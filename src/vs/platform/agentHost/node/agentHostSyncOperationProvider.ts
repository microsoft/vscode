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

	private _registry: IChangesetOperationRegistry | undefined;

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	registerHandlers(registry: IChangesetOperationRegistry): IDisposable {
		this._registry = registry;
		const store = new DisposableStore();
		const getSessionState = (sessionKey: string) => this._stateManager.getSessionState(sessionKey);
		const handler = this._instantiationService.createInstance(AgentHostSyncOperationHandler, getSessionState, (sessionKey: string) => this._onSynced(sessionKey));
		store.add(registry.registerChangesetOperationHandler(AgentHostSyncOperationHandler.OPERATION_SYNC, handler));
		store.add({ dispose: () => { this._registry = undefined; } });
		return store;
	}

	getOperations({ sessionKey, gitState }: IChangesetOperationContext): ChangesetOperation[] | undefined {
		// New Session
		const state = this._stateManager.getSessionState(sessionKey);
		if (state?.lifecycle === SessionLifecycle.Creating && (gitState?.uncommittedChanges ?? 0) > 0) {
			return undefined;
		}

		// No upstream branch or no outgoing changes
		if (!gitState?.upstreamBranchName || (gitState?.outgoingChanges ?? 0) === 0) {
			return undefined;
		}

		return [{
			id: AgentHostSyncOperationHandler.OPERATION_SYNC,
			label: localize('agentHost.changeset.sync', "Sync Changes {0}↑", gitState.outgoingChanges),
			icon: 'sync',
			group: 'sync',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		} satisfies ChangesetOperation];
	}

	private async _onSynced(sessionKey: string): Promise<void> {
		this._registry?.onDidChangeOperations(sessionKey);
		await this._registry?.refreshSessionGitState(sessionKey);
	}
}
