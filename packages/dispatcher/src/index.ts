import { createClient } from "redis";
import { LeadershipAcquirer } from "./services/leadership-acquirer";
import { environment } from "@asynchroza/common";

const DISPATCHER_ID = environment.loadEnvironment("DISPATCHER_ID");
const TTL_SECONDS = Number(environment.loadEnvironment("LEADERSHIP_TTL_IN_SECONDS"));

(async () => {
    const client = createClient({ url: "redis://127.0.0.1:7234" });
    await client.connect();

    const leadershipAcquirer = new LeadershipAcquirer(client, DISPATCHER_ID);

    const result = await leadershipAcquirer.acquireLeadership(TTL_SECONDS);
    console.log(result);
})();


