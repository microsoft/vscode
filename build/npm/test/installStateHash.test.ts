/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { suite, test } from 'node:test';
import { collectInputFiles, computeContents, root } from '../installStateHash.ts';
import { separateRoots } from '../dirs.ts';
import { readNativeBuildConfig } from '../pnpm/nativeBuildEnv.ts';

suite('install state hash', () => {
	test('includes every file that the pnpmfiles import', () => {
		const inputs = collectInputFiles();
		const pnpmfiles = inputs.filter(file => path.basename(file) === '.pnpmfile.mjs');
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
			pnpmfiles: ['.pnpmfile.mjs', 'build/.pnpmfile.mjs', 'remote/.pnpmfile.mjs'],
			imported: ['build/npm/pnpm/nativeBuildEnv.ts'],
			missing: [],
		});
	});

	test('includes the native build settings of every install root', () => {
		// A changed target or runtime must reinstall, so that native modules are rebuilt for it.
		const contents = computeContents();
		const hashed: Record<string, unknown> = {};
		const expected: Record<string, unknown> = {};
		for (const dir of ['', ...separateRoots]) {
			const nativeBuild = readNativeBuildConfig(path.join(root, dir));
			if (nativeBuild) {
				const manifest = path.join(dir, 'package.json');
				hashed[manifest] = JSON.parse(contents[manifest]).nativeBuild;
				expected[manifest] = nativeBuild;
			}
		}
		assert.deepStrictEqual(hashed, expected);
		assert.deepStrictEqual(Object.keys(expected).map(file => file.split(path.sep).join('/')).sort(), ['build/package.json', 'package.json', 'remote/package.json']);
	});
});
