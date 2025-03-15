# Implementation Idea

## Assumptions Made
- We don't care about the order of how messages are processed and written to the stream
- It doesn't matter which worker processes which message
- The **message_id** property in the JSON payload sent by the publisher has no intrinsic meaning. We're assuming it corresponds to the underlying system generating the messages, 
    such as an IoT device or a broker and has nothing to do with our distribution system. 
    Identifying these messages is our responsibility and there's no requirements that we use the **message_id** property. 
    The reason for this is to to offload all deserialization and CPU-intensive tasks to the workers.

## Dispatcher Leader with Processing Workers writing to a Redis Cluster

A subscriber leader listens to a the pubsub channel and dispatches messages to the processing workers in a round-robin fashion.
The workers are distributed containerized processes which parse the json messages and write them to a Stream in a Redis Cluster.
Once the message is written to the stream, the worker acknowledges the message.

### Dispatcher Leader
- Subscribes to the channel for new messages

- Dispatches messages to the registered consumers in a round-robin fashion
    - Before a message is dispatched, it's stored in as a sorted set with its timestamp as pending - `timestamp: message_id`
        - A worker is considered to have failed to process a message if the message wasn't processed within a certain period (e.g. **2 seconds**)
        - How sustainable is this? What happens if none of the workers are available?
            - All of this data is in volatile memory - Snapshots? [Read more](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)

- If a worker fails to ACK a message, the leading dispatcher should send the message to another worker
    - Leading dispatcher has three threads - one is suscribed to the pubsub channel, second is listening on a socket for ACKs and third is processing pending messages
    - A message is ACK'ed only and only if it was fully processed and written to Redis Stream

- If a dispatcher fails, another dispatcher should take over
    - This is done with a leader election algorithm - using `SETNX` - `SETNX distributed_leader_lock <pid>`, `EXPIRE distributed_leader_lock 2`
    - Test with chaosmonkey and figure out if **2 seconds** is a good tradeoff.

- There isn't any straightforward way how to scale the dispatcher leader
    - We cannot route messages from the server (the redis instance) to different dispatcher leaders which would in turn handle the routing to the Workers
    (also it doesn't make sense to have a dispatcher leader if we could do a direct subscription between the server and the processing workers)
        - We're entering Redis Consumer Group territory, Redis is handling the distribution of the messages i.e. the dispatcher is embedded within the Redis process (i.e. `XREADGROUP` with consumer id)

