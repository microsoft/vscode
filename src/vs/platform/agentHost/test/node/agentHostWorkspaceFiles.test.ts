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
		const names = result.map(uri => uri.path).sort();

		assert.ok(names.some(p => p.endsWith('/a.txt')), `expected a.txt in ${names.join(',')}`);
		assert.ok(names.some(p => p.endsWith('/sub/b.txt')), `expected sub/b.txt in ${names.join(',')}`);
	});

	test('respects .gitignore', async () => {
		const dir = createTempDir();
		writeFileSync(join(dir, '.gitignore'), 'ignored.txt\n');
		writeFileSync(join(dir, 'kept.txt'), 'k');
		writeFileSync(join(dir, 'ignored.txt'), 'i');

		const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
		const result = await files.getFiles(URI.file(dir), CancellationToken.None);
		const names = result.map(uri => uri.path);

		assert.ok(names.some(p => p.endsWith('/kept.txt')));
		assert.ok(!names.some(p => p.endsWith('/ignored.txt')), `ignored.txt should not be listed: ${names.join(',')}`);
	});

	test('excludes the .git directory', async () => {
		const dir = createTempDir();
		writeFileSync(join(dir, 'a.txt'), 'a');
		mkdirSync(join(dir, '.git'));
		writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/main');

		const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
		const result = await files.getFiles(URI.file(dir), CancellationToken.None);
		const names = result.map(uri => uri.path);

		assert.ok(names.some(p => p.endsWith('/a.txt')));
		assert.ok(!names.some(p => p.includes('/.git/')), `.git contents should be excluded: ${names.join(',')}`);
	});

	test('returns [] for non-file URIs', async () => {
		const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
		const result = await files.getFiles(URI.parse('vscode-vfs://github/foo/bar'), CancellationToken.None);
		assert.deepStrictEqual(result, []);
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
		assert.ok(result.some(uri => uri.path.endsWith('/a.txt')), `survivor should resolve with files even when first caller cancelled: ${result.map(u => u.path).join(',')}`);
	});
});
