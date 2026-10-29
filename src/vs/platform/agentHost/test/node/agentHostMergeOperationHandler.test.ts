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
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
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
	stash: string | undefined;
	popError: Error | undefined;
	stashError: Error | undefined;
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
		this.calls.push(`createStash:${workingDirectory.toString()}:${options?.message}:${options?.includeUntracked}`);
		this.stash = 'stash-sha';
		this.targetDirty = false;
		if (this.stashError) {
			// Like git, a late failure (cleaning the working tree) still leaves the stash recorded.
			throw this.stashError;
		}
	}

	override async popStash(workingDirectory: URI): Promise<void> {
		this.calls.push(`popStash:${workingDirectory.toString()}`);
		if (this.popError) {
			// Like git, a failed pop keeps the stash entry.
			throw this.popError;
		}
		this.stash = undefined;
		this.targetDirty = true;
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

	override async revParse(_repositoryRoot: URI, expression: string): Promise<string | undefined> {
		return expression === 'refs/stash' ? this.stash : this.mergeCommit;
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
	readonly popError?: Error;
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
	gitService.popError = options.popError;
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
				errorMessage: error instanceof Error ? error.message : String(error),
				errorData: error instanceof ProtocolError ? error.data : undefined,
			};
		}
	}

	test('rejects a dirty parent with a structured reason before committing anything', async () => {
		const { gitService, handler, merged, refreshed } = await setup(disposables, { sourceDirty: true, targetDirty: true });

		const outcome = await invokeMerge(handler);

		assert.deepStrictEqual({ calls: gitService.calls, merged, refreshed, outcome, dirtyTarget: readMergeOperationDirtyTargetErrorData(outcome.errorData) }, {
			calls: [`hasUncommittedChanges:${repositoryRoot.toString()}`],
			merged: [],
			refreshed: [],
			outcome: {
				errorMessage: 'Commit or stash the changes in the parent repository before merging into \'main\'. Nothing was committed or merged.',
				errorData: mergeOperationDirtyTargetErrorData('main', []),
			},
			dirtyTarget: { targetBranch: 'main', overlappingPaths: [] },
		});
	});

	test('names the files the merge also changes, and reports them if restoring the stash conflicts there', async () => {
		const { gitService, handler, merged } = await setup(disposables, {
			targetDirty: true,
			mergePaths: ['src/index.js', 'src/multiply.js'],
			popError: new Error('CONFLICT (content): Merge conflict in src/index.js'),
		});

		const rejected = await invokeMerge(handler);
		const outcome = await invokeMerge(handler, mergeOperationStashTargetChangesMeta());

		assert.deepStrictEqual({ dirtyTarget: readMergeOperationDirtyTargetErrorData(rejected.errorData), merged, outcome, stash: gitService.stash }, {
			dirtyTarget: { targetBranch: 'main', overlappingPaths: ['src/index.js'] },
			merged: [{ sessionKey: session.toString(), commit: 'merge-sha' }],
			outcome: {
				errorMessage: 'Merged changes from \'agents/session\' into \'main\'. Restoring your uncommitted changes in the parent repository conflicted with the merged changes in src/index.js. Resolve the conflicts there. Git also kept a copy of your changes in the stash, so nothing is lost.',
				errorData: undefined,
			},
			stash: 'stash-sha',
		});
	});

	test('stashes parent changes, merges, and restores them when requested', async () => {
		const { gitService, handler, merged } = await setup(disposables, { sourceDirty: true, targetDirty: true });

		const outcome = await invokeMerge(handler, mergeOperationStashTargetChangesMeta());

		assert.deepStrictEqual({ calls: gitService.calls, merged, outcome, stash: gitService.stash, targetDirty: gitService.targetDirty }, {
			calls: [
				`hasUncommittedChanges:${repositoryRoot.toString()}`,
				`createStash:${repositoryRoot.toString()}:Changes in main before merging agents/session:true`,
				`hasUncommittedChanges:${worktreeRoot.toString()}`,
				`commitAll:${worktreeRoot.toString()}:Agent Host changes for agents/session`,
				`mergeBranch:${repositoryRoot.toString()}:agents/session`,
				`popStash:${repositoryRoot.toString()}`,
			],
			merged: [{ sessionKey: session.toString(), commit: 'merge-sha' }],
			outcome: { message: 'Merged changes from \'agents/session\' into \'main\' and restored the uncommitted changes in the parent repository.' },
			stash: undefined,
			targetDirty: true,
		});
	});

	test('restores and reports a stash that git recorded before failing to stash', async () => {
		const { gitService, handler, merged } = await setup(disposables, { sourceDirty: true, targetDirty: true, stashError: new Error('unable to remove locked.txt') });

		const outcome = await invokeMerge(handler, mergeOperationStashTargetChangesMeta());

		assert.deepStrictEqual({ calls: gitService.calls, merged, outcome, stash: gitService.stash, targetDirty: gitService.targetDirty }, {
			calls: [
				`hasUncommittedChanges:${repositoryRoot.toString()}`,
				`createStash:${repositoryRoot.toString()}:Changes in main before merging agents/session:true`,
				`popStash:${repositoryRoot.toString()}`,
			],
			merged: [],
			outcome: {
				errorMessage: 'Could not stash the changes in the parent repository, so nothing was committed or merged, and your changes were restored. Git reported: unable to remove locked.txt',
				errorData: undefined,
			},
			stash: undefined,
			targetDirty: true,
		});
	});

	test('restores stashed parent changes when the merge fails', async () => {
		const { gitService, handler, merged } = await setup(disposables, { targetDirty: true, mergeError: new Error('merge conflict') });

		const outcome = await invokeMerge(handler, mergeOperationStashTargetChangesMeta());

		assert.deepStrictEqual({ calls: gitService.calls, merged, outcome, stash: gitService.stash, targetDirty: gitService.targetDirty }, {
			calls: [
				`hasUncommittedChanges:${repositoryRoot.toString()}`,
				`createStash:${repositoryRoot.toString()}:Changes in main before merging agents/session:true`,
				`hasUncommittedChanges:${worktreeRoot.toString()}`,
				`mergeBranch:${repositoryRoot.toString()}:agents/session`,
				`popStash:${repositoryRoot.toString()}`,
			],
			merged: [],
			outcome: {
				errorMessage: 'Failed to merge changes into \'main\'. Open the parent repository and merge manually. Git reported: merge conflict',
				errorData: undefined,
			},
			stash: undefined,
			targetDirty: true,
		});
	});

	test('keeps the stash and explains how to restore it when restoring conflicts', async () => {
		const { gitService, handler, merged } = await setup(disposables, { targetDirty: true, popError: new Error('CONFLICT (content): Merge conflict in src/index.js') });

		const outcome = await invokeMerge(handler, mergeOperationStashTargetChangesMeta());

		assert.deepStrictEqual({ merged, outcome, stash: gitService.stash }, {
			merged: [{ sessionKey: session.toString(), commit: 'merge-sha' }],
			outcome: {
				errorMessage: 'Merged changes from \'agents/session\' into \'main\'. Your uncommitted changes in the parent repository could not be restored automatically. Git kept them in the stash, so nothing is lost; run \'git stash list\' in the parent repository to find and restore them.',
				errorData: undefined,
			},
			stash: 'stash-sha',
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
