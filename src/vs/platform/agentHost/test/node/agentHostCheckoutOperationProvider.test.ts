/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { NullLogService } from '../../../log/common/log.js';
import { buildBranchChangesetUri, buildUncommittedChangesetUri, ChangesetKind } from '../../common/changesetUri.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { ChangesetOperationScope, ChangesetOperationStatus, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostCheckoutOperationContribution } from '../../node/agentHostCheckoutOperationProvider.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';

const sessionKey = 'agent:/session';
const uncommittedChangesetUri = buildUncommittedChangesetUri(sessionKey);
const branchChangesetUri = buildBranchChangesetUri(sessionKey);

suite('AgentHostCheckoutOperationContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createContribution(): { contribution: AgentHostCheckoutOperationContribution; stateManager: AgentHostStateManager } {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		stateManager.createSession({
			resource: sessionKey,
			provider: 'copilot',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date(1).toISOString(),
			modifiedAt: new Date(1).toISOString(),
		});
		const contribution = disposables.add(new AgentHostCheckoutOperationContribution(
			stateManager,
			disposables.add(new InstantiationService()),
		));
		return { contribution, stateManager };
	}

	test('advertises Checkout only for the uncommitted changeset on a new session', () => {
		const { contribution, stateManager } = createContribution();

		const checkoutOperation = contribution.getOperations({
			sessionKey,
			changesetUri: uncommittedChangesetUri,
			changesetKind: ChangesetKind.Uncommitted,
		})?.[0];
		const branchOperations = contribution.getOperations({
			sessionKey,
			changesetUri: branchChangesetUri,
			changesetKind: ChangesetKind.Branch,
		});

		stateManager.dispatchServerAction(sessionKey, { type: ActionType.SessionReady });
		const readySessionOperations = contribution.getOperations({
			sessionKey,
			changesetUri: uncommittedChangesetUri,
			changesetKind: ChangesetKind.Uncommitted,
		});

		assert.deepStrictEqual({ checkoutOperation, branchOperations, readySessionOperations }, {
			checkoutOperation: {
				id: 'checkout',
				label: 'Checkout',
				group: 'checkout',
				scopes: [ChangesetOperationScope.Changeset],
				status: ChangesetOperationStatus.Idle,
			},
			branchOperations: undefined,
			readySessionOperations: undefined,
		});
	});
});
