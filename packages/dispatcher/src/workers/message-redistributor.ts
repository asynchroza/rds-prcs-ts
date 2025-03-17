import { createClient } from "redis";
import { workerData } from "worker_threads"
import { MessageHandler } from "../services/message-handler";
import prometheus from "prom-client";
import { EventsService } from "../services/events-service";
import { exitNotSwiftly } from "./utils/exitNotSwiftly";

type WorkerDataInput = {
    redisUrl: string;
    pushgatewayUrl: string;
}

(async () => {
    const { redisUrl, pushgatewayUrl } = workerData as WorkerDataInput;
    const redisClient = createClient({ url: redisUrl });
    await redisClient.connect();

    const messageHandler = new MessageHandler(redisClient);
    const promClient = new prometheus.Pushgateway(pushgatewayUrl);
    const eventsService = new EventsService("redistributor", promClient);

    setInterval(async () => {
        console.log("Checking for unacknowledged messages");

        const before = Date.now() - 5000;
        const messages = await messageHandler.getUnacknowledgedMessages(before);

        if (messages.length > 0) {
            console.log(`Republishing ${messages.length} messages`);
        }

        // We're missing some guarantees here
        await messageHandler.redistributeMessages(messages).catch(exitNotSwiftly)
        eventsService.incrementRedistributedMessagesMetric(messages.length);

        // Allocate more time to avoid dirty reads
        // Change this as needed
    }, 3000)
})()
