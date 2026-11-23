/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { OperatingSystem } from '../../../../base/common/platform.js';
import { readToolCallMeta, toToolCallMeta } from '../../common/meta/agentToolCallMeta.js';
import { applySandboxPathGrant, applySessionSandboxPathGrant, parseSessionSandboxPaths, resolveSessionSandboxPaths } from '../../common/sandboxPathGrant.js';

suite('Sandbox path grants', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('adds only offered access and preserves unrelated lists', () => {
		const paths = { readonlyPaths: ['/read'], readwritePaths: ['/write'], deniedPaths: ['/secret'] };
		assert.deepStrictEqual({
			read: applySandboxPathGrant(paths, { path: '/new', access: 'read' }),
			write: applySandboxPathGrant(paths, { path: '/new', access: 'readWrite' }),
			original: paths,
		}, {
			read: { readonlyPaths: ['/read', '/new'], readwritePaths: ['/write'], deniedPaths: ['/secret'] },
			write: { readonlyPaths: ['/read'], readwritePaths: ['/write', '/new'], deniedPaths: ['/secret'] },
			original: { readonlyPaths: ['/read'], readwritePaths: ['/write'], deniedPaths: ['/secret'] },
		});
	});

	test('upgrades the offered folder, removes exact read-only entries and deduplicates', () => {
		const grant = { path: '/folder', deniedPath: '/folder/new/file', access: 'readWrite', removedReadonlyPaths: ['/folder', '~/alias'] } as const;
		const paths = { readonlyPaths: ['/folder', '~/alias', '/unrelated'], readwritePaths: ['/folder'], deniedPaths: ['/secret'] };
		const applied = applySandboxPathGrant(paths, grant);
		assert.deepStrictEqual([applied, applySandboxPathGrant(applied, grant)], [
			{ readonlyPaths: ['/unrelated'], readwritePaths: ['/folder'], deniedPaths: ['/secret'] },
			{ readonlyPaths: ['/unrelated'], readwritePaths: ['/folder'], deniedPaths: ['/secret'] },
		]);
	});

	test('validates optional wire metadata without requiring it from other hosts', () => {
		const grant = { path: '/folder', access: 'readWrite', deniedPath: '/folder/file', removedReadonlyPaths: ['/folder'] } as const;
		assert.deepStrictEqual([
			readToolCallMeta({ _meta: toToolCallMeta({ 'vscode.sandboxPathGrant': grant }) })['vscode.sandboxPathGrant'],
			...[undefined, null, {}, { path: '/folder', access: 'write' }, { ...grant, removedReadonlyPaths: [1] }, { ...grant, deniedPath: 5 }]
				.map(value => readToolCallMeta({ _meta: { 'vscode.sandboxPathGrant': value } })['vscode.sandboxPathGrant']),
		], [grant, undefined, undefined, undefined, undefined, undefined, undefined]);
	});

	test('persists policy spellings and escapes literal dollars in concrete paths', () => {
		assert.deepStrictEqual([
			applySandboxPathGrant(undefined, { path: '/outside/$HOME', access: 'read' }),
			applySandboxPathGrant(undefined, { path: '/home/user/data', persistedPath: '${HOME}/data', access: 'read' }),
			readToolCallMeta({ _meta: { 'vscode.sandboxPathGrant': { path: '/folder', access: 'read', persistedPath: 1 } } })['vscode.sandboxPathGrant'],
		], [
			{ readonlyPaths: ['/outside/$$HOME'] },
			{ readonlyPaths: ['${HOME}/data'] },
			undefined,
		]);
	});

	test('session upgrades compose without changing inherited paths or denials', () => {
		const base = { readonlyPaths: ['C:/folder', 'C:/unrelated'], readwritePaths: ['C:/existing'], deniedPaths: ['C:/secret'] };
		let session = parseSessionSandboxPaths(undefined);
		session = applySessionSandboxPathGrant(session, { path: 'C:\\read', access: 'read' });
		session = applySessionSandboxPathGrant(session, { path: 'C:\\folder', access: 'readWrite', removedReadonlyPaths: ['C:\\folder'] });
		assert.deepStrictEqual({
			resolved: resolveSessionSandboxPaths(base, parseSessionSandboxPaths(JSON.stringify(session)), OperatingSystem.Windows),
			base,
		}, {
			resolved: { readonlyPaths: ['C:/unrelated', 'C:\\read'], readwritePaths: ['C:/existing', 'C:\\folder'], deniedPaths: ['C:/secret'] },
			base: { readonlyPaths: ['C:/folder', 'C:/unrelated'], readwritePaths: ['C:/existing'], deniedPaths: ['C:/secret'] },
		});
	});

	test('invalid stored session paths fail explicitly', () => {
		for (const raw of ['null', '{}', '{"readonlyPaths":[1],"readwritePaths":[],"removedReadonlyPaths":[]}']) {
			assert.throws(() => parseSessionSandboxPaths(raw), /Invalid persisted session sandbox paths/);
		}
	});
});
