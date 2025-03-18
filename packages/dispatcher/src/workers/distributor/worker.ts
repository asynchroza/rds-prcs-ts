import { createClient } from "redis"
import { workerData } from "worker_threads";
import assert from "assert";
import prometheus from "prom-client";
import { PUBLISH_CHANNEL } from "../../constants";
import { MessageHandler } from "../../services/message-handler";
import { ConsumerGroupManager, getNextAvailableConsumerRoundRobinStrategy } from "../../services/consumer-group-manager";
import { EventsService } from "../../services/events-service";

type WorkerDataInput = {
    redisUrl: string;
    consumerUrls: string[];
    pushgatewayUrl: string;
}

export const createHandleMessage = (messageHandler: MessageHandler, eventsService: EventsService, consumerGroupManager: ConsumerGroupManager) => async (message: string) => {
    eventsService.incrementReceivedMessagesFromPublisherMetric();

    // Otherwise, we cannot trust that by the time the message is acknowledged it will be present
    // in the sorted set -- write happens after the actual delete operation
    // 
    // Possible optimization - since we're awaiting here, it would throw an exception if it fails
    // to write to the database but we want to try and push the message to the consumer either way.
    await messageHandler.addMessageToSortedSet(message);

    const consumer = consumerGroupManager.getNextAvailableConsumer()
    if (!consumer) {
        console.log("No consumers available to process message");
        return;
    }

    const encodedMessage = messageHandler.encodeProcessMessage(message)
    assert(encodedMessage.ok)

    console.log(`Sending message to ${consumer.connection.url}`);

    consumer.connection.send(encodedMessage.value);
    eventsService.incrementMessageRelayedToConsumerMetric();
}

export async function run({ redisUrl, consumerUrls, pushgatewayUrl }: WorkerDataInput) {

    // TODO: Check if connection pooling is will help here
    const publisherclient = createClient({ url: redisUrl })
    const consumerClient = createClient({ url: redisUrl })

    const promClient = new prometheus.Pushgateway(pushgatewayUrl);
    const eventsService = new EventsService("distributor", promClient);

    await Promise.all([publisherclient.connect(), consumerClient.connect()]);

    const consumerGroupManager = new ConsumerGroupManager(consumerClient, getNextAvailableConsumerRoundRobinStrategy());
    const messageHandler = new MessageHandler(consumerClient);

    await consumerGroupManager.setConsumers(consumerUrls);

    const handleMessage = createHandleMessage(messageHandler, eventsService, consumerGroupManager);

    publisherclient.SUBSCRIBE(PUBLISH_CHANNEL, handleMessage);

    setInterval(() => consumerGroupManager.reconnectDeadConsumers(), 2000)
    eventsService.startPushingMetrics();
}
