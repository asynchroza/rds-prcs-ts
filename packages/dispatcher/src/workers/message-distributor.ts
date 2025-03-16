import { createClient } from "redis"
import { workerData } from "worker_threads";
import { ConsumerGroupManager, getNextAvailableConsumerRoundRobinStrategy } from "../services/consumer-group-manager";

type DistributorWorkerData = {
    redisUrl: string;
    consumerUrls: string[];
}

(async () => {
    // TODO: Check if connection pooling is will help here
    const publisherclient = createClient({ url: (workerData as DistributorWorkerData).redisUrl })
    await publisherclient.connect();

    const consumerClient = createClient({ url: (workerData as DistributorWorkerData).redisUrl })
    await consumerClient.connect();

    const consumers = (workerData as DistributorWorkerData).consumerUrls;
    const consumerGroupManager = new ConsumerGroupManager(consumerClient, getNextAvailableConsumerRoundRobinStrategy());

    await consumerGroupManager.setConsumers(consumers);

    publisherclient.SUBSCRIBE("messages:published", (message) => {
        const consumer = consumerGroupManager.getNextAvailableConsumer()
        console.log(`Sending message to ${consumer?.url}: ${message}\n`)
        consumer?.connection.write(`${consumer.url}: ${message}\n`)
    })

    setInterval(() => consumerGroupManager.regularlyReconnectDeadClients(), 2000)
})()
