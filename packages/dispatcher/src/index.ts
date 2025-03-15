import { createClient } from "redis";
import { LeadershipAcquirer } from "./services/leadership-acquirer";

const client = createClient({ url: "redis://localhost:7234" });

const leadershipAcquirer = new LeadershipAcquirer(client, "node-1");

const result = await leadershipAcquirer.acquireLeadership(100);

console.log(result);

