import { workerData } from "worker_threads";
import { run } from "./worker";

(async () => run(workerData))()
