/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { VSBuffer } from '../../../base/common/buffer.js';
import * as platform from '../../../base/common/platform.js';
var EncodedSemanticTokensType;
(function (EncodedSemanticTokensType) {
    EncodedSemanticTokensType[EncodedSemanticTokensType["Full"] = 1] = "Full";
    EncodedSemanticTokensType[EncodedSemanticTokensType["Delta"] = 2] = "Delta";
})(EncodedSemanticTokensType || (EncodedSemanticTokensType = {}));
function reverseEndianness(arr) {
    for (let i = 0, len = arr.length; i < len; i += 4) {
        // flip bytes 0<->3 and 1<->2
        const b0 = arr[i + 0];
        const b1 = arr[i + 1];
        const b2 = arr[i + 2];
        const b3 = arr[i + 3];
        arr[i + 0] = b3;
        arr[i + 1] = b2;
        arr[i + 2] = b1;
        arr[i + 3] = b0;
    }
}
function toLittleEndianBuffer(arr) {
    const uint8Arr = new Uint8Array(arr.buffer, arr.byteOffset, arr.length * 4);
    if (!platform.isLittleEndian()) {
        // the byte order must be changed
        reverseEndianness(uint8Arr);
    }
    return VSBuffer.wrap(uint8Arr);
}
function fromLittleEndianBuffer(buff) {
    const uint8Arr = buff.buffer;
    if (!platform.isLittleEndian()) {
        // the byte order must be changed
        reverseEndianness(uint8Arr);
    }
    if (uint8Arr.byteOffset % 4 === 0) {
        return new Uint32Array(uint8Arr.buffer, uint8Arr.byteOffset, uint8Arr.length / 4);
    }
    else {
        // unaligned memory access doesn't work on all platforms
        const data = new Uint8Array(uint8Arr.byteLength);
        data.set(uint8Arr);
        return new Uint32Array(data.buffer, data.byteOffset, data.length / 4);
    }
}
export function encodeSemanticTokensDto(semanticTokens) {
    const dest = new Uint32Array(encodeSemanticTokensDtoSize(semanticTokens));
    let offset = 0;
    dest[offset++] = semanticTokens.id;
    if (semanticTokens.type === 'full') {
        dest[offset++] = 1 /* EncodedSemanticTokensType.Full */;
        dest[offset++] = semanticTokens.data.length;
        dest.set(semanticTokens.data, offset);
        offset += semanticTokens.data.length;
    }
    else {
        dest[offset++] = 2 /* EncodedSemanticTokensType.Delta */;
        dest[offset++] = semanticTokens.deltas.length;
        for (const delta of semanticTokens.deltas) {
            dest[offset++] = delta.start;
            dest[offset++] = delta.deleteCount;
            if (delta.data) {
                dest[offset++] = delta.data.length;
                dest.set(delta.data, offset);
                offset += delta.data.length;
            }
            else {
                dest[offset++] = 0;
            }
        }
    }
    return toLittleEndianBuffer(dest);
}
function encodeSemanticTokensDtoSize(semanticTokens) {
    let result = 0;
    result += (+1 // id
        + 1 // type
    );
    if (semanticTokens.type === 'full') {
        result += (+1 // data length
            + semanticTokens.data.length);
    }
    else {
        result += (+1 // delta count
        );
        result += (+1 // start
            + 1 // deleteCount
            + 1 // data length
        ) * semanticTokens.deltas.length;
        for (const delta of semanticTokens.deltas) {
            if (delta.data) {
                result += delta.data.length;
            }
        }
    }
    return result;
}
export function decodeSemanticTokensDto(_buff) {
    const src = fromLittleEndianBuffer(_buff);
    let offset = 0;
    const id = src[offset++];
    const type = src[offset++];
    if (type === 1 /* EncodedSemanticTokensType.Full */) {
        const length = src[offset++];
        const data = src.subarray(offset, offset + length);
        offset += length;
        return {
            id: id,
            type: 'full',
            data: data
        };
    }
    const deltaCount = src[offset++];
    const deltas = [];
    for (let i = 0; i < deltaCount; i++) {
        const start = src[offset++];
        const deleteCount = src[offset++];
        const length = src[offset++];
        let data;
        if (length > 0) {
            data = src.subarray(offset, offset + length);
            offset += length;
        }
        deltas[i] = { start, deleteCount, data };
    }
    return {
        id: id,
        type: 'delta',
        deltas: deltas
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VtYW50aWNUb2tlbnNEdG8uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3NlbWFudGljVG9rZW5zRHRvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxRCxPQUFPLEtBQUssUUFBUSxNQUFNLGtDQUFrQyxDQUFDO0FBZ0I3RCxJQUFXLHlCQUdWO0FBSEQsV0FBVyx5QkFBeUI7SUFDbkMseUVBQVEsQ0FBQTtJQUNSLDJFQUFTLENBQUE7QUFDVixDQUFDLEVBSFUseUJBQXlCLEtBQXpCLHlCQUF5QixRQUduQztBQUVELFNBQVMsaUJBQWlCLENBQUMsR0FBZTtJQUN6QyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUNuRCw2QkFBNkI7UUFDN0IsTUFBTSxFQUFFLEdBQUcsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN0QixNQUFNLEVBQUUsR0FBRyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3RCLE1BQU0sRUFBRSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDdEIsTUFBTSxFQUFFLEdBQUcsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN0QixHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNoQixHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNoQixHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxH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