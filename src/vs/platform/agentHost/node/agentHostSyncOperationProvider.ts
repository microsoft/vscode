/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import type { IChangesetOperationContribution, IChangesetOperationContext, IChangesetOperationRegistry } from '../common/agentHostChangesetOperationService.js';
import { ChangesetOperationScope, ChangesetOperationStatus, SessionLifecycle, type ChangesetOperation } from '../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { AgentHostSyncOperationHandler } from './agentHostSyncOperationHandler.js';

export class AgentHostSyncOperationContribution extends Disposable implements IChangesetOperationContribution {

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	registerHandlers(registry: IChangesetOperationRegistry): IDisposable {
		const store = new DisposableStore();
		const getSessionState = (sessionKey: string) => this._stateManager.getSessionState(sessionKey);
		const handler = this._instantiationService.createInstance(AgentHostSyncOperationHandler, getSessionState);
		store.add(registry.registerChangesetOperationHandler(AgentHostSyncOperationHandler.OPERATION_SYNC, handler));
		return store;
	}

	getOperations({ sessionKey, gitState }: IChangesetOperationContext): ChangesetOperation[] | undefined {
		// New Session
		const state = this._stateManager.getSessionState(sessionKey);
		if (state?.lifecycle === SessionLifecycle.Creating && (gitState?.uncommittedChanges ?? 0) > 0) {
			return undefined;
		}

		// No upstream branch
		if (!gitState?.upstreamBranchName) {
			return undefined;
		}

		// No incoming/outgoing changes
		const incomingChanges = gitState?.incomingChanges ?? 0;
		const outgoingChanges = gitState?.outgoingChanges ?? 0;
		if (incomingChanges === 0 && outgoingChanges === 0) {
			return undefined;
		}

		const label = incomingChanges > 0
			? outgoingChanges > 0
				? localize('agentHost.changeset.syncIncomingOutgoing', "Sync Changes {0}↓ {1}↑", incomingChanges, outgoingChanges)
				: localize('agentHost.changeset.syncIncoming', "Sync Changes {0}↓", incomingChanges)
			: localize('agentHost.changeset.sync', "Sync Changes {0}↑", outgoingChanges);

		return [{
			id: AgentHostSyncOperationHandler.OPERATION_SYNC,
			label,
			icon: 'sync',
			group: 'sync',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		} satisfies ChangesetOperation];
	}
}
