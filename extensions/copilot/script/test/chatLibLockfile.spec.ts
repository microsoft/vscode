/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { DependencyKind, lockChatLibDependencies, PnpmLockfile, splitLockfileDocuments } from '../build/chatLibLockfile';

type Importer = PnpmLockfile['importers'][string];

/**
 * Creates a lockfile with Copilot's project (`extensions/copilot`), chat-lib's project
 * (`extensions/copilot/chat-lib`) and a package and snapshot entry for each of the given snapshot
 * keys (`name@version`, optionally with resolved peers), mapped to their dependencies.
 */
function lockfile(copilot: Importer, chatLib: Importer, entries: Record<string, Record<string, string>>): PnpmLockfile {
	return {
		importers: { 'extensions/copilot': copilot, 'extensions/copilot/chat-lib': chatLib },
		packages: Object.fromEntries(Object.keys(entries).map(key => [key.replace(/\(.*$/, ''), { resolution: { integrity: `sha512-${key.replace(/\(.*$/, '')}` } }])),
		snapshots: Object.fromEntries(Object.entries(entries).map(([key, dependencies]) => [key, Object.keys(dependencies).length > 0 ? { dependencies } : {}])),
	};
}

function update(input: PnpmLockfile, changed: Record<string, DependencyKind>, removed: string[] = []) {
	const locked = lockChatLibDependencies(input, 'extensions/copilot', 'extensions/copilot/chat-lib', new Map(Object.entries(changed)), new Set(removed));
	return { locked, lockfile: input };
}

suite('lockChatLibDependencies', () => {
	test('a rollback within a compatible range selects Copilot\'s version and drops chat-lib\'s', () => {
		const copilot = { dependencies: { 'jsonc-parser': { specifier: '^3.1.0', version: '3.1.0' } } };
		expect(update(lockfile(copilot, {
			dependencies: { 'jsonc-parser': { specifier: '^3.2.0', version: '3.2.0' } },
		}, { 'jsonc-parser@3.1.0': {}, 'jsonc-parser@3.2.0': {} }), { 'jsonc-parser': 'dependencies' })).toEqual({
			locked: 1,
			lockfile: lockfile(copilot, {
				dependencies: { 'jsonc-parser': { specifier: '^3.1.0', version: '3.1.0' } },
			}, { 'jsonc-parser@3.1.0': {} }),
		});
	});

	test('an upgrade uses Copilot\'s entries, with resolved peers, and drops the ones no project uses', () => {
		const copilot = {
			dependencies: { a: { specifier: '^2.0.0', version: '2.0.0(p@1.0.0)' }, b: { specifier: '^1.0.0', version: '1.0.0' }, p: { specifier: '^1.0.0', version: '1.0.0' } },
		};
		const entries = {
			'a@2.0.0(p@1.0.0)': { c: '1.0.0', p: '1.0.0' },
			'b@1.0.0': { c: '1.0.0' },
			'c@1.0.0': {},
			'p@1.0.0': {},
		};
		expect(update(lockfile(copilot, {
			dependencies: { a: { specifier: '^1.0.0', version: '1.0.0' }, b: { specifier: '^1.0.0', version: '1.0.0' } },
		}, { ...entries, 'a@1.0.0': { e: '1.0.0' }, 'e@1.0.0': {} }), { a: 'dependencies' })).toEqual({
			locked: 1,
			lockfile: lockfile(copilot, {
				dependencies: { a: { specifier: '^2.0.0', version: '2.0.0(p@1.0.0)' }, b: { specifier: '^1.0.0', version: '1.0.0' } },
			}, entries),
		});
	});

	test('an npm alias is locked to the aliased package, also when it moves to another section', () => {
		const copilot = {
			devDependencies: { typescript: { specifier: 'npm:@typescript/typescript6@^6.0.2', version: '@typescript/typescript6@6.0.2' } },
		};
		expect(update(lockfile(copilot, {
			dependencies: { typescript: { specifier: '^5.8.3', version: '5.8.3' } },
		}, { '@typescript/typescript6@6.0.2': {}, 'typescript@5.8.3': {} }), { typescript: 'devDependencies' })).toEqual({
			locked: 1,
			lockfile: lockfile(copilot, {
				devDependencies: { typescript: { specifier: 'npm:@typescript/typescript6@^6.0.2', version: '@typescript/typescript6@6.0.2' } },
			}, { '@typescript/typescript6@6.0.2': {} }),
		});
	});

	test('a removed dependency is dropped; its entries stay while Copilot uses them', () => {
		const copilot = { dependencies: { a: { specifier: '^1.0.0', version: '1.0.0' }, c: { specifier: '^1.0.0', version: '1.0.0' } } };
		expect(update(lockfile(copilot, {
			dependencies: { a: { specifier: '^1.0.0', version: '1.0.0' } },
			devDependencies: { b: { specifier: '^1.0.0', version: '1.0.0' } },
		}, { 'a@1.0.0': {}, 'b@1.0.0': { c: '1.0.0', d: '1.0.0' }, 'c@1.0.0': {}, 'd@1.0.0': {} }), {}, ['b'])).toEqual({
			locked: 0,
			lockfile: lockfile(copilot, {
				dependencies: { a: { specifier: '^1.0.0', version: '1.0.0' } },
			}, { 'a@1.0.0': {}, 'c@1.0.0': {} }),
		});
	});

	test('keeps the entries of the file: dependencies of other projects', () => {
		const copilot = { dependencies: { a: { specifier: '^1.0.0', version: '1.0.0' } } };
		const input = lockfile(copilot, {
			dependencies: { a: { specifier: '^1.0.0', version: '1.0.0' } },
		}, { 'a@1.0.0': { mock: 'file:mocks/mock' }, 'mock@file:other/mock': {}, 'mock@file:mocks/mock': {} });
		input.importers.other = { dependencies: { mock: { specifier: 'file:./mock', version: 'file:other/mock' }, project: { specifier: 'workspace:*', version: 'link:../project' } } };
		const expected = structuredClone(input);
		expect(update(input, {}, [])).toEqual({ locked: 0, lockfile: expected });
	});

	test('fails instead of resolving when a version or an entry is missing', () => {
		const chatLib = { dependencies: { a: { specifier: '^1.0.0', version: '1.0.0' } } };
		expect([
			() => update(lockfile({}, chatLib, { 'a@1.0.0': {} }), { a: 'dependencies' }),
			() => update(lockfile({ dependencies: { a: { specifier: '^2.0.0', version: '2.0.0' } } }, chatLib, { 'a@1.0.0': {}, 'a@2.0.0': { b: '1.0.0' } }), { a: 'dependencies' }),
			() => lockChatLibDependencies(lockfile({}, {}, {}), 'extensions/copilot', 'other', new Map(), new Set()),
		].map(fn => { try { fn(); return 'no error'; } catch (error) { return (error as Error).message; } })).toEqual([
			'Copilot\'s project in pnpm-lock.yaml doesn\'t lock a version of a that chat-lib can use.',
			'pnpm-lock.yaml has no entries for b@1.0.0.',
			'pnpm-lock.yaml has no project other.',
		]);
	});
});

suite('splitLockfileDocuments', () => {
	test('splits off the documents before the lockfile of the projects', () => {
		const packageManager = '---\nlockfileVersion: \'9.0\'\n\nimporters:\n\n  .:\n    packageManagerDependencies: {}\n\n---\n';
		const projects = 'lockfileVersion: \'9.0\'\n\nimporters:\n\n  .:\n    dependencies:\n      a:\n        specifier: \'---\'\n        version: 1.0.0\n';
		expect([
			splitLockfileDocuments(packageManager + projects),
			splitLockfileDocuments((packageManager + projects).replace(/\n/g, '\r\n')),
			splitLockfileDocuments(projects),
		]).toEqual([
			{ leadingDocuments: packageManager, lockfile: projects },
			{ leadingDocuments: packageManager.replace(/\n/g, '\r\n'), lockfile: projects.replace(/\n/g, '\r\n') },
			{ leadingDocuments: '', lockfile: projects },
		]);
	});
});
