import { environment } from '@asynchroza/common'
import net from 'net'

const CONSUMER_PORT = environment.loadEnvironment("CONSUMER_PORT")

const srv = net.createServer((socket) => {
    socket.on('data', (data) => {
        console.log(data.toString())
    })
})

srv.listen(CONSUMER_PORT)
