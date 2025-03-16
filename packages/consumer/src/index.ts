import { environment, nonameproto } from '@asynchroza/common'
import { COMMANDS_TO_BINARY } from '@asynchroza/common/src/nonameproto'
import { createClient } from 'redis'
import { sleep, wsUtils } from '@asynchroza/common/src/utils'
import { Server, WebSocket } from 'ws'

const CONSUMER_PORT = environment.loadEnvironment("CONSUMER_PORT")
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

    socket.onclose = () => {
        throw new Error("Connection to acknowledger closed unexpectedly");
    };
}

connectToAcknowledger(POSSIBLE_ACK_HOSTS);

(async () => {
    // Ensure connection to acknowledger is established
    const redisClient = createClient({ url: REDIS_PUBLISHER_URL });

    // Sleep to give the acknowledger some time to connect
    await Promise.all([sleep(100), redisClient.connect()]);

    if (!ackSocket) {
        throw new Error("Could not connect to any of the provided acknowledger hosts");
    }

    ackSocket.onerror = () => {
        throw new Error("Error with connection to acknowledger");
    }


    let messageCount = 0;

    const ws = new Server({ port: parseInt(CONSUMER_PORT) });

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
            deserializedMessage.consumer_id = `localhost:${CONSUMER_PORT}`

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


