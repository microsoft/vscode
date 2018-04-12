/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Readable, Writable } from 'stream';
import { UTF8 } from 'vs/base/node/encoding';
import URI from 'vs/base/common/uri';
import { IFileSystemProvider, ITextSnapshot, ISimpleReadWriteProvider, IReadWriteProvider } from 'vs/platform/files/common/files';

export function createWritableOfProvider(provider: IFileSystemProvider, resource: URI): Writable {
	switch (provider._type) {
		case 'simple': return createSimpleWritable(provider, resource);
		case 'chunked': return createWritable(provider, resource);
	}
}

function createSimpleWritable(provider: ISimpleReadWriteProvider, resource: URI): Writable {
	return new class extends Writable {
		_chunks: Buffer[] = [];
		constructor(opts?) {
			super(opts);
		}
		_write(chunk: Buffer, encoding: string, callback: Function) {
			this._chunks.push(chunk);
			callback(null);
		}
		end() {
			// todo@joh - end might have another chunk...
			provider.writeFile(resource, Buffer.concat(this._chunks)).then(_ => {
				super.end();
			}, err => {
				this.emit('error', err);
			});
		}
	};
}

function createWritable(provider: IReadWriteProvider, resource: URI): Writable {
	return new class extends Writable {
		_fd: number;
		_pos: number;
		constructor(opts?) {
			super(opts);
		}
		async _write(chunk: Buffer, encoding, callback: Function) {
			try {
				if (typeof this._fd !== 'number') {
					this._fd = await provider.open(resource, { mode: 'w+' });
				}
				let bytesWritten = await provider.write(this._fd, this._pos, chunk, 0, chunk.length);
				this._pos += bytesWritten;
				callback();
			} catch (err) {
				callback(err);
			}
		}
		end() {
			provider.close(this._fd).then(_ => {
				super.end();
			}, err => {
				this.emit('error', err);
			});
		}
	};
}

export function createReadableOfProvider(provider: IFileSystemProvider, resource: URI): Readable {
	switch (provider._type) {
		case 'simple': return createSimpleReadable(provider, resource);
		case 'chunked': return createReadable(provider, resource);
	}
}

function createReadable(provider: IReadWriteProvider, resource: URI): Readable {
	return new class extends Readable {
		_fd: number;
		_pos: number = 0;
		_reading: boolean = false;
		constructor(opts?) {
			super(opts);
			this.once('close', _ => this._final());
		}
		async _read(size?: number) {
			if (this._reading) {
				return;
			}
			this._reading = true;
			try {
				if (typeof this._fd !== 'number') {
					this._fd = await provider.open(resource, { mode: 'r' });
				}
				let buffer = Buffer.allocUnsafe(64 * 1024);
				while (this._reading) {
					let bytesRead = await provider.read(this._fd, this._pos, buffer, 0, buffer.length);
					if (bytesRead === 0) {
						this._reading = false;
						this.push(null);
					}
					else {
						this._reading = this.push(buffer.slice(0, bytesRead));
						this._pos += bytesRead;
					}
				}
			}
			catch (err) {
				//
				this.emit('error', err);
			}
		}
		async _final() {
			if (typeof this._fd === 'number') {
				await provider.close(this._fd);
			}
		}
	};
}

function createSimpleReadable(provider: ISimpleReadWriteProvider, resource: URI): Readable {
	return new class extends Readable {
		_readOperation: Thenable<any>;
		_read(size?: number): void {
			if (this._readOperation) {
				return;
			}
			this._readOperation = provider.readFile(resource).then(data => {
				this.push(data);
				this.push(null);
			}, err => {
				this.emit('error', err);
				this.push(null);
			});
		}
	};
}

export function createReadableOfSnapshot(snapshot: ITextSnapshot): Readable {
	return new Readable({
		read: function () {
			try {
				let chunk: string;
				let canPush = true;

				// Push all chunks as long as we can push and as long as
				// the underlying snapshot returns strings to us
				while (canPush && typeof (chunk = snapshot.read()) === 'string') {
					canPush = this.push(chunk);
				}

				// Signal EOS by pushing NULL
				if (typeof chunk !== 'string') {
					this.push(null);
				}
			} catch (error) {
				this.emit('error', error);
			}
		},
		encoding: UTF8 // very important, so that strings are passed around and not buffers!
	});
}
