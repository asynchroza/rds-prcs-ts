import { BINARY_TO_COMMANDS, Commands } from "./commands";
import { PROTO_VERSION } from "./constants";

type InitialDecode = {
    command: Commands;
    message: string;
}

// Convert to result pattern
export function initialDecode({ buffer }: Buffer): InitialDecode {
    const view = new DataView(buffer);

    const version = view.getUint8(0);

    if (version !== PROTO_VERSION) {
        throw new Error("Invalid version");
    }

    const command = BINARY_TO_COMMANDS.get(view.getUint8(1));

    if (!command) {
        throw new Error("Invalid command");
    }

    const messageLength = view.getUint32(2, true); // true for little-endian byte order

    const messageBytes = new Uint8Array(buffer, 6, messageLength);

    const message = new TextDecoder().decode(messageBytes);

    return {
        command,
        message
    };
}

export function decode(buffer: Buffer) {
    console.log("buffer", typeof buffer);
    const result = initialDecode(buffer);

    switch (result.command) {
        case "PROCESS":
            return {
                ok: true,
                value: result.message
            };
        case "ACK":
            return {
                ok: false,
                error: new Error(result.message)
            };
    }
}
