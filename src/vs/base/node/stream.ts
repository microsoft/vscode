/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBufferReadableStream } from 'vs/base/common/buffer';
import { Readable } from 'stream';

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
