import { RawData } from 'ws'
import { types } from '..';

const sliceBuffer = (data: RawData): types.Result<ArrayBufferLike> => {
    let arrayBuffer: ArrayBufferLike | undefined;

    try {
        if (Buffer.isBuffer(data)) {
            arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        } else if (data instanceof ArrayBuffer) {
            arrayBuffer = data;
        } else if (data instanceof Uint8Array) {
            arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        }
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
    };

    if (!arrayBuffer) {
        return { ok: false, error: new Error("Couldn't slice buffer") };
    }

    return { ok: true, value: arrayBuffer };
}

export { sliceBuffer }
