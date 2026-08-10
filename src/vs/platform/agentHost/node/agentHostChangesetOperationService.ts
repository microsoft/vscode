/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Disposable, DisposableMap, toDisposable, type IDisposable } from '../../../base/common/lifecycle.js';
import { ChangesetKind, parseChangesetUri } from '../common/changesetUri.js';
import { isMultiRootSession } from '../common/agentHostWorkingDirectories.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { ActionType } from '../common/state/sessionActions.js';
import { ChangesetOperationScope, ChangesetOperationStatus, ChangesetOperationTargetKind, ISessionGitHubState, readSessionGitHubState, readSessionGitState, type ChangesetOperation, type ErrorInfo, type ISessionGitState } from '../common/state/sessionState.js';
import type { IChangesetOperationContribution, IAgentHostChangesetOperationService, IChangesetOperationContext, IChangesetOperationHandler, IChangesetOperationRegistry } from '../common/agentHostChangesetOperationService.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { IAgentHostChangesetSubscriptionService } from '../common/agentHostChangesetSubscriptionService.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';

export class AgentHostChangesetOperationService extends Disposable implements IAgentHostChangesetOperationService {
	declare readonly _serviceBrand: undefined;

	private readonly _registry: IChangesetOperationRegistry;
	private readonly _handlerRegistrations = this._register(new DisposableMap<IChangesetOperationContribution>());
	private readonly _changesetOperationHandlers = new Map<string, IChangesetOperationHandler>();
	private readonly _inFlightOperations = new Map<string, Promise<InvokeChangesetOperationResult>>();

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostGitStateService private readonly _gitStateService: IAgentHostGitStateService,
		@IAgentHostChangesetSubscriptionService private readonly _changesetSubscriptions: IAgentHostChangesetSubscriptionService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
	) {
		super();

		this._registry = {
			registerChangesetOperationHandler: (operationId, handler) => this._registerChangesetOperationHandler(operationId, handler),
			refreshSessionGitState: sessionKey => this._gitStateService.refreshSessionGitState(sessionKey),
			onDidChangeOperations: sessionKey => this.updateOperations(sessionKey),
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

	getOperations(sessionKey: string, changeset: string, gitState?: ISessionGitState, gitHubState?: ISessionGitHubState): readonly ChangesetOperation[] {
		if (!gitState) {
			const sessionState = this._stateManager.getSessionState(sessionKey);
			gitState = readSessionGitState(sessionState?._meta);
			if (!gitState) {
				return [];
			}
		}

		if (!gitHubState) {
			gitHubState = readSessionGitHubState(this._stateManager.getSessionState(sessionKey)?._meta);
		}

		const parsed = parseChangesetUri(changeset);
		if (!parsed) {
			return [];
		}

		// In a multi-folder session the per-turn `turn` and `compare-turns`
		// changesets advertise NO operations. Enforcing this centrally here — the
		// single chokepoint both the publish path (`_publishChangesetDiffs`) and
		// the recompute path (`updateOperations`) funnel through — guarantees the
		// rule can't be undone by a later recompute on active-turn / git-state
		// flips. Single-folder sessions and all other changeset kinds are
		// unaffected.
		if (this._shouldSuppressOperations(sessionKey, parsed.kind)) {
			return [];
		}

		return this._getOperations({
			sessionKey,
			changesetUri: changeset,
			changesetKind: parsed.kind,
			gitState,
			gitHubState
		});
	}

	/**
	 * Whether operations must be suppressed for a changeset of `kind` in the
	 * given session. The per-turn `turn` and `compare-turns` changesets carry no
	 * operations in a multi-root session; every other kind and single-folder
	 * sessions are unaffected. Uses the effective working directories so the rule
	 * is provider-agnostic and tracks dynamic root changes.
	 */
	private _shouldSuppressOperations(sessionKey: string, kind: ChangesetKind): boolean {
		return (kind === ChangesetKind.Turn || kind === ChangesetKind.Compare)
			&& isMultiRootSession(this._configurationService.getEffectiveWorkingDirectories(sessionKey));
	}

	private _getOperations(context: IChangesetOperationContext): readonly ChangesetOperation[] {
		const operations: ChangesetOperation[] = [];
		for (const contribution of this._handlerRegistrations.keys()) {
			const contributed = contribution.getOperations(context);
			if (contributed) {
				operations.push(...contributed);
			}
		}

		// Operations are disabled while a turn is active so the working tree /
		// branch state can't be mutated mid-request.
		if (this._stateManager.hasActiveTurn(context.sessionKey)) {
			return operations.map(operation => ({
				...operation,
				status: ChangesetOperationStatus.Disabled
			}));
		}

		return operations;
	}

	updateOperations(sessionKey: string, changeset?: string, gitState?: ISessionGitState, gitHubState?: ISessionGitHubState): void {
		const changesets = changeset
			? [changeset]
			: this._changesetSubscriptions.getSessionSubscriptions(sessionKey);

		// Clear the suppressed per-turn / compare-turns changesets FIRST, before
		// the git-state gate below. A root transition (e.g. the Editor Window
		// adding a second folder) can fire a recompute while the session's git
		// state is not yet resolved; without this, the early `return` on absent
		// git state would leave stale operations advertised on those changesets.
		// Dispatching an empty list is safe for an unknown changeset (it is
		// dropped without advancing the sequence).
		const unsuppressed: string[] = [];
		for (const changeset of changesets) {
			const parsed = parseChangesetUri(changeset);
			if (parsed && this._shouldSuppressOperations(sessionKey, parsed.kind)) {
				this._stateManager.dispatchServerAction(changeset, {
					type: ActionType.ChangesetOperationsChanged,
					operations: [],
				});
				continue;
			}
			unsuppressed.push(changeset);
		}

		if (unsuppressed.length === 0) {
			return;
		}

		if (!gitState) {
			const sessionState = this._stateManager.getSessionState(sessionKey);
			gitState = readSessionGitState(sessionState?._meta);
			if (!gitState) {
				return;
			}
		}

		if (!gitHubState) {
			const sessionState = this._stateManager.getSessionState(sessionKey);
			gitHubState = readSessionGitHubState(sessionState?._meta);
		}

		for (const changeset of unsuppressed) {
			const operations = this.getOperations(sessionKey, changeset, gitState, gitHubState);

			this._stateManager.dispatchServerAction(changeset, {
				type: ActionType.ChangesetOperationsChanged,
				operations: [...operations],
			});
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
		if (op.status === ChangesetOperationStatus.Disabled) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Operation '${params.operationId}' is disabled on changeset ${params.channel}`);
		}

		// Enforce the active-turn gate at invocation time too, independent of
		// the advertised operation status. A ChangesetOperationStatusChanged
		// action (e.g. a previously running operation finishing) can reset the
		// status back to Idle while a chat turn is still streaming, which would
		// otherwise re-enable invocation mid-turn and let the working tree /
		// branch state be mutated.
		const parsed = parseChangesetUri(params.channel);
		if (parsed && this._stateManager.hasActiveTurn(parsed.sessionUri)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Operation '${params.operationId}' is disabled while a turn is active on changeset ${params.channel}`);
		}

		// Re-enforce the multi-folder suppression at invocation time, independent
		// of the advertised operations. The turn / compare-turns changesets carry
		// NO operations in a multi-root session (see `getOperations`), but cached
		// advertised operations can go stale if the session became multi-root
		// after they were published (e.g. the Editor Window added a root), so a
		// stale operation must not be invocable.
		if (parsed
			&& (parsed.kind === ChangesetKind.Turn || parsed.kind === ChangesetKind.Compare)
			&& isMultiRootSession(this._configurationService.getEffectiveWorkingDirectories(parsed.sessionUri))) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Operation '${params.operationId}' is not available on a ${parsed.kind} changeset in a multi-root session: ${params.channel}`);
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
