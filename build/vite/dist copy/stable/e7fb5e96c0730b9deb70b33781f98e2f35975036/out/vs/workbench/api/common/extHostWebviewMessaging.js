/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { VSBuffer } from '../../../base/common/buffer.js';
class ArrayBufferSet {
    constructor() {
        this.buffers = [];
    }
    add(buffer) {
        let index = this.buffers.indexOf(buffer);
        if (index < 0) {
            index = this.buffers.length;
            this.buffers.push(buffer);
        }
        return index;
    }
}
export function serializeWebviewMessage(message, options) {
    if (options.serializeBuffersForPostMessage) {
        // Extract all ArrayBuffers from the message and replace them with references.
        const arrayBuffers = new ArrayBufferSet();
        const replacer = (_key, value) => {
            if (value instanceof ArrayBuffer) {
                const index = arrayBuffers.add(value);
                return {
                    $$vscode_array_buffer_reference$$: true,
                    index,
                };
            }
            else if (ArrayBuffer.isView(value)) {
                const type = getTypedArrayType(value);
                if (type) {
                    const index = arrayBuffers.add(value.buffer);
                    return {
                        $$vscode_array_buffer_reference$$: true,
                        index,
                        view: {
                            type: type,
                            byteLength: value.byteLength,
                            byteOffset: value.byteOffset,
                        }
                    };
                }
            }
            return value;
        };
        const serializedMessage = JSON.stringify(message, replacer);
        const buffers = arrayBuffers.buffers.map(arrayBuffer => {
            const bytes = new Uint8Array(arrayBuffer);
            return VSBuffer.wrap(bytes);
        });
        return { message: serializedMessage, buffers };
    }
    else {
        return { message: JSON.stringify(message), buffers: [] };
    }
}
function getTypedArrayType(value) {
    switch (value.constructor.name) {
        case 'Int8Array': return 1 /* extHostProtocol.WebviewMessageArrayBufferViewType.Int8Array */;
        case 'Uint8Array': return 2 /* extHostProtocol.WebviewMessageArrayBufferViewType.Uint8Array */;
        case 'Uint8ClampedArray': return 3 /* extHostProtocol.WebviewMessageArrayBufferViewType.Uint8ClampedArray */;
        case 'Int16Array': return 4 /* extHostProtocol.WebviewMessageArrayBufferViewType.Int16Array */;
        case 'Uint16Array': return 5 /* extHostProtocol.WebviewMessageArrayBufferViewType.Uint16Array */;
        case 'Int32Array': return 6 /* extHostProtocol.WebviewMessageArrayBufferViewType.Int32Array */;
        case 'Uint32Array': return 7 /* extHostProtocol.WebviewMessageArrayBufferViewType.Uint32Array */;
        case 'Float32Array': return 8 /* extHostProtocol.WebviewMessageArrayBufferViewType.Float32Array */;
        case 'Float64Array': return 9 /* extHostProtocol.WebviewMessageArrayBufferViewType.Float64Array */;
        case 'BigInt64Array': return 10 /* extHostProtocol.WebviewMessageArrayBufferViewType.BigInt64Array */;
        case 'BigUint64Array': return 11 /* extHostProtocol.WebviewMessageArrayBufferViewType.BigUint64Array */;
    }
    return undefined;
}
export function deserializeWebviewMessage(jsonMessage, buffers) {
    const arrayBuffers = buffers.map(buffer => {
        const arrayBuffer = new ArrayBuffer(buffer.byteLength);
        const uint8Array = new Uint8Array(arrayBuffer);
        uint8Array.set(buffer.buffer);
        return arrayBuffer;
    });
    const reviver = !buffers.length ? undefined : (_key, value) => {
        if (value && typeof value === 'object' && value.$$vscode_array_buffer_reference$$) {
            const ref = value;
            const { index } = ref;
            const arrayBuffer = arrayBuffers[index];
            if (ref.view) {
                switch (ref.view.type) {
                    case 1 /* extHostProtocol.WebviewMessageArrayBufferViewType.Int8Array */: return new Int8Array(arrayBuffer, ref.view.byteOffset, ref.view.byteLength / Int8Array.BYTES_PER_ELEMENT);
                    case 2 /* extHostProtocol.WebviewMessageArrayBufferViewType.Uint8Array */: return new Uint8Array(arrayBuffer, ref.view.byteOffset, ref.view.byteLength / Uint8Array.BYTES_PER_ELEMENT);
                    case 3 /* extHostProtocol.WebviewMessageArrayBufferViewType.Uint8ClampedArray */: return new Uint8ClampedArray(arrayBuffer, ref.view.byteOffset, ref.view.byteLength / Uint8ClampedArray.BYTES_PER_ELEMENT);
                    case 4 /* extHostProtocol.WebviewMessageArrayBufferViewType.Int16Array */: return new Int16Array(arrayBuffer, ref.view.byteOffset, ref.view.byteLength / Int16Array.BYTES_PER_ELEMENT);
                    case 5 /* extHostProtocol.WebviewMessageArrayBufferViewType.Uint16Array */: return new Uint16Array(arrayBuffer, ref.view.byteOffset, ref.view.byteLength / Uint16Array.BYTES_PER_ELEMENT);
                    case 6 /* extHostProtocol.WebviewMessageArrayBufferViewType.Int32Array */: return new Int32Array(arrayBuffer, ref.view.byteOffset, ref.view.byteLength / Int32Array.BYTES_PER_ELEMENT);
                    case 7 /* extHostProtocol.WebviewMessageArrayBufferViewType.Uint32Array */: return new Uint32Array(arrayBuffer, ref.view.byteOffset, ref.view.byteLength / Uint32Array.BYTES_PER_ELEMENT);
                    case 8 /* extHostProtocol.WebviewMessageArrayBufferViewType.Float32Array */: return new Float32Array(arrayBuffer, ref.view.byteOffset, ref.view.byteLength / Float32Array.BYTES_PER_ELEMENT);
                    case 9 /* extHostProtocol.WebviewMessageArrayBufferViewType.Float64Array */: return new Float64Array(arrayBuffer, ref.view.byteOffset, ref.view.byteLength / Float64Array.BYTES_PER_ELEMENT);
                    case 10 /* extHostProtocol.WebviewMessageArrayBufferViewType.BigInt64Array */: return new BigInt64Array(arrayBuffer, ref.view.byteOffset, ref.view.byteLength / BigInt64Array.BYTES_PER_ELEMENT);
                    case 11 /* extHostProtocol.WebviewMessageArrayBufferViewType.BigUint64Array */: return new BigUint64Array(arrayBuffer, ref.view.byteOffset, ref.view.byteLength / BigUint64Array.BYTES_PER_ELEMENT);
                    default: throw new Error('Unknown array buffer view type');
                }
            }
            return arrayBuffer;
        }
        return value;
    };
    const message = JSON.parse(jsonMessage, reviver);
    return { message, arrayBuffers };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFdlYnZpZXdNZXNzYWdpbmcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9leHRIb3N0V2Vidmlld01lc3NhZ2luZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFHMUQsTUFBTSxjQUFjO0lBQXBCO1FBQ2lCLFlBQU8sR0FBc0IsRUFBRSxDQUFDO0lBVWpELENBQUM7SUFSTyxHQUFHLENBQUMsTUFBdUI7UUFDakMsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDekMsSUFBSSxLQUFLLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDZixLQUFLLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUM7WUFDNUIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDM0IsQ0FBQztRQUNELE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztDQUNEO0FBRUQsTUFBTSxVQUFVLHVCQUF1QixDQUN0QyxPQUFnQixFQUNoQixPQUFxRDtJQUVyRCxJQUFJLE9BQU8sQ0FBQyw4QkFBOEIsRUFBRSxDQUFDO1FBQzVDLDhFQUE4RTtRQUM5RSxNQUFNLFlBQVksR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO1FBRTFDLE1BQU0sUUFBUSxHQUFHLENBQUMsSUFBWSxFQUFFLEtBQVUsRUFBRSxFQUFFO1lBQzdDLElBQUksS0FBSyxZQUFZLFdBQVcsRUFBRSxDQUFDO2dCQUNsQyxNQUFNLEtBQUssR0FBRyxZQUFZLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUN0QyxPQUFPO29CQUNOLGlDQUFpQyxFQUFFLElBQUk7b0JBQ3ZDLEtB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