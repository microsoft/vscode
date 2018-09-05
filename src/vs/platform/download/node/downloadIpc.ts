/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { URI } from 'vs/base/common/uri';
import * as path from 'path';
import * as fs from 'fs';
import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/node/ipc';
import { Event, Emitter, buffer } from 'vs/base/common/event';
import { IDownloadService } from 'vs/platform/download/common/download';
import { mkdirp } from 'vs/base/node/pfs';
import { IURITransformer } from 'vs/base/common/uriIpc';

export type UploadResponse = Buffer | string | undefined;

export function upload(uri: URI): Event<UploadResponse> {
	const stream = new Emitter<UploadResponse>();
	const readstream = fs.createReadStream(uri.fsPath);
	readstream.on('data', data => stream.fire(data));
	readstream.on('error', error => stream.fire(error.toString()));
	readstream.on('close', () => stream.fire());
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
					const disposable = uploadStream((result: UploadResponse) => {
						if (result === void 0) {
							out.end();
							disposable.dispose();
							c(null);
						} else if (Buffer.isBuffer(result)) {
							out.write(result);
						} else if (typeof result === 'string') {
							out.close();
							disposable.dispose();
							e(result);
						}
					});
				});
		});
	}
}