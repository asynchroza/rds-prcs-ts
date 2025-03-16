import { createClient } from "redis";
import { LeadershipAcquirer } from "./services/leadership-acquirer";
import { environment } from "@asynchroza/common";
import { Worker } from "worker_threads";
import path from "path";

const DISPATCHER_ID = crypto.randomUUID();
const TTL_SECONDS = Number(environment.loadEnvironment("LEADERSHIP_TTL_IN_SECONDS"));
const REDIS_PUBLISHER_URL = environment.loadEnvironment("REDIS_PUBLISHER_URL");
const ACKNOWLEDGER_PORT = parseInt(environment.loadEnvironment("ACKNOWLEDGER_PORT"));
const CONSUMER_URLS = environment.loadEnvironment("CONSUMER_URLS").split(",");
const IS_PROD = environment.loadEnvironment("NODE_ENV") === "production";

const getWorkerPath = (workerName: string) => {
    return path.join(__dirname, IS_PROD ? ".." : ".", `workers/${workerName}.${IS_PROD ? "js" : "ts"}`);
}

const createWorker = (workerFileNameWoExt: string, workerData: any, mutex: { shouldGiveUpLeadership: boolean }) => {
    return new Worker(path.join(__dirname, getWorkerPath(workerFileNameWoExt)), { workerData })
        .on("error", (err) => {
            console.error(`${workerFileNameWoExt} worker failed`, err);
            mutex.shouldGiveUpLeadership = true;
        });
}

(async () => {
    const client = createClient({ url: REDIS_PUBLISHER_URL });
    await client.connect();

    const leadershipAcquirer = new LeadershipAcquirer(client, DISPATCHER_ID);

    let workers: Worker[] | undefined;

    // TODO: Expand on this, pass as argument to acquirer, acquirer should reset once leadership is lost
    const mutex = { shouldGiveUpLeadership: false };

    await leadershipAcquirer.acquireLeadershipOnRelease(mutex, TTL_SECONDS, 1, {
        onLeadershipLoss() {
            console.log("Lost leadership");
            workers?.forEach(worker => worker.terminate());
        },
        onLeadershipAcquire() {
            if (workers && workers?.length > 0) {
                console.warn("Workers are running, terminating old ones before starting new ones");
                workers.forEach(worker => worker.terminate());
                return;
            }

            workers = [];
            workers.push(
                createWorker("message-distributor", {
                    redisUrl: REDIS_PUBLISHER_URL,
                    consumerUrls: CONSUMER_URLS
                }, mutex),

                createWorker("acknowledger", {
                    redisUrl: REDIS_PUBLISHER_URL,
                    acknowledgerPort: ACKNOWLEDGER_PORT
                }, mutex),

                createWorker("message-redistributor", {
                    redisUrl: REDIS_PUBLISHER_URL,
                }, mutex)
            );
        }
    });
})();


