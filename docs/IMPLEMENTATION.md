# Implementation Idea

## Assumptions Made
- We don't care about the order of how messages are processed and written to the stream
- It doesn't matter which worker processes which message
- The **message_id** property in the JSON payload sent by the publisher has no intrinsic meaning. We're assuming it corresponds to the underlying system generating the messages, 
    such as an IoT device or a broker and has nothing to do with our distribution system. 
    Identifying these messages is our responsibility and there's no requirements that we use the **message_id** property. 
    The reason for not using the **message_id** is to offload all deserialization and CPU-intensive tasks to the processing services.

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

## Dispatcher Architecture

- Node process which tries to acquire the leader lock from Redis. 
If acquired, it spawns three worker threads - one is suscribed to the pubsub channel and routes messages, second is listening for ACKs and third is
processing pending messages by republishing them. We don't have a guarantee that all of these would run in parallel but it's a good starting point. 
The main thread is responsible for acquiring the lock, starting and shutting down worker threads based on the lock state.

### Message Routing 

- The node process is fed a configuration file with all available consumers
    - Consumer IDs will be `host:port`
- After a message is received on the channel, assign an ID to the message, distribute to next consumer
  in queue.
- Message is delivered over a connection using the [custom protocol](#custom-protocol)

### Listening for ACKs

- Listening on a port - How to make sure that leader receives the frames when we have multiple active dispatchers
    - Replicative fan-out, new service?
    - Can NGINX or Caddy do something of the sorts?
- Consumers use the [custom protocol](#custom-protocol) to let us know they have acknowledged a message.

### Redistribution of Unacknowledged Messages

- Process is actively retrieving the latest values available for redistribution from the sorted hash set
- Publishes the unacknowledge messages on the same pubsub channel and expires the entry from the set (it's expected that the message routing thread would set it anew if unprocessed)
    - We have only one dispatcher concerned with redistributing the messages so as far we don't execute redistribution processes in parallel,
        with redistributing the same message twice.

## Custom Protocol

```
 | Protocol Version (1 byte) | Command (1 byte) | Length (4 bytes) | Payload (variable length) |
```

### Commands

| Command (Bits) | Name            | Description                                                                 |
|----------------|-----------------|-----------------------------------------------------------------------------|
| 0              | PROCESS_MESSAGE | Expects a payload consisting of a UUID4 identifier followed by a JSON payload of 54 ASCII characters (formatted as `UUID4:json_data`). |
| 1              | ACK_MESSAGE     | Expects a payload consisting only of a UUID4 identifier.                   |


## Consumer

- Consumer must store processed message into a Redis Stream and acknowledge the message upon processing by sending `ACK_MESSAGE` and the corresponding ID given by the dispatcher.