/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import type { IChangesetOperationContribution, IChangesetOperationContext, IChangesetOperationRegistry } from '../common/agentHostChangesetOperationService.js';
import { ChangesetKind } from '../common/changesetUri.js';
import { ChangesetOperationScope, ChangesetOperationStatus, SessionLifecycle, type ChangesetOperation } from '../common/state/sessionState.js';
import { AgentHostCheckoutOperationHandler } from './agentHostCheckoutOperationHandler.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';

export class AgentHostCheckoutOperationContribution extends Disposable implements IChangesetOperationContribution {

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
		const handler = this._instantiationService.createInstance(AgentHostCheckoutOperationHandler, getSessionState, (sessionKey: string) => this._onCheckedOut(sessionKey));
		store.add(registry.registerChangesetOperationHandler(AgentHostCheckoutOperationHandler.OPERATION_CHECKOUT, handler));
		store.add({ dispose: () => { this._registry = undefined; } });
		return store;
	}

	getOperations({ sessionKey, changesetKind }: IChangesetOperationContext): ChangesetOperation[] | undefined {
		const state = this._stateManager.getSessionState(sessionKey);
		if (
			state?.lifecycle !== SessionLifecycle.Creating ||
			this._stateManager.isUnusedDraft(sessionKey) !== true ||
			changesetKind !== ChangesetKind.Uncommitted
		) {
			return undefined;
		}

		return [{
			id: AgentHostCheckoutOperationHandler.OPERATION_CHECKOUT,
			label: localize('agentHost.changeset.checkout', "Checkout"),
			group: 'checkout',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		} satisfies ChangesetOperation];
	}

	private _onCheckedOut(sessionKey: string): void {
		void this._registry?.refreshSessionGitState(sessionKey);
	}
}
