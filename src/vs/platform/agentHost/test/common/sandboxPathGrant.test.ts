/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readToolCallMeta, toToolCallMeta } from '../../common/meta/agentToolCallMeta.js';
import { applySandboxPathGrant } from '../../common/sandboxPathGrant.js';

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
});
