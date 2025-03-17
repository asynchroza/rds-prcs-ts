import { describe, expect, it, Mock, vi } from "vitest";
import { createClient } from "redis";
import prometheus from "prom-client";
import { afterEach } from "node:test";
import { WebSocketServer } from "ws";
import { EventsService } from "../../src/services/events-service";
import { MessageHandler } from "../../src/services/message-handler";
import { nonameproto } from "@asynchroza/common";
import { createHandleMessage, run } from "../../src/workers/acknowledger/worker";

const createMockSocket = (on: Mock) => ({
    on: on.mockImplementation(() => createMockSocket(on)),
})

vi.mock("redis", () => ({
    createClient: vi.fn(() => ({
        connect: vi.fn()
    })),
}))

vi.mock("prom-client", () => ({
    default: {
        Counter: vi.fn(),
        Pushgateway: vi.fn()
    }
}));

vi.mock("ws", () => ({
    WebSocketServer: vi.fn()
}));

vi.mock("@asynchroza/common", () => ({
    nonameproto: {
        decode: vi.fn()
    }
}))

const REDIS_URL = "redis://redis-mock:7123";
const ACK_PORT = 7124;
const PUSHGATEWAY_URL = "http://pushgateway-mock:9091";

describe("Acknowledger", () => {
    const mockWorkerData = {
        redisUrl: REDIS_URL,
        acknowledgerPort: ACK_PORT,
        pushgatewayUrl: PUSHGATEWAY_URL
    }

    afterEach(() => {
        vi.clearAllMocks()
    });

    it("Server is correctly initialized", async () => {
        const on = vi.fn();

        // WebSockets are using the builder pattern to chain event handlers
        // Pass along the same `on` mock reference to easily test the chain
        const mockedSocket = vi.fn().mockImplementation(() => createMockSocket(on));

        const eventServicePushAdd = vi.fn();

        (WebSocketServer as any).mockReturnValueOnce({
            on: mockedSocket,
        });

        (prometheus.Pushgateway as any).mockReturnValueOnce({
            pushAdd: eventServicePushAdd
        })

        await run(mockWorkerData);

        // Dependencies are initialized
        expect(createClient).toHaveBeenCalledExactlyOnceWith({ url: REDIS_URL });
        expect(prometheus.Pushgateway).toHaveBeenCalledExactlyOnceWith(PUSHGATEWAY_URL);

        // Server connection is initialized
        expect(WebSocketServer).toHaveBeenCalledExactlyOnceWith({ port: ACK_PORT });
        expect(mockedSocket).toHaveBeenCalledWith("connection", expect.any(Function));
        expect(on).toHaveBeenCalledWith("error", expect.any(Function));
        expect(on).toHaveBeenCalledWith("close", expect.any(Function));

        // Metrics are pushed
        expect(eventServicePushAdd).toHaveBeenCalledExactlyOnceWith({
            jobName: "dispatcher_acknowledger_metrics",
        });
    });

    it("Removes parsed message from sorted set as it's acknowledged", async () => {
        const messageHandler = {
            removeMessageFromSortedSet: vi.fn().mockImplementationOnce(() => Promise.resolve(1))
        };

        const eventService = {
            incrementAcknowledgedMessagesMetric: vi.fn()
        }

        const handleMessage = createHandleMessage(
            messageHandler as unknown as MessageHandler,
            eventService as unknown as EventsService
        );

        (nonameproto.decode as Mock<typeof nonameproto.decode>).mockReturnValueOnce({
            ok: true,
            value: {
                command: "ACK",
                message: "AAAAAA"
            }
        })

        handleMessage(new ArrayBuffer(10));

        expect(messageHandler.removeMessageFromSortedSet).toHaveBeenCalledExactlyOnceWith("AAAAAA");
    })
});

