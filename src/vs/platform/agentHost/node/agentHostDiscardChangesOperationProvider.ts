/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ChangesetKind } from '../common/changesetUri.js';
import type { IChangesetOperationContribution, IChangesetOperationContext, IChangesetOperationRegistry } from '../common/agentHostChangesetOperationService.js';
import { ChangesetOperationScope, ChangesetOperationStatus, type ChangesetOperation } from '../common/state/sessionState.js';
import { AgentHostDiscardChangesOperationHandler } from './agentHostDiscardChangesOperationHandler.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';

export class AgentHostDiscardChangesOperationContribution extends Disposable implements IChangesetOperationContribution {

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
		const handler = this._instantiationService.createInstance(AgentHostDiscardChangesOperationHandler, getSessionState, (sessionKey: string) => this._onDiscarded(sessionKey));
		store.add(registry.registerChangesetOperationHandler(AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES, handler));
		store.add({ dispose: () => { this._registry = undefined; } });

		return store;
	}

	getOperations({ changesetKind, gitState }: IChangesetOperationContext): ChangesetOperation[] {
		if (changesetKind !== ChangesetKind.Uncommitted || (gitState?.uncommittedChanges ?? 0) <= 0) {
			return [];
		}

		return [{
			id: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			label: localize('agentHost.changeset.discardChanges', "Discard Changes"),
			confirmation: localize('agentHost.changeset.discardChanges.confirmation', "Are you sure you want to discard the changes in \'{0}\'? This action cannot be undone."),
			icon: 'discard',
			scopes: [ChangesetOperationScope.Resource],
			status: ChangesetOperationStatus.Idle,
		} satisfies ChangesetOperation];
	}

	private async _onDiscarded(sessionKey: string): Promise<void> {
		this._registry?.onDidChangeOperations(sessionKey);
		await this._registry?.refreshSessionGitState(sessionKey);
	}
}
