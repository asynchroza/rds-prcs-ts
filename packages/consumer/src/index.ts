import { environment, nonameproto } from '@asynchroza/common'
import { COMMANDS_TO_BINARY } from '@asynchroza/common/src/nonameproto'
import net from 'net'

const CONSUMER_PORT = environment.loadEnvironment("CONSUMER_PORT")
const POSSIBLE_ACK_HOSTS = environment.loadEnvironment("ACK_HOSTS").split(',').map(host => {
    const [hostName, port] = host.split(":")

    return { hostName, port: parseInt(port) }
})

let ackSocket: net.Socket;

function tryConnect(hosts: { hostName: string, port: number }[], index = 0) {
    if (index >= hosts.length) {
        throw new Error("Could not connect to any of the provided hosts");
    }

    const socket = new net.Socket();

    const host = hosts[index];
    socket.connect(host.port, host.hostName, () => {
        console.log(`Connected to acknowledger@${host.hostName}:${host.port}`);
        ackSocket = socket;
    }).on("close", () => { throw new Error("Connection to acknowledger closed") })


    socket.on("error", () => {
        console.log(`${host.hostName}:${host.port} failed, trying next acknowledger host...`);
        socket.destroy();
        tryConnect(hosts, index + 1);
    });
}

tryConnect(POSSIBLE_ACK_HOSTS);

const srv = net.createServer((socket) => {
    if (!ackSocket) {
        throw new Error("Couldn't establish connection with acknowledger");
    }

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
    })
})

srv.listen(CONSUMER_PORT, () => {
    console.log(`Consumer bound on port ${CONSUMER_PORT}`)
})
    // For the sake of ease, bubble up the error and let docker handle the restart of the consumer
    .on('error', (err) => { throw err; })
