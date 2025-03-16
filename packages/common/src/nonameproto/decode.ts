import { types } from "..";
import { BINARY_TO_COMMANDS, Commands } from "./commands";
import { PROTO_VERSION } from "./constants";

type InitialDecode = {
    command: Commands;
    message: string;
}

export function initialDecode(buffer: ArrayBuffer): types.Result<InitialDecode> {
    const view = new DataView(buffer);

    const version = view.getUint8(0);

    if (version !== PROTO_VERSION) {
        return {
            ok: false,
            error: new Error("Invalid version")
        }
    }

    const command = BINARY_TO_COMMANDS.get(view.getUint8(1));

    if (!command) {
        return {
            ok: false,
            error: new Error("Invalid command")
        }
    }

    const messageLength = view.getUint32(2, true);

    const messageBytes = new Uint8Array(buffer, 6, messageLength);

    const message = new TextDecoder().decode(messageBytes);

    return {
        ok: true, value: {
            command,
            message
        }
    };
}

export function decode(buffer: ArrayBuffer) {
    const result = initialDecode(buffer);

    if (!result.ok) {
        return result;
    }

    switch (result.value.command) {
        case "PROCESS":
            return {
                ok: true,
                value: result.value
            };
        case "ACK":
            return {
                ok: true,
                value: result.value
            };
        default:
            return {
                ok: false,
                error: new Error("Invalid command")
            };
    }
}
