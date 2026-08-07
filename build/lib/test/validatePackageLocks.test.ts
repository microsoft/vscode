/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { createLockfileRegenerationSeed, findChangedPackageKeys, findLockfileDifferences, pinChangedPackages, restoreDeclaredDependencies } from '../../azure-pipelines/common/validatePackageLocks.ts';

suite('validatePackageLocks', () => {
	test('forces npm to regenerate every package record changed by the PR', () => {
		const base = {
			lockfileVersion: 3,
			packages: {
				'': { devDependencies: { tool: '2.0.0' } },
				'node_modules/native-gnu': { version: '1.0.0', os: ['linux'], libc: ['glibc'] },
				'node_modules/native-musl': { version: '1.0.0', os: ['linux'], libc: ['musl'] },
				'node_modules/unchanged': { version: '1.0.0', resolved: 'https://registry.npmjs.org/unchanged/-/unchanged-1.0.0.tgz' },
			}
		};
		const submitted = {
			lockfileVersion: 3,
			packages: {
				'': { devDependencies: { tool: '2.0.0' } },
				'node_modules/native-gnu': { version: '1.0.0', os: ['linux'] },
				'node_modules/native-musl': { version: '1.0.0', os: ['linux'] },
				'node_modules/unchanged': { version: '1.0.0', resolved: 'https://private.example/npm/unchanged/-/unchanged-1.0.0.tgz' },
				'node_modules/tool': { version: '2.0.0' },
			}
		};

		assert.deepStrictEqual(createLockfileRegenerationSeed(base, submitted), {
			lockfileVersion: 3,
			packages: {
				'': { devDependencies: { tool: '2.0.0' } },
				'node_modules/unchanged': { version: '1.0.0', resolved: 'https://registry.npmjs.org/unchanged/-/unchanged-1.0.0.tgz' },
			}
		});
	});

	test('reports package metadata removed by a stale npm version', () => {
		const expected = {
			packages: {
				'node_modules/native-musl': { version: '1.0.0', resolved: 'https://registry.npmjs.org/native-musl/-/native-musl-1.0.0.tgz', integrity: 'sha1-registry-value', libc: ['musl'] }
			}
		};
		const submitted = {
			packages: {
				'node_modules/native-musl': { version: '1.0.0', resolved: 'https://private.example/npm/native-musl/-/native-musl-1.0.0.tgz', integrity: 'sha512-public-registry-value' }
			}
		};

		assert.deepStrictEqual(findLockfileDifferences(expected, submitted), [
			'packages.node_modules/native-musl.libc: expected ["musl"], submitted <missing>'
		]);
	});

	test('ignores packages whose only difference is a release published after the lockfile was generated', () => {
		const base = {
			packages: {
				'': { dependencies: { canary: '^1.0.79-2', unchanged: '^3.0.0' } },
				'node_modules/canary': { version: '1.0.78' },
				'node_modules/unchanged': { version: '3.0.0' },
			}
		};
		const submitted = {
			packages: {
				'': { dependencies: { canary: '^1.0.79-2', unchanged: '^3.0.0' } },
				'node_modules/canary': { version: '1.0.79-2' },
				'node_modules/unchanged': { version: '3.0.0' },
			}
		};
		const packageJson = { dependencies: { canary: '^1.0.79-2', unchanged: '^3.0.0' } };

		// The changed dependency is pinned to the committed version, so regeneration cannot drift to a
		// newer release; the untouched dependency keeps its declared range.
		assert.deepStrictEqual(pinChangedPackages(packageJson, findChangedPackageKeys(base, submitted), submitted), {
			dependencies: { canary: '1.0.79-2', unchanged: '^3.0.0' }
		});
	});

	test('pins changed transitive and dev dependencies without inventing new entries', () => {
		const base = { packages: { '': {}, 'node_modules/tool': { version: '2.0.0' } } };
		const submitted = {
			packages: {
				'': {},
				'node_modules/tool': { version: '2.1.0' },
				'node_modules/tool/node_modules/nested': { version: '5.0.0' },
				'node_modules/workspace-link': { link: true, resolved: 'packages/thing' },
			}
		};
		const packageJson = { devDependencies: { tool: '^2.0.0' }, dependencies: { unrelated: '^1.0.0' } };

		assert.deepStrictEqual(pinChangedPackages(packageJson, findChangedPackageKeys(base, submitted), submitted), {
			devDependencies: { tool: '2.1.0' },
			dependencies: { unrelated: '^1.0.0' }
		});
	});

	test('restores declared dependency ranges after regeneration', () => {
		const regenerated = {
			packages: {
				'': {
					dependencies: { canary: '1.0.79-2' },
					devDependencies: { tool: '2.1.0' },
					license: 'MIT'
				}
			}
		};
		const packageJson = {
			dependencies: { canary: '^1.0.79-2' },
			devDependencies: { tool: '^2.0.0' }
		};

		assert.deepStrictEqual(restoreDeclaredDependencies(regenerated, packageJson), {
			packages: {
				'': {
					dependencies: { canary: '^1.0.79-2' },
					devDependencies: { tool: '^2.0.0' },
					license: 'MIT'
				}
			}
		});
	});
});
