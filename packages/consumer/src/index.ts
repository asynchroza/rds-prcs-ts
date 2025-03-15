import net from 'net'

const srv = net.createServer((socket) => {
    socket.on('data', (data) => {
        console.log(data.toString())
    })
})

srv.listen(6969)
