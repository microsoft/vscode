/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GitProcess } from 'dugite';
import * as fs from 'fs';
import * as tmp from 'tmp';

export async function writeTmpFile(content: string, ext: string): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		tmp.file({ postfix: ext }, async (err: any, tmpFilePath: string) => {
			if (err) {
				reject(err);
				return;
			}

			try {
				fs.appendFileSync(tmpFilePath, content);
				resolve(tmpFilePath);
			} catch (ex) {
				reject(ex);
			}
		});
	});
}

export async function getFileContent(rootDir: string, commitSha: string, sourceFilePath: string): Promise<string> {
	const result = await GitProcess.exec([
		'show',
		`${commitSha}:` + sourceFilePath.replace(/\\/g, '/')
	], rootDir);

	const out = result.stdout;
	const error = result.stderr;

	if (result.exitCode === 0) {
		return out;
	} else {
		throw error;
	}
}
