import { nonameproto } from "@asynchroza/common";
import net from "net"
import { createClient } from "redis";
import { workerData } from "worker_threads";
import { MessageHandler } from "../services/message-handler";
import { Server } from "ws";
import { wsUtils } from "@asynchroza/common/src/utils";

(async () => {
    const { redisUrl, acknowledgerPort } = workerData as { redisUrl: string, acknowledgerPort: number };

    const redisClient = createClient({ url: redisUrl });
    await redisClient.connect();

    const messageHandler = new MessageHandler(redisClient);

    let messageCount = 0;

    const ws = new Server({ port: acknowledgerPort });

    ws.on("connection", (socket) => {
        socket.on("message", (data) => {
            const buffer = wsUtils.sliceBuffer(data);

            if (!buffer.ok) {
                return console.warn(buffer.error);
            }

            const message = nonameproto.decode(buffer.value);

            if (!message.ok) {
                return console.warn(message.error);
            }

            if (message.value.command !== "ACK") {
                return console.log("Received message that is not an ACK");
            }

            messageHandler.removeMessageFromSortedSet(message.value.message).then((result) => {
                console.log(`Received ${++messageCount} acknowledgements`);
                console.log(`${result} - Message ${message.value.message} was acknowledged`);
            });
        })

        socket.onerror = (err) => {
            throw err;
        }

        socket.onclose = () => {
            throw new Error("Server closed unexpectedly");
        }
    })
        // We need these to ensure that we bubble up the errors to the main thread
        .on("error", (err) => {
            throw err;
        })
        .on("close", () => { throw new Error("Server closed unexpectedly") });
})()
