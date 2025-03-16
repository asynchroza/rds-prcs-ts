import { Commands, COMMANDS_TO_BINARY } from "./commands";
import { PROTO_VERSION } from "./constants";

function getBuffer(message: Uint8Array<ArrayBufferLike>) {
    return new ArrayBuffer(1 + 1 + 4 + message.byteLength);
}

export function encode(operation: Commands, message: string) {
    const messageBuffer = new TextEncoder().encode(message);

    const buffer = getBuffer(messageBuffer);
    const view = new DataView(buffer);

    view.setUint8(0, PROTO_VERSION);
    view.setUint8(1, COMMANDS_TO_BINARY.get(operation)!);
    view.setUint32(2, messageBuffer.byteLength, true);

    for (let i = 0; i < messageBuffer.byteLength; i++) {
        view.setUint8(6 + i, messageBuffer[i]);
    }

    return new Uint8Array(buffer);
}
