import { createClient } from "redis";
import { LeadershipAcquirer } from "./services/leadership-acquirer";
import { environment } from "@asynchroza/common";

const DISPATCHER_ID = environment.loadEnvironment("DISPATCHER_ID");

(async () => {
    const client = createClient({ url: "redis://127.0.0.1:7234" });
    await client.connect();

    const leadershipAcquirer = new LeadershipAcquirer(client, "node-1");

    const result = await leadershipAcquirer.acquireLeadership(100);
    console.log(result);
})();


