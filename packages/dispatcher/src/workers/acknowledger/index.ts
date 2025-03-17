import { workerData } from "worker_threads";
import { run } from "./acknowledger";

(async () => run(workerData))()
