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

type GetNextAvailableConsumerStrategy = (manager: ConsumerGroupManager) => () => Consumer | undefined;

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

            if (currentIndex >= liveConnections.length) {
                currentIndex = 0;
            }

            const connection = liveConnections[currentIndex];

            if (connection.closed) {
                return manager.getNextConnection();
            }

            currentIndex = (currentIndex + 1) % liveConnections.length;

            return connection;
        }
    }
}

export class ConsumerGroupManager {
    private connections: Record<string, Consumer> = {};
    private _liveConnections: Consumer[] = []; // Consumer reference or url?
    public getNextConnection: () => Consumer | undefined;

    constructor(
        private redisClient: ReturnType<typeof createClient>,
        getNextAvailableConsumerStrategy: GetNextAvailableConsumerStrategy,
        private tcpClient = new net.Socket()
    ) {
        this.getNextConnection = getNextAvailableConsumerStrategy(this);
    }

    private dequeueConnection(consumerUrl: string) {
        console.log(`Disconnected from ${consumerUrl}`);
        const index = this._liveConnections.indexOf(this.connections[consumerUrl]);

        if (index > -1) {
            this._liveConnections.splice(index, 1);
        }
    }

    private enqueueConnection(consumerUrl: string) {
        this._liveConnections.push(this.connections[consumerUrl]);
    }

    // TODO: Figure out a bettter way to handle this. Cloning the array is not efficient and we're still exposing the internal reference to the consumers
    get liveConnections() {
        return [...this._liveConnections];
    }

    async setConsumers(consumers: string[]) {
        // Clean up connections to avoid memory leaks
        for (const [consumer, connection] of Object.entries(this.connections)) {
            if (!consumers.includes(consumer)) {
                // Connection might be active but it's not part of the consumers list

                connection.connection.destroy();
                delete this.connections[consumer];

                this.dequeueConnection(consumer);
            }
        }

        for (const consumer of consumers) {
            if (!this.connections[consumer]) {
                this.connections[consumer] = this.establishConnectionWithConsumer(consumer);
            }
        }

        // TODO: Populate redis list
    }

    private establishConnectionWithConsumer(consumerUrl: string) {
        const [host, port] = consumerUrl.split(":");

        const connection = this.tcpClient.connect({ port: Number(port), host })

        const consumer: Consumer = {
            url: consumerUrl,
            connection,
            closed: false
        }

        connection.on("close", () => {
            consumer.closed = true;
            this.dequeueConnection(consumerUrl);
        })

        connection.on("connect", () => {
            consumer.closed = false;
            console.log(`Connected to ${consumerUrl}`);
            this.enqueueConnection(consumerUrl);
        })

        return consumer;
    }
}
