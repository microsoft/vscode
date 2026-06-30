/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { NullLogService } from '../../../log/common/log.js';
import { buildSessionChangesetUri, ChangesetKind } from '../../common/changesetUri.js';
import type { ISessionGitState } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostSyncOperationContribution } from '../../node/agentHostSyncOperationProvider.js';

const sessionKey = 'agent:/session';
const sessionChangesetUri = buildSessionChangesetUri(sessionKey);

const gitStateWithOutgoingChanges: ISessionGitState = {
	branchName: 'feature/test',
	upstreamBranchName: 'origin/feature/test',
	outgoingChanges: 2,
};

suite('AgentHostSyncOperationContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createContribution(): AgentHostSyncOperationContribution {
		return disposables.add(new AgentHostSyncOperationContribution(
			disposables.add(new AgentHostStateManager(new NullLogService())),
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

		assert.deepStrictEqual(operations?.map(op => op.id), ['sync']);
	});

	test('does not advertise sync without outgoing changes', () => {
		const provider = createContribution();

		const operations = provider.getOperations({
			sessionKey,
			changesetUri: sessionChangesetUri,
			changesetKind: ChangesetKind.Session,
			gitState: { ...gitStateWithOutgoingChanges, outgoingChanges: 0 }
		});

		assert.strictEqual(operations, undefined);
	});
});
