/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import * as fs from 'fs';
import { IServerChannel } from 'vs/base/parts/ipc/node/ipc';
import { Event, Emitter } from 'vs/base/common/event';

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

	listen(_, event: string, arg?: any): Event<any> {
		switch (event) {
			case 'upload': return Event.buffer(upload(URI.revive(arg)));
		}

		throw new Error(`Event not found: ${event}`);
	}

	call(_, command: string): Promise<any> {
		throw new Error(`Call not found: ${command}`);
	}
}
