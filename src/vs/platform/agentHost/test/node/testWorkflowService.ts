/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import type { IAgentHostWorkflowService } from '../../node/workflow/agentHostWorkflowService.js';
import type { IAgentHostWorkflowStore } from '../../node/workflow/workflowStore.js';

export { workflowStoreRun } from '../common/workflowTestUtils.js';

const unsupported = (): never => { throw new Error('Workflows are not configured in this test'); };

export const emptyTestWorkflowStore: IAgentHostWorkflowStore = {
	getRun: async () => undefined,
	getSessionRun: async () => undefined,
	listRuns: async () => [],
	listDueRuns: async () => [],
	createRun: async () => unsupported(),
	getInitialSession: async () => undefined,
	listInitialSessions: async () => [],
	updateInitialSession: async () => unsupported(),
	discardInitialSession: async () => { },
	claimStartContext: async () => undefined,
	releaseStartContext: async () => { },
	updateRun: async () => unsupported(),
	deleteSession: async () => { },
};

export function createTestWorkflowService(overrides: Partial<IAgentHostWorkflowService> = {}): IAgentHostWorkflowService {
	return {
		_serviceBrand: undefined,
		onDidChangeWorkflowRun: Event.None,
		onDidChangeOwnership: Event.None,
		getWorkflowRun: async () => undefined,
		projectSessions: async sessions => sessions,
		getSessionBootstrap: async () => undefined,
		startWorkflow: async () => unsupported(),
		controlWorkflow: async () => unsupported(),
		setWorkflowSourceEnabled: async () => unsupported(),
		setWorkflowExtensionSources: async () => unsupported(),
		ownsContinuation: () => false,
		isQuietTurn: () => false,
		onIncomingRequest: () => undefined,
		onTurnEnd: () => { },
		onDidDispatchAction: () => { },
		getCheckpoint: async () => unsupported(),
		prove: async () => unsupported(),
		reportBlocked: async () => unsupported(),
		activate: () => Disposable.None,
		...overrides,
	};
}
