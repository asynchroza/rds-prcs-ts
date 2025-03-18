import { createClient } from "redis";
import prometheus from "prom-client";
import { MessageHandler } from "../../services/message-handler";
import { EventsService } from "../../services/events-service";
import { exitNotSwiftly } from "../utils/exitNotSwiftly";

type WorkerDataInput = {
    redisUrl: string;
    pushgatewayUrl: string;
}

const REDISTRIBUTION_INTERVAL_IN_SECONDS = 3;
const TIME_BEFORE_MARKING_AS_ELIGIBLE_FOR_REPUBLISH_IN_SECONDS = 5;

export const handleUnacknowledgedMessages = async (messageHandler: MessageHandler, eventsService: EventsService) => {
    console.log("Checking for unacknowledged messages");

    const before = Date.now() - TIME_BEFORE_MARKING_AS_ELIGIBLE_FOR_REPUBLISH_IN_SECONDS * 1000;
    const messages = await messageHandler.getUnacknowledgedMessages(before);

    if (messages.length > 0) {
        console.log(`Republishing ${messages.length} messages`);
    }

    // We're missing some guarantees here
    await messageHandler.redistributeMessages(messages).catch(exitNotSwiftly)
    eventsService.incrementRedistributedMessagesMetric(messages.length);
}

export async function run({ redisUrl, pushgatewayUrl }: WorkerDataInput) {
    const redisClient = createClient({ url: redisUrl });
    await redisClient.connect();

    const messageHandler = new MessageHandler(redisClient);
    const promClient = new prometheus.Pushgateway(pushgatewayUrl);
    const eventsService = new EventsService("republisher", promClient);

    setInterval(() => handleUnacknowledgedMessages(messageHandler, eventsService), REDISTRIBUTION_INTERVAL_IN_SECONDS)
    eventsService.startPushingMetrics();
}
