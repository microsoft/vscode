/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { basename, dirname, join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createTestDirectory } from './e2e/harness/testDirectories.js';
import { initTestGitRepo } from './e2e/harness/agentHostE2ETestHarness.js';

suite('Agent Host E2E test directories', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('canonicalizes aliased parents before exposing a unique workspace', () => {
		const root = mkdtempSync(join(tmpdir(), 'agent-host-directory-test-'));
		store.add(toDisposable(() => rmSync(root, { recursive: true, force: true })));
		const target = join(root, 'target');
		mkdirSync(target);
		const alias = join(root, 'alias');
		symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
		const first = createTestDirectory(join(alias, 'workspace-'));
		const second = createTestDirectory(join(alias, 'workspace-'));

		assert.deepStrictEqual({
			parent: dirname(first),
			canonical: first === realpathSync(first),
			distinct: first !== second,
			prefixPreserved: basename(first).startsWith('workspace-'),
		}, {
			parent: realpathSync(target),
			canonical: true,
			distinct: true,
			prefixPreserved: true,
		});
	});

	test('reports allocation failures rather than returning an uncanonicalized path', () => {
		const root = mkdtempSync(join(tmpdir(), 'agent-host-directory-test-'));
		store.add(toDisposable(() => rmSync(root, { recursive: true, force: true })));
		assert.throws(() => createTestDirectory(join(root, 'missing', 'workspace-')), { code: 'ENOENT' });
	});

	(process.platform === 'win32' ? test : test.skip)('expands Windows short-path parents to their long filesystem identity', () => {
		const root = createTestDirectory(join(tmpdir(), 'agent-host-directory-test-'));
		store.add(toDisposable(() => rmSync(root, { recursive: true, force: true })));
		const target = join(root, 'canonical directory target');
		mkdirSync(target);
		const shortPath = execFileSync('cmd.exe', ['/d', '/c', `for %I in ("${target}") do @echo %~sI`], { encoding: 'utf8' }).trim();
		const directory = createTestDirectory(join(shortPath, 'workspace-'));

		assert.strictEqual(dirname(directory), target);
	});

	test('test repositories prevent both automatic garbage collection and maintenance', () => {
		const directory = createTestDirectory(join(tmpdir(), 'agent-host-repository-test-'));
		store.add(toDisposable(() => rmSync(directory, { recursive: true, force: true })));
		initTestGitRepo(directory);
		const settings = ['user.name', 'user.email', 'gc.auto', 'maintenance.auto'];

		assert.deepStrictEqual(Object.fromEntries(settings.map(setting => [
			setting,
			execFileSync('git', ['config', '--local', '--get', setting], { cwd: directory, encoding: 'utf8' }).trim(),
		])), {
			'user.name': 'Agent Host Test',
			'user.email': 'agent-host-test@example.com',
			'gc.auto': '0',
			'maintenance.auto': 'false',
		});
	});
});
