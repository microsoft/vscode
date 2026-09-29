/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { NullLogService } from '../../../log/common/log.js';
import { buildSessionChangesetUri, buildUncommittedChangesetUri, ChangesetKind } from '../../common/changesetUri.js';
import { ChangesetOperationScope, ChangesetOperationStatus, SessionStatus, type ISessionGitState } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostSyncOperationContribution } from '../../node/agentHostSyncOperationProvider.js';

const sessionKey = 'agent:/session';
const sessionChangesetUri = buildSessionChangesetUri(sessionKey);
const uncommittedChangesetUri = buildUncommittedChangesetUri(sessionKey);

const gitStateWithOutgoingChanges: ISessionGitState = {
	branchName: 'feature/test',
	upstreamBranchName: 'origin/feature/test',
	outgoingChanges: 2,
};

const gitStateWithIncomingChanges: ISessionGitState = {
	...gitStateWithOutgoingChanges,
	incomingChanges: 1,
	outgoingChanges: 0,
};

suite('AgentHostSyncOperationContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createContribution(isNewSession = false): AgentHostSyncOperationContribution {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		if (isNewSession) {
			stateManager.createSession({
				resource: sessionKey,
				provider: 'copilot',
				title: 'Session',
				status: SessionStatus.Idle,
				createdAt: new Date(1).toISOString(),
				modifiedAt: new Date(1).toISOString(),
			});
		}
		return disposables.add(new AgentHostSyncOperationContribution(
			stateManager,
			disposables.add(new InstantiationService()),
		));
	}

	test('advertises sync when there are outgoing changes', () => {
		const provider = createContribution();

		const operations = provider.getOperations({
			sessionKey,
			changesetUri: sessionChangesetUri,
			changesetKind: ChangesetKind.Session,
			gitState: gitStateWithOutgoingChanges
		});

		assert.deepStrictEqual(operations?.map(op => ({ id: op.id, label: op.label })), [{ id: 'sync', label: 'Sync Changes 2\u2191' }]);
	});

	test('advertises sync on the uncommitted changeset of a clean draft that is only behind its upstream', () => {
		const provider = createContribution(true);

		const operations = provider.getOperations({
			sessionKey,
			changesetUri: uncommittedChangesetUri,
			changesetKind: ChangesetKind.Uncommitted,
			gitState: gitStateWithIncomingChanges,
		});

		assert.deepStrictEqual(operations, [{
			id: 'sync',
			label: 'Sync Changes 1\u2193',
			icon: 'sync',
			group: 'sync',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		}]);
	});

	test('advertises incoming sync when the outgoing count is absent', () => {
		const provider = createContribution();
		const operations = provider.getOperations({
			sessionKey,
			changesetUri: uncommittedChangesetUri,
			changesetKind: ChangesetKind.Uncommitted,
			gitState: { ...gitStateWithIncomingChanges, outgoingChanges: undefined },
		});

		assert.deepStrictEqual(operations?.map(op => op.label), ['Sync Changes 1\u2193']);
	});

	test('shows both incoming and outgoing counts for a diverged branch', () => {
		const provider = createContribution();
		const operations = provider.getOperations({
			sessionKey,
			changesetUri: sessionChangesetUri,
			changesetKind: ChangesetKind.Session,
			gitState: { ...gitStateWithOutgoingChanges, incomingChanges: 1 },
		});

		assert.deepStrictEqual(operations?.map(op => op.label), ['Sync Changes 1\u2193 2\u2191']);
	});

	test('does not advertise sync without incoming or outgoing changes', () => {
		const provider = createContribution();

		const operations = [0, undefined].map(count => provider.getOperations({
			sessionKey,
			changesetUri: sessionChangesetUri,
			changesetKind: ChangesetKind.Session,
			gitState: { ...gitStateWithOutgoingChanges, incomingChanges: count, outgoingChanges: count },
		}));

		assert.deepStrictEqual(operations, [undefined, undefined]);
	});

	test('does not advertise incoming sync without an upstream', () => {
		const provider = createContribution();
		const operations = provider.getOperations({
			sessionKey,
			changesetUri: uncommittedChangesetUri,
			changesetKind: ChangesetKind.Uncommitted,
			gitState: { ...gitStateWithIncomingChanges, upstreamBranchName: undefined },
		});

		assert.strictEqual(operations, undefined);
	});

	test('does not advertise incoming sync on a draft with uncommitted changes', () => {
		const provider = createContribution(true);
		const operations = provider.getOperations({
			sessionKey,
			changesetUri: uncommittedChangesetUri,
			changesetKind: ChangesetKind.Uncommitted,
			gitState: { ...gitStateWithIncomingChanges, uncommittedChanges: 1 },
		});

		assert.strictEqual(operations, undefined);
	});
});
