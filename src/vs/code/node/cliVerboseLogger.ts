/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess } from 'child_process';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Promises } from 'vs/base/node/pfs';
import { watchFile } from 'vs/base/node/watcher';

/**
 * This class provides logging for verbose commands on Mac
 * as part of #102975
 */
export class CliVerboseLogger {
	public async track(child: ChildProcess, logfile: string): Promise<void> {
		// Assume logfile already exists at this point
		const fileHandle = await Promises.open(logfile, 'r');
		const bufferSize = 512;
		const buffer = Buffer.allocUnsafe(bufferSize);
		let watcher: IDisposable;

		return new Promise<void>(async (c) => {
			watcher = watchFile(logfile, async (type) => {
				if (type === 'changed') {
					while (true) {
						const readObj = await Promises.read(fileHandle, buffer, 0, bufferSize, null);
						if (!readObj.bytesRead) {
							return;
						}
						process.stdout.write(readObj.buffer.toString(undefined, 0, readObj.bytesRead));
					}
				}
			}, (err) => {
				console.error('Verbose logger file watcher encountered an error. ' + err);
				c();
			});
			child.on('close', () => {
				c();
			});
		}).finally(async () => {
			watcher.dispose();
			await Promises.close(fileHandle);
		});
	}
}
