# Requirements Investigation

You need to develop a console application that simulates a scalable consumer group processing
messages from a Redis Pub/Sub channel.

## Configurable Consumer Group
- You need to implement a consumer group with
a configurable group size (number of
consumers).
    - [What are streams in Redis?](https://redis.io/docs/latest/develop/tools/insight/tutorials/insight-stream-consumer/)
        - Immutable log files
        - Random access in O(1) time (?)
        - Trimming strategies - [XREAD](https://redis.io/docs/latest/commands/xread/), [XREADGROUP](https://redis.io/docs/latest/commands/xreadgroup/), [XRANGE](https://redis.io/docs/latest/commands/xrange/) (*Consider these when thinking about scalability)
    - Consumer Groups
        - Kafka's terminology
            - Each message is served to a different consumer so that it is not possible that the same message will be delivered to multiple consumers.
            - Consumers are identified, within a consumer group, by a name, which is a case-sensitive string that the clients implementing consumers must choose. This means that even after a disconnect, the stream consumer group retains all the state, since the client will claim again to be the same consumer. However, this also means that it is up to the client to provide a unique identifier.
            - Each consumer group has the concept of the first ID never consumed so that, when a consumer asks for new messages, it can provide just messages that were not previously delivered.
            - Consuming a message, however, requires an explicit acknowledgment using a specific command. Redis interprets the acknowledgment as: this message was correctly processed so it can be evicted from the consumer group.
            - A consumer group tracks all the messages that are currently pending, that is, messages that were delivered to some consumer of the consumer group, but are yet to be acknowledged as processed. Thanks to this feature, when accessing the message history of a stream, each consumer will only see messages that were delivered to it.

        - `XACK` acknowledging consumed messages (IMPORTANT! - we will have to process and then acknowledge consumed message)
        - **Claiming** messages in case of failure (`XPENDING`, `XCLAIM` and automatic claiming)

        - So once the deliveries counter reaches a given large number that you chose, it is probably wiser to put such messages in another stream and send a notification to the system administrator. This is basically the way that Redis Streams implements the **dead letter** concept.

        - Processing order
            - If you use 1 stream -> 1 consumer, you are processing messages in order.
            - If you use N streams with N consumers, so that only a given consumer hits a subset of the N streams, you can scale the above model of 1 stream -> 1 consumer.
            - If you use 1 stream -> N consumers, you are load balancing to N consumers, however in that case, messages about the same logical item may be consumed out of order, because a given consumer may process message 3 faster than another consumer is processing message 4.
            - So basically Kafka partitions are more similar to using N different Redis keys, while Redis consumer groups are a server-side load balancing system of messages from a given stream to N different consumers.


- It must be possible to specify the desired
group size through command-line arguments
or configuration files.

## Consumer Behaviour

- Consumer(s) should subscribe to the
pre-defined Pub/Sub channel
"messages:published".

- Consumers should expect messages in JSON
format containing a "message_id" field with a
random identifier.

- During startup, the application should create a
Redis List with the key name "consumer:ids"
and ensure that only active consumer ids are
in the list.

- Important! Please consider your solution's
scalability. As the number of consumers
increases, the message processing
throughput should increase.

## Message Processing

- You should implement a function to process
the received messages. This can be a simple
function that simulates processing by adding a
random property and value to a message
object.

- Important! Ensure only one consumer within
the group processes each message.

- After processing, store the message data
(including the "message_id" and any
processing results) in a Redis Stream with the
key name "messages:processed".

- The stored stream entry in
"messages:processed" should also include
the consumer's ID that processed the
message.


## Monitoring

- You need to implement logic to periodically (e.g. every 3 seconds)
report the current number of messages processed per second.
