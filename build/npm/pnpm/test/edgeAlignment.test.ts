/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { alignDependencyEdges } from '../edgeAlignment.ts';
import type { NpmLockfile } from '../npmLockfile.ts';

const lockfile = (snapshots: readonly string[], packages: readonly string[]) => [
	'lockfileVersion: \'9.0\'',
	'',
	'importers:',
	'',
	'  .:',
	'    dependencies:',
	'      a:',
	'        specifier: ^1.0.0',
	'        version: 1.0.0',
	'      c:',
	'        specifier: ^2.0.0',
	'        version: 2.0.0',
	'    optionalDependencies:',
	'      d:',
	'        specifier: ^1.0.0',
	'        version: 1.0.0',
	'',
	'packages:',
	'',
	...packages,
	'snapshots:',
	'',
	...snapshots,
].join('\n');

const allPackages = [
	'  a@1.0.0:',
	'    resolution: {integrity: sha512-a}',
	'',
	'  b@1.0.0:',
	'    resolution: {integrity: sha512-b1}',
	'',
	'  b@1.1.0:',
	'    resolution: {integrity: sha512-b2}',
	'',
	'  c@2.0.0:',
	'    resolution: {integrity: sha512-c}',
	'',
	'  d@1.0.0:',
	'    resolution: {integrity: sha512-d}',
	'',
];

// npm: a and c both use b@1.0.0, d uses b@1.1.0 (pnpm gave a b@1.1.0)
const npmLockfile: NpmLockfile = {
	lockfileVersion: 3,
	packages: {
		'': { dependencies: { a: '^1.0.0', c: '^2.0.0' }, optionalDependencies: { d: '^1.0.0' } },
		'node_modules/a': { version: '1.0.0', dependencies: { b: '^1.0.0' } },
		'node_modules/b': { version: '1.0.0' },
		'node_modules/c': { version: '2.0.0', dependencies: { b: '^1.0.0' } },
		'node_modules/d': { version: '1.0.0', optional: true, dependencies: { b: '^1.1.0' } },
		'node_modules/d/node_modules/b': { version: '1.1.0', optional: true },
	},
};

suite('pnpm conversion: aligning package dependencies with npm', () => {

	test('uses npm\'s version and recomputes the optional flags', () => {
		const input = lockfile([
			'  a@1.0.0:',
			'    dependencies:',
			'      b: 1.1.0',
			'',
			'  b@1.0.0: {}',
			'',
			'  b@1.1.0: {}',
			'',
			'  c@2.0.0:',
			'    dependencies:',
			'      b: 1.0.0',
			'',
			'  d@1.0.0:',
			'    dependencies:',
			'      b: 1.1.0',
			'    optional: true',
			'',
		], allPackages);
		const result = alignDependencyEdges(input, [npmLockfile]);
		assert.deepStrictEqual({ aligned: result.aligned, skipped: result.skipped, text: result.text }, {
			aligned: ['a@1.0.0 -> b@1.0.0 (pnpm b@1.1.0)'],
			skipped: [],
			text: lockfile([
			'  a@1.0.0:',
			'    dependencies:',
			'      b: 1.0.0',
			'',
			'  b@1.0.0: {}',
			'',
			'  b@1.1.0:',
			'    optional: true',
			'',
			'  c@2.0.0:',
			'    dependencies:',
			'      b: 1.0.0',
			'',
			'  d@1.0.0:',
			'    dependencies:',
			'      b: 1.1.0',
			'    optional: true',
			'',
		], allPackages),
		});
	});

	test('leaves the lockfile alone when npm\'s version has no snapshot', () => {
		const input = lockfile([
			'  a@1.0.0:',
			'    dependencies:',
			'      b: 1.1.0',
			'',
			'  b@1.1.0: {}',
			'',
			'  c@2.0.0:',
			'    dependencies:',
			'      b: 1.1.0',
			'',
			'  d@1.0.0:',
			'    dependencies:',
			'      b: 1.1.0',
			'    optional: true',
			'',
		], allPackages.filter(line => !line.includes('b@1.0.0') && !line.includes('sha512-b1')));
		const result = alignDependencyEdges(input, [npmLockfile]);
		assert.deepStrictEqual({ skipped: result.skipped, unchanged: result.text === input }, {
			skipped: ['a@1.0.0 -> b@1.0.0 (pnpm b@1.1.0): 0 snapshots of b@1.0.0', 'c@2.0.0 -> b@1.0.0 (pnpm b@1.1.0): 0 snapshots of b@1.0.0'],
			unchanged: true,
		});
	});
});
