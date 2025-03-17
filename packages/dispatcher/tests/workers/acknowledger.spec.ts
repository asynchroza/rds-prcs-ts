import { describe, expect, it, Mock, vi } from "vitest";
import { createClient } from "redis";
import { run } from "../../src/workers/acknowledger";
import prometheus from "prom-client";
import { afterEach } from "node:test";
import { WebSocketServer } from "ws";

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

    it("A message is propagated through initialized server socket", async () => {
        const on = vi.fn();

        // WebSockets are using the builder pattern to chain event handlers
        const mockedSocket = vi.fn().mockImplementation(() => createMockSocket(on));

        const eventServicePushAdd = vi.fn();

        (WebSocketServer as any).mockReturnValueOnce({
            on: mockedSocket,
        });

        (prometheus.Pushgateway as any).mockReturnValueOnce({
            pushAdd: eventServicePushAdd
        })

        await run(mockWorkerData);

        expect(createClient).toHaveBeenCalledExactlyOnceWith({ url: REDIS_URL });
        expect(prometheus.Pushgateway).toHaveBeenCalledExactlyOnceWith(PUSHGATEWAY_URL);
        expect(WebSocketServer).toHaveBeenCalledExactlyOnceWith({ port: ACK_PORT });

        // Server connection is initialized
        expect(mockedSocket).toHaveBeenCalledWith("connection", expect.any(Function));
        expect(on).toHaveBeenCalledWith("error", expect.any(Function));
        expect(on).toHaveBeenCalledWith("close", expect.any(Function));

        // Metrics are pushed
        expect(eventServicePushAdd).toHaveBeenCalledExactlyOnceWith({
            jobName: "dispatcher_acknowledger_metrics",
        });
    });
});

