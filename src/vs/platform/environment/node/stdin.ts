/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * This code is also used by standalone cli's. Avoid adding dependencies to keep the size of the cli small.
 */
import * as paths from 'vs/base/common/path';
import * as fs from 'fs';
import * as os from 'os';
import { resolveTerminalEncoding } from 'vs/base/node/terminalEncoding';

export function hasStdinWithoutTty() {
	try {
		return !process.stdin.isTTY; // Via https://twitter.com/MylesBorins/status/782009479382626304
	} catch (error) {
		// Windows workaround for https://github.com/nodejs/node/issues/11656
	}
	return false;
}

export function stdinDataListener(durationinMs: number): Promise<boolean> {
	return new Promise(c => {
		const dataListener = () => c(true);

		// wait for 1s maximum...
		setTimeout(() => {
			process.stdin.removeListener('data', dataListener);

			c(false);
		}, durationinMs);

		// ...but finish early if we detect data
		process.stdin.once('data', dataListener);
	});
}

export function getStdinFilePath(): string {
	return paths.join(os.tmpdir(), `code-stdin-${Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 3)}.txt`);
}

export function readFromStdin(targetPath: string, verbose: boolean): Promise<any> {
	// open tmp file for writing
	const stdinFileStream = fs.createWriteStream(targetPath);
	// Pipe into tmp file using terminals encoding
	return resolveTerminalEncoding(verbose).then(async encoding => {

		const iconv = await import('iconv-lite');
		if (!iconv.encodingExists(encoding)) {
			console.log(`Unsupported terminal encoding: ${encoding}, falling back to UTF-8.`);
			encoding = 'utf8';
		}
		const converterStream = iconv.decodeStream(encoding);
		process.stdin.pipe(converterStream).pipe(stdinFileStream);
	});
}
