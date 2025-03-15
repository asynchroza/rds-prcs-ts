import { createClient } from "redis"
import { workerData } from "worker_threads";
import { ConsumerGroupManager } from "../services/consumer-group-manager";

type DistributorWorkerData = {
    redisUrl: string;
    consumerUrls: string[];
}

(async () => {
    let currentConsumerIndex = 0;

    const client = createClient({ url: (workerData as DistributorWorkerData).redisUrl })
    await client.connect();

    const consumers = (workerData as DistributorWorkerData).consumerUrls;
    const consumerGroupManager = new ConsumerGroupManager(client);

    consumerGroupManager.setConsumers(consumers);

    await client.SUBSCRIBE("messages:published", (message) => {
        console.log(`Sending message to ${currentConsumerIndex++}: ${message}`);
    })
})()
