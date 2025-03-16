import { createClient } from "redis";
import { LeadershipAcquirer } from "./services/leadership-acquirer";
import { environment } from "@asynchroza/common";
import { Worker } from "worker_threads";
import path from "path";

const DISPATCHER_ID = crypto.randomUUID();
const TTL_SECONDS = Number(environment.loadEnvironment("LEADERSHIP_TTL_IN_SECONDS"));
const REDIS_PUBLISHER_URL = environment.loadEnvironment("REDIS_PUBLISHER_URL");
const CONSUMER_URLS = ["localhost:6969", "localhost:7001"];

const createWorker = (workerPath: string, workerData: any, mutex: { shouldGiveUpLeadership: boolean }) => {
    return new Worker(path.join(__dirname, `workers/${workerPath}`), { workerData })
        .on("error", () => {
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

    await leadershipAcquirer.acquireLeadershipOnRelease(TTL_SECONDS, TTL_SECONDS / 2, {
        onLeadershipLoss() {
            workers?.forEach(worker => worker.terminate());
            console.log("Lost leadership");
        },
        onLeadershipAcquire() {
            if (workers && workers?.length > 0) {
                console.warn("Workers are running, terminating old ones before starting new ones");
                workers.forEach(worker => worker.terminate());
                return;
            }

            workers = [];
            workers.push(
                createWorker("message-distributor.ts",
                    { redisUrl: REDIS_PUBLISHER_URL, consumerUrls: CONSUMER_URLS }, mutex),
                createWorker("acknowledger.ts", { redisUrl: REDIS_PUBLISHER_URL }, mutex)
            );
        }
    });
})();


