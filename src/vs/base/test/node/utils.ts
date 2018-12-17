/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from 'vs/base/common/uuid';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirp, del } from 'vs/base/node/pfs';

export interface ITestFileResult {
	testFile: string;
	cleanUp: () => Promise<void>;
}

export function testFile(folder: string, file: string): Promise<ITestFileResult> {
	const id = generateUuid();
	const parentDir = join(tmpdir(), 'vsctests', id);
	const newDir = join(parentDir, 'config', id);
	const testFile = join(newDir, 'config.json');

	return mkdirp(newDir, 493).then(() => {
		return {
			testFile,
			cleanUp: () => del(parentDir, tmpdir())
		} as ITestFileResult;
	});
}
