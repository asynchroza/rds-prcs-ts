import { createClient } from "redis"
import { workerData } from "worker_threads";
import { ConsumerGroupManager, getNextAvailableConsumerRoundRobinStrategy } from "../services/consumer-group-manager";
import async_hooks from "async_hooks";
import { monitorEventLoopDelay } from "perf_hooks";
import { assert } from "console";

type DistributorWorkerData = {
    redisUrl: string;
    consumerUrls: string[];
}

const resources: Record<string, unknown> = {};

const hook = async_hooks.createHook({
    init(asyncId, type, triggerAsyncId, resource) {
        console.log(`Init: ${type} (asyncId: ${asyncId}, triggerAsyncId: ${triggerAsyncId}, resource: ${resource.constructor.name})`);
        resources[asyncId] = { resource, type, triggerAsyncId };
    },
    before(asyncId) {
        console.log(`Before: asyncId ${asyncId}`);
        console.log(resources)
    },
    after(asyncId) {
        console.log(`After: asyncId ${asyncId}`);
        console.log(resources)
    },
    destroy(asyncId) {
        console.log(`Destroy: asyncId ${asyncId}`);
    },
    promiseResolve(asyncId) {
        console.log(`PromiseResolved: asyncId ${asyncId}`);
    },
});

(async () => {
    const client = createClient({ url: (workerData as DistributorWorkerData).redisUrl })
    await client.connect();

    const consumers = (workerData as DistributorWorkerData).consumerUrls;
    const consumerGroupManager = new ConsumerGroupManager(client, getNextAvailableConsumerRoundRobinStrategy());

    await consumerGroupManager.setConsumers(consumers);

    await client.SUBSCRIBE("messages:published", (message) => {
        const consumer = consumerGroupManager.getNextAvailableConsumer()
        console.log(`Sending message to ${consumer?.url}: ${message}\n`)
        consumer?.connection.write(`${consumer.url}: ${message}\n`)
    })
})()
