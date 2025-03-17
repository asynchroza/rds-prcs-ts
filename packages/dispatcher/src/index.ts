import { createClient } from "redis";
import { LeadershipAcquirer } from "./services/leadership-acquirer";
import { environment } from "@asynchroza/common";
import { Worker } from "worker_threads";
import path from "path";
import { terminateWorkers } from "./utils/terminateWorkers";

const DISPATCHER_ID = crypto.randomUUID();
const TTL_SECONDS = Number(environment.loadEnvironment("LEADERSHIP_TTL_IN_SECONDS"));
const REDIS_PUBLISHER_URL = environment.loadEnvironment("REDIS_PUBLISHER_URL");
const ACKNOWLEDGER_PORT = parseInt(environment.loadEnvironment("ACKNOWLEDGER_PORT"));
const CONSUMER_URLS = environment.loadEnvironment("CONSUMER_URLS").split(",");
const PROMETHEUS_PUSHGATEWAY_URL = environment.loadEnvironment("PROMETHEUS_PUSHGATEWAY_URL");
const IS_PROD = environment.loadEnvironment("NODE_ENV") === "production";

const getWorkerPath = (workerName: string) => {
    return path.join(__dirname, IS_PROD ? ".." : ".", `workers/${workerName}.${IS_PROD ? "js" : "ts"}`);
}

const createWorker = (workerFileNameWoExt: string, workerData: any, mutex: { shouldGiveUpLeadership: boolean }, workers: Worker[] | undefined) => {
    return new Worker(path.join(__dirname, getWorkerPath(workerFileNameWoExt)), { workerData })
        .on("error", async (err) => {
            console.error(`${workerFileNameWoExt} worker failed`, err);
            mutex.shouldGiveUpLeadership = true;

            if (workers) {
                await terminateWorkers(workers);
            }
        });
}

(async () => {
    const client = createClient({ url: REDIS_PUBLISHER_URL });
    await client.connect();

    const leadershipAcquirer = new LeadershipAcquirer(client, DISPATCHER_ID);

    let workers: Worker[] | undefined;

    const mutex = { shouldGiveUpLeadership: false };

    await leadershipAcquirer.acquireLeadershipOnRelease(mutex, TTL_SECONDS, 1, {
        async onLeadershipLoss() {
            console.log("Lost leadership");

            if (workers) {
                await Promise.all(workers.map(worker => worker.terminate()));
            }

        },
        async onLeadershipAcquire() {
            if (workers && workers?.length > 0) {
                console.warn("Workers are running, terminating old ones before starting new ones");
                await Promise.all(workers.map(worker => worker.terminate()));
            }

            workers = [];
            workers.push(
                createWorker("message-distributor", {
                    redisUrl: REDIS_PUBLISHER_URL,
                    consumerUrls: CONSUMER_URLS,
                    pushgatewayUrl: PROMETHEUS_PUSHGATEWAY_URL,
                }, mutex, workers),

                createWorker("acknowledger", {
                    redisUrl: REDIS_PUBLISHER_URL,
                    acknowledgerPort: ACKNOWLEDGER_PORT,
                    pushgatewayUrl: PROMETHEUS_PUSHGATEWAY_URL,
                    workers,
                }, mutex, workers),

                createWorker("message-redistributor", {
                    redisUrl: REDIS_PUBLISHER_URL,
                    pushgatewayUrl: PROMETHEUS_PUSHGATEWAY_URL,
                    workers
                }, mutex, workers)
            );
        }
    });
})();


