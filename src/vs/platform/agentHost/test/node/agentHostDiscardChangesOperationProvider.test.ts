/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { NullLogService } from '../../../log/common/log.js';
import { buildBranchChangesetUri, buildSessionChangesetUri, buildUncommittedChangesetUri, ChangesetKind } from '../../common/changesetUri.js';
import { ChangesetOperationScope, ChangesetOperationStatus } from '../../common/state/sessionState.js';
import { AgentHostDiscardChangesOperationHandler } from '../../node/agentHostDiscardChangesOperationHandler.js';
import { AgentHostDiscardChangesOperationContribution } from '../../node/agentHostDiscardChangesOperationProvider.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';

const sessionKey = 'agent:/session';

suite('AgentHostDiscardChangesOperationContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createContribution(): AgentHostDiscardChangesOperationContribution {
		return disposables.add(new AgentHostDiscardChangesOperationContribution(
			disposables.add(new AgentHostStateManager(new NullLogService())),
			disposables.add(new InstantiationService()),
		));
	}

	test('advertises resource-scoped discard for Branch, non-empty Uncommitted, and Session Changes', () => {
		const contribution = createContribution();
		const contexts = [
			{ changesetUri: buildBranchChangesetUri(sessionKey), changesetKind: ChangesetKind.Branch, gitState: { uncommittedChanges: 0 } },
			{ changesetUri: buildUncommittedChangesetUri(sessionKey), changesetKind: ChangesetKind.Uncommitted, gitState: { uncommittedChanges: 1 } },
			{ changesetUri: buildUncommittedChangesetUri(sessionKey), changesetKind: ChangesetKind.Uncommitted, gitState: { uncommittedChanges: 0 } },
			{ changesetUri: buildSessionChangesetUri(sessionKey), changesetKind: ChangesetKind.Session, gitState: { uncommittedChanges: 1 } },
		];

		const operations = contexts.map(context => contribution.getOperations({ sessionKey, ...context }));

		assert.deepStrictEqual(operations, [
			[{
				id: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
				label: 'Discard Changes',
				confirmation: 'Are you sure you want to discard the changes in \'{0}\'? This action cannot be undone.',
				icon: 'discard',
				scopes: [ChangesetOperationScope.Resource],
				status: ChangesetOperationStatus.Idle,
			}],
			[{
				id: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
				label: 'Discard Changes',
				confirmation: 'Are you sure you want to discard the changes in \'{0}\'? This action cannot be undone.',
				icon: 'discard',
				scopes: [ChangesetOperationScope.Resource],
				status: ChangesetOperationStatus.Idle,
			}],
			[],
			[{
				id: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
				label: 'Discard Changes',
				confirmation: 'Are you sure you want to discard the session\'s changes to \'{0}\'? Changes made outside of the session will be kept, except in a file the session created, which is deleted along with any later changes to it. This action cannot be undone.',
				icon: 'discard',
				scopes: [ChangesetOperationScope.Resource],
				status: ChangesetOperationStatus.Idle,
			}],
		]);
	});
});
