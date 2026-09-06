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
import { AgentHostPullRequestLifecycleOperationHandler } from '../../node/agentHostPullRequestLifecycleOperationHandler.js';
import type { IAgentHostPullRequestStatus, IAgentHostPullRequestStatusService } from '../../node/agentHostPullRequestStatusService.js';
import { SessionStatus, type ISessionGitHubState, type ISessionGitState } from '../../common/state/sessionState.js';
import type { IAgentHostGitStateService } from '../../common/agentHostGitStateService.js';
import { ChangesetKind } from '../../common/changesetUri.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { mock } from '../../../../base/test/common/mock.js';
import type { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentMergeConfigKey } from '../../common/agentMerge.js';

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

function createStatusService(status?: IAgentHostPullRequestStatus, onDidChangePullRequestStatus = Event.None): IAgentHostPullRequestStatusService {
	return {
		_serviceBrand: undefined,
		onDidChangePullRequestStatus,
		getPullRequestStatus: () => status,
		markPullRequestMerged: () => { },
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

	function createContribution(status?: IAgentHostPullRequestStatus, isolation?: 'folder' | 'worktree', onDidChangePullRequestStatus = Event.None, agentMergeEnabled = false, sessionAgentMergeEnabled = false): AgentHostPullRequestOperationContribution {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		if (isolation || sessionAgentMergeEnabled) {
			const session = {
				resource: 'agent:/session',
				provider: 'copilot',
				title: 'Session',
				status: SessionStatus.Idle,
				createdAt: new Date(1).toISOString(),
				modifiedAt: new Date(1).toISOString(),
				workingDirectories: ['file:///repo'],
			};
			if (sessionAgentMergeEnabled) {
				stateManager.restoreSession(session, []);
			} else {
				stateManager.createSession(session);
			}
			stateManager.setSessionConfig('agent:/session', {
				schema: { type: 'object', properties: {} },
				values: {
					...(isolation ? { [SessionConfigKey.Isolation]: isolation } : {}),
					...(sessionAgentMergeEnabled ? { [SessionConfigKey.AgentMerge]: { enabled: true } } : {}),
				},
			});
		}
		const configurationService = new class extends mock<IAgentConfigurationService>() {
			override getRootValue(_schema: never, key: string) {
				return (key === AgentMergeConfigKey.Enabled ? agentMergeEnabled : undefined) as never;
			}
		}();
		return disposables.add(new AgentHostPullRequestOperationContribution(
			stateManager,
			disposables.add(new InstantiationService()),
			nullGitStateService,
			createStatusService(status, onDidChangePullRequestStatus),
			configurationService,
			new NullLogService(),
		));
	}

	test('advertises PR operations for GitHub branches with uncommitted changes', () => {
		const provider = createContribution();

		const operations = provider.getOperations({ sessionKey: 'agent:/session', gitState: githubBranchWithUncommittedChanges, changesetKind: ChangesetKind.Session, changesetUri: '' });

		assert.deepStrictEqual(operations?.map(op => op.id), ['create-pr', 'create-pr-auto-merge', 'create-pr-auto-squash', 'create-pr-auto-rebase', 'create-draft-pr']);
	});

	test('advertises Agent Merge variants as the last ready and draft Create PR options when Agent Merge is enabled', () => {
		const provider = createContribution(undefined, undefined, Event.None, true);

		const operations = provider.getOperations({ sessionKey: 'agent:/session', gitState: githubBranchWithUncommittedChanges, changesetKind: ChangesetKind.Session, changesetUri: '' });

		assert.deepStrictEqual(operations?.map(({ id, label }) => ({ id, label })), [
			{ id: 'create-pr', label: 'Create PR' },
			{ id: 'create-pr-auto-merge', label: 'Create PR (Auto-Merge)' },
			{ id: 'create-pr-auto-squash', label: 'Create PR (Auto-Squash)' },
			{ id: 'create-pr-auto-rebase', label: 'Create PR (Auto-Rebase)' },
			{ id: 'create-pr-agent-merge', label: 'Create PR & Agent Merge' },
			{ id: 'create-draft-pr', label: 'Create Draft PR' },
			{ id: 'create-draft-pr-agent-merge', label: 'Create Draft PR & Agent Merge' },
		]);
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
		const operationsFor = (status?: IAgentHostPullRequestStatus, agentMergeEnabled = false) => createContribution(status, undefined, Event.None, agentMergeEnabled, agentMergeEnabled)
			.getOperations({ sessionKey: 'agent:/session', gitState: githubBranchWithUncommittedChanges, gitHubState: pullRequestForBranch, changesetKind: ChangesetKind.Session, changesetUri: '' })
			?.map(op => op.id);

		assert.deepStrictEqual({
			unresolved: operationsFor(undefined),
			merged: operationsFor(openPullRequest({ state: 'merged' })),
			draft: operationsFor(openPullRequest({ draft: true, viewerCanEnableAutoMerge: true })),
			agentMergeDraftWaiting: operationsFor(openPullRequest({ draft: true, agentMergeReadyForReview: false }), true),
			agentMergeDraftUnknown: operationsFor(openPullRequest({ draft: true }), true),
			agentMergeDraftReady: operationsFor(openPullRequest({ draft: true, agentMergeReadyForReview: true }), true),
			mergeable: operationsFor(openPullRequest({ mergeReady: true })),
			blocked: operationsFor(openPullRequest({ viewerCanEnableAutoMerge: true })),
			autoMerging: operationsFor(openPullRequest({ autoMergeEnabled: true })),
			noAutoMerge: operationsFor(openPullRequest()),
		}, {
			unresolved: undefined,
			merged: undefined,
			draft: ['pr-mark-ready', 'pr-enable-auto-merge'],
			agentMergeDraftWaiting: ['pr-mark-ready-with-agent-merge'],
			agentMergeDraftUnknown: ['pr-mark-ready-with-agent-merge'],
			agentMergeDraftReady: ['pr-mark-ready'],
			mergeable: ['pr-merge'],
			blocked: ['pr-enable-auto-merge'],
			autoMerging: ['pr-disable-auto-merge'],
			noAutoMerge: undefined,
		});
	});

	test('uses the same label for the Agent Merge Mark Ready operation', () => {
		const operations = createContribution(openPullRequest({ draft: true, agentMergeReadyForReview: false }), undefined, Event.None, true, true)
			.getOperations({ sessionKey: 'agent:/session', gitState: githubBranchWithUncommittedChanges, gitHubState: pullRequestForBranch, changesetKind: ChangesetKind.Session, changesetUri: '' });

		assert.deepStrictEqual(operations?.map(({ id, label }) => ({ id, label })), [{
			id: AgentHostPullRequestLifecycleOperationHandler.OPERATION_MARK_READY_WITH_AGENT_MERGE,
			label: 'Mark Ready',
		}]);
	});

});
