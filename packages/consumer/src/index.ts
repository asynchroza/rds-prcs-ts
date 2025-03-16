import { environment, nonameproto } from '@asynchroza/common'
import net from 'net'

const CONSUMER_PORT = environment.loadEnvironment("CONSUMER_PORT")

// TODO: Establish connection with the acknowledger socket
// If the connection is lost, re-establish it

const srv = net.createServer((socket) => {
    socket.on('data', (data) => {
        const result = nonameproto.decode(data.buffer);

        if (result.ok) {
            console.log(result.value);
        } else {
            console.error(result.error);
        }
    })
})

srv.listen(CONSUMER_PORT, () => {
    console.log(`Consumer bound on port ${CONSUMER_PORT}`)
})
