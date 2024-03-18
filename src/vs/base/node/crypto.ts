/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as fs from 'fs';
import { createSingleCallFunction } from 'vs/base/common/functional';

export async function checksum(path: string, sha256hash: string | undefined): Promise<void> {
	const checksumPromise = new Promise<string | undefined>((resolve, reject) => {
		const input = fs.createReadStream(path);
		const hash = crypto.createHash('sha256');
		input.pipe(hash);

		const done = createSingleCallFunction((err?: Error, result?: string) => {
			input.removeAllListeners();
			hash.removeAllListeners();

			if (err) {
				reject(err);
			} else {
				resolve(result);
			}
		});

		input.once('error', done);
		input.once('end', done);
		hash.once('error', done);
		hash.once('data', (data: Buffer) => done(undefined, data.toString('hex')));
	});

	const hash = await checksumPromise;

	if (hash !== sha256hash) {
		throw new Error('Hash mismatch');
	}
}
