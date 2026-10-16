/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration tests for {@link readSemanticDiffContent} that spawn real `git`
 * against temporary on-disk repositories. Run via `scripts/test-integration.sh`.
 */

import assert from 'assert';
import * as cp from 'child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'fs';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { join } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { FileService } from '../../../files/common/fileService.js';
import { DiskFileSystemProvider } from '../../../files/node/diskFileSystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { SemanticDiffComparison } from '../../common/semanticDiff.js';
import { ISemanticDiffContentRequest, ISemanticDiffHunkRange } from '../../common/semanticDiffContent.js';
import { AgentHostGitService } from '../../node/agentHostGitService.js';
import { readSemanticDiffContent, readSemanticDiffWorkingTreeFile } from '../../node/semanticDiffContent.js';

const BASE_TEXT = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', ''].join('\n');

suite('readSemanticDiffContent (real git)', function () {
	// Each test runs several git processes, which can be slow on a cold cache.
	this.timeout(30_000);
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const hasGit = (() => {
		try { cp.execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
	})();

	let repository: string | undefined;
	let externalDirectory: string | undefined;
	let gitService: AgentHostGitService;
	let fileService: FileService;

	setup(() => {
		repository = undefined;
		externalDirectory = undefined;
		const store = disposables.add(new DisposableStore());
		const logService = new NullLogService();
		fileService = store.add(new FileService(logService));
		store.add(fileService.registerProvider(Schemas.file, store.add(new DiskFileSystemProvider(logService))));
		const env: Partial<INativeEnvironmentService> = { tmpDir: URI.file(tmpdir()) };
		gitService = new AgentHostGitService(fileService, env as INativeEnvironmentService, logService);
	});

	teardown(async () => {
		if (repository) {
			await rm(repository, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
		}
		if (externalDirectory) {
			await rm(externalDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
		}
	});

	function git(...args: string[]): string {
		return cp.execFileSync('git', args, { cwd: repository!, stdio: 'pipe', encoding: 'utf8' });
	}

	function write(text: string, file = 'file.txt'): void {
		writeFileSync(join(repository!, file), text);
	}

	function replace(text: string, replacements: Record<string, string>): string {
		return text.split('\n').map(line => replacements[line] ?? line).join('\n');
	}

	function initRepository(): string {
		repository = mkdtempSync(join(tmpdir(), 'semantic-diff-content-'));
		git('init', '-q', '-b', 'main');
		git('config', 'user.name', 'Test');
		git('config', 'user.email', 'test@example.com');
		write(BASE_TEXT);
		write('other\n', 'other.txt');
		git('add', '.');
		git('commit', '-q', '-m', 'base');
		return git('rev-parse', 'HEAD').trim();
	}

	/** The hunk ranges a classifier reports, read from the zero-context diff it inspects. */
	function hunksOf(...diffArgs: string[]): ISemanticDiffHunkRange[] {
		const patch = git('diff', '--no-color', '--unified=0', '--inter-hunk-context=0', ...diffArgs, '--', 'file.txt');
		return [...patch.matchAll(/^@@ -(?<oldStart>\d+)(?:,(?<oldCount>\d+))? \+(?<newStart>\d+)(?:,(?<newCount>\d+))? @@/gm)].map(({ groups }) => ({
			oldStart: Number(groups!.oldStart), oldCount: Number(groups!.oldCount ?? 1),
			newStart: Number(groups!.newStart), newCount: Number(groups!.newCount ?? 1),
		}));
	}

	function read(comparison: SemanticDiffComparison, baseRevision: string, targetRevision: string | null, side: ISemanticDiffContentRequest['side'], hunks: readonly ISemanticDiffHunkRange[], path = 'file.txt'): Promise<string> {
		const request: ISemanticDiffContentRequest = { sessionUri: 'copilot:/session', comparison, baseRevision, targetRevision, side, path, oldPath: null, status: 'modified', hunks };
		return readSemanticDiffContent(request, [URI.file(repository!)], gitService, (repository, resource) => readSemanticDiffWorkingTreeFile(repository, resource, fileService));
	}

	async function error(promise: Promise<string>): Promise<string | undefined> {
		try {
			await promise;
			return undefined;
		} catch (e) {
			return e instanceof Error ? e.message : String(e);
		}
	}

	(hasGit ? test : test.skip)('serves the working tree with only the group hunks', async () => {
		const base = initRepository();
		write(replace(BASE_TEXT, { two: 'TWO!', nine: 'NINE!' }));
		const [first, second] = hunksOf('HEAD');
		assert.deepStrictEqual({
			original: await read('workingTree', base, null, 'original', [first]),
			first: await read('workingTree', base, null, 'modified', [first]),
			second: await read('workingTree', base, null, 'modified', [second]),
			outOfRange: await error(read('workingTree', base, null, 'modified', [{ oldStart: 20, oldCount: 1, newStart: 20, newCount: 1 }])),
		}, {
			original: BASE_TEXT,
			first: replace(BASE_TEXT, { two: 'TWO!' }),
			second: replace(BASE_TEXT, { nine: 'NINE!' }),
			outOfRange: 'The walkthrough\'s changes do not fit file.txt. The file may have changed after the walkthrough was created.',
		});
	});

	(hasGit ? test : test.skip)('serves staged changes without the unstaged ones', async () => {
		const base = initRepository();
		write(replace(BASE_TEXT, { three: 'THREE!' }));
		git('add', 'file.txt');
		write(replace(BASE_TEXT, { three: 'THREE!', eight: 'EIGHT!' }));
		const hunks = hunksOf('--cached', 'HEAD');
		assert.deepStrictEqual({
			hunks: hunks.length,
			modified: await read('staged', base, null, 'modified', hunks),
		}, { hunks: 1, modified: replace(BASE_TEXT, { three: 'THREE!' }) });
	});

	(hasGit ? test : test.skip)('serves a commit range regardless of the working tree, and rejects unknown revisions', async () => {
		const base = initRepository();
		write(replace(BASE_TEXT, { one: 'ONE!', ten: 'TEN!' }));
		git('commit', '-q', '-am', 'target');
		const target = git('rev-parse', 'HEAD').trim();
		const [, second] = hunksOf(base, target);
		write('unrelated working-tree edit\n');
		assert.deepStrictEqual({
			modified: await read('commitRange', base, target, 'modified', [second]),
			unknownBase: await error(read('commitRange', 'f'.repeat(40), target, 'original', [second])),
		}, {
			modified: replace(BASE_TEXT, { ten: 'TEN!' }),
			unknownBase: `No repository of this session contains revision ${'f'.repeat(40)}.`,
		});
	});

	(hasGit && !isWindows ? test : test.skip)('does not follow an intermediate working-tree symlink outside the repository', async () => {
		initRepository();
		mkdirSync(join(repository!, 'nested'));
		write(BASE_TEXT, 'nested/file.txt');
		git('add', '.');
		git('commit', '-q', '-m', 'nested base');
		const base = git('rev-parse', 'HEAD').trim();
		externalDirectory = mkdtempSync(join(tmpdir(), 'semantic-diff-external-'));
		writeFileSync(join(externalDirectory, 'file.txt'), replace(BASE_TEXT, { two: 'EXTERNAL' }));
		await rm(join(repository!, 'nested'), { recursive: true, force: true });
		symlinkSync(externalDirectory, join(repository!, 'nested'), 'dir');

		assert.strictEqual(
			await error(read('workingTree', base, null, 'modified', [{ oldStart: 2, oldCount: 1, newStart: 2, newCount: 1 }], 'nested/file.txt')),
			'nested/file.txt could not be read.',
		);
	});
});
