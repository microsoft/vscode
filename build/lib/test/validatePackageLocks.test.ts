/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { createLockfileRegenerationSeed, excludeRegistryDrift, findLockfileDifferences } from '../../azure-pipelines/common/validatePackageLocks.ts';

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
		const expected = {
			packages: {
				'node_modules/canary': { version: '1.0.79-canary.32.g8e26f23', resolved: 'https://registry.npmjs.org/canary/-/canary-1.0.79-canary.32.g8e26f23.tgz', optionalDependencies: { 'canary-darwin-arm64': '1.0.79-canary.32.g8e26f23' } },
				'node_modules/canary/node_modules/nested': { version: '2.0.1' },
				'node_modules/downgraded': { version: '1.0.0' },
				'node_modules/stale-metadata': { version: '1.0.0', libc: ['musl'] },
			}
		};
		const submitted = {
			packages: {
				'node_modules/canary': { version: '1.0.79-2', resolved: 'https://registry.npmjs.org/canary/-/canary-1.0.79-2.tgz', optionalDependencies: { 'canary-darwin-arm64': '1.0.79-2' } },
				'node_modules/canary/node_modules/nested': { version: '2.0.0' },
				'node_modules/downgraded': { version: '9.9.9' },
				'node_modules/stale-metadata': { version: '1.0.0' },
			}
		};
		const comparison = excludeRegistryDrift(expected, submitted);

		assert.deepStrictEqual({ drift: comparison.drift, differences: findLockfileDifferences(comparison.expected, comparison.submitted) }, {
			drift: [
				'node_modules/canary: committed "1.0.79-2", registry now offers "1.0.79-canary.32.g8e26f23"',
				'node_modules/canary/node_modules/nested: committed "2.0.0", registry now offers "2.0.1"',
			],
			differences: [
				'packages.node_modules/downgraded.version: expected "1.0.0", submitted "9.9.9"',
				'packages.node_modules/stale-metadata.libc: expected ["musl"], submitted <missing>',
			]
		});
	});
});
