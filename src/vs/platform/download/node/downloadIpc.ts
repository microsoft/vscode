/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import * as path from 'path';
import * as fs from 'fs';
import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { Event, Emitter, buffer } from 'vs/base/common/event';
import { IDownloadService } from 'vs/platform/download/common/download';
import { mkdirp } from 'vs/base/node/pfs';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IURITransformer } from 'vs/base/common/uriIpc';

export type UploadResponse = Buffer | Error | undefined;

export function upload(uri: URI): Event<UploadResponse> {
	const stream = new Emitter<Buffer | Error | undefined>();
	fs.open(uri.fsPath, 'r', (err, fd) => {
		if (err) {
			if (err.code === 'ENOENT') {
				stream.fire(new Error('File Not Found'));
			}
			return;
		}
		const finish = (err?: any) => {
			if (err) {
				stream.fire(err);
			} else {
				stream.fire();
				if (fd) {
					fs.close(fd, err => {
						if (err) {
							onUnexpectedError(err);
						}
					});
				}
			}
		};
		let currentPosition: number = 0;
		const readChunk = () => {
			const chunkBuffer = Buffer.allocUnsafe(64 * 1024); // 64K Chunk
			fs.read(fd, chunkBuffer, 0, chunkBuffer.length, currentPosition, (err, bytesRead) => {
				currentPosition += bytesRead;
				if (err) {
					finish(err);
				} else {
					if (bytesRead === 0) {
						// no more data -> finish
						finish();
					} else {
						stream.fire(chunkBuffer.slice(0, bytesRead));
						readChunk();
					}
				}
			});
		};
		// start reading
		readChunk();
	});
	return stream.event;
}

export interface IDownloadServiceChannel extends IChannel {
	listen(event: 'upload', uri: URI): Event<UploadResponse>;
	listen(event: string, arg?: any): Event<any>;
}

export class DownloadServiceChannel implements IDownloadServiceChannel {

	constructor() { }

	listen(event: string, arg?: any): Event<any> {
		switch (event) {
			case 'upload': return buffer(upload(URI.revive(arg)));
		}
		return undefined;
	}

	call(command: string, arg?: any): TPromise<any> {
		throw new Error('No calls');
	}
}

export class DownloadServiceChannelClient implements IDownloadService {

	_serviceBrand: any;

	constructor(private channel: IDownloadServiceChannel, private uriTransformer: IURITransformer) { }

	download(from: URI, to: string): TPromise<void> {
		from = this.uriTransformer.transformOutgoing(from);
		const dirName = path.dirname(to);
		let out: fs.WriteStream;
		return new TPromise((c, e) => {
			return mkdirp(dirName)
				.then(() => {
					out = fs.createWriteStream(to);
					out.once('close', () => c(null));
					out.once('error', e);
					const uploadStream = this.channel.listen('upload', from);
					const disposable = uploadStream((result: Buffer | Error | undefined) => {
						if (result === void 0) {
							out.end();
							out.close();
							disposable.dispose();
							c(null);
						} else if (result instanceof Buffer) {
							out.write(result);
						} else if (result instanceof Error) {
							out.close();
							disposable.dispose();
							e(result);
						}
					});
				});
		});
	}
}