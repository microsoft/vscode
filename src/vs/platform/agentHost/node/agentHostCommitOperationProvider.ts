/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import type { IChangesetOperationContribution, IChangesetOperationContext, IChangesetOperationRegistry } from '../common/agentHostChangesetOperationService.js';
import { ChangesetKind } from '../common/changesetUri.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import { ChangesetOperationScope, ChangesetOperationStatus, hasSessionPullRequestForBranch, type ChangesetOperation } from '../common/state/sessionState.js';
import { AgentHostCommitOperationHandler } from './agentHostCommitOperationHandler.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';

export class AgentHostCommitOperationContribution extends Disposable implements IChangesetOperationContribution {

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
		const handler = this._instantiationService.createInstance(AgentHostCommitOperationHandler, getSessionState, (sessionKey: string) => this._onCommitted(sessionKey));
		store.add(registry.registerChangesetOperationHandler(AgentHostCommitOperationHandler.OPERATION_COMMIT, handler));
		store.add({ dispose: () => { this._registry = undefined; } });
		return store;
	}

	getOperations({ sessionKey, changesetKind, gitHubState, gitState }: IChangesetOperationContext): ChangesetOperation[] {
		const isNewSession = this._stateManager.isUnusedDraft(sessionKey) === true;
		if (!isNewSession && (gitState?.uncommittedChanges ?? 0) <= 0) {
			return [];
		}

		const isFolderSession = this._stateManager.getSessionState(sessionKey)?.config?.values[SessionConfigKey.Isolation] === 'folder';
		if (!isFolderSession && !hasSessionPullRequestForBranch(gitHubState, gitState?.branchName) && changesetKind !== ChangesetKind.Uncommitted) {
			return [];
		}

		return [{
			id: AgentHostCommitOperationHandler.OPERATION_COMMIT,
			label: localize('agentHost.changeset.commit', "Commit"),
			icon: 'git-commit',
			group: 'commit',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		} satisfies ChangesetOperation];
	}

	private async _onCommitted(sessionKey: string): Promise<void> {
		this._registry?.onDidChangeOperations(sessionKey);
		await this._registry?.refreshSessionGitState(sessionKey);
	}
}
