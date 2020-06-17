/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBufferReadableStream, VSBufferReadable, VSBuffer } from 'vs/base/common/buffer';
import { Readable } from 'stream';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { UTF8, UTF8_with_bom, UTF8_BOM, UTF16be, UTF16le_BOM, UTF16be_BOM, UTF16le, UTF_ENCODING } from 'vs/base/node/encoding';

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
