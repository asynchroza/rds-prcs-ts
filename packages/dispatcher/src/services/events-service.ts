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
    acknowledgedMessagesCounter = new prometheus.Counter({
        name: 'acknowledged_messages_total',
        help: 'Number of messages acknowledged by the consumer',
    })
    redistributedMessagesCounter = new prometheus.Counter({
        name: 'redistributed_messages_total',
        help: 'Number of previously unacknowledged messages redistributed by the dispatcher',
    })

    constructor(private name: string, private client: prometheus.Pushgateway<any>) { }

    async incrementRelayedToConsumerMetric() {
        this.relayedMessageToConsumerCounter.inc();
    }

    async incrementReceivedMessagesFromPublisherMetric() {
        this.receivedMessagesFromPublisherCounter.inc();
    }

    async incrementAcknowledgedMessagesMetric() {
        this.acknowledgedMessagesCounter.inc();
    }

    async incrementRedistributedMessagesMetric(count: number = 1) {
        this.redistributedMessagesCounter.inc(count);
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
