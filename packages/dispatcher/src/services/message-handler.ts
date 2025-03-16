import { nonameproto } from "@asynchroza/common";
import { createClient } from "redis";
import { PUBLISH_CHANNEL } from "../constants";

const SORTED_SET_NAME = "messages:pending";

export class MessageHandler {
    constructor(private redisClient: ReturnType<typeof createClient>) { }

    addMessageToSortedSet(message: string) {
        // Shouldn't worry too much about the performance of Date.now() here -- ~33M ops/sec on the macbook
        return this.redisClient.ZADD(SORTED_SET_NAME, [{ score: Date.now(), value: message }]);
    }

    /**
    * I hadn't done enough investigation around deleting the message from the sorted set
    * and it seems that you remove entries by value. Hence, the whole plan around generating our
    * own unique identifier for the message in the message distributor is redudant.
    * The goal was to avoid using the `message_id` property in the message because
    * it would have required JSON deserialization and instead use a unique identifier
    * we generate ourselves. Not required anymore.
    */
    removeMessageFromSortedSet(message: string) {
        console.log(`Removing message ${message} from sorted set`);
        return this.redisClient.ZREM(SORTED_SET_NAME, message);
    };

    cleanUpSortedSet() {
        return this.redisClient.DEL(SORTED_SET_NAME)
    }

    encodeProcessMessage(message: string) {
        return nonameproto.encode("PROCESS", message);
    }

    encodeAckMessage(message: string) {
        return nonameproto.encode("ACK", message);
    }

    getUnacknowledgedMessages(before: number) {
        return this.redisClient.ZRANGEBYSCORE(SORTED_SET_NAME, "-inf", before);
    }

    /**
    * Redistributes the messages and removes them from the sorted set
    */
    redistributeMessages(messages: string[]) {
        // Seems like this client lib doesn't support pipelining?
        // Either way don't spend to much time if it's not a bottleneck
        const promises = messages.map(async (message) => {
            const result = await this.redisClient.PUBLISH(PUBLISH_CHANNEL, message);


            if (result > 0) {
                // We can do a ranged removal but since the client doesn't support pipelining
                // it would be risky to remove items without knowing if they were actually sent
                return await this.removeMessageFromSortedSet(message);
            }
        })

        return Promise.all(promises);
    }
}
