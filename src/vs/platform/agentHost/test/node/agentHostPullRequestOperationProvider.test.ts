/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Event } from '../../../../base/common/event.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostPullRequestOperationContribution } from '../../node/agentHostPullRequestOperationProvider.js';
import type { IAgentHostPullRequestStatus, IAgentHostPullRequestStatusService } from '../../node/agentHostPullRequestStatusService.js';
import { SessionStatus, type ISessionGitHubState, type ISessionGitState } from '../../common/state/sessionState.js';
import type { IAgentHostGitStateService } from '../../common/agentHostGitStateService.js';
import { ChangesetKind } from '../../common/changesetUri.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';

const nullGitStateService = new class implements IAgentHostGitStateService {
	declare readonly _serviceBrand: undefined;
	readonly onDidRefreshSessionGitState = Event.None;
	readonly onDidChangeSessionGitHubState = Event.None;
	async refreshSessionGitState(): Promise<void> { }
	async resolveSessionBaseBranchName(): Promise<string | undefined> { return undefined; }
	async getSessionGitHubState(): Promise<ISessionGitHubState | undefined> { return undefined; }
	async setSessionGitHubState(): Promise<void> { }
	async recordSessionMerge(): Promise<void> { }
	async attachSessionGitHubPullRequest(): Promise<void> { }
};

function createStatusService(status?: IAgentHostPullRequestStatus): IAgentHostPullRequestStatusService {
	return {
		_serviceBrand: undefined,
		onDidChangePullRequestStatus: Event.None,
		getPullRequestStatus: () => status,
		refresh: async () => { },
		dispose: () => { },
	};
}

function openPullRequest(overrides?: Partial<IAgentHostPullRequestStatus>): IAgentHostPullRequestStatus {
	return {
		pullRequestId: 'PR_1',
		number: 1,
		url: 'https://github.com/microsoft/vscode/pull/1',
		headSha: 'sha1',
		state: 'open',
		draft: false,
		mergeReady: false,
		viewerCanEnableAutoMerge: false,
		autoMergeEnabled: false,
		allowedMergeMethods: ['SQUASH'],
		...overrides,
	};
}

const githubBranchWithUncommittedChanges: ISessionGitState = {
	hasGitHubRemote: true,
	branchName: 'feature/test',
	uncommittedChanges: 1,
	outgoingChanges: 0,
};

const pullRequestForBranch: ISessionGitHubState = {
	pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
	pullRequestBranchName: 'feature/test',
};

suite('AgentHostPullRequestOperationContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createContribution(status?: IAgentHostPullRequestStatus, isolation?: 'folder' | 'worktree'): AgentHostPullRequestOperationContribution {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		if (isolation) {
			stateManager.createSession({
				resource: 'agent:/session',
				provider: 'copilot',
				title: 'Session',
				status: SessionStatus.Idle,
				createdAt: new Date(1).toISOString(),
				modifiedAt: new Date(1).toISOString(),
				workingDirectories: ['file:///repo'],
			});
			stateManager.setSessionConfig('agent:/session', {
				schema: { type: 'object', properties: {} },
				values: { [SessionConfigKey.Isolation]: isolation },
			});
		}
		return disposables.add(new AgentHostPullRequestOperationContribution(
			stateManager,
			disposables.add(new InstantiationService()),
			nullGitStateService,
			createStatusService(status),
			new NullLogService(),
		));
	}

	test('advertises PR operations for GitHub branches with uncommitted changes', () => {
		const provider = createContribution();

		const operations = provider.getOperations({ sessionKey: 'agent:/session', gitState: githubBranchWithUncommittedChanges, changesetKind: ChangesetKind.Session, changesetUri: '' });

		assert.deepStrictEqual(operations?.map(op => op.id), ['create-pr', 'create-pr-auto-merge', 'create-pr-auto-squash', 'create-pr-auto-rebase', 'create-draft-pr']);
	});

	test('does not advertise PR operations for folder sessions with outgoing changes', () => {
		const provider = createContribution(undefined, 'folder');

		const operations = provider.getOperations({
			sessionKey: 'agent:/session',
			gitState: { ...githubBranchWithUncommittedChanges, uncommittedChanges: 0, outgoingChanges: 2 },
			changesetKind: ChangesetKind.Branch,
			changesetUri: '',
		});

		assert.deepStrictEqual(operations, undefined);
	});

	test('does not advertise PR operations without GitHub branch changes', () => {
		const provider = createContribution();

		const actual = [
			provider.getOperations({ sessionKey: 'agent:/session', gitState: { ...githubBranchWithUncommittedChanges, hasGitHubRemote: false }, changesetKind: ChangesetKind.Session, changesetUri: '' }),
			provider.getOperations({ sessionKey: 'agent:/session', gitState: { ...githubBranchWithUncommittedChanges, uncommittedChanges: 0, outgoingChanges: 0 }, changesetKind: ChangesetKind.Session, changesetUri: '' }),
			provider.getOperations({ sessionKey: 'agent:/session', gitState: { ...githubBranchWithUncommittedChanges, uncommittedChanges: 0, outgoingChanges: 2, hasBaseBranchChanges: false }, changesetKind: ChangesetKind.Session, changesetUri: '' }),
		];

		assert.deepStrictEqual(actual, [undefined, undefined, undefined]);
	});

	test('advertises PR operations again for a branch whose pull request is unknown', () => {
		const provider = createContribution();

		const actual = [
			provider.getOperations({ sessionKey: 'agent:/session', gitState: githubBranchWithUncommittedChanges, gitHubState: pullRequestForBranch, changesetKind: ChangesetKind.Session, changesetUri: '' }),
			provider.getOperations({ sessionKey: 'agent:/session', gitState: githubBranchWithUncommittedChanges, gitHubState: { ...pullRequestForBranch, pullRequestBranchName: 'feature/other' }, changesetKind: ChangesetKind.Session, changesetUri: '' }),
		];

		assert.deepStrictEqual(actual.map(operations => operations?.map(op => op.id)), [undefined, ['create-pr', 'create-pr-auto-merge', 'create-pr-auto-squash', 'create-pr-auto-rebase', 'create-draft-pr']]);
	});

	test('advertises lifecycle operations for a pull request on the current branch', () => {
		const operationsFor = (status?: IAgentHostPullRequestStatus) => createContribution(status)
			.getOperations({ sessionKey: 'agent:/session', gitState: githubBranchWithUncommittedChanges, gitHubState: pullRequestForBranch, changesetKind: ChangesetKind.Session, changesetUri: '' })
			?.map(op => op.id);

		assert.deepStrictEqual({
			unresolved: operationsFor(undefined),
			merged: operationsFor(openPullRequest({ state: 'merged' })),
			draft: operationsFor(openPullRequest({ draft: true, viewerCanEnableAutoMerge: true })),
			mergeable: operationsFor(openPullRequest({ mergeReady: true })),
			blocked: operationsFor(openPullRequest({ viewerCanEnableAutoMerge: true })),
			autoMerging: operationsFor(openPullRequest({ autoMergeEnabled: true })),
			noAutoMerge: operationsFor(openPullRequest()),
		}, {
			unresolved: undefined,
			merged: undefined,
			draft: ['pr-mark-ready', 'pr-enable-auto-merge'],
			mergeable: ['pr-merge'],
			blocked: ['pr-enable-auto-merge'],
			autoMerging: ['pr-disable-auto-merge'],
			noAutoMerge: undefined,
		});
	});
});
