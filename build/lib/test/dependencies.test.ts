/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { suite, test } from 'node:test';
import { getMixedInDistroDependencies } from '../dependencies.ts';

suite('dependencies', () => {

	test('takes the distro dependencies from where the mixin copied them, without the distro node_modules', t => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-dependencies-'));
		t.after(() => fs.rmSync(root, { recursive: true, force: true }));
		const folder = path.join(root, 'remote');
		const distroFolder = path.join(root, '.build', 'distro', 'npm', 'remote');
		fs.mkdirSync(distroFolder, { recursive: true });
		fs.writeFileSync(path.join(distroFolder, 'package.json'), JSON.stringify({ dependencies: { 'vsda': '1.0.0', '@vscode/vsce-sign': '2.1.0', 'not-mixed-in': '1.0.0' } }));
		for (const name of ['vsda', '@vscode/vsce-sign', 'other']) {
			fs.mkdirSync(path.join(folder, 'node_modules', name), { recursive: true });
		}

		assert.deepStrictEqual({
			mixedIn: getMixedInDistroDependencies(folder, distroFolder).map(dependency => path.relative(root, dependency)),
			noDistro: getMixedInDistroDependencies(folder, path.join(root, '.build', 'distro', 'npm', 'missing')),
		}, {
			mixedIn: [path.join('remote', 'node_modules', 'vsda'), path.join('remote', 'node_modules', '@vscode', 'vsce-sign')],
			noDistro: [],
		});
	});
});
