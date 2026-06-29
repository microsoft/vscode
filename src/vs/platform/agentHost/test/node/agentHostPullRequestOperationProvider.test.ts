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
import type { ISessionGitHubState, ISessionGitState } from '../../common/state/sessionState.js';
import type { IAgentHostGitStateService } from '../../common/agentHostGitStateService.js';
import { ChangesetKind } from '../../common/changesetUri.js';

const nullGitStateService = new class implements IAgentHostGitStateService {
	declare readonly _serviceBrand: undefined;
	readonly onDidRefreshSessionGitState = Event.None;
	async refreshSessionGitState(): Promise<void> { }
	async getSessionGitHubState(): Promise<ISessionGitHubState | undefined> { return undefined; }
	async setSessionGitHubState(): Promise<void> { }
	async attachSessionGitHubPullRequest(): Promise<void> { }
};

const githubBranchWithUncommittedChanges: ISessionGitState = {
	hasGitHubRemote: true,
	branchName: 'feature/test',
	uncommittedChanges: 1,
	outgoingChanges: 0,
};

suite('AgentHostPullRequestOperationContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createContribution(): AgentHostPullRequestOperationContribution {
		return disposables.add(new AgentHostPullRequestOperationContribution(
			disposables.add(new AgentHostStateManager(new NullLogService())),
			disposables.add(new InstantiationService()),
			nullGitStateService,
		));
	}

	test('advertises PR operations for GitHub branches with uncommitted changes', () => {
		const provider = createContribution();

		const operations = provider.getOperations({ sessionKey: 'agent:/session', gitState: githubBranchWithUncommittedChanges, changesetKind: ChangesetKind.Session, changesetUri: '' });

		assert.deepStrictEqual(operations?.map(op => op.id), ['create-pr', 'create-pr-auto-merge', 'create-pr-auto-squash', 'create-pr-auto-rebase', 'create-draft-pr']);
	});

	test('does not advertise PR operations without GitHub branch changes', () => {
		const provider = createContribution();

		const actual = [
			provider.getOperations({ sessionKey: 'agent:/session', gitState: { ...githubBranchWithUncommittedChanges, hasGitHubRemote: false }, changesetKind: ChangesetKind.Session, changesetUri: '' }),
			provider.getOperations({ sessionKey: 'agent:/session', gitState: { ...githubBranchWithUncommittedChanges, uncommittedChanges: 0, outgoingChanges: 0 }, changesetKind: ChangesetKind.Session, changesetUri: '' }),
		];

		assert.deepStrictEqual(actual, [undefined, undefined]);
	});
});
