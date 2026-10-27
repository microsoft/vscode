/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { suite, test } from 'node:test';
import { collectInputFiles, root } from '../installStateHash.ts';

suite('install state hash', () => {
	test('includes every file that the pnpmfiles import', () => {
		const inputs = collectInputFiles();
		const pnpmfiles = inputs.filter(file => path.basename(file) === '.pnpmfile.mts');
		const imported = new Set<string>();
		const pending = [...pnpmfiles];
		while (pending.length > 0) {
			const file = pending.pop()!;
			for (const match of fs.readFileSync(file, 'utf8').matchAll(/^import .* from '(?<specifier>\.[^']+)';$/gm)) {
				const target = path.resolve(path.dirname(file), match.groups!.specifier);
				if (!imported.has(target)) {
					imported.add(target);
					pending.push(target);
				}
			}
		}
		const relative = (files: Iterable<string>) => [...files].map(file => path.relative(root, file).split(path.sep).join('/')).sort();
		assert.deepStrictEqual({
			pnpmfiles: relative(pnpmfiles),
			imported: relative(imported),
			missing: relative([...imported].filter(file => !inputs.includes(file))),
		}, {
			pnpmfiles: ['.pnpmfile.mts', 'build/.pnpmfile.mts', 'remote/.pnpmfile.mts'],
			imported: ['build/npm/pnpm/nativeBuildEnv.ts'],
			missing: [],
		});
	});
});
