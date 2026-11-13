/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { suite, test } from 'node:test';
import { Formatter } from '../formatter.ts';

suite('formatter', () => {

	test('formats files on disk and in memory with the tsfmt.json settings, and sees changes to files on disk', async () => {
		const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-formatter-'));
		const file = path.join(folder, 'test.ts');
		const formatter = await Formatter.start();
		try {
			fs.writeFileSync(file, 'const f = function() {\n  return [1,2];\n};\n');
			const fromDisk = await formatter.format(file, fs.readFileSync(file, 'utf8'));
			fs.writeFileSync(file, 'if(x){y();}\n');
			const changedOnDisk = await formatter.format(file, fs.readFileSync(file, 'utf8'));
			const inMemory = await formatter.format(file, 'let x = - (y);\n');

			assert.deepStrictEqual({ fromDisk, changedOnDisk, inMemory }, {
				fromDisk: 'const f = function () {\n\treturn [1, 2];\n};\n',
				changedOnDisk: 'if (x) { y(); }\n',
				inMemory: 'let x = -(y);\n',
			});
		} finally {
			await formatter.dispose();
			fs.rmSync(folder, { recursive: true, force: true });
		}
	});
});
