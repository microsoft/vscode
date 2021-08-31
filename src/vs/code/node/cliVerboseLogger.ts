/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess } from 'child_process';
import { watch, writeFileSync } from 'fs';
import { Promises } from 'vs/base/node/pfs';

/**
 * This class provides logging for verbose commands on Mac
 * as part of #102975
 */
export class CliVerboseLogger {
	constructor(readonly filename: string) {
		writeFileSync(filename, '');
	}

	public track(): (child: ChildProcess) => Promise<void> {
		return async (child: ChildProcess) => {
			const watcher = watch(this.filename);
			const fileHandle = await Promises.open(this.filename, 'r');
			const bufferSize = 512;
			const buffer = Buffer.alloc(bufferSize);
			return new Promise<void>(async (c) => {
				watcher.on('change', async () => {
					while (true) {
						const readObj = await Promises.read(fileHandle, buffer, 0, bufferSize, null);
						if (!readObj.bytesRead) {
							return;
						}
						process.stdout.write(readObj.buffer.toString(undefined, 0, readObj.bytesRead));
					}
				});
				watcher.on('error', () => {
					console.error('Verbose logger watcher encountered an error.');
					c();
				});
				child.on('close', () => {
					c();
				});
			}).finally(() => {
				Promises.close(fileHandle);
				watcher.close();
			});
		};
	}
}
