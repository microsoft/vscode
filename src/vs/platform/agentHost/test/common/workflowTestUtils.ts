/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { WorkflowRun } from '../../../workflow/common/workflow.js';
import { buildDefaultChatUri } from '../../common/state/sessionState.js';

export function workflowStoreRun(session = 'copilot:/workflow-store'): WorkflowRun {
	return {
		id: 'test/run', version: 1, revision: 0, session, chat: buildDefaultChatUri(session),
		task: 'Complete the assignment', inputs: {}, stopAfter: 'plan', status: 'running', checkpointIndex: 0,
		receipts: [], firstTurns: {}, createdAt: 1, updatedAt: 1, activityAt: 1, nextWakeAt: 100,
		snapshot: {
			id: 'test/workflow', version: 1, label: 'Test workflow',
			checkpoints: [{
				id: 'plan', label: 'Plan', instructions: 'Save the plan', inputs: {},
				type: { id: 'test/plan', version: 1, label: 'Plan', instructions: 'Save the plan', proofSchema: { type: 'object' }, completion: { kind: 'reported' } },
			}],
		},
	};
}
