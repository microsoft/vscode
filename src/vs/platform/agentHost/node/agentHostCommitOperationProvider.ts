/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ChangesetKind } from '../common/changesetUri.js';
import type { IChangesetOperationContribution, IChangesetOperationContext, IChangesetOperationRegistry } from '../common/changesetOperation.js';
import { ChangesetOperationScope, ChangesetOperationStatus, type ChangesetOperation } from '../common/state/sessionState.js';
import { AgentHostCommitOperationHandler } from './agentHostCommitOperationHandler.js';
import { AgentHostStateManager } from './agentHostStateManager.js';

export class AgentHostCommitOperationContribution extends Disposable implements IChangesetOperationContribution {

	private _registry: IChangesetOperationRegistry | undefined;

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	registerHandlers(registry: IChangesetOperationRegistry): IDisposable {
		this._registry = registry;
		const store = new DisposableStore();
		const getSessionState = (sessionKey: string) => this._stateManager.getSessionState(sessionKey);
		const handler = this._instantiationService.createInstance(AgentHostCommitOperationHandler, getSessionState, sessionKey => this._onCommitted(sessionKey));
		store.add(registry.registerChangesetOperationHandler(AgentHostCommitOperationHandler.OPERATION_COMMIT, handler));
		store.add({ dispose: () => { this._registry = undefined; } });
		return store;
	}

	getOperations({ changesetKind, gitState }: IChangesetOperationContext): ChangesetOperation[] | undefined {
		if (changesetKind !== ChangesetKind.Uncommitted || (gitState.uncommittedChanges ?? 0) <= 0) {
			return undefined;
		}

		return [{
			id: AgentHostCommitOperationHandler.OPERATION_COMMIT,
			label: localize('agentHost.changeset.commit', "Commit"),
			scopes: [ChangesetOperationScope.Changeset],
			icon: 'git-commit',
			status: ChangesetOperationStatus.Idle,
		}];
	}

	private async _onCommitted(sessionKey: string): Promise<void> {
		this._registry?.onDidChangeOperations(sessionKey);
		await this._registry?.refreshSessionGitState(sessionKey);
	}
}
