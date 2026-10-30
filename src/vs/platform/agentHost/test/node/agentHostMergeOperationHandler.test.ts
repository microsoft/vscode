/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createTestGitHubService } from './testGitHubService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import type { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IAgentHostGitService, type IGitStash } from '../../common/agentHostGitService.js';
import { getWorkingDirectoryScopeId } from '../../common/agentHostWorkingDirectories.js';
import { buildBranchChangesetUri, buildFolderChangesetOwnerUri } from '../../common/changesetUri.js';
import { mergeOperationDirtyTargetErrorData, mergeOperationStashTargetChangesMeta, readMergeOperationDirtyTargetErrorData } from '../../common/meta/agentMergeOperationMeta.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ProtocolError } from '../../common/state/sessionProtocol.js';
import { buildDefaultChatUri, SessionStatus, withSessionGitHubState, withSessionGitState, type ISessionGitState } from '../../common/state/sessionState.js';
import { AgentHostMergeOperationHandler } from '../../node/agentHostMergeOperationHandler.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';

const session = URI.parse('agent:/session');
const worktreeRoot = URI.file('/repo.worktrees/session');
const repositoryRoot = URI.file('/repo');
const branchOwner = buildFolderChangesetOwnerUri(session.toString(), getWorkingDirectoryScopeId([worktreeRoot.toString()]));
const branchChangeset = buildBranchChangesetUri(branchOwner);

/** Replaces the random marker that identifies a stash this handler created. */
function normalizeStashMessage(message: string | undefined): string | undefined {
	return message?.replace(/ \([0-9a-f]{8}\)/, ' (<id>)');
}

class TestGitService extends mock<IAgentHostGitService>() {
	declare readonly _serviceBrand: undefined;

	readonly calls: string[] = [];
	readonly requestedBaseBranches: Array<string | undefined> = [];
	sourceBranch = 'agents/session';
	targetBranch: string | undefined = 'main';
	sourceDirty = false;
	targetDirty = false;
	mergeError: Error | undefined;
	mergeCommit: string | undefined = 'merge-sha';
	readonly stashes: IGitStash[] = [];
	stashError: Error | undefined;
	applyError: Error | undefined;
	unmergedPaths: string[] = [];
	/** A stash another worktree pushes right after ours. */
	foreignStash: IGitStash | undefined;
	targetDirtyPaths: string[] = ['scratch.txt', 'src/index.js'];
	mergePaths: string[] = ['src/multiply.js'];

	override async getRepositoryRoot(): Promise<URI> {
		return worktreeRoot;
	}

	override async getWorktreeRoots(): Promise<URI[]> {
		return [repositoryRoot, worktreeRoot];
	}

	override async getSessionGitState(_workingDirectory: URI, baseBranchName?: string): Promise<ISessionGitState> {
		this.requestedBaseBranches.push(baseBranchName);
		return {
			branchName: this.sourceBranch,
			baseBranchName: 'main',
			uncommittedChanges: this.sourceDirty ? 1 : 0,
			outgoingChanges: 1,
		};
	}

	override async getCurrentBranch(): Promise<string> {
		return this.sourceBranch;
	}

	override async getCurrentBranchName(): Promise<string | undefined> {
		return this.targetBranch;
	}

	override async branchExists(): Promise<boolean> {
		return true;
	}

	override async hasUncommittedChanges(workingDirectory: URI): Promise<boolean> {
		this.calls.push(`hasUncommittedChanges:${workingDirectory.toString()}`);
		return workingDirectory.toString() === repositoryRoot.toString() ? this.targetDirty : this.sourceDirty;
	}

	override async commitAll(workingDirectory: URI, message: string): Promise<void> {
		this.calls.push(`commitAll:${workingDirectory.toString()}:${message}`);
		this.sourceDirty = false;
	}

	override async mergeBranch(workingDirectory: URI, branchName: string): Promise<string> {
		this.calls.push(`mergeBranch:${workingDirectory.toString()}:${branchName}`);
		if (this.mergeError) {
			throw this.mergeError;
		}
		return '';
	}

	override async createStash(workingDirectory: URI, options?: { readonly message?: string; readonly includeUntracked?: boolean }): Promise<void> {
		this.calls.push(`createStash:${workingDirectory.toString()}:${normalizeStashMessage(options?.message)}:${options?.includeUntracked}`);
		this.stashes.unshift({ ref: 'stash@{0}', commit: 'stash-sha', message: `On main: ${options?.message}` });
		if (this.foreignStash) {
			this.stashes.unshift(this.foreignStash);
		}
		this.targetDirty = false;
		if (this.stashError) {
			// Like git, a late failure (cleaning the working tree) still leaves the stash recorded.
			throw this.stashError;
		}
	}

	override async listStashes(): Promise<readonly IGitStash[]> {
		return this.stashes;
	}

	override async applyStash(workingDirectory: URI, commit: string): Promise<void> {
		this.calls.push(`applyStash:${workingDirectory.toString()}:${commit}`);
		if (this.applyError) {
			throw this.applyError;
		}
		this.targetDirty = true;
	}

	override async dropStash(workingDirectory: URI, commit: string): Promise<void> {
		this.calls.push(`dropStash:${workingDirectory.toString()}:${commit}`);
		const index = this.stashes.findIndex(stash => stash.commit === commit);
		if (index >= 0) {
			this.stashes.splice(index, 1);
		}
	}

	override async getUnmergedPaths(): Promise<readonly string[]> {
		return this.unmergedPaths;
	}

	override async captureWorkingTreeAsTree(workingDirectory: URI): Promise<string> {
		return workingDirectory.toString() === repositoryRoot.toString() ? 'target-tree' : 'worktree-tree';
	}

	override async resolveBranchBaselineCommit(): Promise<string> {
		return 'baseline';
	}

	override async diffTreePaths(_repositoryRoot: URI, fromTreeish: string, toTreeish: string): Promise<string[]> {
		return toTreeish === 'target-tree' && fromTreeish === 'HEAD' ? this.targetDirtyPaths : fromTreeish === 'baseline' ? this.mergePaths : [];
	}

	override async revParse(): Promise<string | undefined> {
		return this.mergeCommit;
	}
}

interface ISetupOptions {
	readonly configuredBranch?: string;
	readonly persistedBaseBranch?: string;
	readonly sourceDirty?: boolean;
	readonly targetBranch?: string;
	readonly targetDirty?: boolean;
	readonly mergeError?: Error;
	readonly missingMergeCommit?: boolean;
	readonly hasPullRequest?: boolean;
	readonly applyError?: Error;
	readonly unmergedPaths?: string[];
	readonly foreignStash?: IGitStash;
	readonly stashError?: Error;
	readonly mergePaths?: string[];
}

async function setup(disposables: Pick<DisposableStore, 'add'>, options: ISetupOptions = {}) {
	const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
	stateManager.createSession({
		resource: session.toString(),
		provider: 'copilot',
		title: 'Session',
		status: SessionStatus.Idle,
		createdAt: new Date(1).toISOString(),
		modifiedAt: new Date(1).toISOString(),
		workingDirectories: [worktreeRoot.toString()],
		project: { uri: repositoryRoot.toString(), displayName: 'repo' },
		defaultChat: buildDefaultChatUri(session.toString()),
	});
	stateManager.setSessionConfig(session.toString(), {
		schema: { type: 'object', properties: {} },
		values: {
			[SessionConfigKey.Isolation]: 'worktree',
			...(options.configuredBranch ? { [SessionConfigKey.Branch]: options.configuredBranch } : {}),
		}
	});
	let sessionMeta = withSessionGitState(undefined, {
		branchName: 'agents/session',
		baseBranchName: 'main',
		uncommittedChanges: options.sourceDirty ? 1 : 0,
		outgoingChanges: 1,
	});
	if (options.hasPullRequest) {
		sessionMeta = withSessionGitHubState(sessionMeta, worktreeRoot.toString(), {
			pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
			pullRequestBranchName: 'agents/session',
		});
	}
	stateManager.setSessionMeta(session.toString(), sessionMeta);

	const gitService = new TestGitService();
	gitService.sourceDirty = options.sourceDirty ?? false;
	gitService.targetBranch = options.targetBranch ?? 'main';
	gitService.targetDirty = options.targetDirty ?? false;
	gitService.mergeError = options.mergeError;
	gitService.mergeCommit = options.missingMergeCommit ? undefined : 'merge-sha';
	gitService.applyError = options.applyError;
	gitService.unmergedPaths = options.unmergedPaths ?? [];
	gitService.foreignStash = options.foreignStash;
	gitService.stashError = options.stashError;
	gitService.mergePaths = options.mergePaths ?? gitService.mergePaths;
	const refreshed: string[] = [];
	const merged: Array<{ sessionKey: string; commit: string | undefined }> = [];
	const handler = new AgentHostMergeOperationHandler(
		sessionKey => stateManager.getSessionState(sessionKey),
		async () => options.configuredBranch ?? options.persistedBaseBranch?.replace(/^origin\//, '') ?? 'main',
		async sessionKey => { refreshed.push(sessionKey); },
		async (sessionKey, commit) => { merged.push({ sessionKey, commit }); },
		gitService,
		new NullLogService(),
		stateManager,
		createTestGitHubService(),
	);
	return { gitService, handler, merged, refreshed };
}

suite('AgentHostMergeOperationHandler', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('commits worktree changes, merges into the checked-out base branch, and refreshes', async () => {
		const { gitService, handler, merged, refreshed } = await setup(disposables, { configuredBranch: 'release', sourceDirty: true, targetBranch: 'release' });

		const result = await handler.invoke({
			channel: branchChangeset,
			operationId: AgentHostMergeOperationHandler.OPERATION_MERGE,
		}, CancellationToken.None);

		assert.deepStrictEqual({
			calls: gitService.calls,
			requestedBaseBranches: gitService.requestedBaseBranches,
			merged,
			refreshed,
			message: typeof result.message === 'string' ? result.message : result.message?.markdown,
		}, {
			calls: [
				`hasUncommittedChanges:${repositoryRoot.toString()}`,
				`hasUncommittedChanges:${worktreeRoot.toString()}`,
				`commitAll:${worktreeRoot.toString()}:Agent Host changes for agents/session`,
				`mergeBranch:${repositoryRoot.toString()}:agents/session`,
			],
			requestedBaseBranches: ['release'],
			merged: [{ sessionKey: session.toString(), commit: 'merge-sha' }],
			refreshed: [branchOwner],
			message: 'Merged changes from \'agents/session\' into \'release\'.',
		});
	});

	test('refreshes and reports the created commit when merging fails afterward', async () => {
		const { gitService, handler, merged, refreshed } = await setup(disposables, {
			configuredBranch: 'main',
			sourceDirty: true,
			mergeError: new Error('merge conflict'),
		});

		let errorMessage: string | undefined;
		try {
			await handler.invoke({
				channel: branchChangeset,
				operationId: AgentHostMergeOperationHandler.OPERATION_MERGE,
			}, CancellationToken.None);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error);
		}

		assert.deepStrictEqual({
			calls: gitService.calls,
			merged,
			refreshed,
			errorMessage,
		}, {
			calls: [
				`hasUncommittedChanges:${repositoryRoot.toString()}`,
				`hasUncommittedChanges:${worktreeRoot.toString()}`,
				`commitAll:${worktreeRoot.toString()}:Agent Host changes for agents/session`,
				`mergeBranch:${repositoryRoot.toString()}:agents/session`,
			],
			merged: [],
			refreshed: [branchOwner],
			errorMessage: 'The worktree changes were committed, but merging into \'main\' failed. Open the parent repository and merge manually. Git reported: merge conflict',
		});
	});

	test('does not record a successful merge without the resulting target commit', async () => {
		const { handler, merged, refreshed } = await setup(disposables, {
			configuredBranch: 'main',
			missingMergeCommit: true,
		});

		let errorMessage: string | undefined;
		try {
			await handler.invoke({
				channel: branchChangeset,
				operationId: AgentHostMergeOperationHandler.OPERATION_MERGE,
			}, CancellationToken.None);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error);
		}

		assert.deepStrictEqual({
			merged,
			refreshed,
			errorMessage,
		}, {
			merged: [],
			refreshed: [branchOwner],
			errorMessage: 'Changes were merged into \'main\', but the resulting commit could not be recorded.',
		});
	});

	test('rejects a stale merge operation when a pull request now exists', async () => {
		const { gitService, handler, merged, refreshed } = await setup(disposables, {
			configuredBranch: 'main',
			hasPullRequest: true,
			sourceDirty: true,
		});

		let errorMessage: string | undefined;
		try {
			await handler.invoke({
				channel: branchChangeset,
				operationId: AgentHostMergeOperationHandler.OPERATION_MERGE,
			}, CancellationToken.None);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error);
		}

		assert.deepStrictEqual({
			calls: gitService.calls,
			merged,
			refreshed,
			errorMessage,
		}, {
			calls: [
				`hasUncommittedChanges:${repositoryRoot.toString()}`,
				`hasUncommittedChanges:${worktreeRoot.toString()}`,
			],
			merged: [],
			refreshed: [],
			errorMessage: 'Merge Changes is no longer available because a pull request exists for branch \'agents/session\'.',
		});
	});

	async function invokeMerge(handler: AgentHostMergeOperationHandler, _meta?: Record<string, unknown>) {
		try {
			const result = await handler.invoke({
				channel: branchChangeset,
				operationId: AgentHostMergeOperationHandler.OPERATION_MERGE,
				_meta,
			}, CancellationToken.None);
			return { message: typeof result.message === 'string' ? result.message : result.message?.markdown };
		} catch (error) {
			return {
				errorMessage: normalizeStashMessage(error instanceof Error ? error.message : String(error)),
				errorData: error instanceof ProtocolError ? error.data : undefined,
			};
		}
	}

	const stashMessage = 'Changes in main before merging agents/session (<id>)';
	const restoreCalls = [
		`applyStash:${repositoryRoot.toString()}:stash-sha`,
		`dropStash:${repositoryRoot.toString()}:stash-sha`,
	];

	test('rejects a dirty parent with a structured reason before committing anything', async () => {
		const { gitService, handler, merged, refreshed } = await setup(disposables, { sourceDirty: true, targetDirty: true });

		const outcome = await invokeMerge(handler);

		assert.deepStrictEqual({ calls: gitService.calls, merged, refreshed, outcome, dirtyTarget: readMergeOperationDirtyTargetErrorData(outcome.errorData) }, {
			calls: [`hasUncommittedChanges:${repositoryRoot.toString()}`],
			merged: [],
			refreshed: [],
			outcome: {
				errorMessage: '\'main\' has uncommitted changes in the parent repository. Commit or stash them, then merge again.',
				errorData: mergeOperationDirtyTargetErrorData('main', []),
			},
			dirtyTarget: { targetBranch: 'main', overlappingPaths: [] },
		});
	});

	test('stashes parent changes, merges, and restores them with their staged state when requested', async () => {
		const { gitService, handler, merged } = await setup(disposables, { sourceDirty: true, targetDirty: true });

		const outcome = await invokeMerge(handler, mergeOperationStashTargetChangesMeta());

		assert.deepStrictEqual({ calls: gitService.calls, merged, outcome, stashes: gitService.stashes, targetDirty: gitService.targetDirty }, {
			calls: [
				`hasUncommittedChanges:${repositoryRoot.toString()}`,
				`createStash:${repositoryRoot.toString()}:${stashMessage}:true`,
				`hasUncommittedChanges:${worktreeRoot.toString()}`,
				`commitAll:${worktreeRoot.toString()}:Agent Host changes for agents/session`,
				`mergeBranch:${repositoryRoot.toString()}:agents/session`,
				...restoreCalls,
			],
			merged: [{ sessionKey: session.toString(), commit: 'merge-sha' }],
			outcome: { message: 'Merged into \'main\' and restored your uncommitted changes.' },
			stashes: [],
			targetDirty: true,
		});
	});

	test('restores only its own stash when another worktree pushes a stash meanwhile', async () => {
		const foreignStash: IGitStash = { ref: 'stash@{0}', commit: 'foreign-sha', message: 'On feature: other worktree' };
		const { gitService, handler } = await setup(disposables, { targetDirty: true, foreignStash });

		const outcome = await invokeMerge(handler, mergeOperationStashTargetChangesMeta());

		assert.deepStrictEqual({ restoreCalls: gitService.calls.filter(call => /^(apply|drop)Stash/.test(call)), outcome, stashes: gitService.stashes }, {
			restoreCalls,
			outcome: { message: 'Merged into \'main\' and restored your uncommitted changes.' },
			stashes: [foreignStash],
		});
	});

	test('restores and reports a stash that git recorded before failing to stash', async () => {
		const { gitService, handler, merged } = await setup(disposables, { sourceDirty: true, targetDirty: true, stashError: new Error('unable to remove locked.txt') });

		const outcome = await invokeMerge(handler, mergeOperationStashTargetChangesMeta());

		assert.deepStrictEqual({ calls: gitService.calls, merged, outcome, stashes: gitService.stashes, targetDirty: gitService.targetDirty }, {
			calls: [
				`hasUncommittedChanges:${repositoryRoot.toString()}`,
				`createStash:${repositoryRoot.toString()}:${stashMessage}:true`,
				...restoreCalls,
			],
			merged: [],
			outcome: {
				errorMessage: 'Couldn\'t stash your uncommitted changes, so nothing was merged. Your changes are back in place. Git reported: unable to remove locked.txt',
				errorData: undefined,
			},
			stashes: [],
			targetDirty: true,
		});
	});

	test('restores stashed parent changes when the merge fails', async () => {
		const { gitService, handler, merged } = await setup(disposables, { targetDirty: true, mergeError: new Error('merge conflict') });

		const outcome = await invokeMerge(handler, mergeOperationStashTargetChangesMeta());

		assert.deepStrictEqual({ calls: gitService.calls, merged, outcome, stashes: gitService.stashes, targetDirty: gitService.targetDirty }, {
			calls: [
				`hasUncommittedChanges:${repositoryRoot.toString()}`,
				`createStash:${repositoryRoot.toString()}:${stashMessage}:true`,
				`hasUncommittedChanges:${worktreeRoot.toString()}`,
				`mergeBranch:${repositoryRoot.toString()}:agents/session`,
				...restoreCalls,
			],
			merged: [],
			outcome: {
				errorMessage: 'Failed to merge changes into \'main\'. Open the parent repository and merge manually. Git reported: merge conflict',
				errorData: undefined,
			},
			stashes: [],
			targetDirty: true,
		});
	});

	test('names the files the merge also changes, and reports the conflicts git leaves when restoring', async () => {
		const { gitService, handler, merged } = await setup(disposables, {
			targetDirty: true,
			mergePaths: ['src/index.js', 'src/multiply.js'],
			applyError: new Error('CONFLICT (content): Merge conflict in src/index.js'),
			unmergedPaths: ['src/index.js'],
		});

		const rejected = await invokeMerge(handler);
		const outcome = await invokeMerge(handler, mergeOperationStashTargetChangesMeta());

		assert.deepStrictEqual({ dirtyTarget: readMergeOperationDirtyTargetErrorData(rejected.errorData), merged, outcome, keptStashes: gitService.stashes.map(stash => stash.commit) }, {
			dirtyTarget: { targetBranch: 'main', overlappingPaths: ['src/index.js'] },
			merged: [{ sessionKey: session.toString(), commit: 'merge-sha' }],
			outcome: {
				errorMessage: `Merged into 'main'. Your uncommitted changes conflict with the merged changes in src/index.js. Resolve the conflicts in the parent repository. A copy of your changes is in the stash as "${stashMessage}".`,
				errorData: undefined,
			},
			keptStashes: ['stash-sha'],
		});
	});

	test('reports git\'s diagnostic and keeps the stash when restoring fails without conflicts', async () => {
		const { gitService, handler } = await setup(disposables, { targetDirty: true, applyError: new Error('Unable to create index.lock: File exists') });

		const outcome = await invokeMerge(handler, mergeOperationStashTargetChangesMeta());

		assert.deepStrictEqual({ outcome, keptStashes: gitService.stashes.map(stash => stash.commit) }, {
			outcome: {
				errorMessage: `Merged into 'main'. Your uncommitted changes couldn't be put back. They're safe in the stash as "${stashMessage}". Git reported: Unable to create index.lock: File exists`,
				errorData: undefined,
			},
			keptStashes: ['stash-sha'],
		});
	});

	test('uses the resolved persisted baseline when the configured branch is unavailable', async () => {
		const { gitService, handler, refreshed } = await setup(disposables, {
			persistedBaseBranch: 'origin/main',
			targetBranch: 'other',
		});

		let errorMessage: string | undefined;
		try {
			await handler.invoke({
				channel: branchChangeset,
				operationId: AgentHostMergeOperationHandler.OPERATION_MERGE,
			}, CancellationToken.None);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error);
		}

		assert.deepStrictEqual({
			calls: gitService.calls,
			refreshed,
			errorMessage,
		}, {
			calls: [],
			refreshed: [],
			errorMessage: 'The parent repository is on \'other\'. Check out \'main\' there before merging.',
		});
	});
});
