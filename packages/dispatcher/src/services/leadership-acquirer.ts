import { RedisClientType } from "@redis/client";

const LEADER_KEY = "leadership_lock";

export class LeadershipAcquirer {
    constructor(private client: RedisClientType, private leaderIdentifier: string) { }

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
