import { createClient } from "redis";
import net from 'net'

type Consumer = {
    url: string;
    connection: net.Socket;
    closed: boolean;
}

export class ConsumerGroupManager {
    private connections: Record<string, Consumer> = {};
    private liveConnections: Consumer[] = []; // Consumer reference or url?

    constructor(private redisClient: ReturnType<typeof createClient>, private tcpClient = new net.Socket()) { }

    private dequeueConnection(consumerUrl: string) {
        const index = this.liveConnections.indexOf(this.connections[consumerUrl]);

        if (index > -1) {
            this.liveConnections.splice(index, 1);
        }
    }

    private enqueueConnection(consumerUrl: string) {
        this.liveConnections.push(this.connections[consumerUrl]);
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

        connection.on("error", () => {
            consumer.closed = true;
            this.dequeueConnection(consumerUrl);
        })

        connection.on("close", () => {
            consumer.closed = true;
            this.dequeueConnection(consumerUrl);
        })

        connection.on("end", () => {
            consumer.closed = true;
            this.dequeueConnection(consumerUrl);
        })

        connection.on("timeout", () => {
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
