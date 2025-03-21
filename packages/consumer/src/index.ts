import { environment, nonameproto } from '@asynchroza/common'
import { COMMANDS_TO_BINARY } from '@asynchroza/common/src/nonameproto'
import { createClient } from 'redis'
import { sleep, wsUtils } from '@asynchroza/common/src/utils'
import { WebSocket, WebSocketServer } from 'ws'

const CONSUMER_URL = environment.loadEnvironment("CONSUMER_URL")
const [_, PORT] = CONSUMER_URL.split(":")

const POSSIBLE_ACK_HOSTS = environment.loadEnvironment("ACK_HOSTS").split(',').map(host => {
    const [hostName, port] = host.split(":")

    return { hostName, port: parseInt(port) }
})
const REDIS_PUBLISHER_URL = environment.loadEnvironment("REDIS_PUBLISHER_URL")

let ackSocket: WebSocket | undefined;

function connectToAcknowledger(hosts: { hostName: string; port: number }[], index = 0) {
    if (index >= hosts.length) {
        throw new Error("Could not connect to any of the provided hosts");
    }

    const host = hosts[index];
    const url = `ws://${host.hostName}:${host.port}`;

    console.log(`Connecting to acknowledger: ${url}`);

    const socket = new WebSocket(url);

    socket.onopen = (() => {
        console.log(`Connected to acknowledger@${host.hostName}:${host.port}`);
        ackSocket = socket;
    });

    socket.onerror = () => {
        console.log(`${host.hostName}:${host.port} failed, trying next acknowledger host...`);
        socket.close();
        connectToAcknowledger(hosts, index + 1);
    };
}

connectToAcknowledger(POSSIBLE_ACK_HOSTS);

(async () => {
    // Ensure connection to acknowledger is established
    const redisClient = createClient({ url: REDIS_PUBLISHER_URL });

    // Sleep to give the acknowledger some time to connect
    await Promise.all([sleep(50), redisClient.connect()]);

    if (!ackSocket) {
        throw new Error("Could not connect to any of the provided acknowledger hosts");
    }

    // Overwrite the error handlers to avoid calling the `connectToAcknowledger` function
    // This could be handled more gracefully
    ackSocket.onerror = () => {
        throw new Error("Error with connection to acknowledger");
    }

    ackSocket.onclose = () => {
        throw new Error("Connection to acknowledger closed unexpectedly");
    }


    let messageCount = 0;

    const ws = new WebSocketServer({ port: parseInt(PORT) });

    ws.on('connection', (socket) => {
        socket.on('message', (data) => {
            const arrayBuffer = wsUtils.sliceBuffer(data);

            if (!arrayBuffer.ok) throw new Error("Invalid data type received");


            const result = nonameproto.decode(arrayBuffer.value);

            if (!result.ok) {
                console.log("Received message that is not an ACK");
                return console.log(result.error);
            }

            // Read comment on `MessageHandler.removeMessageFromSortedSet`
            // No need to waste resources on encoding when we can just swap out the
            // command byte as the message is pretty much the same
            const message = new Uint8Array(arrayBuffer.value)
            message[1] = COMMANDS_TO_BINARY.get("ACK")!

            const deserializedMessage = JSON.parse(result.value.message) as {
                message_id: string, random_property?: string, consumer_id: string
            };

            deserializedMessage.random_property = crypto.randomUUID();
            deserializedMessage.consumer_id = CONSUMER_URL;

            redisClient.XADD("messages:processed", "*", deserializedMessage).then(() => {
                ackSocket!.send(message)
                console.log(`Processed ${++messageCount} messages`);
                console.log(`Message with id ${deserializedMessage.message_id} processed and saved to Redis`);
            })
        })
    });

    ws.on('error', (err) => { throw err });
    ws.on("close", () => { throw new Error("WebSocket connection closed unexpectedly") });
})()


