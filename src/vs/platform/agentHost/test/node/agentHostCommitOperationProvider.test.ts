/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { NullLogService } from '../../../log/common/log.js';
import { buildBranchChangesetUri, buildSessionChangesetUri, buildUncommittedChangesetUri, ChangesetKind } from '../../common/changesetUri.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { SessionStatus, type ISessionGitState } from '../../common/state/sessionState.js';
import { AgentHostCommitOperationContribution } from '../../node/agentHostCommitOperationProvider.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';

const sessionKey = 'agent:/session';
const branchChangesetUri = buildBranchChangesetUri(sessionKey);
const sessionChangesetUri = buildSessionChangesetUri(sessionKey);
const uncommittedChangesetUri = buildUncommittedChangesetUri(sessionKey);

const gitStateWithUncommittedChanges: ISessionGitState = {
	branchName: 'feature/test',
	uncommittedChanges: 1,
};

suite('AgentHostCommitOperationContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createContribution(isolation?: 'folder' | 'worktree'): AgentHostCommitOperationContribution {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		if (isolation) {
			stateManager.createSession({
				resource: sessionKey,
				provider: 'copilot',
				title: 'Session',
				status: SessionStatus.Idle,
				createdAt: new Date(1).toISOString(),
				modifiedAt: new Date(1).toISOString(),
				workingDirectories: ['file:///repo'],
			});
			stateManager.setSessionConfig(sessionKey, {
				schema: { type: 'object', properties: {} },
				values: { [SessionConfigKey.Isolation]: isolation },
			});
		}
		return disposables.add(new AgentHostCommitOperationContribution(
			stateManager,
			disposables.add(new InstantiationService()),
		));
	}

	test('advertises commit on the uncommitted changeset when there are uncommitted changes', () => {
		const provider = createContribution();

		const operations = provider.getOperations({ sessionKey, changesetUri: uncommittedChangesetUri, changesetKind: ChangesetKind.Uncommitted, gitState: gitStateWithUncommittedChanges });

		assert.deepStrictEqual(operations?.map(op => op.id), ['commit']);
	});

	test('does not advertise commit without uncommitted changes', () => {
		const provider = createContribution();

		const operations = provider.getOperations({ sessionKey, changesetUri: uncommittedChangesetUri, changesetKind: ChangesetKind.Uncommitted, gitState: { ...gitStateWithUncommittedChanges, uncommittedChanges: 0 } });

		assert.deepStrictEqual(operations?.map(op => op.id), []);
	});

	test('advertises commit for a new session without uncommitted changes', () => {
		const provider = createContribution('worktree');

		const operations = provider.getOperations({ sessionKey, changesetUri: uncommittedChangesetUri, changesetKind: ChangesetKind.Uncommitted, gitState: { ...gitStateWithUncommittedChanges, uncommittedChanges: 0 } });

		assert.deepStrictEqual(operations?.map(op => op.id), ['commit']);
	});

	test('advertises commit on every folder session changeset when there are uncommitted changes', () => {
		const provider = createContribution('folder');

		const actual = [
			provider.getOperations({ sessionKey, changesetUri: branchChangesetUri, changesetKind: ChangesetKind.Branch, gitState: gitStateWithUncommittedChanges }),
			provider.getOperations({ sessionKey, changesetUri: sessionChangesetUri, changesetKind: ChangesetKind.Session, gitState: gitStateWithUncommittedChanges }),
			provider.getOperations({ sessionKey, changesetUri: uncommittedChangesetUri, changesetKind: ChangesetKind.Uncommitted, gitState: gitStateWithUncommittedChanges }),
		];

		assert.deepStrictEqual(actual.map(operations => operations.map(op => op.id)), [['commit'], ['commit'], ['commit']]);
	});

	test('does not advertise commit on a worktree branch changeset without a pull request', () => {
		const provider = createContribution('worktree');

		const operations = provider.getOperations({ sessionKey, changesetUri: branchChangesetUri, changesetKind: ChangesetKind.Branch, gitState: gitStateWithUncommittedChanges });

		assert.deepStrictEqual(operations.map(op => op.id), []);
	});

	test('advertises commit on the session changeset only for a pull request on the current branch', () => {
		const provider = createContribution();

		const actual = [
			provider.getOperations({ sessionKey, changesetUri: sessionChangesetUri, changesetKind: ChangesetKind.Session, gitState: gitStateWithUncommittedChanges, gitHubState: { pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'], pullRequestBranchName: 'feature/test' } }),
			provider.getOperations({ sessionKey, changesetUri: sessionChangesetUri, changesetKind: ChangesetKind.Session, gitState: gitStateWithUncommittedChanges, gitHubState: { pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'], pullRequestBranchName: 'feature/other' } }),
		];

		assert.deepStrictEqual(actual.map(operations => operations?.map(op => op.id)), [['commit'], []]);
	});
});
