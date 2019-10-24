/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { VSBufferReadableStream, VSBufferReadable, VSBuffer } from 'vs/base/common/buffer';
import { Readable } from 'stream';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { UTF8, UTF8_with_bom, UTF8_BOM, UTF16be, UTF16le_BOM, UTF16be_BOM, UTF16le, UTF_ENCODING } from 'vs/base/node/encoding';

/**
 * Reads a file until a matching string is found.
 *
 * @param file The file to read.
 * @param matchingString The string to search for.
 * @param chunkBytes The number of bytes to read each iteration.
 * @param maximumBytesToRead The maximum number of bytes to read before giving up.
 * @param callback The finished callback.
 */
export function readToMatchingString(file: string, matchingString: string, chunkBytes: number, maximumBytesToRead: number): Promise<string | null> {
	return new Promise<string | null>((resolve, reject) =>
		fs.open(file, 'r', null, (err, fd) => {
			if (err) {
				return reject(err);
			}

			function end(err: Error | null, result: string | null): void {
				fs.close(fd, closeError => {
					if (closeError) {
						return reject(closeError);
					}

					if (err && (<any>err).code === 'EISDIR') {
						return reject(err); // we want to bubble this error up (file is actually a folder)
					}

					return resolve(result);
				});
			}

			const buffer = Buffer.allocUnsafe(maximumBytesToRead);
			let offset = 0;

			function readChunk(): void {
				fs.read(fd, buffer, offset, chunkBytes, null, (err, bytesRead) => {
					if (err) {
						return end(err, null);
					}

					if (bytesRead === 0) {
						return end(null, null);
					}

					offset += bytesRead;

					const newLineIndex = buffer.indexOf(matchingString);
					if (newLineIndex >= 0) {
						return end(null, buffer.toString('utf8').substr(0, newLineIndex));
					}

					if (offset >= maximumBytesToRead) {
						return end(new Error(`Could not find ${matchingString} in first ${maximumBytesToRead} bytes of ${file}`), null);
					}

					return readChunk();
				});
			}

			readChunk();
		})
	);
}

export function streamToNodeReadable(stream: VSBufferReadableStream): Readable {
	return new class extends Readable {
		private listening = false;

		_read(size?: number): void {
			if (!this.listening) {
				this.listening = true;

				// Data
				stream.on('data', data => {
					try {
						if (!this.push(data.buffer)) {
							stream.pause(); // pause the stream if we should not push anymore
						}
					} catch (error) {
						this.emit(error);
					}
				});

				// End
				stream.on('end', () => {
					try {
						this.push(null); // signal EOS
					} catch (error) {
						this.emit(error);
					}
				});

				// Error
				stream.on('error', error => this.emit('error', error));
			}

			// ensure the stream is flowing
			stream.resume();
		}

		_destroy(error: Error | null, callback: (error: Error | null) => void): void {
			stream.destroy();

			callback(null);
		}
	};
}

export function nodeReadableToString(stream: NodeJS.ReadableStream): Promise<string> {
	return new Promise((resolve, reject) => {
		let result = '';

		stream.on('data', chunk => result += chunk);
		stream.on('error', reject);
		stream.on('end', () => resolve(result));
	});
}

export function nodeStreamToVSBufferReadable(stream: NodeJS.ReadWriteStream, addBOM?: { encoding: UTF_ENCODING }): VSBufferReadable {
	let bytesRead = 0;
	let done = false;

	return {
		read(): VSBuffer | null {
			if (done) {
				return null;
			}

			const res = stream.read();
			if (isUndefinedOrNull(res)) {
				done = true;

				// If we are instructed to add a BOM but we detect that no
				// bytes have been read, we must ensure to return the BOM
				// ourselves so that we comply with the contract.
				if (bytesRead === 0 && addBOM) {
					switch (addBOM.encoding) {
						case UTF8:
						case UTF8_with_bom:
							return VSBuffer.wrap(Buffer.from(UTF8_BOM));
						case UTF16be:
							return VSBuffer.wrap(Buffer.from(UTF16be_BOM));
						case UTF16le:
							return VSBuffer.wrap(Buffer.from(UTF16le_BOM));
					}
				}

				return null;
			}

			// Handle String
			if (typeof res === 'string') {
				bytesRead += res.length;

				return VSBuffer.fromString(res);
			}

			// Handle Buffer
			else {
				bytesRead += res.byteLength;

				return VSBuffer.wrap(res);
			}
		}
	};
}
