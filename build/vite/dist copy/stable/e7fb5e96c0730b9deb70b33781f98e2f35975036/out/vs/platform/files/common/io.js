/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { VSBuffer } from '../../../base/common/buffer.js';
import { canceled } from '../../../base/common/errors.js';
import { localize } from '../../../nls.js';
import { createFileSystemProviderError, ensureFileSystemProviderError, FileSystemProviderErrorCode } from './files.js';
/**
 * A helper to read a file from a provider with open/read/close capability into a stream.
 */
export async function readFileIntoStream(provider, resource, target, transformer, options, token) {
    let error = undefined;
    try {
        await doReadFileIntoStream(provider, resource, target, transformer, options, token);
    }
    catch (err) {
        error = err;
    }
    finally {
        if (error && options.errorTransformer) {
            error = options.errorTransformer(error);
        }
        if (typeof error !== 'undefined') {
            target.error(error);
        }
        target.end();
    }
}
async function doReadFileIntoStream(provider, resource, target, transformer, options, token) {
    // Check for cancellation
    throwIfCancelled(token);
    // open handle through provider
    const handle = await provider.open(resource, { create: false });
    try {
        // Check for cancellation
        throwIfCancelled(token);
        let totalBytesRead = 0;
        let bytesRead = 0;
        let allowedRemainingBytes = (options && typeof options.length === 'number') ? options.length : undefined;
        let buffer = VSBuffer.alloc(Math.min(options.bufferSize, typeof allowedRemainingBytes === 'number' ? allowedRemainingBytes : options.bufferSize));
        let posInFile = options && typeof options.position === 'number' ? options.position : 0;
        let posInBuffer = 0;
        do {
            // read from source (handle) at current position (pos) into buffer (buffer) at
            // buffer position (posInBuffer) up to the size of the buffer (buffer.byteLength).
            bytesRead = await provider.read(handle, posInFile, buffer.buffer, posInBuffer, buffer.byteLength - posInBuffer);
            posInFile += bytesRead;
            posInBuffer += bytesRead;
            totalBytesRead += bytesRead;
            if (typeof allowedRemainingBytes === 'number') {
                allowedRemainingBytes -= bytesRead;
            }
            // when buffer full, create a new one and emit it through stream
            if (posInBuffer === buffer.byteLength) {
                await target.write(transformer(buffer));
                buffer = VSBuffer.alloc(Math.min(options.bufferSize, typeof allowedRemainingBytes === 'number' ? allowedRemainingBytes : options.bufferSize));
                posInBuffer = 0;
            }
        } while (bytesRead > 0 && (typeof allowedRemainingBytes !== 'number' || allowedRemainingBytes > 0) && throwIfCancelled(token) && throwIfTooLarge(totalBytesRead, options));
        // wrap up with last buffer (also respect maxBytes if provided)
        if (posInBuffer > 0) {
            let lastChunkLength = posInBuffer;
            if (typeof allowedRemainingBytes === 'number') {
                lastChunkLength = Math.min(posInBuffer, allowedRemainingBytes);
            }
            target.write(transformer(buffer.slice(0, lastChunkLength)));
        }
    }
    catch (error) {
        throw ensureFileSystemProviderError(error);
    }
    finally {
        await provider.close(handle);
    }
}
function throwIfCancelled(token) {
    if (token.isCancellationRequested) {
        throw canceled();
    }
    return true;
}
function throwIfTooLarge(totalBytesRead, options) {
    // Return early if file is too large to load and we have configured limits
    if (typeof options?.limits?.size === 'number' && totalBytesRead > options.limits.size) {
        throw createFileSystemProviderError(localize('fileTooLargeError', "File is too large to open"), FileSystemProviderErrorCode.FileTooLarge);
    }
    return true;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW8uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9maWxlcy9jb21tb24vaW8udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRTFELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUcxRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDM0MsT0FBTyxFQUFFLDZCQUE2QixFQUFFLDZCQUE2QixFQUEwQiwyQkFBMkIsRUFBdUQsTUFBTSxZQUFZLENBQUM7QUFlcE07O0dBRUc7QUFDSCxNQUFNLENBQUMsS0FBSyxVQUFVLGtCQUFrQixDQUN2QyxRQUE2RCxFQUM3RCxRQUFhLEVBQ2IsTUFBMEIsRUFDMUIsV0FBMEMsRUFDMUMsT0FBaUMsRUFDakMsS0FBd0I7SUFFeEIsSUFBSSxLQUFLLEdBQXNCLFNBQVMsQ0FBQztJQUV6QyxJQUFJLENBQUM7UUFDSixNQUFNLG9CQUFvQixDQUFDLFFBQVEsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDckYsQ0FBQztJQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDZCxLQUFLLEdBQUcsR0FBRyxDQUFDO0lBQ2IsQ0FBQztZQUFTLENBQUM7UUFDVixJQUFJLEtBQUssSUFBSSxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUN2QyxLQUFLLEdBQUcsT0FBTyxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3pDLENBQUM7UUFFRCxJQUFJLE9BQU8sS0FBSyxLQUFLLFdBQVcsRUFBRSxDQUFDO1lBQ2xDLE1BQU0sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDckIsQ0FBQztRQUVE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