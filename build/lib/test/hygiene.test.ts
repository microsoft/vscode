/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawnSync } from 'child_process';
import path from 'path';
import { suite, test } from 'node:test';

suite('hygiene', () => {

	test('rejects requested files that enter no hygiene checker', () => {
		const repositoryRoot = path.join(import.meta.dirname, '../../..');
		const result = spawnSync(process.execPath, [
			'--experimental-strip-types',
			'build/hygiene.ts',
			'src/vs/editor/contrib/colorPicker/browser/images/opacity-background.png',
		], {
			cwd: repositoryRoot,
			encoding: 'utf8',
		});

		assert.deepStrictEqual({
			status: result.status,
			hasNoMatchError: result.stderr.includes('No hygiene-eligible files matched the requested paths'),
		}, {
			status: 1,
			hasNoMatchError: true,
		});
	});
});
