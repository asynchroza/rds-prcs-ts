import prometheus from 'prom-client';

export class EventsService {
    relayedMessageToConsumerCounter = new prometheus.Counter({
        name: 'processed_messages_total',
        help: 'Number of messages processed by the dispatcher',
    })
    receivedMessagesFromPublisherCounter = new prometheus.Counter({
        name: 'received_messages_from_publisher_total',
        help: 'Number of messages received from the publisher',
    })

    constructor(private name: string, private client: prometheus.Pushgateway<any>) { }

    async incrementRelayedToConsumerMetric() {
        this.relayedMessageToConsumerCounter.inc();
    }

    async incrementReceivedMessagesFromPublisherMetric() {
        this.receivedMessagesFromPublisherCounter.inc();
    }

    async pushMetrics() {
        await this.client.pushAdd({ jobName: `dispatcher_${this.name}_metrics` });
    }

    async startPushingMetrics(intervalInSeconds: number = 3) {
        setInterval(async () => {
            this.pushMetrics().catch(console.error);
        }, intervalInSeconds * 1000);
    }
}
