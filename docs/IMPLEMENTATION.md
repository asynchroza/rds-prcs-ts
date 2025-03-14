# Implementation Idea

## Assumptions Made
- We don't care about the order of how messages are processed and written to the stream
- Publisher is sending messages with a unique **message_id** but we won't be using it in the dispatcher
    - We could possibly decide to which machine to route the message based on the **message_id** but this means that we have to deserialize it on the dispatcher (no bueno)

## Dispatcher Leader with Processing Workers writing to a Redis Cluster

A subscriber leader listens to a the pubsub channel and dispatches messages to the processing workers in a round-robin fashion.
The worker apis are distributed processes that parse the json messages and write the processed messages to a Stream in a Redis Cluster.

### Dispatcher Leader
- Subscribes to the channel for new messages
- Dispatches messages to the registered consumers in a round-robin fashion (or any other strategy)
    - These could be dedicated Redis Lists
- If a worker fails, the dispatcher should reassign/send the message to another worker
- If a dispatcher fails, another dispatcher should take over
    - This could be done with a leader election algorithm
    - How to handle unprocessed messages? 
        - Mark a message as sent and wait for the consumer to acknowledge it - push in a persistent queue
        - Avoid memory overconsumption by tagging messages with a TTL
            - We're risking losing messages if the TTL expires before the message is processed
                - In our case, we're routing them in a round robin way so as long as we have multiple workers, we should be fine
- There isn't any straightforward way how to scale the dispatcher leader
    - We cannot route messages from the server (the redis instance) to different dispatcher leaders which would in turn handle the routing to the Workers
    (also it doesn't make sense to have a dispatcher leader if we could do a direct subscription between the server and the processing workers)
        - We're entering Redis Consumer Group territory, Redis is handling the distribution of the messages i.e. the dispatcher is embedded (i.e. `XREADGROUP` with consumer id)

