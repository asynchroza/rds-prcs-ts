import { createClient } from "redis";
import { Result } from "../types";

const LEADER_KEY = "leadership_lock";

export class LeadershipAcquirer {
    // RedisClientType is not assignable for some reason
    constructor(private client: ReturnType<typeof createClient>, private leaderIdentifier: string) { }

    async acquireLeadership(ttl: number): Promise<Result<boolean>> {
        try {
            const result = await this.client.SET(LEADER_KEY, this.leaderIdentifier, {
                NX: true, // Set if not exists @link https://redis.io/docs/latest/commands/setnx/
                EX: ttl   // Set expiration time in seconds @link https://redis.io/docs/latest/commands/set/
            });

            // result is (nil) if lock was not acquired
            return { ok: true, value: result === "OK" };
        } catch (error) {
            return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
    }
}
