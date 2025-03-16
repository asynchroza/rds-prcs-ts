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

    publisherclient.SUBSCRIBE("messages:published", (message) => {
        const consumer = consumerGroupManager.getNextAvailableConsumer()
        messageHandler.addMessageToSortedSet(message);

        if (!consumer) {
            return console.warn("There were no available consumers to send the message to. It's queued for later processing")
        }

        console.log(`Sending message to ${consumer?.url}`)
        const encodedMessage = messageHandler.encodeProcessMessage(message)

        assert(encodedMessage.ok)

        consumer.connection.write(encodedMessage.value)
    })

    setInterval(() => consumerGroupManager.reconnectDeadConsumers(), 2000)
})()
