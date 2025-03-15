import { createClient } from "redis";
import net from 'net'
import { inspect } from 'util'

/**
 * TODO:
 * - Retry establishing dead connections and moving them to live connetions -- filter over the map, do not introduce additional complexity with a separate queue
 */

type Consumer = {
    url: string;
    connection: net.Socket;
    closed: boolean;
}

type GetNextAvailableConsumerStrategy = (manager: ConsumerGroupManager) => () => Consumer | undefined;

const CONSUMER_URLS_KEY = "consumer:urls";

/**
 * This is not encapsulating the connetions well. Consider moving them inside the class.
 */
export const getNextAvailableConsumerRoundRobinStrategy = () => {
    let currentIndex = 0;

    return (manager: ConsumerGroupManager) => {
        return () => {
            const liveConnections = manager.liveConnections;

            if (liveConnections.length === 0) {
                return;
            }

            // Skip closed connections
            while (liveConnections[currentIndex]?.closed) {
                currentIndex = (currentIndex + 1) % liveConnections.length;
                if (currentIndex === 0) break;
            }

            const connection = liveConnections[currentIndex];

            if (!connection || connection.closed) {
                return;
            }

            currentIndex = (currentIndex + 1) % liveConnections.length;

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

        Promise.resolve().then(() => this.deleteConsumerUrlFromDatabase(consumerUrl))
    }

    private async enqueueConnection(consumerUrl: string) {
        console.log(`Connected to ${consumerUrl}`);
        this._liveConnections.push(this.connections[consumerUrl]);
        Promise.resolve().then(() => this.addConsumerUrlToDatabase(consumerUrl));
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

    async setConsumers(consumerUrls: string[]) {
        for (const consumer of consumerUrls) {
            if (!this.connections[consumer]) {
                this.connections[consumer] = this.establishConnectionWithConsumer(consumer);
            }
        }

        await this.resetConsumerUrlsInRedisList();
    }

    private establishConnectionWithConsumer(consumerUrl: string) {
        const [host, port] = consumerUrl.split(":");

        const connection = new net.Socket().connect({ port: Number(port), host })

        const consumer: Consumer = {
            url: consumerUrl,
            connection,
            closed: false
        }

        // connection.on("error", async () => {
        //     consumer.closed = true;
        //     console.log("CLOSE", { live: this.connections })
        //     this.dequeueConnection(consumerUrl);
        // })

        connection.once("close", () => {
            setImmediate(() => consumer.closed = true);
            console.log("CLOSE", { live: this.connections })
            // this.dequeueConnection(consumerUrl);
        })

        connection.once("connect", () => {
            consumer.closed = false;
            this.enqueueConnection(consumerUrl);
        })

        return consumer;
    }
}
