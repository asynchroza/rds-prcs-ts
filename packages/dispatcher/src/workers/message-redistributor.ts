import { createClient } from "redis";
import { workerData } from "worker_threads"
import { MessageHandler } from "../services/message-handler";

(async () => {
    const { redisUrl } = workerData as { redisUrl: string };
    const redisClient = createClient({ url: redisUrl });
    await redisClient.connect();

    const messageHandler = new MessageHandler(redisClient);

    setInterval(async () => {
        console.log("Checking for unacknowledged messages");

        const before = Date.now() - 2000;
        const messages = await messageHandler.getUnacknowledgedMessages(before);

        if (messages.length > 0) {
            console.log(`Republishing ${messages.length} messages`);
        }

        await messageHandler.redistributeMessages(messages);

        // Allocate time to avoid dirty reads
        // Change this as needed
    }, 2000)
})()
