import { environment, nonameproto } from '@asynchroza/common'
import { COMMANDS_TO_BINARY } from '@asynchroza/common/src/nonameproto'
import { createClient } from 'redis'
import net from 'net'

const CONSUMER_PORT = environment.loadEnvironment("CONSUMER_PORT")
const POSSIBLE_ACK_HOSTS = environment.loadEnvironment("ACK_HOSTS").split(',').map(host => {
    const [hostName, port] = host.split(":")

    return { hostName, port: parseInt(port) }
})
const REDIS_PUBLISHER_URL = environment.loadEnvironment("REDIS_PUBLISHER_URL")

let ackSocket: net.Socket;

function connectToAcknowledger(hosts: { hostName: string; port: number }[], index = 0): Promise<net.Socket> {
    if (index >= hosts.length) {
        return Promise.reject(new Error("Could not connect to any of the provided hosts"));
    }

    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        const host = hosts[index];

        socket.connect(host.port, host.hostName, () => {
            console.log(`Connected to acknowledger@${host.hostName}:${host.port}`);
            ackSocket = socket;
            resolve(socket);
        });

        socket.on("error", () => {
            console.log(`${host.hostName}:${host.port} failed, trying next acknowledger host...`);
            socket.destroy();
            connectToAcknowledger(hosts, index + 1).then(resolve).catch(reject);
        });

        socket.on("close", () => {
            reject(new Error("Connection to acknowledger closed"));
        });
    });
}


const srv = net.createServer(async (socket) => {
    // Ensure connection to acknowledger is established
    const redisClient = createClient({ url: REDIS_PUBLISHER_URL });
    await Promise.all([connectToAcknowledger(POSSIBLE_ACK_HOSTS), redisClient.connect()]);

    socket.on('data', (data) => {
        const result = nonameproto.decode(data.buffer);

        if (!result.ok) {
            return console.log(result.error);
        }

        // Read comment on `MessageHandler.removeMessageFromSortedSet`
        // No need to waste resources on encoding when we can just swap out the
        // command byte as the message is pretty much the same
        const message = new Uint8Array(data.buffer)
        message[1] = COMMANDS_TO_BINARY.get("ACK")!

        ackSocket.write(message)

        const deserializedMessage = JSON.parse(result.value.message) as {
            message_id: string, random_property?: string, consumer_id: string
        };

        deserializedMessage.random_property = crypto.randomUUID();
        deserializedMessage.consumer_id = `localhost:${CONSUMER_PORT}`

        redisClient.XADD("messages:processed", "*", deserializedMessage).then(() => {
            console.log(`Message with id ${deserializedMessage.message_id} processed and saved to Redis`);
        })
    })
})

srv.listen(CONSUMER_PORT, () => {
    console.log(`Consumer bound on port ${CONSUMER_PORT}`)
})
    // For the sake of ease, bubble up the error and let docker handle the restart of the consumer
    .on('error', (err) => { throw err; })
