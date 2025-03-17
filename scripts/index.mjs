import { createClient } from "redis"

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

(async () => {
    await checkForReprocessedMessages()

    process.exit(0)
})()

