/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { realpath } from 'fs/promises';
import { tmpdir } from 'os';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { basename, dirname, join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createTestDirectory } from './e2e/harness/testDirectories.js';
import { disableTestGitMaintenance, initTestGitRepo } from './e2e/harness/agentHostE2ETestHarness.js';

suite('Agent Host E2E test directories', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('canonicalizes aliased parents before exposing a unique workspace', async () => {
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
			parent: await realpath(target),
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

	test('removes an allocated directory when canonicalization fails and preserves the original error', () => {
		const root = createTestDirectory(join(tmpdir(), 'agent-host-directory-test-'));
		store.add(toDisposable(() => rmSync(root, { recursive: true, force: true })));
		const error = new Error('canonicalization failed');

		assert.throws(() => createTestDirectory(join(root, 'workspace-'), () => {
			throw error;
		}), actual => actual === error);
		assert.deepStrictEqual(readdirSync(root), []);
	});

	test('reports both canonicalization and cleanup failures without deleting unexpected content', () => {
		const root = createTestDirectory(join(tmpdir(), 'agent-host-directory-test-'));
		store.add(toDisposable(() => rmSync(root, { recursive: true, force: true })));
		const error = new Error('canonicalization failed');

		assert.throws(() => createTestDirectory(join(root, 'workspace-'), directory => {
			writeFileSync(join(directory, 'unexpected.txt'), 'content');
			throw error;
		}), actual => actual instanceof AggregateError && actual.errors[0] === error
			&& actual.errors.length === 2 && actual.errors[1] instanceof Error);
		assert.strictEqual(readdirSync(root).length, 1);
	});

	(process.platform === 'win32' ? test : test.skip)('expands Windows short-path parents to their long filesystem identity', function () {
		const root = createTestDirectory(join(tmpdir(), 'agent-host-directory-test-'));
		store.add(toDisposable(() => rmSync(root, { recursive: true, force: true })));
		const target = join(root, 'canonical directory target');
		mkdirSync(target);
		const shortPath = execFileSync('powershell.exe', [
			'-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
			'(New-Object -ComObject Scripting.FileSystemObject).GetFolder($env:AGENT_HOST_TEST_DIRECTORY).ShortPath',
		], { encoding: 'utf8', env: { ...process.env, AGENT_HOST_TEST_DIRECTORY: target } }).trim();
		if (shortPath === target) {
			// Some Windows volumes do not generate 8.3 aliases.
			this.skip();
		}
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

	test('bare remotes and cloned repositories retain local maintenance isolation', () => {
		const root = createTestDirectory(join(tmpdir(), 'agent-host-repository-test-'));
		store.add(toDisposable(() => rmSync(root, { recursive: true, force: true })));
		const remote = join(root, 'remote');
		const clone = join(root, 'clone');
		mkdirSync(remote);
		initTestGitRepo(remote, { bare: true });
		execFileSync('git', ['-c', 'gc.auto=0', '-c', 'maintenance.auto=false', 'clone', '-q', remote, clone]);
		disableTestGitMaintenance(clone);

		assert.deepStrictEqual([{ directory: remote, bare: true }, { directory: clone, bare: false }].map(({ directory, bare }) => Object.fromEntries(
			['gc.auto', 'maintenance.auto'].map(setting => [
				setting,
				execFileSync('git', [...(bare ? ['--git-dir=.'] : []), 'config', '--local', '--get', setting], { cwd: directory, encoding: 'utf8' }).trim(),
			]))), [
			{ 'gc.auto': '0', 'maintenance.auto': 'false' },
			{ 'gc.auto': '0', 'maintenance.auto': 'false' },
		]);
	});
});
