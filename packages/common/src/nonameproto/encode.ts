import { types } from "..";
import { Commands, COMMANDS_TO_BINARY } from "./commands";
import { PROTO_VERSION } from "./constants";

function getBuffer(message: Uint8Array<ArrayBufferLike>) {
    return new ArrayBuffer(1 + 1 + 4 + message.byteLength);
}

export function encode(operation: Commands, message: string): types.Result<Uint8Array> {
    const messageBuffer = new TextEncoder().encode(message);

    const buffer = getBuffer(messageBuffer);
    const view = new DataView(buffer);

    view.setUint8(0, PROTO_VERSION);

    const command = COMMANDS_TO_BINARY.get(operation);

    // 0 IS A FALSY VALUE!!!
    if (command === undefined) {
        console.error(COMMANDS_TO_BINARY)
        return {
            ok: false, error: new Error(`Invalid command ${operation}`)
        }
    }

    view.setUint8(1, COMMANDS_TO_BINARY.get(operation)!);
    view.setUint32(2, messageBuffer.byteLength, true);

    for (let i = 0; i < messageBuffer.byteLength; i++) {
        view.setUint8(6 + i, messageBuffer[i]);
    }

    return { ok: true, value: new Uint8Array(buffer) };
}
