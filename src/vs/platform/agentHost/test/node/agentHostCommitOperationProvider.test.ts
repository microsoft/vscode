/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { NullLogService } from '../../../log/common/log.js';
import { buildSessionChangesetUri, buildUncommittedChangesetUri, ChangesetKind } from '../../common/changesetUri.js';
import type { ISessionGitState } from '../../common/state/sessionState.js';
import { AgentHostCommitOperationContribution } from '../../node/agentHostCommitOperationProvider.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';

const sessionKey = 'agent:/session';
const uncommittedChangesetUri = buildUncommittedChangesetUri(sessionKey);

const gitStateWithUncommittedChanges: ISessionGitState = {
	branchName: 'feature/test',
	uncommittedChanges: 1,
};

suite('AgentHostCommitOperationContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createContribution(): AgentHostCommitOperationContribution {
		return disposables.add(new AgentHostCommitOperationContribution(
			disposables.add(new AgentHostStateManager(new NullLogService())),
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

		assert.strictEqual(operations, undefined);
	});

	test('advertises commit on the session changeset when there are uncommitted changes', () => {
		const provider = createContribution();

		const operations = provider.getOperations({ sessionKey, changesetUri: buildSessionChangesetUri(sessionKey), changesetKind: ChangesetKind.Session, gitState: gitStateWithUncommittedChanges });

		assert.deepStrictEqual(operations?.map(op => op.id), undefined);
	});
});
