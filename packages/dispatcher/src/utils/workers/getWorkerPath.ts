import path from "path";

export const getWorkerPath = (workerName: string, loadBundledRoutes = false) => {
    return path.join(__dirname, loadBundledRoutes ? ".." : ".", `workers/${workerName}.${loadBundledRoutes ? "js" : "ts"}`);
}

