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
import { join, dirname, basename } from 'path';
import { IStat, FileType, IFileSystemProvider } from 'vs/platform/files/common/files';
import { IProgress } from 'vs/platform/progress/common/progress';

export class FtpFileSystemProvider implements IFileSystemProvider {

	private _connection: JSFtp;

	readonly onDidChange = Event.None;

	constructor() {
		this._connection = new JSFtp({
			host: 'waws-prod-db3-029.ftp.azurewebsites.windows.net'
		});
		this._connection.keepAlive(1000 * 5);
	}

	dispose(): void {
		ninvoke(this._connection, this._connection.raw, 'QUIT');
	}

	utimes(resource: URI, mtime: number): TPromise<IStat> {
		return ninvoke(this._connection, this._connection.raw, 'NOOP')
			.then(() => this.stat(resource));
	}

	stat(resource: URI): TPromise<IStat> {
		const { path } = resource;
		if (path === '/') {
			// root directory
			return TPromise.as(<IStat>{
				type: FileType.Dir,
				resource,
				mtime: 0,
				size: 0
			});
		}

		const name = basename(path);
		const dir = dirname(path);
		return ninvoke<JSFtp.Entry[]>(this._connection, this._connection.ls, dir).then(entries => {
			for (const entry of entries) {
				if (entry.name === name) {
				return {
					resource,
					mtime: entry.time,
					size: entry.size,
						type: entry.type
				};
			}
			}
			console.log(entries, name, resource);
			throw new Error(`NotFound: ${resource.path}`);
		});
	}

	readdir(resource: URI): TPromise<IStat[]> {
		return ninvoke<JSFtp.Entry[]>(this._connection, this._connection.ls, resource.path).then(ret => {
			const result: IStat[] = [];
			for (let entry of ret) {
				result.push({
					resource: resource.with({ path: join(resource.path, entry.name) }),
					mtime: entry.time,
					size: entry.size,
					type: entry.type
				});
			}
			return result;
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

	write(resource: URI, content: Uint8Array): TPromise<void> {
		return ninvoke(this._connection, this._connection.put, content, resource.path);
	}

	rmdir(resource: URI): TPromise<void> {
		return ninvoke(this._connection, this._connection.raw, 'RMD', [resource.path]);
	}

	mkdir(resource: URI): TPromise<void> {
		return ninvoke(this._connection, this._connection.raw, 'MKD', [resource.path]);
	}

	unlink(resource: URI): TPromise<void> {
		return ninvoke(this._connection, this._connection.raw, 'DELE', [resource.path]);
	}

	rename(resource: URI, target: URI): TPromise<void> {
		return ninvoke(this._connection, this._connection.raw, 'RNFR', [resource.path]).then(() => {
			return ninvoke(this._connection, this._connection.raw, 'RNTO', [target.path]);
		});
	}
}
