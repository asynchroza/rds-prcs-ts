import { environment, nonameproto } from '@asynchroza/common'
import net from 'net'

const CONSUMER_PORT = environment.loadEnvironment("CONSUMER_PORT")

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

srv.listen(CONSUMER_PORT)
