import { createClient } from "redis"
import prometheus from 'prom-client'

async function checkForReprocessedMessages() {
    const countPerMessageId = {}

    const client = createClient({ url: "redis://localhost:7234" })
    await client.connect()

    const messages = await client.xRange("messages:processed", "-", "+")

    console.log(`Found ${messages.length} messages`)

    for (const { message } of messages) {
        if (!countPerMessageId[message.message_id]) {
            countPerMessageId[message.message_id] = 1
        } else {
            countPerMessageId[message.message_id]++;
        }
    }

    console.log(`Found ${Object.keys(countPerMessageId).length} unique message IDs`)
}

const testEventServiceWrite = async () => {
    const client = new prometheus.Pushgateway('http://localhost:9091')
    const counter = new prometheus.Counter({
        name: 'test_event_service_write',
        help: 'Test event service write',
        labelNames: ['status']
    })

    const count = 10;

    for (let i = 0; i < count; i++) {
        counter.inc()
    }


    await client.pushAdd({ jobName: 'test_event_service_write' }, (err, resp, body) => {
        console.log('pushAdd', err, resp, body)
    }).catch(console.error);
}

(async () => {
    // await checkForReprocessedMessages()
    await testEventServiceWrite()

    process.exit(0)
})()

