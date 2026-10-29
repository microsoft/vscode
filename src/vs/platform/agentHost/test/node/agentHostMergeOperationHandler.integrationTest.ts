/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration tests for {@link AgentHostMergeOperationHandler} that run real
 * `git` against a temporary repository with a worktree. Run via
 * `scripts/test-integration.sh`.
 */

import assert from 'assert';
import * as cp from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'fs';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Schemas } from '../../../../base/common/network.js';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { FileService } from '../../../files/common/fileService.js';
import { DiskFileSystemProvider } from '../../../files/node/diskFileSystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { getWorkingDirectoryScopeId } from '../../common/agentHostWorkingDirectories.js';
import { buildBranchChangesetUri, buildFolderChangesetOwnerUri } from '../../common/changesetUri.js';
import { mergeOperationStashTargetChangesMeta, readMergeOperationDirtyTargetErrorData } from '../../common/meta/agentMergeOperationMeta.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ProtocolError } from '../../common/state/sessionProtocol.js';
import { buildDefaultChatUri, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostGitService } from '../../node/agentHostGitService.js';
import { AgentHostMergeOperationHandler } from '../../node/agentHostMergeOperationHandler.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { createTestGitHubService } from './testGitHubService.js';

suite('AgentHostMergeOperationHandler (real git)', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const hasGit = (() => {
		try {
			cp.execFileSync('git', ['--version'], { stdio: 'pipe' });
			return true;
		} catch {
			return false;
		}
	})();

	let tmpRoot: string | undefined;

	teardown(async () => {
		if (tmpRoot) {
			await rm(tmpRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
			tmpRoot = undefined;
		}
	});

	function git(cwd: string, ...args: string[]): string {
		return cp.execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trimEnd();
	}

	/** The scenario from the bug report: a dirty `main` and a worktree session with uncommitted edits. */
	function setupRepositories(worktreeEdit: 'newFile' | 'sameFile'): { readonly repository: string; readonly worktree: string } {
		tmpRoot = realpathSync(mkdtempSync(join(tmpdir(), 'agent-host-merge-')));
		const repository = join(tmpRoot, 'demo');
		const worktree = join(tmpRoot, 'demo.worktrees', 'add-multiply-function');
		mkdirSync(join(repository, 'src'), { recursive: true });
		git(repository, 'init', '-q', '-b', 'main');
		git(repository, 'config', 'user.name', 'Test');
		git(repository, 'config', 'user.email', 'test@example.com');
		git(repository, 'config', 'commit.gpgsign', 'false');
		writeFileSync(join(repository, 'src', 'index.js'), 'export function add(a, b) {\n\treturn a + b;\n}\n');
		git(repository, 'add', '-A');
		git(repository, 'commit', '-q', '-m', 'init');
		git(repository, 'worktree', 'add', '-q', '-b', 'agents/add-multiply-function', worktree);

		if (worktreeEdit === 'newFile') {
			writeFileSync(join(worktree, 'src', 'multiply.js'), 'export function multiply(a, b) {\n\treturn a * b;\n}\n');
		} else {
			writeFileSync(join(worktree, 'src', 'index.js'), 'export function add(a, b) {\n\treturn a + b;\n}\n\nexport function multiply(a, b) {\n\treturn a * b;\n}\n');
		}
		writeFileSync(join(repository, 'src', 'index.js'), 'export function add(a, b) {\n\treturn a + b;\n}\n\nexport function sub(a, b) {\n\treturn a - b;\n}\n');
		writeFileSync(join(repository, 'scratch.txt'), 'notes\n');
		return { repository, worktree };
	}

	function createHandler(repository: string, worktree: string) {
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(logService))));
		const environment: Partial<INativeEnvironmentService> = { tmpDir: URI.file(tmpdir()) };
		const gitService = new AgentHostGitService(fileService, environment as INativeEnvironmentService, logService);

		const session = URI.parse('agent:/session');
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		stateManager.createSession({
			resource: session.toString(),
			provider: 'copilot',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date(1).toISOString(),
			modifiedAt: new Date(1).toISOString(),
			workingDirectories: [URI.file(worktree).toString()],
			project: { uri: URI.file(repository).toString(), displayName: 'demo' },
			defaultChat: buildDefaultChatUri(session.toString()),
		});
		stateManager.setSessionConfig(session.toString(), { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: 'worktree' } });

		const handler = new AgentHostMergeOperationHandler(
			sessionKey => stateManager.getSessionState(sessionKey),
			async () => 'main',
			async () => { },
			async () => { },
			gitService,
			logService,
			stateManager,
			createTestGitHubService(),
		);
		const owner = buildFolderChangesetOwnerUri(session.toString(), getWorkingDirectoryScopeId([URI.file(worktree).toString()]));
		const invoke = async (_meta?: Record<string, unknown>) => {
			try {
				const result = await handler.invoke({ channel: buildBranchChangesetUri(owner), operationId: AgentHostMergeOperationHandler.OPERATION_MERGE, _meta }, CancellationToken.None);
				return { message: typeof result.message === 'string' ? result.message : result.message?.markdown };
			} catch (error) {
				return error instanceof ProtocolError && readMergeOperationDirtyTargetErrorData(error.data)
					? { dirtyTarget: readMergeOperationDirtyTargetErrorData(error.data) }
					: { errorMessage: (error instanceof Error ? error.message : String(error)).replace(/ \([0-9a-f]{8}\)/, ' (<id>)') };
			}
		};
		return { invoke };
	}

	function snapshot(repository: string, worktree: string) {
		return {
			mainLog: git(repository, 'log', '--format=%s', 'main').split('\n'),
			parentStatus: git(repository, 'status', '--porcelain').split('\n'),
			parentIndex: readFileSync(join(repository, 'src', 'index.js'), 'utf8').includes('function sub'),
			stashes: git(repository, 'stash', 'list'),
			worktreeStatus: git(worktree, 'status', '--porcelain'),
		};
	}

	(hasGit ? test : test.skip)('leaves both repositories untouched for a dirty parent, then Stash and Merge merges and restores the parent changes', async () => {
		const { repository, worktree } = setupRepositories('newFile');
		const { invoke } = createHandler(repository, worktree);

		const rejected = await invoke();
		const afterRejected = snapshot(repository, worktree);
		const merged = await invoke(mergeOperationStashTargetChangesMeta());
		const afterMerged = { ...snapshot(repository, worktree), mergedFile: readFileSync(join(repository, 'src', 'multiply.js'), 'utf8').includes('function multiply') };

		assert.deepStrictEqual({ rejected, afterRejected, merged, afterMerged }, {
			rejected: { dirtyTarget: { targetBranch: 'main', overlappingPaths: [] } },
			afterRejected: {
				mainLog: ['init'],
				parentStatus: [' M src/index.js', '?? scratch.txt'],
				parentIndex: true,
				stashes: '',
				worktreeStatus: '?? src/multiply.js',
			},
			merged: { message: 'Merged into \'main\' and restored your uncommitted changes.' },
			afterMerged: {
				mainLog: ['Agent Host changes for agents/add-multiply-function', 'init'],
				parentStatus: [' M src/index.js', '?? scratch.txt'],
				parentIndex: true,
				stashes: '',
				worktreeStatus: '',
				mergedFile: true,
			},
		});
	});

	(hasGit ? test : test.skip)('keeps the stash and leaves the conflict to resolve when the merge changes a file the parent has edited', async () => {
		const { repository, worktree } = setupRepositories('sameFile');
		const { invoke } = createHandler(repository, worktree);

		const rejected = await invoke();
		const merged = await invoke(mergeOperationStashTargetChangesMeta());
		const after = snapshot(repository, worktree);
		const index = readFileSync(join(repository, 'src', 'index.js'), 'utf8');

		assert.deepStrictEqual({
			rejected,
			merged,
			mainLog: after.mainLog,
			parentStatus: after.parentStatus,
			keptStashes: after.stashes.split('\n').length,
			bothVersionsInConflict: index.includes('function multiply') && index.includes('function sub') && index.includes('<<<<<<<'),
		}, {
			rejected: { dirtyTarget: { targetBranch: 'main', overlappingPaths: ['src/index.js'] } },
			merged: { errorMessage: 'Merged into \'main\'. Your uncommitted changes conflict with the merged changes in src/index.js. Resolve the conflicts in the parent repository. A copy of your changes is in the stash as "Changes in main before merging agents/add-multiply-function (<id>)".' },
			mainLog: ['Agent Host changes for agents/add-multiply-function', 'init'],
			parentStatus: ['UU src/index.js', '?? scratch.txt'],
			keptStashes: 1,
			bothVersionsInConflict: true,
		});
	});
});
