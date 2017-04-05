/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as fs from 'fs';
import * as crypto from 'crypto';
import * as stream from 'stream';
import { TPromise } from 'vs/base/common/winjs.base';
import { once } from 'vs/base/common/functional';

export function checksum(path: string, sha1hash: string): TPromise<void> {
	const promise = new TPromise<string>((c, e) => {
		const input = fs.createReadStream(path);
		const hash = crypto.createHash('sha1');
		const hashStream = hash as any as stream.PassThrough;
		input.pipe(hashStream);

		const done = once((err?: Error, result?: string) => {
			input.removeAllListeners();
			hashStream.removeAllListeners();

			if (err) {
				e(err);
			} else {
				c(result);
			}
		});

		input.once('error', done);
		input.once('end', done);
		hashStream.once('error', done);
		hashStream.once('data', data => done(null, data.toString('hex')));
	});

	return promise.then(hash => {
		if (hash !== sha1hash) {
			return TPromise.wrapError<void>(new Error('Hash mismatch'));
		}

		return TPromise.as(null);
	});
}