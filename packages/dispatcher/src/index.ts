import { createClient } from "redis";
import { LeadershipAcquirer } from "./services/leadership-acquirer";
import { environment } from "@asynchroza/common";
import { Worker } from "worker_threads";
import path from "path";

const DISPATCHER_ID = crypto.randomUUID();
const TTL_SECONDS = Number(environment.loadEnvironment("LEADERSHIP_TTL_IN_SECONDS"));
const REDIS_PUBLISHER_URL = environment.loadEnvironment("REDIS_PUBLISHER_URL");
const CONSUMER_URLS = ["localhost:6969", "localhost:7001"];

/**
 * @qs
* How do I stop the leadership acquirer from renewing the lock on worker error?
*/

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
            workers = []; // TODO: Possible leakage here - unterminated workers
            workers.push(
                new Worker(path.join(__dirname, "workers/message-distributor.ts"),
                    { workerData: { redisUrl: REDIS_PUBLISHER_URL, consumerUrls: CONSUMER_URLS } })
                    .on("error", () => {
                        mutex.shouldGiveUpLeadership = true;
                    }));
        }
    });
})();


