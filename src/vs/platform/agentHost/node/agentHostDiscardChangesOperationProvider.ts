/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ChangesetKind, parseChangesetUri } from '../common/changesetUri.js';
import type { IChangesetOperationContribution, IChangesetOperationContext, IChangesetOperationRegistry } from '../common/agentHostChangesetOperationService.js';
import { ChangesetOperationScope, ChangesetOperationStatus, isAhpChatChannel, type ChangesetOperation } from '../common/state/sessionState.js';
import { isMultiRootSession } from '../common/agentHostWorkingDirectories.js';
import { getEffectiveWorkingDirectories, getSessionSummaryWorkingDirectories } from './agentConfigurationService.js';
import { AgentHostDiscardChangesOperationHandler, getLastTurn } from './agentHostDiscardChangesOperationHandler.js';
import { AgentHostFileEditRevert } from './agentHostFileEditRevert.js';
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
		const fileEditRevert = this._instantiationService.createInstance(AgentHostFileEditRevert);
		const handler = this._instantiationService.createInstance(AgentHostDiscardChangesOperationHandler, getSessionState, (sessionKey: string) => this._onDiscarded(sessionKey), fileEditRevert);
		store.add(registry.registerChangesetOperationHandler(AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES, handler));
		store.add({ dispose: () => { this._registry = undefined; } });

		return store;
	}

	getOperations({ changesetKind, changesetUri, gitState }: IChangesetOperationContext): ChangesetOperation[] {
		const confirmation = localize('agentHost.changeset.discardChanges.confirmation', "Are you sure you want to discard the changes in \'{0}\'? This action cannot be undone.");
		switch (changesetKind) {
			case ChangesetKind.Branch:
				return [this._createOperation(confirmation)];
			case ChangesetKind.Uncommitted:
				return (gitState?.uncommittedChanges ?? 0) > 0
					? [this._createOperation(confirmation)]
					: [];
			case ChangesetKind.Turn: {
				// Also offered while the turn is running, so the action is shown;
				// the operation service disables it until the turn completes.
				const parsed = parseChangesetUri(changesetUri);
				return parsed?.turnId !== undefined && getLastTurn(this._stateManager, parsed.ownerUri)?.id === parsed.turnId
					? [this._createOperation(localize('agentHost.changeset.discardTurnChanges.confirmation', "Are you sure you want to discard the last turn's changes to \'{0}\'? Changes made outside of the last turn will be kept, except in a file the last turn created, which is deleted along with any later changes to it. This action cannot be undone."))]
					: [];
			}
			case ChangesetKind.Session:
			case ChangesetKind.WorkingSet: {
				const owner = parseChangesetUri(changesetUri)?.ownerUri;
				if (owner === undefined) {
					return [];
				}
				// The session's changeset covers every chat's folders, a chat's only its own.
				const workingDirectories = isAhpChatChannel(owner)
					? getEffectiveWorkingDirectories(this._stateManager, owner)
					: getSessionSummaryWorkingDirectories(this._stateManager, owner);
				if (isMultiRootSession(workingDirectories)) {
					return [];
				}
				// Like undoing a file in the editing session's working set, discarding a Working Set file needs no confirmation,
				// and it can discard just the hunks of a range.
				return [changesetKind === ChangesetKind.WorkingSet
					? this._createOperation(undefined, [ChangesetOperationScope.Resource, ChangesetOperationScope.Range])
					: this._createOperation(localize('agentHost.changeset.discardSessionChanges.confirmation', "Are you sure you want to discard the session's changes to \'{0}\'? Changes made outside of the session will be kept, except in a file the session created, which is deleted along with any later changes to it. This action cannot be undone."))];
			}
			default:
				return [];
		}
	}

	private _createOperation(confirmation: string | undefined, scopes = [ChangesetOperationScope.Resource]): ChangesetOperation {
		return {
			id: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			label: localize('agentHost.changeset.discardChanges', "Discard Changes"),
			...(confirmation ? { confirmation } : {}),
			icon: 'discard',
			scopes,
			status: ChangesetOperationStatus.Idle,
		} satisfies ChangesetOperation;
	}

	private async _onDiscarded(sessionKey: string): Promise<void> {
		this._registry?.onDidChangeOperations(sessionKey);
		await this._registry?.refreshSessionGitState(sessionKey);
	}
}
