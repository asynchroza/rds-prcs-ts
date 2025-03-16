import { nonameproto } from "@asynchroza/common";
import { createClient } from "redis";

const SORTED_SET_NAME = "messages:pending";

export class MessageHandler {
    constructor(private redisClinet: ReturnType<typeof createClient>) { }

    addMessageToSortedSet(message: string) {
        // Shouldn't worry too much about the performance of Date.now() here -- ~33M ops/sec on the macbook
        return this.redisClinet.ZADD(SORTED_SET_NAME, [{ score: Date.now(), value: message }]);
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
        return this.redisClinet.ZREM(SORTED_SET_NAME, message);
    };

    cleanUpSortedSet() {
        return this.redisClinet.DEL(SORTED_SET_NAME)
    }

    encodeProcessMessage(message: string) {
        return nonameproto.encode("PROCESS", message);
    }

    encodeAckMessage(message: string) {
        return nonameproto.encode("ACK", message);
    }
}
