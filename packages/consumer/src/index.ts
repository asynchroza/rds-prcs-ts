import { environment, nonameproto } from '@asynchroza/common'
import { COMMANDS_TO_BINARY } from '@asynchroza/common/src/nonameproto'
import net from 'net'

const CONSUMER_PORT = environment.loadEnvironment("CONSUMER_PORT")

const ackSocket = new net.Socket().connect({ port: 7999, host: 'localhost' }).on('error', (err) => {
    // For the sake of ease, bubble up the error and let compose handle the restart of the consumer
    throw err;
})

const srv = net.createServer((socket) => {
    socket.on('data', (data) => {
        const result = nonameproto.decode(data.buffer);

        if (!result.ok) {
            return console.log(result.error);
        }

        // Read comment on `removeMessageFromSortedSet`
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
    // For the sake of ease, bubble up the error and let compose handle the restart of the consumer
    .on('error', (err) => { throw err; })
