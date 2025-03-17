import { createClient } from "redis";
import { LeadershipAcquirer } from "./services/leadership-acquirer";
import { environment } from "@asynchroza/common";
import { Worker } from "worker_threads";
import { createWorker } from "./utils/workers/createWorker";
import { terminateWorkers } from "./utils/workers/terminateWorkers";

const DISPATCHER_ID = crypto.randomUUID();
const TTL_SECONDS = Number(environment.loadEnvironment("LEADERSHIP_TTL_IN_SECONDS"));
const REDIS_PUBLISHER_URL = environment.loadEnvironment("REDIS_PUBLISHER_URL");
const ACKNOWLEDGER_PORT = parseInt(environment.loadEnvironment("ACKNOWLEDGER_PORT"));
const CONSUMER_URLS = environment.loadEnvironment("CONSUMER_URLS").split(",");
const PROMETHEUS_PUSHGATEWAY_URL = environment.loadEnvironment("PROMETHEUS_PUSHGATEWAY_URL");
const IS_PROD = environment.loadEnvironment("NODE_ENV") === "production";



(async () => {
    const client = createClient({ url: REDIS_PUBLISHER_URL });
    await client.connect();

    const leadershipAcquirer = new LeadershipAcquirer(client, DISPATCHER_ID);

    let workers: Worker[] | undefined;

    const mutex = { shouldGiveUpLeadership: false };

    await leadershipAcquirer.acquireLeadershipOnRelease(mutex, TTL_SECONDS, 1, {
        async onLeadershipLoss() {
            console.log("Lost leadership");

            if (workers) await terminateWorkers(workers);

        },
        async onLeadershipAcquire() {
            if (workers && workers?.length > 0) {
                console.warn("Workers are running, terminating old ones before starting new ones");
                await terminateWorkers(workers);
            }

            workers = [];
            workers.push(
                createWorker("message-distributor", {
                    redisUrl: REDIS_PUBLISHER_URL,
                    consumerUrls: CONSUMER_URLS,
                    pushgatewayUrl: PROMETHEUS_PUSHGATEWAY_URL,
                }, mutex, workers, IS_PROD),

                createWorker("acknowledger/runner", {
                    redisUrl: REDIS_PUBLISHER_URL,
                    acknowledgerPort: ACKNOWLEDGER_PORT,
                    pushgatewayUrl: PROMETHEUS_PUSHGATEWAY_URL,
                    workers,
                }, mutex, workers, IS_PROD),

                createWorker("message-redistributor", {
                    redisUrl: REDIS_PUBLISHER_URL,
                    pushgatewayUrl: PROMETHEUS_PUSHGATEWAY_URL,
                    workers
                }, mutex, workers, IS_PROD)
            );
        }
    });
})();


