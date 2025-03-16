import { nonameproto } from "@asynchroza/common";
import net from "net"
import { createClient } from "redis";
import { workerData } from "worker_threads";
import { MessageHandler } from "../services/message-handler";

(async () => {
    const { redisUrl, acknowledgerPort } = workerData as { redisUrl: string, acknowledgerPort: number };

    const redisClient = createClient({ url: redisUrl });
    await redisClient.connect();

    const messageHandler = new MessageHandler(redisClient);

    const srv = net.createServer((socket) => {
        socket.on("data", (data) => {
            const message = nonameproto.decode(data.buffer);

            if (!message.ok) {
                return console.warn(message.error);
            }

            if (message.value?.command !== "ACK") {
                return console.log("Received message that is not an ACK");
            }

            messageHandler.removeMessageFromSortedSet(message.value.message);
        })
        // Bubble up the error to main thread to stop acquirer from claiming leadership
    }).on("error", (err) => { throw err });

    srv.listen(acknowledgerPort, () => {
        console.log(`Acknowledger bound on port ${acknowledgerPort}`)
    });
})();
