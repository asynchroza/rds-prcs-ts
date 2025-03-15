import { createClient } from "redis";
import { LeadershipAcquirer } from "./services/leadership-acquirer";

(async () => {
    const client = createClient({ url: "redis://127.0.0.1:7234" });
    await client.connect();

    const leadershipAcquirer = new LeadershipAcquirer(client, "node-1");

    const result = await leadershipAcquirer.acquireLeadership(100);
    console.log(result);
})();


