/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Readable } from 'stream';
import { URI } from 'vs/base/common/uri';
import { IFileSystemProvider, FileSystemProviderCapabilities } from 'vs/platform/files/common/files';
import { illegalArgument } from 'vs/base/common/errors';

export function createReadableOfProvider(provider: IFileSystemProvider, resource: URI, position: number): Readable {
	if (provider.capabilities & FileSystemProviderCapabilities.FileOpenReadWriteClose) {
		return createReadable(provider, resource, position);
	} else if (provider.capabilities & FileSystemProviderCapabilities.FileReadWrite) {
		return createSimpleReadable(provider, resource, position);
	} else {
		throw illegalArgument();
	}
}

function createReadable(provider: IFileSystemProvider, resource: URI, position: number): Readable {
	return new class extends Readable {
		_fd: number;
		_pos: number = position;
		_reading: boolean = false;

		async _read(size: number = 2 ** 10) {
			if (this._reading) {
				return;
			}
			this._reading = true;
			try {
				if (typeof this._fd !== 'number') {
					this._fd = await provider.open!(resource, { create: false });
				}
				while (this._reading) {
					let buffer = Buffer.allocUnsafe(size);
					let bytesRead = await provider.read!(this._fd, this._pos, buffer, 0, buffer.length);
					if (bytesRead === 0) {
						await provider.close!(this._fd);
						this._reading = false;
						this.push(null);
					} else {
						this._reading = this.push(buffer.slice(0, bytesRead));
						this._pos += bytesRead;
					}
				}
			} catch (err) {
				//
				this.emit('error', err);
			}
		}
		_destroy(_err: any, callback: (err?: any) => any) {
			if (typeof this._fd === 'number') {
				provider.close!(this._fd).then(callback, callback);
			}
		}
	};
}

function createSimpleReadable(provider: IFileSystemProvider, resource: URI, position: number): Readable {
	return new class extends Readable {
		_readOperation: Promise<any>;
		_read(size?: number): void {
			if (this._readOperation) {
				return;
			}
			this._readOperation = provider.readFile!(resource).then(data => {
				this.push(Buffer.from(data.buffer, data.byteOffset, data.byteLength).slice(position));
				this.push(null);
			}, err => {
				this.emit('error', err);
				this.push(null);
			});
		}
	};
}