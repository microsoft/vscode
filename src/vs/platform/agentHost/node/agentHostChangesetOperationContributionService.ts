/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, toDisposable, type IDisposable } from '../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { buildSessionChangesetUri, buildUncommittedChangesetUri, ChangesetKind } from '../common/changesetUri.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { ActionType } from '../common/state/sessionActions.js';
import { ChangesetOperationScope, ChangesetOperationTargetKind, readSessionGitState, type ChangesetOperation, type ISessionGitState } from '../common/state/sessionState.js';
import type { IChangesetOperationContribution, IChangesetOperationContributionService, IChangesetOperationContext, IChangesetOperationHandler, IChangesetOperationRegistry } from '../common/changesetOperation.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { AgentHostSessionGitStateService } from './agentHostSessionGitStateService.js';

export class AgentHostChangesetOperationContributionService extends Disposable implements IChangesetOperationContributionService {

	private readonly _handlerRegistrations = this._register(new DisposableMap<IChangesetOperationContribution>());
	private readonly _changesetOperationHandlers = new Map<string, IChangesetOperationHandler>();
	private readonly _inFlightOperations = new Map<string, Promise<InvokeChangesetOperationResult>>();
	private readonly _registry: IChangesetOperationRegistry;

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		private readonly _sessionGitStateService: AgentHostSessionGitStateService,
	) {
		super();
		this._registry = {
			registerChangesetOperationHandler: (operationId, handler) => this._registerChangesetOperationHandler(operationId, handler),
			onDidChangeOperations: sessionKey => this.refreshOperationsFromCurrentState(sessionKey),
			refreshSessionGitState: sessionKey => this._refreshSessionGitStateAndOperations(sessionKey),
		};
	}

	registerContribution(contribution: IChangesetOperationContribution): IDisposable {
		if (this._handlerRegistrations.has(contribution)) {
			throw new Error('Changeset operation contribution already registered');
		}
		this._handlerRegistrations.set(contribution, contribution.registerHandlers(this._registry));
		return toDisposable(() => {
			this._handlerRegistrations.deleteAndDispose(contribution);
			contribution.dispose();
		});
	}

	getOperations(context: IChangesetOperationContext): readonly ChangesetOperation[] | undefined {
		const operations: ChangesetOperation[] = [];
		for (const contribution of this._handlerRegistrations.keys()) {
			const contributed = contribution.getOperations(context);
			if (contributed) {
				operations.push(...contributed);
			}
		}
		return operations.length > 0 ? operations : undefined;
	}

	refreshOperationsFromCurrentState(sessionKey: string): void {
		const gitState = readSessionGitState(this._stateManager.getSessionState(sessionKey)?._meta);
		if (!gitState) {
			return;
		}
		this.updateOperations(sessionKey, gitState);
	}

	updateOperations(sessionKey: string, gitState: ISessionGitState): void {
		this._updateOperationsForChangeset(sessionKey, buildSessionChangesetUri(sessionKey), ChangesetKind.Session, gitState);
		this._updateOperationsForChangeset(sessionKey, buildUncommittedChangesetUri(sessionKey), ChangesetKind.Uncommitted, gitState);
	}

	private _updateOperationsForChangeset(sessionKey: string, changesetUri: string, changesetKind: ChangesetKind, gitState: ISessionGitState): void {
		const operations = this.getOperations({ sessionKey, changesetUri, changesetKind, gitState });
		this._stateManager.dispatchServerAction(changesetUri, {
			type: ActionType.ChangesetOperationsChanged,
			operations: operations ? [...operations] : undefined,
		});
	}

	private async _refreshSessionGitStateAndOperations(sessionKey: string): Promise<void> {
		const gitState = await this._sessionGitStateService.refreshSessionGitState(sessionKey);
		if (gitState) {
			this.updateOperations(sessionKey, gitState);
		}
	}

	async invokeChangesetOperation(params: InvokeChangesetOperationParams): Promise<InvokeChangesetOperationResult> {
		const state = this._stateManager.getChangesetState(params.channel);
		if (!state) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Changeset not found: ${params.channel}`);
		}
		const op = state.operations?.find(o => o.id === params.operationId);
		if (!op) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Unknown operation '${params.operationId}' on changeset ${params.channel}`);
		}
		const targetKind: ChangesetOperationScope = params.target?.kind === ChangesetOperationTargetKind.Resource
			? ChangesetOperationScope.Resource
			: params.target?.kind === ChangesetOperationTargetKind.Range
				? ChangesetOperationScope.Range
				: ChangesetOperationScope.Changeset;
		if (!op.scopes.includes(targetKind)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Operation '${params.operationId}' does not support scope '${targetKind}' (allowed: ${op.scopes.join(', ')})`);
		}
		const handler = this._changesetOperationHandlers.get(params.operationId);
		if (!handler) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `No operation handler registered for '${params.operationId}' on changeset ${params.channel}`);
		}
		const operationKey = `${params.channel}\x00${params.operationId}\x00${JSON.stringify(params.target ?? null)}`;
		const inFlight = this._inFlightOperations.get(operationKey);
		if (inFlight) {
			return inFlight;
		}
		const invoked = handler.invoke(params, CancellationToken.None).finally(() => {
			if (this._inFlightOperations.get(operationKey) === invoked) {
				this._inFlightOperations.delete(operationKey);
			}
		});
		this._inFlightOperations.set(operationKey, invoked);
		return invoked;
	}

	private _registerChangesetOperationHandler(operationId: string, handler: IChangesetOperationHandler): IDisposable {
		if (this._changesetOperationHandlers.has(operationId)) {
			throw new Error(`Changeset operation handler already registered for '${operationId}'`);
		}
		this._changesetOperationHandlers.set(operationId, handler);
		return toDisposable(() => {
			if (this._changesetOperationHandlers.get(operationId) === handler) {
				this._changesetOperationHandlers.delete(operationId);
			}
		});
	}
}
