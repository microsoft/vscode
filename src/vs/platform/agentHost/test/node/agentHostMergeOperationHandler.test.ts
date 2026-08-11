/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import type { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IAgentHostGitService, META_DIFF_BASE_BRANCH } from '../../common/agentHostGitService.js';
import { buildBranchChangesetUri } from '../../common/changesetUri.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { SessionStatus, withSessionGitState, type ISessionGitState } from '../../common/state/sessionState.js';
import { AgentHostMergeOperationHandler } from '../../node/agentHostMergeOperationHandler.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

const session = URI.parse('agent:/session');
const worktreeRoot = URI.file('/repo.worktrees/session');
const repositoryRoot = URI.file('/repo');

class TestGitService extends mock<IAgentHostGitService>() {
	declare readonly _serviceBrand: undefined;

	readonly calls: string[] = [];
	sourceBranch = 'agents/session';
	targetBranch: string | undefined = 'main';
	sourceDirty = false;
	targetDirty = false;
	mergeError: Error | undefined;
	mergeCommit: string | undefined = 'merge-sha';

	override async getRepositoryRoot(): Promise<URI> {
		return worktreeRoot;
	}

	override async getWorktreeRoots(): Promise<URI[]> {
		return [repositoryRoot, worktreeRoot];
	}

	override async getSessionGitState(): Promise<ISessionGitState> {
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
	});
	stateManager.setSessionConfig(session.toString(), {
		schema: { type: 'object', properties: {} },
		values: {
			[SessionConfigKey.Isolation]: 'worktree',
			...(options.configuredBranch ? { [SessionConfigKey.Branch]: options.configuredBranch } : {}),
		}
	});
	stateManager.setSessionMeta(session.toString(), withSessionGitState(undefined, {
		branchName: 'agents/session',
		baseBranchName: 'main',
		uncommittedChanges: options.sourceDirty ? 1 : 0,
		outgoingChanges: 1,
	}));

	const database = new TestSessionDatabase();
	if (options.persistedBaseBranch) {
		await database.setMetadata(META_DIFF_BASE_BRANCH, options.persistedBaseBranch);
	}
	const gitService = new TestGitService();
	gitService.sourceDirty = options.sourceDirty ?? false;
	gitService.targetBranch = options.targetBranch ?? 'main';
	gitService.targetDirty = options.targetDirty ?? false;
	gitService.mergeError = options.mergeError;
	gitService.mergeCommit = options.missingMergeCommit ? undefined : 'merge-sha';
	const refreshed: string[] = [];
	const merged: Array<{ sessionKey: string; commit: string | undefined }> = [];
	const handler = new AgentHostMergeOperationHandler(
		sessionKey => stateManager.getSessionState(sessionKey),
		async sessionKey => { refreshed.push(sessionKey); },
		async (sessionKey, commit) => { merged.push({ sessionKey, commit }); },
		gitService,
		createSessionDataService(database),
		new NullLogService(),
	);
	return { gitService, handler, merged, refreshed };
}

suite('AgentHostMergeOperationHandler', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('commits worktree changes, merges into the checked-out base branch, and refreshes', async () => {
		const { gitService, handler, merged, refreshed } = await setup(disposables, { configuredBranch: 'main', sourceDirty: true });

		const result = await handler.invoke({
			channel: buildBranchChangesetUri(session.toString()),
			operationId: AgentHostMergeOperationHandler.OPERATION_MERGE,
		}, CancellationToken.None);

		assert.deepStrictEqual({
			calls: gitService.calls,
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
			merged: [{ sessionKey: session.toString(), commit: 'merge-sha' }],
			refreshed: [session.toString()],
			message: 'Merged changes from \'agents/session\' into \'main\'.',
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
				channel: buildBranchChangesetUri(session.toString()),
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
			refreshed: [session.toString()],
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
				channel: buildBranchChangesetUri(session.toString()),
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
			refreshed: [session.toString()],
			errorMessage: 'Changes were merged into \'main\', but the resulting commit could not be recorded.',
		});
	});

	test('normalizes the persisted remote baseline when the configured branch is unavailable', async () => {
		const { gitService, handler, refreshed } = await setup(disposables, {
			persistedBaseBranch: 'origin/main',
			targetBranch: 'other',
		});

		let errorMessage: string | undefined;
		try {
			await handler.invoke({
				channel: buildBranchChangesetUri(session.toString()),
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
