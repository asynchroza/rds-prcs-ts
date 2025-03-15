import { createClient } from "redis";
import { Result } from "../types";

const LEADER_KEY = "leadership_lock";

export class LeadershipAcquirer {
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

    private async getLearshipLock(): Promise<Result<string | null>> {
        try {
            const result = await this.client.GET(LEADER_KEY);

            return { ok: true, value: result };
        } catch (error) {
            return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
    }

    async renewLeadership(ttl: number): Promise<Result<boolean>> {
        try {
            const isLeaderResult = await this.checkIsLeader();

            if (!isLeaderResult.ok) {
                return isLeaderResult;
            }

            if (!isLeaderResult.value) {
                return { ok: false, error: new Error("Only leader can renew the lock") };
            }

            return this.acquireLeadership(ttl);
        } catch (error) {
            return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
    }

    async checkIsLeader(): Promise<Result<boolean>> {
        const result = await this.getLearshipLock();

        if (!result.ok) {
            return result;
        }

        return { ok: true, value: result.value === this.leaderIdentifier };
    }

    async checkIsLockReleased(): Promise<Result<boolean>> {
        const result = await this.getLearshipLock();

        if (!result.ok) {
            return result;
        }

        return { ok: true, value: result.value === null };
    }
}
