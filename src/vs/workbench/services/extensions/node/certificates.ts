/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as path from 'path';
import { promisify } from 'util';

const der2 = require.__$__nodeRequire<any>('win-ca/lib/der2');

export async function readCertificates(appRoot: string) {
	if (process.platform === 'win32') {
		let stdout: string;
		try {
			stdout = (await promisify(cp.execFile)(path.join(appRoot, 'node_modules.asar.unpacked\\win-ca\\lib\\roots.exe'), { encoding: 'utf8' })).stdout;
		} catch (err) {
			if (err.code !== 'ENOENT') {
				throw err;
			}
			stdout = (await promisify(cp.execFile)(path.join(appRoot, 'node_modules\\win-ca\\lib\\roots.exe'), { encoding: 'utf8' })).stdout;
		}
		const seen = {};
		return stdout.split('\r\n')
			.filter(line => !!line.length && !seen[line] && (seen[line] = true))
			.map(hex => der2(der2.pem, Buffer.from(hex, 'hex')) as string);
	}
	return undefined;
}
