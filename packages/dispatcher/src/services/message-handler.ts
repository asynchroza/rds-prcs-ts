import { createClient } from "redis";

const SORTED_SET_NAME = "messages:pending";

export class MessageHandler {
    constructor(private redisClinet: ReturnType<typeof createClient>) { }

    addMessageToSortedSet(message: string) {
        // Shouldn't worry too much about the performance of Date.now() here -- ~33M ops/sec on the macbook
        return this.redisClinet.ZADD(SORTED_SET_NAME, [{ score: Date.now(), value: message }]);
    }

    cleanUpSortedSet() {
        return this.redisClinet.DEL(SORTED_SET_NAME)
    }

    // TODO: Encode message to protocol
    encodeMessage(message: string) {
        return message;
    }
}
