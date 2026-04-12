/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Lazy } from './lazy.js';
import * as streams from './stream.js';
const hasBuffer = (typeof Buffer !== 'undefined');
const indexOfTable = new Lazy(() => new Uint8Array(256));
let textEncoder;
let textDecoder;
export class VSBuffer {
    /**
     * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
     * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
     */
    static alloc(byteLength) {
        if (hasBuffer) {
            return new VSBuffer(Buffer.allocUnsafe(byteLength));
        }
        else {
            return new VSBuffer(new Uint8Array(byteLength));
        }
    }
    /**
     * When running in a nodejs context, if `actual` is not a nodejs Buffer, the backing store for
     * the returned `VSBuffer` instance might use a nodejs Buffer allocated from node's Buffer pool,
     * which is not transferrable.
     */
    static wrap(actual) {
        if (hasBuffer && !(Buffer.isBuffer(actual))) {
            // https://nodejs.org/dist/latest-v10.x/docs/api/buffer.html#buffer_class_method_buffer_from_arraybuffer_byteoffset_length
            // Create a zero-copy Buffer wrapper around the ArrayBuffer pointed to by the Uint8Array
            actual = Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength);
        }
        return new VSBuffer(actual);
    }
    /**
     * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
     * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
     */
    static fromString(source, options) {
        const dontUseNodeBuffer = options?.dontUseNodeBuffer || false;
        if (!dontUseNodeBuffer && hasBuffer) {
            return new VSBuffer(Buffer.from(source));
        }
        else {
            if (!textEncoder) {
                textEncoder = new TextEncoder();
            }
            return new VSBuffer(textEncoder.encode(source));
        }
    }
    /**
     * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
     * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
     */
    static fromByteArray(source) {
        const result = VSBuffer.alloc(source.length);
        for (let i = 0, len = source.length; i < len; i++) {
            result.buffer[i] = source[i];
        }
        return result;
    }
    /**
     * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
     * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
     */
    static concat(buffers, totalLength) {
        if (typeof totalLength === 'undefined') {
            totalLength = 0;
            for (let i = 0, len = buffers.length; i < len; i++) {
                totalLength += buffers[i].byteLength;
            }
        }
        const ret = VSBuffer.alloc(totalLength);
        let offset = 0;
        for (let i = 0, len = buffers.length; i < len; i++) {
            const element = buffers[i];
            ret.set(element, offset);
            offset += element.byteLength;
        }
        return ret;
    }
    static isNativeBuffer(buffer) {
        return hasBuffer && Buffer.isBuffer(buffer);
    }
    constructor(buffer) {
        this.buffer = buffer;
        this.byteLength = this.buffer.byteLength;
    }
    /**
     * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
     * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
     */
    clone() {
        const result = VSBuffer.alloc(this.byteLength);
        result.set(this);
        return result;
    }
    toString() {
        if (hasBuffer) {
            return this.buffer.toString();
        }
        else {
            if (!textDecoder) {
                textDecoder = new TextDecoder(undefined, { ignoreBOM: true });
            }
            return textDecoder.decode(this.buffer);
        }
    }
    slice(start, end) {
        // IMPORTANT: use subarray instead of slice because TypedArray#slice
        // creates shallow copy and NodeBuffer#slice doesn't. The use of subarray
        // ensures the same, performance, behaviour.
        return new VSBuffer(this.buffer.subarray(start, end));
    }
    set(array, offset) {
        if (array instanceof VSBuffer) {
            this.buffer.set(array.buffer, offset);
        }
        else if (array instanceof Uint8Array) {
            this.buffer.set(array, offset);
        }
        else if (array instanceof ArrayBuffer) {
            this.buffer.set(new Uint8Array(array), offset);
        }
        else if (ArrayBuffer.isView(array)) {
            this.buffer.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), offset);
        }
        else {
            throw new Error(`Unknown argument 'array'`);
        }
    }
    readUInt32BE(offset) {
        return readUInt32BE(this.buffer, offset);
    }
    writeUInt32BE(value, offset) {
        writeUInt32BE(this.buffer, value, offset);
    }
    readUInt32LE(offset) {
        return readUInt32LE(this.buffer, offset);
    }
    writeUInt32LE(value, offset) {
        writeUInt32LE(this.buffer, value, offset);
    }
    readUInt8(offset) {
        return readUInt8(this.buffer, offset);
    }
    writeUInt8(value, offset) {
        writeUInt8(this.buffer, value, offset);
    }
    indexOf(subarray, offset = 0) {
        return binaryIndexOf(this.buffer, subarray instanceof VSBuffer ? subarray.buffer : subarray, offset);
    }
    equals(other) {
        if (this === other) {
            return true;
        }
        if (this.byteLength !== other.byteLength) {
            return false;
        }
        return this.buffer.every((value, index) => value === other.buffer[index]);
    }
}
/**
 * Like String.indexOf, but works on Uint8Arrays.
 * Uses the boyer-moore-horspool algorithm to be reasonably speedy.
 */
export function binaryIndexOf(haystack, needle, offset = 0) {
    const needleLen = needle.byteLength;
    const haystackLen = haystack.byteLength;
    if (needleLen === 0) {
        return 0;
    }
    if (needleLen === 1) {
        return haystack.indexOf(needle[0], offset);
    }
    if (needleLen > haystackLen - offset) {
        return -1;
    }
    // find index of the subarray using boyer-moore-horspool algorithm
    const table = indexOfTable.value;
    table.fill(needle.length);
    for (let i = 0; i < needle.length; i++) {
        table[needle[i]] = needle.length - i - 1;
    }
    let i = offset + needle.length - 1;
    let j = i;
    let result = -1;
    while (i < haystackLen) {
        if (haystack[i] === needle[j]) {
            if (j === 0) {
                result = i;
                break;
            }
            i--;
            j--;
        }
        else {
            i += Math.max(needle.length - j, table[haystack[i]]);
            j = needle.length - 1;
        }
    }
    return result;
}
export function readUInt16LE(source, offset) {
    return (((source[offset + 0] << 0) >>> 0) |
        ((source[offset + 1] << 8) >>> 0));
}
export function writeUInt16LE(destination, value, offset) {
    destination[offset + 0] = (value & 0b11111111);
    value = value >>> 8;
    destination[offset + 1] = (value & 0b11111111);
}
export function readUInt32BE(source, offset) {
    return (source[offset] * 2 ** 24
        + source[offset + 1] * 2 ** 16
        + source[offset + 2] * 2 ** 8
        + source[offset + 3]);
}
export function writeUInt32BE(destination, value, offset) {
    destination[offset + 3] = value;
    value = value >>> 8;
    destination[offset + 2] = value;
    value = value >>> 8;
    destination[offset + 1] = value;
    value = value >>> 8;
    destination[offset] = value;
}
export function readUInt32LE(source, offset) {
    return (((source[offset + 0] << 0) >>> 0) |
        ((source[offset + 1] << 8) >>> 0) |
        ((source[offset + 2] << 16) >>> 0) |
        ((source[offset + 3] << 24) >>> 0));
}
export function writeUInt32LE(destination, value, offset) {
    destination[offset + 0] = (value & 0b11111111);
    value = value >>> 8;
    destination[offset + 1] = (value & 0b11111111);
    value = value >>> 8;
    destination[offset + 2] = (value & 0b11111111);
    value = value >>> 8;
    destination[offset + 3] = (value & 0b11111111);
}
export function readUInt8(source, offset) {
    return source[offset];
}
export function writeUInt8(destination, value, offset) {
    destination[offset] = value;
}
export function readableToBuffer(readable) {
    return streams.consumeReadable(readable, chunks => VSBuffer.concat(chunks));
}
export function bufferToReadable(buffer) {
    return streams.toReadable(buffer);
}
export function streamToBuffer(stream) {
    return streams.consumeStream(stream, chunks => VSBuffer.concat(chunks));
}
export async function bufferedStreamToBuffer(bufferedStream) {
    if (bufferedStream.ended) {
        return VSBuffer.concat(bufferedStream.buffer);
    }
    return VSBuffer.concat([
        // Include already read chunks...
        ...bufferedStream.buffer,
        // ...and all additional chunks
        await streamToBuffer(bufferedStream.stream)
    ]);
}
export function bufferToStream(buffer) {
    return streams.toStream(buffer, chunks => VSBuffer.concat(chunks));
}
export function streamToBufferReadableStream(stream) {
    return streams.transform(stream, { data: data => typeof data === 'string' ? VSBuffer.fromString(data) : VSBuffer.wrap(data) }, chunks => VSBuffer.concat(chunks));
}
export function newWriteableBufferStream(options) {
    return streams.newWriteableStream(chunks => VSBuffer.concat(chunks), options);
}
export function prefixedBufferReadable(prefix, readable) {
    return streams.prefixedReadable(prefix, readable, chunks => VSBuffer.concat(chunks));
}
export function prefixedBufferStream(prefix, stream) {
    return streams.prefixedStream(prefix, stream, chunks => VSBuffer.concat(chunks));
}
/** Decodes base64 to a uint8 array. URL-encoded and unpadded base64 is allowed. */
export function decodeBase64(encoded) {
    let building = 0;
    let remainder = 0;
    let bufi = 0;
    // The simpler way to do this is `Uint8Array.from(atob(str), c => c.charCodeAt(0))`,
    // but that's about 10-20x slower than this function in current Chromium versions.
    const buffer = new Uint8Array(Math.floor(encoded.length / 4 * 3));
    const append = (value) => {
        switch (remainder) {
            case 3:
                buffer[bufi++] = building | value;
                remainder = 0;
                break;
            case 2:
                buffer[bufi++] = building | (value >>> 2);
                building = value << 6;
                remainder = 3;
                break;
            case 1:
                buffer[bufi++] = building | (value >>> 4);
                building = value << 4;
                remainder = 2;
                break;
            default:
                building = value << 2;
                remainder = 1;
        }
    };
    for (let i = 0; i < encoded.length; i++) {
        const code = encoded.charCodeAt(i);
        // See https://datatracker.ietf.org/doc/html/rfc4648#section-4
        // This branchy code is about 3x faster than an indexOf on a base64 char string.
        if (code >= 65 && code <= 90) {
            append(code - 65); // A-Z starts ranges from char code 65 to 90
        }
        else if (code >= 97 && code <= 122) {
            append(code - 97 + 26); // a-z starts ranges from char code 97 to 122, starting at byte 26
        }
        else if (code >= 48 && code <= 57) {
            append(code - 48 + 52); // 0-9 starts ranges from char code 48 to 58, starting at byte 52
        }
        else if (code === 43 || code === 45) {
            append(62); // "+" or "-" for URLS
        }
        else if (code === 47 || code === 95) {
            append(63); // "/" or "_" for URLS
        }
        else if (code === 61) {
            break; // "="
        }
        else {
            throw new SyntaxError(`Unexpected base64 character ${encoded[i]}`);
        }
    }
    const unpadded = bufi;
    while (remainder > 0) {
        append(0);
    }
    // slice is needed to account for overestimation due to padding
    return VSBuffer.wrap(buffer).slice(0, unpadded);
}
const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const base64UrlSafeAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
/** Encodes a buffer to a base64 string. */
export function encodeBase64({ buffer }, padded = true, urlSafe = false) {
    const dictionary = urlSafe ? base64UrlSafeAlphabet : base64Alphabet;
    let output = '';
    const remainder = buffer.byteLength % 3;
    let i = 0;
    for (; i < buffer.byteLength - remainder; i += 3) {
        const a = buffer[i + 0];
        const b = buffer[i + 1];
        const c = buffer[i + 2];
        output += dictionary[a >>> 2];
        output += dictionary[(a << 4 | b >>> 4) & 0b111111];
        output += dictionary[(b << 2 | c >>> 6) & 0b111111];
        output += dictionary[c & 0b111111];
    }
    if (remainder === 1) {
        const a = buffer[i + 0];
        output += dictionary[a >>> 2];
        output += dictionary[(a << 4) & 0b111111];
        if (padded) {
            output += '==';
        }
    }
    else if (remainder === 2) {
        const a = buffer[i + 0];
        const b = buffer[i + 1];
        output += dictionary[a >>> 2];
        output += dictionary[(a << 4 | b >>> 4) & 0b111111];
        output += dictionary[(b << 2) & 0b111111];
        if (padded) {
            output += '=';
        }
    }
    return output;
}
const hexChars = '0123456789abcdef';
export function encodeHex({ buffer }) {
    let result = '';
    for (let i = 0; i < buffer.length; i++) {
        const byte = buffer[i];
        result += hexChars[byte >>> 4];
        result += hexChars[byte & 0x0f];
    }
    return result;
}
export function decodeHex(hex) {
    if (hex.length % 2 !== 0) {
        throw new SyntaxError('Hex string must have an even length');
    }
    const out = new Uint8Array(hex.length >> 1);
    for (let i = 0; i < hex.length;) {
        out[i >> 1] = (decodeHexChar(hex, i++) << 4) | decodeHexChar(hex, i++);
    }
    return VSBuffer.wrap(out);
}
function decodeHexChar(str, position) {
    const s = str.charCodeAt(position);
    if (s >= 48 && s <= 57) { // '0'-'9'
        return s - 48;
    }
    else if (s >= 97 && s <= 102) { // 'a'-'f'
        return s - 87;
    }
    else if (s >= 65 && s <= 70) { // 'A'-'F'
        return s - 55;
    }
    else {
        throw new SyntaxError(`Invalid hex character at position ${position}`);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVmZmVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vYnVmZmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFDakMsT0FBTyxLQUFLLE9BQU8sTUFBTSxhQUFhLENBQUM7QUFXdkMsTUFBTSxTQUFTLEdBQUcsQ0FBQyxPQUFPLE1BQU0sS0FBSyxXQUFXLENBQUMsQ0FBQztBQUNsRCxNQUFNLFlBQVksR0FBRyxJQUFJLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBRXpELElBQUksV0FBNkQsQ0FBQztBQUNsRSxJQUFJLFdBQTZELENBQUM7QUFFbEUsTUFBTSxPQUFPLFFBQVE7SUFFcEI7OztPQUdHO0lBQ0gsTUFBTSxDQUFDLEtBQUssQ0FBQyxVQUFrQjtRQUM5QixJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ2YsT0FBTyxJQUFJLFFBQVEsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFDckQsQ0FBQzthQUFNLENBQUM7WUFDUCxPQUFPLElBQUksUUFBUSxDQUFDLElBQUksVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFDakQsQ0FBQztJQUNGLENBQUM7SUFFRDs7OztPQUlHO0lBQ0gsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFrQjtRQUM3QixJQUFJLFNBQVMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDN0MsMEhBQTBIO1lBQzFILHdGQUF3RjtZQUN4RixNQUFNLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxVQUFV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Q0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxRQUFRLENBQUMsQ0FBQztRQUNwRCxNQUFNLElBQUksVUFBVSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsUUFBUSxDQUFDLENBQUM7UUFDcEQsTUFBTSxJQUFJLFVBQVUsQ0FBQyxDQUFDLEdBQUcsUUFBUSxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUVELElBQUksU0FBUyxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQ3JCLE1BQU0sQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDeEIsTUFBTSxJQUFJLFVBQVUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDOUIsTUFBTSxJQUFJLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxRQUFRLENBQUMsQ0FBQztRQUMxQyxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQUMsTUFBTSxJQUFJLElBQUksQ0FBQztRQUFDLENBQUM7SUFDaEMsQ0FBQztTQUFNLElBQUksU0FBUyxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQzVCLE1BQU0sQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDeEIsTUFBTSxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN4QixNQUFNLElBQUksVUFBVSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUM5QixNQUFNLElBQUksVUFBVSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsUUFBUSxDQUFDLENBQUM7UUFDcEQsTUFBTSxJQUFJLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxRQUFRLENBQUMsQ0FBQztRQUMxQyxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQUMsTUFBTSxJQUFJLEdBQUcsQ0FBQztRQUFDLENBQUM7SUFDL0IsQ0FBQztJQUVELE9BQU8sTUFBTSxDQUFDO0FBQ2YsQ0FBQztBQUVELE1BQU0sUUFBUSxHQUFHLGtCQUFrQixDQUFDO0FBQ3BDLE1BQU0sVUFBVSxTQUFTLENBQUMsRUFBRSxNQUFNLEVBQVk7SUFDN0MsSUFBSSxNQUFNLEdBQUcsRUFBRSxDQUFDO0lBQ2hCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDeEMsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3ZCLE1BQU0sSUFBSSxRQUFRLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQy9CLE1BQU0sSUFBSSxRQUFRLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxDQUFDO0lBQ2pDLENBQUM7SUFDRCxPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUM7QUFFRCxNQUFNLFVBQVUsU0FBUyxDQUFDLEdBQVc7SUFDcEMsSUFBSSxHQUFHLENBQUMsTUFBTSxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUMxQixNQUFNLElBQUksV0FBVyxDQUFDLHFDQUFxQyxDQUFDLENBQUM7SUFDOUQsQ0FBQztJQUNELE1BQU0sR0FBRyxHQUFHLElBQUksVUFBVSxDQUFDLEdBQUcsQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDNUMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQztRQUNqQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLGFBQWEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUN4RSxDQUFDO0lBQ0QsT0FBTyxRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQzNCLENBQUM7QUFFRCxTQUFTLGFBQWEsQ0FBQyxHQUFXLEVBQUUsUUFBZ0I7SUFDbkQsTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNuQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUMsVUFBVTtRQUNuQyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDZixDQUFDO1NBQU0sSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQyxDQUFDLFVBQVU7UUFDM0MsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ2YsQ0FBQztTQUFNLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxVQUFVO1FBQzFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUNmLENBQUM7U0FBTSxDQUFDO1FBQ1AsTUFBTSxJQUFJLFdBQVcsQ0FBQyxxQ0FBcUMsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUN4RSxDQUFDO0FBQ0YsQ0FBQyJ9