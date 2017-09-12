/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';



import URI from 'vs/base/common/uri';
import Event from 'vs/base/common/event';
import * as JSFtp from 'jsftp';
import { ninvoke } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { Readable } from 'stream';
import { join } from 'path';
import { IStat, IRemoteFileSystemProvider } from 'vs/workbench/services/files/electron-browser/remoteFileService';
import { IProgress } from 'vs/platform/progress/common/progress';

export class FtpFileSystemProvider implements IRemoteFileSystemProvider {

	private _connection: JSFtp;

	readonly onDidChange = Event.None;

	constructor() {
		this._connection = new JSFtp({
			host: 'waws-prod-db3-029.ftp.azurewebsites.windows.net'
		});
		this._connection.keepAlive(1000 * 5);
	}

	dispose(): void {
		//
	}

	stat(resource: URI): TPromise<IStat> {

		return ninvoke<JSFtp.Entry[]>(this._connection, this._connection.ls, resource.path).then(entries => {

			if (entries.length === 1) {
				// stat one file
				const [entry] = entries;
				return {
					resource,
					mtime: entry.time,
					size: entry.size,
					isDirectory: false
				};
			}

			// stat directory
			return <IStat>{
				resource,
				isDirectory: true,
				mtime: 0,
				size: 0
			};
		});
	}

	readdir(resource: URI): TPromise<IStat[]> {
		return ninvoke<JSFtp.Entry[]>(this._connection, this._connection.ls, resource.path).then(ret => {
			const promises: TPromise<IStat>[] = [];
			for (let entry of ret) {
				promises.push(this.stat(resource.with({ path: join(resource.path, entry.name) })));
			}
			return TPromise.join(promises);
		});
	}

	read(resource: URI, progress: IProgress<Uint8Array>): TPromise<void> {
		return ninvoke<Readable>(this._connection, this._connection.get, resource.path).then(stream => {
			return new TPromise<void>((resolve, reject) => {
				stream.on('data', d => progress.report(<any>d));
				stream.on('close', hadErr => {
					if (hadErr) {
						reject(hadErr);
					} else {
						resolve(undefined);
					}
				});
				stream.resume();
			});
		});
	}

	write(resource: URI, content: string): TPromise<void> {
		return ninvoke(this._connection, this._connection.put, Buffer.from(content, 'utf8'), resource.path);
	}

	del(resource: URI): TPromise<void> {

		return ninvoke<JSFtp.Entry[]>(this._connection, this._connection.ls, resource.path).then(entries => {
			if (entries.length === 1) {
				// file;
		return ninvoke(this._connection, this._connection.raw, 'DELE', [resource.path]);
			} else {
				// dir
				return ninvoke(this._connection, this._connection.raw, 'RMD', [resource.path]);
			}
		});
	}

	mkdir(resource: URI): TPromise<void> {
		return ninvoke(this._connection, this._connection.raw, 'MKD', [resource.path]);
	}
}
