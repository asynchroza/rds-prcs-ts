import { createClient } from "redis"
import { workerData } from "worker_threads";
import { ConsumerGroupManager, getNextAvailableConsumerRoundRobinStrategy } from "../services/consumer-group-manager";
import { MessageHandler } from "../services/message-handler";
import assert from "assert";

type DistributorWorkerData = {
    redisUrl: string;
    consumerUrls: string[];
}

(async () => {
    const { redisUrl, consumerUrls } = (workerData as DistributorWorkerData)

    // TODO: Check if connection pooling is will help here
    const publisherclient = createClient({ url: redisUrl })
    const consumerClient = createClient({ url: redisUrl })

    await Promise.all([publisherclient.connect(), consumerClient.connect()]);

    const consumerGroupManager = new ConsumerGroupManager(consumerClient, getNextAvailableConsumerRoundRobinStrategy());
    const messageHandler = new MessageHandler(consumerClient);

    await consumerGroupManager.setConsumers(consumerUrls);

    publisherclient.SUBSCRIBE("messages:published", async (message) => {
        const consumer = consumerGroupManager.getNextAvailableConsumer()
        // Otherwise, we cannot trust that by the time the message is acknowledged it will be present
        // in the sorted set -- write happens after the actual delete operation
        // 
        // Possible optimization - since we're awaiting here, it would throw an exception if it fails
        // to write to the database but we want to try and push the message to the consumer either way.
        await messageHandler.addMessageToSortedSet(message);

        if (!consumer) {
            // SILENCE! -- logs were polluting
            return;
        }

        console.log(`Sending message to ${consumer?.url}`)

        const encodedMessage = messageHandler.encodeProcessMessage(message)
        assert(encodedMessage.ok)

        consumer.connection.write(encodedMessage.value)
    })

    setInterval(() => consumerGroupManager.reconnectDeadConsumers(), 2000)
})()
