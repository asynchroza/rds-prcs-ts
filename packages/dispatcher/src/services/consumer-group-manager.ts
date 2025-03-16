import { createClient } from "redis";
import net from 'net'

/**
 * TODO:
 * - Retry establishing dead connections and moving them to live connetions -- filter over the map, do not introduce additional complexity with a separate queue
 */

type Consumer = {
    url: string;
    connection: net.Socket;
    closed: boolean;
}

import async_hooks from 'async_hooks';

const stackTraces = new Map();

const hook = async_hooks.createHook({
    init(asyncId, type, triggerAsyncId, resource) {
        // Capture the stack trace when an async operation is initialized
        const stack = (new Error()).stack;
        stackTraces.set(asyncId, stack);
    },
    destroy(asyncId) {
        // Print the stack trace when an async operation is destroyed
        const stack = stackTraces.get(asyncId);
        if (stack) {
            console.log(`Async operation ${asyncId} destroyed. Stack trace:\n${stack}`);
            stackTraces.delete(asyncId);
        }
    },
    promiseResolve(asyncId) {
        // Optionally track promise resolution
        console.log(`Promise ${asyncId} resolved.`);
    }
});

// Enable the async hook
hook.enable();

type GetNextAvailableConsumerStrategy = (manager: ConsumerGroupManager) => () => Consumer | undefined;

const CONSUMER_URLS_KEY = "consumer:urls";

/**
 * TODO: 
 * I'm going to skip over this for now but even though this looks CoOl,
 * it's a really inefficient way to get the next available consumer.
 * Not because the algorithm is bad but because we copy the `liveConnections` array
 * every time we yield it. We're doing this to avoid exposing the internal reference
 * but this doesn't help us much either way because the connection references are still 
 * accessible and mutable. Also, there's not really any way for us to avoid giving access
 * to the connections outside of the scope of the strategy and the manager, especially in 
 * high performance scenarius because a copy operation is expensive.
 *
 * Hence, TODO: Pull inside the consumer manager, avoid exposing the connections array.
 *
 * @qs
 *  * How expensive is the copy operation really if we have only 10 connections?
 */
export const getNextAvailableConsumerRoundRobinStrategy = () => {
    let currentIndex = 0;

    return (manager: ConsumerGroupManager) => {
        return () => {
            console.log("Getting next available consumer");
            const liveConnections = manager.liveConnections;
            const totalConnections = liveConnections.length;

            if (totalConnections === 0) {
                return;
            }

            let startIndex = currentIndex;
            let checked = 0;

            while (liveConnections[currentIndex]?.closed && checked < totalConnections) {
                currentIndex = (currentIndex + 1) % totalConnections;
                checked++;

                if (currentIndex === startIndex) {
                    return;
                }
            }

            const connection = liveConnections[currentIndex];

            if (!connection || connection.closed) {
                return;
            }

            currentIndex = (currentIndex + 1) % totalConnections;

            return connection;
        };
    };
};


export class ConsumerGroupManager {
    private connections: Record<string, Consumer> = {};
    private _liveConnections: Consumer[] = []; // Consumer reference or url?
    public getNextAvailableConsumer: () => Consumer | undefined;

    constructor(
        private redisClient: ReturnType<typeof createClient>,
        getNextAvailableConsumerStrategy: GetNextAvailableConsumerStrategy
    ) {
        this.getNextAvailableConsumer = getNextAvailableConsumerStrategy(this);
    }

    private dequeueConnection(consumerUrl: string) {
        console.log(`Disconnected from ${consumerUrl}`);
        const index = this._liveConnections.indexOf(this.connections[consumerUrl]);

        if (index > -1) {
            this._liveConnections.splice(index, 1);
        }

        // This is blocking the event loop if it reuses the suscribed connection
        this.deleteConsumerUrlFromDatabase(consumerUrl);
    }

    private enqueueConnection(consumerUrl: string) {
        console.log(`Connected to ${consumerUrl}`);
        this._liveConnections.push(this.connections[consumerUrl]);
        this.addConsumerUrlToDatabase(consumerUrl);
    }

    // TODO: Figure out a bettter way to handle this. Cloning the array is not efficient and we're still exposing the internal reference to the consumers
    get liveConnections() {
        return [...this._liveConnections];
    }

    private addConsumerUrlToDatabase(consumerUrl: string) {
        return this.redisClient.LPUSH(CONSUMER_URLS_KEY, consumerUrl);
    }

    private deleteConsumerUrlFromDatabase(consumerUrl: string) {
        return this.redisClient.LREM(CONSUMER_URLS_KEY, 1, consumerUrl);
    }

    private resetConsumerUrlsInRedisList() {
        return this.redisClient.DEL(CONSUMER_URLS_KEY);
    }

    /**
     * Method for cleaning up current connections (in database) 
     * and establishing new connections with provided consumers.
     */
    async setConsumers(consumerUrls: string[]) {
        await this.resetConsumerUrlsInRedisList();

        for (const consumer of consumerUrls) {
            if (!this.connections[consumer]) {
                this.connections[consumer] = this.establishConnectionWithConsumer(consumer);
            }
        }
    }

    /**
    * Method for creating a new socket connection to the specified consumer.
    * Appends the appropriate event listeners to the connection which would handle
    * trying to re-establish the connection in case of a disconnect and pushing the 
    * identifier to the Database.
    */
    private establishConnectionWithConsumer(consumerUrl: string, connectionRetryInSeconds: number = 1) {
        const [host, port] = consumerUrl.split(":");

        const connection = new net.Socket().connect({ port: Number(port), host })

        const consumer: Consumer = {
            url: consumerUrl,
            connection,
            closed: true
        }

        connection.on("close", () => {
            consumer.closed = true;
            this.dequeueConnection(consumerUrl);
        })

        connection.on("connect", () => {
            consumer.closed = false;
            this.enqueueConnection(consumerUrl);
        })

        return consumer;
    }

    private reconnectToConsumer(consumer: Consumer) {
        const [host, port] = consumer.url.split(":");

        if (consumer.connection.connecting) return;

        consumer.connection.connect({ port: parseInt(port), host })
            .once("error", (err) => {
                console.error(`Error reconnecting to ${consumer.url}:`, err.message);
            });

        console.log(`Attempting to reconnect to ${consumer.url}`);
    }

    regularlyReconnectDeadClients() {
        console.log("Reconnecting dead clients");
        for (const connection of Object.values(this.connections)) {
            if (connection.closed) {
                console.log(`Reconnecting to ${connection.url}`);
                this.reconnectToConsumer(connection);
            }
        }
    }
}
