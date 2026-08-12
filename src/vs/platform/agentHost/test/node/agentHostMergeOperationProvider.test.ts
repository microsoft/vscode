/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { NullLogService } from '../../../log/common/log.js';
import { buildBranchChangesetUri, ChangesetKind } from '../../common/changesetUri.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { SessionStatus, type ISessionGitHubState, type ISessionGitState } from '../../common/state/sessionState.js';
import { AgentHostMergeOperationContribution } from '../../node/agentHostMergeOperationProvider.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import type { IAgentHostGitStateService } from '../../common/agentHostGitStateService.js';

const sessionKey = 'agent:/session';
const branchChangesetUri = buildBranchChangesetUri(sessionKey);
const gitStateWithChanges: ISessionGitState = {
	branchName: 'agents/session',
	baseBranchName: 'main',
	uncommittedChanges: 1,
	outgoingChanges: 0,
};

const nullGitStateService = new class implements IAgentHostGitStateService {
	declare readonly _serviceBrand: undefined;
	readonly onDidRefreshSessionGitState = Event.None;
	readonly onDidChangeSessionGitHubState = Event.None;
	async refreshSessionGitState(): Promise<void> { }
	async resolveSessionBaseBranchName(): Promise<string | undefined> { return 'main'; }
	async setSessionGitHubState(_sessionKey: string, _state: ISessionGitHubState): Promise<void> { }
	async recordSessionMerge(): Promise<void> { }
	async attachSessionGitHubPullRequest(): Promise<void> { }
	async attachSessionGitHubReferences(): Promise<void> { }
};

suite('AgentHostMergeOperationContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createContribution(options: { readonly isolation?: 'folder' | 'worktree'; readonly linkedWorktree?: boolean } = {}): AgentHostMergeOperationContribution {
		const isolation = options.isolation ?? 'worktree';
		const workingDirectory = isolation === 'worktree' || options.linkedWorktree ? 'file:///repo.worktrees/session' : 'file:///repo';
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		stateManager.createSession({
			resource: sessionKey,
			provider: 'copilot',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date(1).toISOString(),
			modifiedAt: new Date(1).toISOString(),
			workingDirectories: [workingDirectory],
			project: { uri: 'file:///repo', displayName: 'repo' },
		});
		stateManager.setSessionConfig(sessionKey, {
			schema: { type: 'object', properties: {} },
			values: {
				[SessionConfigKey.Isolation]: isolation,
				[SessionConfigKey.Branch]: 'main',
			}
		});
		stateManager.dispatchServerAction(sessionKey, { type: ActionType.SessionReady });
		return disposables.add(new AgentHostMergeOperationContribution(
			stateManager,
			disposables.add(new InstantiationService()),
			nullGitStateService,
		));
	}

	test('advertises Merge Changes for a ready worktree with changes and no pull request', () => {
		const contribution = createContribution();

		const operations = contribution.getOperations({
			sessionKey,
			changesetUri: branchChangesetUri,
			changesetKind: ChangesetKind.Branch,
			gitState: gitStateWithChanges,
		});

		assert.deepStrictEqual(operations?.map(operation => ({
			id: operation.id,
			group: operation.group,
			scopes: operation.scopes,
			confirmation: operation.confirmation,
		})), [{
			id: 'merge',
			group: 'merge',
			scopes: ['changeset'],
			confirmation: 'Merge the worktree changes into the parent repository? Any uncommitted worktree changes will be committed first.',
		}]);
	});

	test('does not advertise Merge Changes outside an eligible worktree branch changeset', () => {
		const worktreeContribution = createContribution();
		const folderContribution = createContribution({ isolation: 'folder' });
		const actual = [
			folderContribution.getOperations({ sessionKey, changesetUri: branchChangesetUri, changesetKind: ChangesetKind.Branch, gitState: gitStateWithChanges }),
			worktreeContribution.getOperations({ sessionKey, changesetUri: branchChangesetUri, changesetKind: ChangesetKind.Session, gitState: gitStateWithChanges }),
			worktreeContribution.getOperations({ sessionKey, changesetUri: branchChangesetUri, changesetKind: ChangesetKind.Branch, gitState: { ...gitStateWithChanges, uncommittedChanges: 0, outgoingChanges: 0 } }),
			worktreeContribution.getOperations({ sessionKey, changesetUri: branchChangesetUri, changesetKind: ChangesetKind.Branch, gitState: { ...gitStateWithChanges, uncommittedChanges: 0, outgoingChanges: 2, hasBaseBranchChanges: false } }),
			worktreeContribution.getOperations({
				sessionKey,
				changesetUri: branchChangesetUri,
				changesetKind: ChangesetKind.Branch,
				gitState: gitStateWithChanges,
				gitHubState: { pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'], pullRequestBranchName: 'agents/session' },
			}),
		];

		assert.deepStrictEqual(actual, [undefined, undefined, undefined, undefined, undefined]);
	});

	test('advertises Merge Changes for an adopted linked worktree that retains folder isolation', () => {
		const contribution = createContribution({ isolation: 'folder', linkedWorktree: true });

		const operations = contribution.getOperations({
			sessionKey,
			changesetUri: branchChangesetUri,
			changesetKind: ChangesetKind.Branch,
			gitState: gitStateWithChanges,
		});

		assert.deepStrictEqual(operations?.map(operation => operation.id), ['merge']);
	});
});
