/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import * as path from 'vs/base/common/path';
import * as fs from 'fs';
import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { Event, Emitter } from 'vs/base/common/event';
import { IDownloadService } from 'vs/platform/download/common/download';
import { mkdirp } from 'vs/base/node/pfs';
import { IURITransformer } from 'vs/base/common/uriIpc';
import { tmpdir } from 'os';
import { generateUuid } from 'vs/base/common/uuid';

type UploadResponse = Buffer | string | undefined;

function upload(uri: URI): Event<UploadResponse> {
	const stream = new Emitter<UploadResponse>();
	const readstream = fs.createReadStream(uri.fsPath);
	readstream.on('data', data => stream.fire(data));
	readstream.on('error', error => stream.fire(error.toString()));
	readstream.on('close', () => stream.fire(undefined));
	return stream.event;
}

export class DownloadServiceChannel implements IServerChannel {

	constructor() { }

	listen(_: unknown, event: string, arg?: any): Event<any> {
		switch (event) {
			case 'upload': return Event.buffer(upload(URI.revive(arg)));
		}

		throw new Error(`Event not found: ${event}`);
	}

	call(_: unknown, command: string): Promise<any> {
		throw new Error(`Call not found: ${command}`);
	}
}

export class DownloadServiceChannelClient implements IDownloadService {

	_serviceBrand: any;

	constructor(private channel: IChannel, private getUriTransformer: () => IURITransformer) { }

	download(from: URI, to: string = path.join(tmpdir(), generateUuid())): Promise<string> {
		from = this.getUriTransformer().transformOutgoingURI(from);
		const dirName = path.dirname(to);
		let out: fs.WriteStream;
		return new Promise<string>((c, e) => {
			return mkdirp(dirName)
				.then(() => {
					out = fs.createWriteStream(to);
					out.once('close', () => c(to));
					out.once('error', e);
					const uploadStream = this.channel.listen<UploadResponse>('upload', from);
					const disposable = uploadStream(result => {
						if (result === undefined) {
							disposable.dispose();
							out.end(() => c(to));
						} else if (Buffer.isBuffer(result)) {
							out.write(result);
						} else if (typeof result === 'string') {
							disposable.dispose();
							out.end(() => e(result));
						}
					});
				});
		});
	}
}