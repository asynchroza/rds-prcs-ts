import { nonameproto } from "@asynchroza/common";
import { createClient } from "redis";
import { workerData } from "worker_threads";
import { MessageHandler } from "../services/message-handler";
import { WebSocketServer } from "ws";
import { wsUtils } from "@asynchroza/common/src/utils";
import { EventsService } from "../services/events-service";
import prometheus from 'prom-client';

type WorkerDataInput = {
    redisUrl: string, acknowledgerPort: number, pushgatewayUrl: string
}

(async () => {
    const { redisUrl, acknowledgerPort, pushgatewayUrl } = workerData as WorkerDataInput;

    const redisClient = createClient({ url: redisUrl });
    await redisClient.connect();

    const promClient = new prometheus.Pushgateway(pushgatewayUrl);
    const eventsService = new EventsService("acknowledger", promClient);

    const messageHandler = new MessageHandler(redisClient);

    let messageCount = 0;

    const ws = new WebSocketServer({ port: acknowledgerPort });

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
                eventsService.incrementAcknowledgedMessagesMetric();
            });
        })
    })
        // We need these to ensure that we bubble up the errors to the main thread
        .on("error", (err) => {
            throw err;
        })
        .on("close", () => { throw new Error("Server closed unexpectedly") });

    eventsService.pushMetrics().catch(console.error);
})()
