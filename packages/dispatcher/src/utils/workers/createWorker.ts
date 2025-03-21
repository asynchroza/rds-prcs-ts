import path from "path";
import { getWorkerPath } from "./getWorkerPath";
import { Worker } from "worker_threads";
import { terminateWorkers } from "./terminateWorkers";

export const createWorker = (
    pathToWorker: string,
    workerData: any,
    mutex: { shouldGiveUpLeadership: boolean },
    workers: Worker[] | undefined,
    loadBundledRoutes = false
) => {
    return new Worker(path.join(__dirname, getWorkerPath(pathToWorker, loadBundledRoutes)), { workerData })
        .on("error", async (err) => {
            console.error(`${pathToWorker.split("/")[0]} worker failed`, err);
            mutex.shouldGiveUpLeadership = true;

            if (workers) {
                await terminateWorkers(workers);
            }
        });
}
