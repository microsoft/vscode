/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { Promises } from 'vs/base/node/pfs';
import { watchFile } from 'vs/base/node/watcher';

/**
 * This class provides logging for verbose commands on Mac
 * as part of #102975
 */
export class CliVerboseLogger {
	public async streamFile(path: string, stream: NodeJS.WriteStream): Promise<void> {
		// Assume path already exists at this point
		const fileHandle = await Promises.open(path, 'r');
		const bufferSize = 512;
		const buffer = Buffer.allocUnsafe(bufferSize);
		let watcher: IDisposable;

		return new Promise<void>((c) => {
			watcher = watchFile(path, async (type) => {
				if (type === 'changed') {
					while (true) {
						const readObj = await Promises.read(fileHandle, buffer, 0, bufferSize, null);
						if (!readObj.bytesRead) {
							return;
						}
						stream.write(readObj.buffer.toString(undefined, 0, readObj.bytesRead));
					}
				}
			}, (err) => {
				console.error('File watcher encountered an error. ' + err);
				c();
			});
		}).finally(async () => {
			watcher.dispose();
			await Promises.close(fileHandle);
		});
	}
}
