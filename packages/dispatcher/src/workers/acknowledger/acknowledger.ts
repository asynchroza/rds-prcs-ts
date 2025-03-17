import { nonameproto } from "@asynchroza/common";
import { createClient } from "redis";
import { WebSocketServer, RawData } from "ws";
import { wsUtils } from "@asynchroza/common/src/utils";
import prometheus from 'prom-client';
import { MessageHandler } from "../../services/message-handler";
import { EventsService } from "../../services/events-service";

type WorkerDataInput = {
    redisUrl: string, acknowledgerPort: number, pushgatewayUrl: string
}

export const createHandleMessage = (messageHandler: MessageHandler, eventsService: EventsService) => (data: RawData) => {
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
        console.log(`${result} - Message ${message.value.message} was acknowledged`);
        eventsService.incrementAcknowledgedMessagesMetric();
    });
}

export async function run({ redisUrl, acknowledgerPort, pushgatewayUrl }: WorkerDataInput) {
    const redisClient = createClient({ url: redisUrl });
    await redisClient.connect();

    const promClient = new prometheus.Pushgateway(pushgatewayUrl);
    const eventsService = new EventsService("acknowledger", promClient);

    const messageHandler = new MessageHandler(redisClient);
    const handleMessage = createHandleMessage(messageHandler, eventsService);

    const ws = new WebSocketServer({ port: acknowledgerPort });

    ws.on("connection", (socket) => {
        socket.on("message", handleMessage)
    })
        // We need these to ensure that we bubble up the errors to the main thread
        .on("error", (err) => {
            throw err;
        })
        .on("close", () => { throw new Error("Server closed unexpectedly") });

    eventsService.pushMetrics().catch(console.error);
}

