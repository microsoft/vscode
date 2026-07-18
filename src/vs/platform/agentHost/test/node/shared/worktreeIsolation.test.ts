/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { timeout } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { join } from '../../../../../base/common/path.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import { IAgentHostGitService } from '../../../common/agentHostGitService.js';
import { SessionConfigKey } from '../../../common/sessionConfigKeys.js';
import { AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_DONE_DB_KEY, MessageKind, ResponsePartKind, TurnState, type Turn } from '../../../common/state/sessionState.js';
import { AgentBranchNameGenerator, IAgentBranchNameGenerator } from '../../../node/shared/agentBranchNameGenerator.js';
import { ICopilotApiService } from '../../../node/shared/copilotApiService.js';
import { SessionWorkingDirectoryMissingError, WorktreeIsolation, getWorktreeName, getWorktreesRoot } from '../../../node/shared/worktreeIsolation.js';
import { TestSessionDatabase, createNoopGitService, createSessionDataService } from '../../common/sessionTestHelpers.js';

/**
 * Minimal {@link ICopilotApiService} stub for constructing {@link WorktreeIsolation}
 * in tests. Tests inject their own branch-name generator, so its methods are never called.
 */
function createNullCopilotApiService(): ICopilotApiService {
	return {
		_serviceBrand: undefined,
		messages: (..._args: unknown[]): never => { throw new Error('not implemented'); },
		countTokens: async () => { throw new Error('not implemented'); },
		models: async () => [],
		responses: async () => { throw new Error('not implemented'); },
		utilityChatCompletion: async () => { throw new Error('not implemented'); },
		resolveRestrictedTelemetryContext: async () => { throw new Error('not implemented'); },
		resolveApiEndpoint: async () => undefined,
	};
}

suite('WorktreeIsolation', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let repoRoot: URI;
	let worktreesRoot: URI;
	let db: TestSessionDatabase;
	let addWorktreeCalls: { worktree: URI; branchName: string; startPoint: string }[];
	let addExistingCalls: { worktree: URI; branchName: string }[];
	let removeCalls: URI[];
	let copyIncludeCalls: { repositoryRoot: URI; worktree: URI; globs: readonly string[] }[];
	let copyIncludeError: Error | undefined;
	let branchName: string;
	let hasUncommittedChanges: boolean;
	let branchExists: boolean;
	let headCommit: string | undefined;

	const sessionUri = URI.parse('agent-session://test/s1');
	const sessionId = 's1';

	function createGitService(): IAgentHostGitService {
		return {
			...createNoopGitService(),
			getRepositoryRoot: async () => repoRoot,
			revParse: async (_root, expr) => expr === 'HEAD' ? headCommit : undefined,
			getCurrentBranch: async () => 'feature',
			getDefaultBranch: async () => 'main',
			getBranches: async () => ['main', 'feature'],
			branchExists: async () => branchExists,
			hasUncommittedChanges: async () => hasUncommittedChanges,
			addWorktree: async (_root, worktree, branch, startPoint) => {
				addWorktreeCalls.push({ worktree, branchName: branch, startPoint });
				mkdirSync(worktree.fsPath, { recursive: true });
			},
			copyWorktreeIncludeFiles: async (repositoryRoot, worktree, globs) => {
				copyIncludeCalls.push({ repositoryRoot, worktree, globs: [...globs] });
				if (copyIncludeError) {
					throw copyIncludeError;
				}
			},
			addExistingWorktree: async (_root, worktree, branch) => {
				addExistingCalls.push({ worktree, branchName: branch });
				mkdirSync(worktree.fsPath, { recursive: true });
			},
			removeWorktree: async (_root, worktree) => {
				removeCalls.push(worktree);
				rmSync(worktree.fsPath, { recursive: true, force: true });
			},
		};
	}

	function createIsolation(disposableStore: Pick<DisposableStore, 'add'>, options?: { readonly branchNameGenerator?: IAgentBranchNameGenerator; readonly gitService?: IAgentHostGitService }): WorktreeIsolation {
		const branchNameGenerator = options?.branchNameGenerator ?? {
			generateBranchName: async () => branchName,
		};
		return disposableStore.add(new WorktreeIsolation(
			branchNameGenerator,
			options?.gitService ?? createGitService(),
			createNullCopilotApiService(),
			createSessionDataService(db),
			new NullLogService(),
		));
	}

	setup(() => {
		repoRoot = URI.file(mkdtempSync(join(tmpdir(), 'wt-iso-')));
		worktreesRoot = getWorktreesRoot(repoRoot);
		db = new TestSessionDatabase();
		addWorktreeCalls = [];
		addExistingCalls = [];
		removeCalls = [];
		copyIncludeCalls = [];
		copyIncludeError = undefined;
		branchName = 'agents/my-feature';
		hasUncommittedChanges = false;
		branchExists = true;
		headCommit = 'abc123';
	});

	teardown(() => {
		rmSync(repoRoot.fsPath, { recursive: true, force: true });
		rmSync(worktreesRoot.fsPath, { recursive: true, force: true });
	});

	test('getWorktreesRoot / getWorktreeName derive sibling paths and strip the agents/ prefix', () => {
		assert.deepStrictEqual({
			root: getWorktreesRoot(URI.file('/src/vscode')).fsPath,
			named: getWorktreeName('agents/add-config'),
			namedFlattened: getWorktreeName('agents/feature/sub-topic'),
			namedNoPrefix: getWorktreeName('plain-branch'),
			namedWithBranchPrefix: getWorktreeName('users/alice/agents/add-config', 'users/alice/'),
		}, {
			root: URI.file('/src/vscode.worktrees').fsPath,
			named: 'add-config',
			namedFlattened: 'feature-sub-topic',
			namedNoPrefix: 'plain-branch',
			namedWithBranchPrefix: 'add-config',
		});
	});

	test('resolveIsolationConfig advertises folder/worktree + branch based on git state', async () => {
		const isolation = createIsolation(disposables);

		const noRepo = await isolation.resolveIsolationConfig({ workingDirectory: undefined, config: undefined });
		const repoWorktree = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: undefined });
		const repoWorktreeSelected = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'feature' } });
		const repoFolder = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'folder' } });
		headCommit = undefined; // unborn HEAD (no commits)
		const noCommits = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: undefined });

		assert.deepStrictEqual({
			noRepo: { enum: noRepo.isolationProperty.protocol.enum, value: noRepo.isolationValue, branch: noRepo.branchProperty, prefix: noRepo.worktreeBranchPrefixProperty, includeFiles: noRepo.worktreeIncludeFilesProperty },
			repoWorktree: { enum: repoWorktree.isolationProperty.protocol.enum, value: repoWorktree.isolationValue, branchDefault: repoWorktree.branchDefault, branchReadOnly: repoWorktree.branchProperty?.protocol.readOnly, prefixReadOnly: repoWorktree.worktreeBranchPrefixProperty?.protocol.readOnly, includeFilesReadOnly: repoWorktree.worktreeIncludeFilesProperty?.protocol.readOnly },
			repoWorktreeSelected: { branchDefault: repoWorktreeSelected.branchDefault, branchValue: repoWorktreeSelected.branchValue, branchEnum: repoWorktreeSelected.branchProperty?.protocol.enum },
			repoFolder: { value: repoFolder.isolationValue, branchDefault: repoFolder.branchDefault, branchReadOnly: repoFolder.branchProperty?.protocol.readOnly, hasPrefix: !!repoFolder.worktreeBranchPrefixProperty, hasIncludeFiles: !!repoFolder.worktreeIncludeFilesProperty },
			noCommits: { enum: noCommits.isolationProperty.protocol.enum, value: noCommits.isolationValue, branch: noCommits.branchProperty, prefix: noCommits.worktreeBranchPrefixProperty, includeFiles: noCommits.worktreeIncludeFilesProperty },
		}, {
			noRepo: { enum: ['folder'], value: 'folder', branch: undefined, prefix: undefined, includeFiles: undefined },
			repoWorktree: { enum: ['folder', 'worktree'], value: 'worktree', branchDefault: 'main', branchReadOnly: false, prefixReadOnly: true, includeFilesReadOnly: true },
			repoWorktreeSelected: { branchDefault: 'main', branchValue: 'feature', branchEnum: ['main'] },
			repoFolder: { value: 'folder', branchDefault: 'feature', branchReadOnly: true, hasPrefix: true, hasIncludeFiles: true },
			noCommits: { enum: ['folder'], value: 'folder', branch: undefined, prefix: undefined, includeFiles: undefined },
		});
	});

	test('branchCompletions returns git branches, empty without a working directory', async () => {
		const isolation = createIsolation(disposables);
		assert.deepStrictEqual({
			withDir: await isolation.branchCompletions(repoRoot),
			noDir: await isolation.branchCompletions(undefined),
		}, {
			withDir: { items: [{ value: 'main', label: 'main' }, { value: 'feature', label: 'feature' }] },
			noDir: { items: [] },
		});
	});

	test('resolveWorkingDirectory creates a worktree, persists metadata, queues the announcement, and is idempotent', async () => {
		const isolation = createIsolation(disposables);
		const config = { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' };

		const first = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config, prompt: 'do a thing' });
		const meta = await isolation.readWorktreeMetadata(sessionUri);
		const announcement = isolation.takePendingAnnouncement(sessionId);
		const second = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config, prompt: 'do a thing' });

		const expectedWorktree = URI.joinPath(worktreesRoot, getWorktreeName(branchName));
		assert.deepStrictEqual({
			returnedWorktree: first!.toString(),
			addWorktreeCallCount: addWorktreeCalls.length,
			addWorktreeArgs: addWorktreeCalls.map(c => ({ worktree: c.worktree.toString(), branchName: c.branchName, startPoint: c.startPoint })),
			metaBranch: meta?.branchName,
			metaWorktree: meta?.worktreePath?.toString(),
			metaRepo: meta?.repositoryRoot?.toString(),
			announcementHasBranch: announcement?.includes(branchName) ?? false,
			secondTakeAnnouncement: isolation.takePendingAnnouncement(sessionId),
			idempotentReturn: second!.toString(),
			createdSessions: isolation.createdWorktreeSessionIds,
		}, {
			returnedWorktree: expectedWorktree.toString(),
			addWorktreeCallCount: 1,
			addWorktreeArgs: [{ worktree: expectedWorktree.toString(), branchName, startPoint: 'main' }],
			metaBranch: branchName,
			metaWorktree: expectedWorktree.toString(),
			metaRepo: repoRoot.toString(),
			announcementHasBranch: true,
			secondTakeAnnouncement: undefined,
			idempotentReturn: expectedWorktree.toString(),
			createdSessions: [sessionId],
		});
	});

	test('resolveWorkingDirectory avoids an existing worktree directory', async () => {
		const collisionSessionId = '12345678-aaaa-bbbb-cccc-123456789abc';
		const collisionSessionUri = URI.parse(`agent-session://test/${collisionSessionId}`);
		const existingWorktree = URI.joinPath(worktreesRoot, 'add-feature');
		mkdirSync(existingWorktree.fsPath, { recursive: true });
		branchExists = false;
		const isolation = createIsolation(disposables, {
			branchNameGenerator: new AgentBranchNameGenerator(createNullCopilotApiService(), new NullLogService()),
		});

		const resolved = await isolation.resolveWorkingDirectory({
			sessionUri: collisionSessionUri,
			sessionId: collisionSessionId,
			workingDirectory: repoRoot,
			config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' },
			prompt: 'Add feature',
		});

		assert.deepStrictEqual({
			branchName: addWorktreeCalls[0]?.branchName,
			worktree: resolved?.toString(),
		}, {
			branchName: 'agents/add-feature-12345678',
			worktree: URI.joinPath(worktreesRoot, 'add-feature-12345678').toString(),
		});
	});

	test('resolveWorkingDirectory treats a failed branch check as a collision', async () => {
		const collisionSessionId = '12345678-aaaa-bbbb-cccc-123456789abc';
		const collisionSessionUri = URI.parse(`agent-session://test/${collisionSessionId}`);
		const gitService = createGitService();
		let branchExistsCalls = 0;
		gitService.branchExists = async () => {
			if (branchExistsCalls++ === 0) {
				throw new Error('transient failure');
			}
			return false;
		};
		const isolation = createIsolation(disposables, {
			branchNameGenerator: new AgentBranchNameGenerator(createNullCopilotApiService(), new NullLogService()),
			gitService,
		});

		const resolved = await isolation.resolveWorkingDirectory({
			sessionUri: collisionSessionUri,
			sessionId: collisionSessionId,
			workingDirectory: repoRoot,
			config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' },
			prompt: 'Add feature',
		});

		assert.deepStrictEqual({
			branchExistsCalls,
			branchName: addWorktreeCalls[0]?.branchName,
			worktree: resolved?.toString(),
		}, {
			branchExistsCalls: 2,
			branchName: 'agents/add-feature-12345678',
			worktree: URI.joinPath(worktreesRoot, 'add-feature-12345678').toString(),
		});
	});

	test('resolveWorkingDirectory serializes concurrent creation in the same repository', async () => {
		const gitService = createGitService();
		const existingBranches = new Set<string>();
		let activeAddWorktrees = 0;
		let maxActiveAddWorktrees = 0;
		gitService.branchExists = async (_repositoryRoot, candidate) => existingBranches.has(candidate);
		gitService.addWorktree = async (_repositoryRoot, worktree, candidate, startPoint) => {
			activeAddWorktrees++;
			maxActiveAddWorktrees = Math.max(maxActiveAddWorktrees, activeAddWorktrees);
			await timeout(10);
			addWorktreeCalls.push({ worktree, branchName: candidate, startPoint });
			existingBranches.add(candidate);
			mkdirSync(worktree.fsPath, { recursive: true });
			activeAddWorktrees--;
		};
		const isolation = createIsolation(disposables, {
			branchNameGenerator: new AgentBranchNameGenerator(createNullCopilotApiService(), new NullLogService()),
			gitService,
		});
		const config = { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' };

		const worktrees = await Promise.all([
			isolation.resolveWorkingDirectory({ sessionUri: URI.parse('agent-session://test/12345678-aaaa-bbbb-cccc-123456789abc'), sessionId: '12345678-aaaa-bbbb-cccc-123456789abc', workingDirectory: repoRoot, config, prompt: 'Add feature' }),
			isolation.resolveWorkingDirectory({ sessionUri: URI.parse('agent-session://test/87654321-aaaa-bbbb-cccc-123456789abc'), sessionId: '87654321-aaaa-bbbb-cccc-123456789abc', workingDirectory: repoRoot, config, prompt: 'Add feature' }),
		]);

		assert.deepStrictEqual({
			maxActiveAddWorktrees,
			branchNames: addWorktreeCalls.map(call => call.branchName),
			worktrees: worktrees.map(worktree => worktree?.toString()),
		}, {
			maxActiveAddWorktrees: 1,
			branchNames: ['agents/add-feature', 'agents/add-feature-87654321'],
			worktrees: [
				URI.joinPath(worktreesRoot, 'add-feature').toString(),
				URI.joinPath(worktreesRoot, 'add-feature-87654321').toString(),
			],
		});
	});

	test('resolveWorkingDirectory is a no-op for folder isolation or a missing branch', async () => {
		const isolation = createIsolation(disposables);

		const folder = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'folder', [SessionConfigKey.Branch]: 'main' } });
		const noBranch = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree' } });

		assert.deepStrictEqual({
			folder: folder?.toString(),
			noBranch: noBranch?.toString(),
			addWorktreeCallCount: addWorktreeCalls.length,
			createdSessions: isolation.createdWorktreeSessionIds,
		}, {
			folder: repoRoot.toString(),
			noBranch: repoRoot.toString(),
			addWorktreeCallCount: 0,
			createdSessions: [],
		});
	});

	test('resolveWorkingDirectory copies configured include files and tolerates copy failures', async () => {
		const isolation = createIsolation(disposables);
		const includeFiles = ['.env', '.env.local', 'config/**'];
		copyIncludeError = new Error('copy failed');

		const worktree = await isolation.resolveWorkingDirectory({
			sessionUri,
			sessionId,
			workingDirectory: repoRoot,
			config: {
				[SessionConfigKey.Isolation]: 'worktree',
				[SessionConfigKey.Branch]: 'main',
				[SessionConfigKey.WorktreeIncludeFiles]: includeFiles,
			},
		});

		assert.deepStrictEqual({
			worktree: worktree?.toString(),
			copyIncludeCalls: copyIncludeCalls.map(call => ({
				repositoryRoot: call.repositoryRoot.toString(),
				worktree: call.worktree.toString(),
				globs: call.globs,
			})),
			createdSessions: isolation.createdWorktreeSessionIds,
		}, {
			worktree: URI.joinPath(worktreesRoot, getWorktreeName(branchName)).toString(),
			copyIncludeCalls: [{
				repositoryRoot: repoRoot.toString(),
				worktree: URI.joinPath(worktreesRoot, getWorktreeName(branchName)).toString(),
				globs: includeFiles,
			}],
			createdSessions: [sessionId],
		});
	});

	test('resolveWorkingDirectoryForResume recreates a missing live worktree and preserves an existing directory', async () => {
		const isolation = createIsolation(disposables);
		const missingWorktree = URI.joinPath(worktreesRoot, 'missing-live-worktree');
		const existingWorktree = URI.joinPath(worktreesRoot, 'existing-live-worktree');
		mkdirSync(existingWorktree.fsPath, { recursive: true });
		await Promise.all([
			db.setMetadata('copilot.worktree.branchName', 'feature/x'),
			db.setMetadata('copilot.worktree.path', missingWorktree.toString()),
			db.setMetadata('copilot.worktree.repositoryRoot', repoRoot.toString()),
		]);

		const outcomes = {
			missingWorktreeRecreated: (await isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingWorktree)).toString(),
			existingWorktreeUsedUnchanged: (await isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, existingWorktree)).toString(),
			recreatedWorktrees: addExistingCalls.map(call => ({ worktree: call.worktree.toString(), branchName: call.branchName })),
		};

		assert.deepStrictEqual(outcomes, {
			missingWorktreeRecreated: missingWorktree.toString(),
			existingWorktreeUsedUnchanged: existingWorktree.toString(),
			recreatedWorktrees: [{ worktree: missingWorktree.toString(), branchName: 'feature/x' }],
		});
	});

	test('resolveWorkingDirectoryForResume uses the repository root for archived history', async () => {
		const isolation = createIsolation(disposables);
		const missingWorktree = URI.joinPath(worktreesRoot, 'missing-archived-worktree');
		await Promise.all([
			db.setMetadata('copilot.worktree.branchName', 'feature/x'),
			db.setMetadata('copilot.worktree.path', missingWorktree.toString()),
			db.setMetadata('copilot.worktree.repositoryRoot', repoRoot.toString()),
			db.setMetadata(AH_META_IS_ARCHIVED_DB_KEY, 'true'),
		]);

		const resolved = await isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingWorktree);

		assert.deepStrictEqual({ resolved: resolved.toString(), worktreesRecreated: addExistingCalls.length }, {
			resolved: repoRoot.toString(),
			worktreesRecreated: 0,
		});
	});

	test('resolveWorkingDirectoryForResume falls back to legacy isDone archived metadata', async () => {
		const isolation = createIsolation(disposables);
		const missingWorktree = URI.joinPath(worktreesRoot, 'missing-legacy-archived-worktree');
		await Promise.all([
			db.setMetadata('copilot.worktree.branchName', 'feature/x'),
			db.setMetadata('copilot.worktree.path', missingWorktree.toString()),
			db.setMetadata('copilot.worktree.repositoryRoot', repoRoot.toString()),
			db.setMetadata(AH_META_IS_DONE_DB_KEY, 'true'),
		]);

		const resolved = await isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingWorktree);

		assert.strictEqual(resolved.toString(), repoRoot.toString());
	});

	test('resolveWorkingDirectoryForResume reports a missing preserved branch', async () => {
		const isolation = createIsolation(disposables);
		const missingWorktree = URI.joinPath(worktreesRoot, 'missing-branch-worktree');
		branchExists = false;
		await Promise.all([
			db.setMetadata('copilot.worktree.branchName', 'feature/x'),
			db.setMetadata('copilot.worktree.path', missingWorktree.toString()),
			db.setMetadata('copilot.worktree.repositoryRoot', repoRoot.toString()),
		]);

		await assert.rejects(
			() => isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingWorktree),
			(error: Error) => error instanceof SessionWorkingDirectoryMissingError
				&& error.reason !== undefined
				&& /branch 'feature\/x' no longer exists/.test(error.message),
		);
		assert.strictEqual(addExistingCalls.length, 0);
	});

	test('resolveWorkingDirectoryForResume reports a missing live directory without worktree metadata', async () => {
		const isolation = createIsolation(disposables);
		const missingDirectory = URI.joinPath(repoRoot, 'missing-directory');

		await assert.rejects(
			() => isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingDirectory),
			(error: Error) => error instanceof SessionWorkingDirectoryMissingError,
		);
	});

	test('resolveWorkingDirectoryForResume reports an archived session when its repository root is also missing', async () => {
		const isolation = createIsolation(disposables);
		const missingRepositoryRoot = URI.joinPath(repoRoot, 'missing-repository');
		const missingWorktree = URI.joinPath(worktreesRoot, 'missing-archived-no-root-worktree');
		await Promise.all([
			db.setMetadata('copilot.worktree.branchName', 'feature/x'),
			db.setMetadata('copilot.worktree.path', missingWorktree.toString()),
			db.setMetadata('copilot.worktree.repositoryRoot', missingRepositoryRoot.toString()),
			db.setMetadata(AH_META_IS_ARCHIVED_DB_KEY, 'true'),
		]);

		await assert.rejects(
			() => isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingWorktree),
			(error: Error) => error instanceof SessionWorkingDirectoryMissingError,
		);
	});

	test('resolveWorktreeProject / createdWorktreeProject expose the repository as the session project', async () => {
		// The worktree lives at `<repo>.worktrees/<name>`, but a worktree session
		// must group under the repository in the sessions UI. Both accessors return
		// the repo root as the project so agents can merge it into the reported
		// `IAgentSessionMetadata` / materialize event. Folder (non-worktree)
		// sessions have no worktree metadata and get `undefined`.
		const isolation = createIsolation(disposables);
		const expectedDisplayName = basename(repoRoot);

		const beforeAsync = await isolation.resolveWorktreeProject(sessionUri);
		const beforeSync = isolation.createdWorktreeProject(sessionId);

		await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' } });

		const afterAsync = await isolation.resolveWorktreeProject(sessionUri);
		const afterSync = isolation.createdWorktreeProject(sessionId);

		assert.deepStrictEqual({
			beforeAsync,
			beforeSync,
			afterAsync: { uri: afterAsync?.uri.toString(), displayName: afterAsync?.displayName },
			afterSync: { uri: afterSync?.uri.toString(), displayName: afterSync?.displayName },
			unknownSession: isolation.createdWorktreeProject('does-not-exist'),
		}, {
			beforeAsync: undefined,
			beforeSync: undefined,
			afterAsync: { uri: repoRoot.toString(), displayName: expectedDisplayName },
			afterSync: { uri: repoRoot.toString(), displayName: expectedDisplayName },
			unknownSession: undefined,
		});
	});

	test('applyRestoreAnnouncement prepends a markdown part when worktree metadata exists', async () => {
		const isolation = createIsolation(disposables);
		const turn: Turn = {
			id: 't1',
			message: { text: 'hi', origin: { kind: MessageKind.User } },
			responseParts: [],
			usage: undefined,
			state: TurnState.Complete,
		};

		const withoutMeta = await isolation.applyRestoreAnnouncement(sessionUri, [turn]);
		await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' } });
		const withMeta = await isolation.applyRestoreAnnouncement(sessionUri, [turn]);
		const firstPart = withMeta[0].responseParts[0];

		assert.deepStrictEqual({
			unchangedWhenNoMeta: withoutMeta[0].responseParts.length,
			firstPartKind: firstPart?.kind,
			firstPartHasBranch: firstPart?.kind === ResponsePartKind.Markdown ? firstPart.content.includes(branchName) : false,
		}, {
			unchangedWhenNoMeta: 0,
			firstPartKind: ResponsePartKind.Markdown,
			firstPartHasBranch: true,
		});
	});

	test('cleanup on archive removes a clean worktree and unarchive recreates it', async () => {
		const isolation = createIsolation(disposables);
		const worktree = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' } });

		await isolation.cleanupWorktreeOnArchive(sessionUri, sessionId);
		const removedDuringArchive = worktree ? !existsSync(worktree.fsPath) : false;
		await isolation.recreateWorktreeOnUnarchive(sessionUri, sessionId);
		const restoredDuringUnarchive = worktree ? existsSync(worktree.fsPath) : false;

		assert.deepStrictEqual({
			removeCalls: removeCalls.map(u => u.toString()),
			removedDuringArchive,
			addExistingCalls: addExistingCalls.map(c => ({ worktree: c.worktree.toString(), branchName: c.branchName })),
			restoredDuringUnarchive,
		}, {
			removeCalls: [worktree!.toString()],
			removedDuringArchive: true,
			addExistingCalls: [{ worktree: worktree!.toString(), branchName }],
			restoredDuringUnarchive: true,
		});
	});

	test('archive skips removal when the worktree has uncommitted changes', async () => {
		const isolation = createIsolation(disposables);
		const worktree = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' } });
		hasUncommittedChanges = true;

		await isolation.cleanupWorktreeOnArchive(sessionUri, sessionId);

		assert.deepStrictEqual({
			removeCalls: removeCalls.length,
			stillExists: worktree ? existsSync(worktree.fsPath) : false,
		}, {
			removeCalls: 0,
			stillExists: true,
		});
	});

	test('removeAllCreatedWorktrees drains every worktree created in this process', async () => {
		const isolation = createIsolation(disposables);
		const worktree = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' } });

		await isolation.removeAllCreatedWorktrees();

		assert.deepStrictEqual({
			removeCalls: removeCalls.map(u => u.toString()),
			createdSessions: isolation.createdWorktreeSessionIds,
		}, {
			removeCalls: [worktree!.toString()],
			createdSessions: [],
		});
	});
});
