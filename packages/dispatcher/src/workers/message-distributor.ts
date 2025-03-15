import { createClient } from "redis"
import { workerData } from "worker_threads";
import { ConsumerGroupManager, getNextAvailableConsumerRoundRobinStrategy } from "../services/consumer-group-manager";

type DistributorWorkerData = {
    redisUrl: string;
    consumerUrls: string[];
}

(async () => {
    const client = createClient({ url: (workerData as DistributorWorkerData).redisUrl })
    await client.connect();

    const consumers = (workerData as DistributorWorkerData).consumerUrls;
    const consumerGroupManager = new ConsumerGroupManager(client, getNextAvailableConsumerRoundRobinStrategy());

    await consumerGroupManager.setConsumers(consumers);

    client.SUBSCRIBE("messages:published", (message) => {
        const consumer = consumerGroupManager.getNextAvailableConsumer()
        console.log(`Sending message to ${consumer?.url}: ${message}\n`)
        consumer?.connection.write(`${consumer.url}: ${message}\n`)
    })
})()
