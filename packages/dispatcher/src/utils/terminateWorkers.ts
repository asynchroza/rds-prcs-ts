import { Worker } from "worker_threads";

export const terminateWorkers = async (workers: Worker[]) => {
    await Promise.all(workers.map(worker => worker.terminate()));
}
