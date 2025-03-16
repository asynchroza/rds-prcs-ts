import { RawData } from 'ws'

const sliceBuffer = (data: RawData) => {
    let arrayBuffer: ArrayBufferLike | undefined;

    if (Buffer.isBuffer(data)) {
        arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    } else if (data instanceof ArrayBuffer) {
        arrayBuffer = data;
    } else if (data instanceof Uint8Array) {
        arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }

    return arrayBuffer;
}

export { sliceBuffer }
