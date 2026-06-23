/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Disposable, DisposableMap, toDisposable, type IDisposable } from '../../../base/common/lifecycle.js';
import { parseChangesetUri } from '../common/changesetUri.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { ActionType } from '../common/state/sessionActions.js';
import { ChangesetOperationScope, ChangesetOperationStatus, ChangesetOperationTargetKind, ISessionGitHubState, readSessionGitHubState, readSessionGitState, type ChangesetOperation, type ErrorInfo, type ISessionGitState } from '../common/state/sessionState.js';
import type { IChangesetOperationContribution, IAgentHostChangesetOperationService, IChangesetOperationContext, IChangesetOperationHandler, IChangesetOperationRegistry } from '../common/agentHostChangesetOperationService.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { IAgentHostChangesetSubscriptionService } from '../common/agentHostChangesetSubscriptionService.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { AgentHostPullRequestOperationContribution } from './agentHostPullRequestOperationProvider.js';
import { AgentHostCommitOperationContribution } from './agentHostCommitOperationProvider.js';
import { AgentHostDiscardChangesOperationContribution } from './agentHostDiscardChangesOperationProvider.js';
import { AgentHostSyncOperationContribution } from './agentHostSyncOperationProvider.js';

export class AgentHostChangesetOperationService extends Disposable implements IAgentHostChangesetOperationService {
	declare readonly _serviceBrand: undefined;

	private readonly _registry: IChangesetOperationRegistry;
	private readonly _handlerRegistrations = this._register(new DisposableMap<IChangesetOperationContribution>());
	private readonly _changesetOperationHandlers = new Map<string, IChangesetOperationHandler>();
	private readonly _inFlightOperations = new Map<string, Promise<InvokeChangesetOperationResult>>();

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		@IAgentHostGitStateService private readonly _gitStateService: IAgentHostGitStateService,
		@IAgentHostChangesetSubscriptionService private readonly _changesetSubscriptions: IAgentHostChangesetSubscriptionService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();
		this._registry = {
			registerChangesetOperationHandler: (operationId, handler) => this._registerChangesetOperationHandler(operationId, handler),
			onDidChangeOperations: sessionKey => this.updateOperations(sessionKey),
			refreshSessionGitState: sessionKey => this._refreshSessionGitStateAndOperations(sessionKey),
		};

		this._register(this.registerContribution(instantiationService.createInstance(AgentHostPullRequestOperationContribution, this._stateManager)));
		this._register(this.registerContribution(instantiationService.createInstance(AgentHostCommitOperationContribution, this._stateManager)));
		this._register(this.registerContribution(instantiationService.createInstance(AgentHostSyncOperationContribution, this._stateManager)));
		this._register(this.registerContribution(instantiationService.createInstance(AgentHostDiscardChangesOperationContribution, this._stateManager)));
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

	updateOperations(sessionKey: string, changeset?: string, gitState?: ISessionGitState, gitHubState?: ISessionGitHubState): void {
		if (!gitState) {
			const sessionState = this._stateManager.getSessionState(sessionKey);
			gitState = readSessionGitState(sessionState?._meta);
			if (!gitState) {
				return;
			}
		}

		if (!gitHubState) {
			const sessionState = this._stateManager.getSessionState(sessionKey);
			gitHubState = readSessionGitHubState(sessionState?.summary._meta);
		}

		const changesets = changeset
			? [changeset]
			: this._changesetSubscriptions.getSessionSubscriptions(sessionKey);

		for (const changeset of changesets) {
			const parsed = parseChangesetUri(changeset);
			if (!parsed) {
				continue;
			}

			const operations = this._getOperations({
				sessionKey,
				changesetUri: changeset,
				changesetKind: parsed.kind,
				gitState,
				gitHubState
			});

			this._stateManager.dispatchServerAction(changeset, {
				type: ActionType.ChangesetOperationsChanged,
				operations: operations ? [...operations] : undefined,
			});
		}
	}

	private _getOperations(context: IChangesetOperationContext): readonly ChangesetOperation[] | undefined {
		const operations: ChangesetOperation[] = [];
		for (const contribution of this._handlerRegistrations.keys()) {
			const contributed = contribution.getOperations(context);
			if (contributed) {
				operations.push(...contributed);
			}
		}
		return operations.length > 0 ? operations : undefined;
	}

	private async _refreshSessionGitStateAndOperations(sessionKey: string): Promise<void> {
		const gitState = await this._gitStateService.refreshSessionGitState(sessionKey);
		if (!gitState) {
			return;
		}

		this.updateOperations(sessionKey, undefined, gitState);
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
		if (op.status === ChangesetOperationStatus.Disabled) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Operation '${params.operationId}' is disabled on changeset ${params.channel}`);
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

		return this._invokeChangesetOperation(handler, params);
	}

	private _invokeChangesetOperation(
		handler: IChangesetOperationHandler,
		params: InvokeChangesetOperationParams,
	): Promise<InvokeChangesetOperationResult> {
		const operationKey = `${params.channel}\x00${params.operationId}\x00${JSON.stringify(params.target ?? null)}`;
		const inFlightOperationResult = this._inFlightOperations.get(operationKey);
		if (inFlightOperationResult) {
			return inFlightOperationResult;
		}

		this._stateManager.dispatchServerAction(params.channel, {
			type: ActionType.ChangesetOperationStatusChanged,
			operationId: params.operationId,
			status: ChangesetOperationStatus.Running,
		});

		const operationPromise = handler.invoke(params, CancellationToken.None)
			.then(result => {
				this._stateManager.dispatchServerAction(params.channel, {
					type: ActionType.ChangesetOperationStatusChanged,
					operationId: params.operationId,
					status: ChangesetOperationStatus.Idle,
				});

				return result;
			})
			.catch((error) => {
				this._stateManager.dispatchServerAction(params.channel, {
					type: ActionType.ChangesetOperationStatusChanged,
					operationId: params.operationId,
					status: ChangesetOperationStatus.Error,
					error: toChangesetOperationError(error),
				});

				throw error;
			})
			.finally(() => {
				if (this._inFlightOperations.get(operationKey) === operationPromise) {
					this._inFlightOperations.delete(operationKey);
				}
			});

		this._inFlightOperations.set(operationKey, operationPromise);

		return operationPromise;
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

function toChangesetOperationError(error: unknown): ErrorInfo {
	const message = toErrorMessage(error);
	return error instanceof Error
		? { errorType: error.name, message, stack: error.stack }
		: { errorType: 'Error', message };
}
