import { createClient } from "redis";
import { types } from "@asynchroza/common";

const LEADER_KEY = "leadership_lock";

type IntervalCallbacks = {
    /**
    * Callback to be called when this successfully renews its leadership.
    */
    onLeadershipRenewal?: () => Promise<void>;

    /**
    * Callback to be called when this dispatcher instance acquires a new leadership.
    *
    * @note Difference between this and `onLeadershipRenewal` is that this is only 
    * called if the previous leadership instance is different from the current one (i.e. this process)
    */
    onLeadershipAcquire?: () => Promise<void>;

    /**
    * Callback to be called when this dispatcher instance loses leadership
    */
    onLeadershipLoss?: () => Promise<void>;
}

export class LeadershipAcquirer {
    private lockRenewalInterval: NodeJS.Timeout | null = null;
    constructor(private client: ReturnType<typeof createClient>, private leaderIdentifier: string) { }

    async acquireLeadership(ttl: number): Promise<types.Result<boolean>> {
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

    private async getLearshipLock(): Promise<types.Result<string | null>> {
        try {
            const result = await this.client.GET(LEADER_KEY);

            return { ok: true, value: result };
        } catch (error) {
            return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
    }

    async renewLeadership(ttl: number): Promise<types.Result<boolean>> {
        try {
            const isLeaderResult = await this.checkIsLeader();

            if (!isLeaderResult.ok) {
                return isLeaderResult;
            }

            if (!isLeaderResult.value) {
                return { ok: false, error: new Error("Only leader can renew the lock") };
            }

            const result = await this.client.SET(LEADER_KEY, this.leaderIdentifier, {
                EX: ttl,
                XX: true // Set if exists
            });

            return { ok: true, value: result === "OK" };
        } catch (error) {
            return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
    }

    async checkIsLeader(): Promise<types.Result<boolean>> {
        const result = await this.getLearshipLock();

        if (!result.ok) {
            return result;
        }

        return { ok: true, value: result.value === this.leaderIdentifier };
    }

    async checkIsLockReleased(): Promise<types.Result<boolean>> {
        const result = await this.getLearshipLock();

        if (!result.ok) {
            return result;
        }

        return { ok: true, value: result.value === null };
    }

    async acquireLeadershipOnRelease(mutex: { shouldGiveUpLeadership: boolean }, ttl: number, checkIntervalInSeconds: number, callbacks?: IntervalCallbacks) {
        mutex.shouldGiveUpLeadership = false;

        this.lockRenewalInterval = setInterval(async () => {
            const isReleasedResult = await this.checkIsLockReleased();

            if (!isReleasedResult.ok) {
                console.error("Error checking lock release:", isReleasedResult.error);
                return;
            }

            if (isReleasedResult.value) {
                console.log("Lock released, attempting to acquire...");

                const acquireResult = await this.acquireLeadership(ttl);

                if (acquireResult.ok && acquireResult.value) {
                    console.log("Successfully acquired leadership lock!");
                    await callbacks?.onLeadershipAcquire?.();

                    await this.startRenewingLeadership(mutex, ttl, checkIntervalInSeconds, callbacks);
                } else {
                    console.log("Failed to acquire leadership lock.");
                }
            }
        }, checkIntervalInSeconds * 1000);
    }

    private async startRenewingLeadership(mutex: { shouldGiveUpLeadership: boolean }, ttl: number, checkIntervalInSeconds: number, callback?: IntervalCallbacks): Promise<void> {
        if (this.lockRenewalInterval) {
            clearInterval(this.lockRenewalInterval);
        }

        const renewalInterval = setInterval(async () => {
            // Do not even try to renew if we are requested to give up leadership
            if (mutex.shouldGiveUpLeadership) {
                console.log("Mutex requested to give up leadership, stopping renewal...");

                clearInterval(renewalInterval);
                mutex.shouldGiveUpLeadership = false;

                await callback?.onLeadershipLoss?.();
                await this.acquireLeadershipOnRelease(mutex, ttl, checkIntervalInSeconds);
            }

            const renewalResult = await this.renewLeadership(ttl);

            if (!renewalResult.ok || !renewalResult.value) {
                console.error("Failed to renew leadership lock.");

                clearInterval(renewalInterval);
                await callback?.onLeadershipLoss?.();

                console.debug("Starting to monitor lock release again...");
                await this.acquireLeadershipOnRelease(mutex, ttl, checkIntervalInSeconds);
            } else {
                console.log("Leadership lock renewed successfully.");
            }
        }, checkIntervalInSeconds * 1000);
    }
}
