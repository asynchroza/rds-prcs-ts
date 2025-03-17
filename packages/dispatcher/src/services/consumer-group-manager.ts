import WebSocket from "ws";
import { createClient } from "redis";

type Consumer = {
    url: string;
    connection: WebSocket;
    closed: boolean;
}

type GetNextAvailableConsumerStrategy = (manager: ConsumerGroupManager) => () => Consumer | undefined;

const CONSUMER_URLS_KEY = "consumer:urls";

/**
 * TODO: 
 *
 * I'm going to skip over this one for now...
 * This is a really inefficient way to get the next available consumer.
 * Not because the algorithm is bad but because we copy the `liveConnections` array
 * every time we yield it. 
 *
 * We're doing this to avoid exposing the internal reference to the array.
 * I.e. make it immutable and avoid side effects.
 *
 * but this doesn't help us much either way because the connection references within it are still 
 * accessible and mutable. Also, there's not really any way for us to avoid giving access
 * to the connections outside of the scope of the strategy and the manager, especially in 
 * high performance scenarios because a copy operation is expensive.
 *
 * Hence, TODO: Pull inside the consumer manager, avoid exposing the connections array.
 */
export const getNextAvailableConsumerRoundRobinStrategy = () => {
    let currentIndex = 0;
    const isConsumerReadyForConsuming = (consumer?: Consumer) => !consumer?.closed && consumer?.connection.readyState === WebSocket.OPEN;

    return (manager: ConsumerGroupManager) => {
        return () => {
            const liveConnections = manager.liveConnections;
            const totalConnections = liveConnections.length;

            if (totalConnections === 0) {
                return;
            }

            let startIndex = currentIndex;
            let checked = 0;

            while (!isConsumerReadyForConsuming(liveConnections[currentIndex]) && checked < totalConnections) {
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
    private _liveConnections: Consumer[] = [];
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

    private enqueueConnection(consumer: Consumer) {
        this._liveConnections.push(consumer);
        return this.addConsumerUrlToDatabase(consumer.url);
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

        const connectionPromises: Promise<Consumer>[] = [];

        for (const consumer of consumerUrls) {
            if (!this.connections[consumer]) {
                connectionPromises.push(this.establishConnectionWithConsumer(consumer));
            }
        }

        const consumers = await Promise.all(connectionPromises);

        consumers.map(consumer => {
            this.connections[consumer.url] = consumer;
        })
    }

    private async establishConnectionWithConsumer(consumerUrl: string) {
        const socket = new WebSocket(`ws://${consumerUrl}`);

        const consumer: Consumer = {
            url: consumerUrl,
            connection: socket,
            closed: false
        }

        await this.enqueueConnection(consumer);

        socket.onclose = () => {
            if (!consumer.closed) this.dequeueConnection(consumerUrl);

            // Ensure it's marked as closed
            consumer.closed = true;
        }

        socket.onerror = () => {
            console.error(`Error with connection to ${consumerUrl}`);

            // If consumer isn't already closed, close it
            if (!consumer.closed) this.dequeueConnection(consumerUrl);

            // Ensure it's marked as closed
            consumer.closed = true;
        }

        return consumer;
    }

    private async reconnectToConsumer(consumer: Consumer) {
        if (!consumer.closed) return;

        console.log(`Attempting to reconnect to ${consumer.url}`);

        const newConsumer = await this.establishConnectionWithConsumer(consumer.url);
        delete this.connections[consumer.url];

        this.connections[consumer.url] = newConsumer;
    }

    // TODO: 
    // If all consumers are unreachable for long periods, 
    // it's probably an issue on the dispatcher's side.
    // Bubble up the error to the main thread to give up leadership.
    async reconnectDeadConsumers() {
        const reconnectionPromises: Promise<void>[] = [];

        for (const connection of Object.values(this.connections)) {
            if (connection.closed) {
                reconnectionPromises.push(this.reconnectToConsumer(connection));
            }
        }

        await Promise.all(reconnectionPromises);
    }
}
