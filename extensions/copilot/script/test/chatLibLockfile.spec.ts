/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { copyLockedDependencies, DependencyKind, PnpmLockfile } from '../build/chatLibLockfile';

type Importer = PnpmLockfile['importers'][string];

/**
 * Creates a lockfile with the given importer and a package and snapshot entry for each of the given
 * snapshot keys (`name@version`, optionally with resolved peers), mapped to their dependencies.
 */
function lockfile(importer: Importer, entries: Record<string, Record<string, string>>): PnpmLockfile {
	return {
		importers: { '.': importer },
		packages: Object.fromEntries(Object.keys(entries).map(key => [key.replace(/\(.*$/, ''), { resolution: { integrity: `sha512-${key}` } }])),
		snapshots: Object.fromEntries(Object.entries(entries).map(([key, dependencies]) => [key, Object.keys(dependencies).length > 0 ? { dependencies } : {}])),
	};
}

function update(copilot: PnpmLockfile, chatLib: PnpmLockfile, changed: Record<string, DependencyKind>, removed: string[] = []) {
	const copied = copyLockedDependencies(copilot, chatLib, new Map(Object.entries(changed)), new Set(removed));
	return { copied, chatLib };
}

suite('copyLockedDependencies', () => {
	test('a rollback within a compatible range selects Copilot\'s version', () => {
		const copilot = lockfile({ dependencies: { 'jsonc-parser': { specifier: '^3.1.0', version: '3.1.0' } } }, { 'jsonc-parser@3.1.0': {} });
		const chatLib = lockfile({ dependencies: { 'jsonc-parser': { specifier: '^3.2.0', version: '3.2.0' } } }, { 'jsonc-parser@3.2.0': {} });
		expect(update(copilot, chatLib, { 'jsonc-parser': 'dependencies' })).toEqual({
			copied: 1,
			chatLib: lockfile({ dependencies: { 'jsonc-parser': { specifier: '^3.1.0', version: '3.1.0' } } }, { 'jsonc-parser@3.1.0': {} }),
		});
	});

	test('an upgrade copies Copilot\'s subtree, replacing shared entries, and drops unused ones', () => {
		const copilot = lockfile({
			dependencies: { a: { specifier: '^2.0.0', version: '2.0.0(p@1.0.0)' }, b: { specifier: '^1.0.0', version: '1.0.0' }, p: { specifier: '^1.0.0', version: '1.0.0' } },
		}, {
			'a@2.0.0(p@1.0.0)': { c: '1.0.0', p: '1.0.0' },
			'b@1.0.0': { c: '1.0.0' },
			'c@1.0.0': { d: '1.1.0' },
			'd@1.1.0': {},
			'p@1.0.0': {},
		});
		const chatLib = lockfile({
			dependencies: { a: { specifier: '^1.0.0', version: '1.0.0' }, b: { specifier: '^1.0.0', version: '1.0.0' } },
		}, {
			'a@1.0.0': { e: '1.0.0' },
			'b@1.0.0': { c: '1.0.0' },
			'c@1.0.0': { d: '1.0.0' },
			'd@1.0.0': {},
			'e@1.0.0': {},
		});
		expect(update(copilot, chatLib, { a: 'dependencies' })).toEqual({
			copied: 4,
			chatLib: lockfile({
				dependencies: { a: { specifier: '^2.0.0', version: '2.0.0(p@1.0.0)' }, b: { specifier: '^1.0.0', version: '1.0.0' } },
			}, {
				'a@2.0.0(p@1.0.0)': { c: '1.0.0', p: '1.0.0' },
				'b@1.0.0': { c: '1.0.0' },
				'c@1.0.0': { d: '1.1.0' },
				'd@1.1.0': {},
				'p@1.0.0': {},
			}),
		});
	});

	test('an npm alias is locked to the aliased package', () => {
		const copilot = lockfile({
			devDependencies: { typescript: { specifier: 'npm:@typescript/typescript6@^6.0.2', version: '@typescript/typescript6@6.0.2' } },
		}, {
			'@typescript/typescript6@6.0.2': { '@typescript/old': 'typescript@6.0.3' },
			'typescript@6.0.3': {},
		});
		const chatLib = lockfile({ devDependencies: { typescript: { specifier: '^5.8.3', version: '5.8.3' } } }, { 'typescript@5.8.3': {} });
		expect(update(copilot, chatLib, { typescript: 'devDependencies' })).toEqual({
			copied: 2,
			chatLib: lockfile({
				devDependencies: { typescript: { specifier: 'npm:@typescript/typescript6@^6.0.2', version: '@typescript/typescript6@6.0.2' } },
			}, {
				'@typescript/typescript6@6.0.2': { '@typescript/old': 'typescript@6.0.3' },
				'typescript@6.0.3': {},
			}),
		});
	});

	test('a removed dependency and its entries are dropped', () => {
		const copilot = lockfile({ dependencies: { a: { specifier: '^1.0.0', version: '1.0.0' } } }, { 'a@1.0.0': {} });
		const chatLib = lockfile({
			dependencies: { a: { specifier: '^1.0.0', version: '1.0.0' } },
			devDependencies: { b: { specifier: '^1.0.0', version: '1.0.0' } },
		}, { 'a@1.0.0': {}, 'b@1.0.0': { c: '1.0.0' }, 'c@1.0.0': {} });
		expect(update(copilot, chatLib, {}, ['b'])).toEqual({
			copied: 0,
			chatLib: lockfile({ dependencies: { a: { specifier: '^1.0.0', version: '1.0.0' } } }, { 'a@1.0.0': {} }),
		});
	});

	test('fails instead of resolving when an entry is missing', () => {
		const chatLib = () => lockfile({ dependencies: { a: { specifier: '^1.0.0', version: '1.0.0' } } }, { 'a@1.0.0': {} });
		expect([
			() => update(lockfile({}, {}), chatLib(), { a: 'dependencies' }),
			() => update(lockfile({ dependencies: { a: { specifier: '^2.0.0', version: '2.0.0' } } }, { 'a@2.0.0': { b: '1.0.0' } }), chatLib(), { a: 'dependencies' }),
		].map(fn => { try { fn(); return 'no error'; } catch (error) { return (error as Error).message; } })).toEqual([
			'Copilot\'s pnpm-lock.yaml doesn\'t lock a version of a that chat-lib can use.',
			'Copilot\'s pnpm-lock.yaml has no entry for b@1.0.0.',
		]);
	});
});
