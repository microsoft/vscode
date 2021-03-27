/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { VSBuffer, VSBufferWriteableStream, newWriteableBufferStream, VSBufferReadableStream } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IFileSystemProviderWithOpenReadWriteCloseCapability, FileReadStreamOptions, createFileSystemProviderError, FileSystemProviderErrorCode, ensureFileSystemProviderError } from 'vs/platform/files/common/files';
import { canceled } from 'vs/base/common/errors';

export interface ICreateReadStreamOptions extends FileReadStreamOptions {

	/**
	 * The size of the buffer to use before sending to the stream.
	 */
	bufferSize: number;
}

export function createReadStream(provider: IFileSystemProviderWithOpenReadWriteCloseCapability, resource: URI, options: ICreateReadStreamOptions, token?: CancellationToken): VSBufferReadableStream {
	const stream = newWriteableBufferStream();

	// do not await reading but simply return the stream directly since it operates
	// via events. finally end the stream and send through the possible error
	let error: Error | undefined = undefined;

	doReadFileIntoStream(provider, resource, stream, options, token).then(undefined, err => error = err).finally(() => stream.end(error));

	return stream;
}

async function doReadFileIntoStream(provider: IFileSystemProviderWithOpenReadWriteCloseCapability, resource: URI, stream: VSBufferWriteableStream, options: ICreateReadStreamOptions, token?: CancellationToken): Promise<void> {

	// Check for cancellation
	throwIfCancelled(token);

	// open handle through provider
	const handle = await provider.open(resource, { create: false });

	// Check for cancellation
	throwIfCancelled(token);

	try {
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
				stream.write(buffer);

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

			stream.write(buffer.slice(0, lastChunkLength));
		}
	} catch (error) {
		throw ensureFileSystemProviderError(error);
	} finally {
		await provider.close(handle);
	}
}

function throwIfCancelled(token?: CancellationToken): boolean {
	if (token && token.isCancellationRequested) {
		throw canceled();
	}

	return true;
}

function throwIfTooLarge(totalBytesRead: number, options: ICreateReadStreamOptions): boolean {

	// Return early if file is too large to load and we have configured limits
	if (options?.limits) {
		if (typeof options.limits.memory === 'number' && totalBytesRead > options.limits.memory) {
			throw createFileSystemProviderError(localize('fileTooLargeForHeapError', "To open a file of this size, you need to restart and allow it to use more memory"), FileSystemProviderErrorCode.FileExceedsMemoryLimit);
		}

		if (typeof options.limits.size === 'number' && totalBytesRead > options.limits.size) {
			throw createFileSystemProviderError(localize('fileTooLargeError', "File is too large to open"), FileSystemProviderErrorCode.FileTooLarge);
		}
	}

	return true;
}
