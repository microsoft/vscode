/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { resolveAgentHostFileCompletionRoots } from '../../node/agentHostFileCompletionUtils.js';
import { AgentHostWorkspaceFiles } from '../../node/agentHostWorkspaceFiles.js';

suite('AgentHostWorkspaceFiles', () => {

	const disposables = new DisposableStore();
	const tempDirs: string[] = [];

	function createTempDir(): string {
		const dir = mkdtempSync(`${tmpdir()}/ahp-files-`);
		tempDirs.push(dir);
		return dir;
	}

	teardown(async () => {
		disposables.clear();
		// On Windows, ripgrep handles may take a tick to release after
		// dispose() kills the child process. Retry rmSync rather than
		// failing on transient EBUSY.
		for (const dir of tempDirs) {
			let lastErr: unknown;
			for (let i = 0; i < 10; i++) {
				try {
					rmSync(dir, { recursive: true, force: true });
					lastErr = undefined;
					break;
				} catch (err) {
					lastErr = err;
					await new Promise(r => setTimeout(r, 50));
				}
			}
			if (lastErr) {
				throw lastErr;
			}
		}
		tempDirs.length = 0;
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('enumerates files in the working directory', async () => {
		const dir = createTempDir();
		writeFileSync(join(dir, 'a.txt'), 'a');
		mkdirSync(join(dir, 'sub'));
		writeFileSync(join(dir, 'sub', 'b.txt'), 'b');

		const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
		const result = await files.getFiles(URI.file(dir), CancellationToken.None);
		const names = result.files.map(uri => uri.path).sort();

		assert.ok(names.some(p => p.endsWith('/a.txt')), `expected a.txt in ${names.join(',')}`);
		assert.ok(names.some(p => p.endsWith('/sub/b.txt')), `expected sub/b.txt in ${names.join(',')}`);
	});

	test('caches an empty directory as a successful result', async () => {
		const dir = createTempDir();
		const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
		const workingDirectory = URI.file(dir);

		const first = await files.getFiles(workingDirectory, CancellationToken.None);
		const second = await files.getFiles(workingDirectory, CancellationToken.None);

		assert.deepStrictEqual({ first, cacheHit: first === second }, { first: { files: [], isTruncated: false }, cacheHit: true });
	});

	test('respects .gitignore', async () => {
		const dir = createTempDir();
		writeFileSync(join(dir, '.gitignore'), 'ignored.txt\n');
		writeFileSync(join(dir, 'kept.txt'), 'k');
		writeFileSync(join(dir, 'ignored.txt'), 'i');

		const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
		const result = await files.getFiles(URI.file(dir), CancellationToken.None);
		const names = result.files.map(uri => uri.path);

		assert.ok(names.some(p => p.endsWith('/kept.txt')));
		assert.ok(!names.some(p => p.endsWith('/ignored.txt')), `ignored.txt should not be listed: ${names.join(',')}`);
	});

	test('uses outer-root ignore semantics when a declared nested root is covered', async () => {
		const dir = createTempDir();
		const nestedDir = join(dir, 'sub');
		mkdirSync(nestedDir);
		writeFileSync(join(dir, '.gitignore'), 'sub/parent-ignored.txt\n');
		writeFileSync(join(nestedDir, '.gitignore'), 'nested-ignored.txt\n');
		writeFileSync(join(nestedDir, 'kept.txt'), 'kept');
		writeFileSync(join(nestedDir, 'parent-ignored.txt'), 'ignored by parent');
		writeFileSync(join(nestedDir, 'nested-ignored.txt'), 'ignored by nested');

		const roots = resolveAgentHostFileCompletionRoots([URI.file(dir), URI.file(nestedDir)]);
		const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
		const results = await Promise.all(roots.enumerationRoots.map(root => files.getFiles(root, CancellationToken.None)));

		assert.deepStrictEqual({
			enumeratedRoots: roots.enumerationRoots.map(root => root.path),
			files: results.flatMap(result => result.files).map(uri => uri.path.slice(URI.file(dir).path.length + 1)).sort(),
		}, {
			enumeratedRoots: [URI.file(dir).path],
			files: ['.gitignore', 'sub/.gitignore', 'sub/kept.txt'],
		});
	});

	test('excludes the .git directory', async () => {
		const dir = createTempDir();
		writeFileSync(join(dir, 'a.txt'), 'a');
		mkdirSync(join(dir, '.git'));
		writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/main');

		const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
		const result = await files.getFiles(URI.file(dir), CancellationToken.None);
		const names = result.files.map(uri => uri.path);

		assert.ok(names.some(p => p.endsWith('/a.txt')));
		assert.ok(!names.some(p => p.includes('/.git/')), `.git contents should be excluded: ${names.join(',')}`);
	});

	test('returns [] for non-file URIs', async () => {
		const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
		const result = await files.getFiles(URI.parse('vscode-vfs://github/foo/bar'), CancellationToken.None);
		assert.deepStrictEqual(result, { files: [], isTruncated: false });
	});

	test('caches concurrent calls for the same working directory', async () => {
		const dir = createTempDir();
		writeFileSync(join(dir, 'a.txt'), 'a');

		const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
		const wd = URI.file(dir);
		const [r1, r2] = await Promise.all([
			files.getFiles(wd, CancellationToken.None),
			files.getFiles(wd, CancellationToken.None),
		]);
		assert.strictEqual(r1, r2, 'concurrent calls should share the same promise / result array');
	});

	test('rejects with CancellationError on cancellation', async () => {
		const dir = createTempDir();
		writeFileSync(join(dir, 'a.txt'), 'a');

		const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
		const cts = new CancellationTokenSource();
		const promise = files.getFiles(URI.file(dir), cts.token);
		cts.cancel();
		await assert.rejects(promise, (err: unknown) => err instanceof CancellationError);
		cts.dispose();
	});

	test('cancelling one caller does not poison concurrent callers sharing the cache', async () => {
		const dir = createTempDir();
		writeFileSync(join(dir, 'a.txt'), 'a');

		const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
		const wd = URI.file(dir);

		const cts = new CancellationTokenSource();
		const cancelled = files.getFiles(wd, cts.token);
		const survivor = files.getFiles(wd, CancellationToken.None);
		cts.cancel();
		cts.dispose();

		await assert.rejects(cancelled, (err: unknown) => err instanceof CancellationError);
		const result = await survivor;
		assert.ok(result.files.some(uri => uri.path.endsWith('/a.txt')), `survivor should resolve with files even when first caller cancelled: ${result.files.map(u => u.path).join(',')}`);
	});
	test('enumerate lists files for its caller without sharing a cached result', async () => {
		const dir = createTempDir();
		writeFileSync(join(dir, 'a.txt'), 'a');

		const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
		const wd = URI.file(dir);
		const [first, second] = await Promise.all([
			files.enumerate(wd, CancellationToken.None),
			files.enumerate(wd, CancellationToken.None),
		]);
		assert.deepStrictEqual({
			separate: first !== second,
			files: first.files.map(uri => uri.path.slice(uri.path.lastIndexOf('/') + 1)),
		}, { separate: true, files: ['a.txt'] });
	});

	test('enumerate rejects when cancelled and never starts once already cancelled', async () => {
		const dir = createTempDir();
		writeFileSync(join(dir, 'a.txt'), 'a');

		const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
		const running = new CancellationTokenSource();
		const inFlight = files.enumerate(URI.file(dir), running.token);
		running.cancel();
		running.dispose();
		const cancelled = new CancellationTokenSource();
		cancelled.cancel();
		const neverStarted = files.enumerate(URI.file(dir), cancelled.token);
		cancelled.dispose();

		await assert.rejects(inFlight, (err: unknown) => err instanceof CancellationError);
		await assert.rejects(neverStarted, (err: unknown) => err instanceof CancellationError);
	});
	test('enumerate does not list Git administrative directories as source trees', async () => {
		const dir = createTempDir();
		const bare = join(dir, 'bare.git');
		mkdirSync(join(bare, 'objects'), { recursive: true });
		mkdirSync(join(bare, 'refs'));
		writeFileSync(join(bare, 'HEAD'), 'ref: refs/heads/main\n');
		writeFileSync(join(bare, 'config'), '[core]\n\tbare = true\n');
		const commonDirectory = join(dir, 'repo', '.git');
		mkdirSync(commonDirectory, { recursive: true });
		writeFileSync(join(commonDirectory, 'HEAD'), 'ref: refs/heads/main\n');
		const workTree = join(dir, 'repo');
		writeFileSync(join(workTree, 'HEAD'), 'not git metadata');

		const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
		const listed = async (path: string) => (await files.enumerate(URI.file(path), CancellationToken.None)).files.map(uri => uri.path.slice(uri.path.lastIndexOf('/') + 1));
		assert.deepStrictEqual({
			bare: await listed(bare),
			commonDirectory: await listed(commonDirectory),
			workTree: await listed(workTree),
		}, { bare: [], commonDirectory: [], workTree: ['HEAD'] });
	});
});
