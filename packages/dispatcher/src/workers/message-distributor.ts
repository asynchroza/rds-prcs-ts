import { createClient } from "redis"
import { workerData } from "worker_threads";

type DistributorWorkerData = {
    redisUrl: string;
}

(async () => {
    const client = createClient({ url: (workerData as DistributorWorkerData).redisUrl })
    await client.connect();

    await client.SUBSCRIBE("messages:published", (message) => {
        console.log("Received message: ", message);
    })
})()
