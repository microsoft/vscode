/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable, type IDisposable } from '../../../base/common/lifecycle.js';
import { equals, stableStringify } from '../../../base/common/objects.js';
import { buildBranchChangesetUri, changesetSession, ChangesetKind, parseChangesetUri, parseFolderChangesetOwnerUri } from '../common/changesetUri.js';
import { isMultiRootSession } from '../common/agentHostWorkingDirectories.js';
import { resolveBranchChangesetScopeForOwner, resolveBranchChangesetScopeForSource, resolveChangesetOwnerScope, resolveGitHubStateFolder } from './agentHostBranchChangesetScope.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { ActionType } from '../common/state/sessionActions.js';
import { ChangesetOperationScope, ChangesetOperationStatus, ChangesetOperationTargetKind, isAhpChatChannel, ISessionGitHubState, readFolderGitHubState, readSessionGitHubState, readSessionGitState, type ChangesetOperation, type ErrorInfo, type ISessionGitState } from '../common/state/sessionState.js';
import { AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID, AGENT_HOST_DISCARD_CHANGES_OPERATION_ID, AGENT_HOST_MERGE_CHANGESET_OPERATION_ID, AGENT_HOST_PULL_REQUEST_OPERATION_IDS, type IChangesetOperationContribution, type IAgentHostChangesetOperationService, type IChangesetOperationContext, type IChangesetOperationHandler, type IChangesetOperationRegistry } from '../common/agentHostChangesetOperationService.js';
import { getCapturedCredentialSourceKey, type IAgentHostCredentialSource } from '../common/agentHostCredentials.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { IAgentHostChangesetSubscriptionService } from '../common/agentHostChangesetSubscriptionService.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { resolveChangesetSubscriptions } from './agentHostChangesetSummary.js';
import { IAgentHostChatOwnershipService } from './agentHostChatOwnershipService.js';

/**
 * Whether operations on a changeset of `kind` wait for the session's Git
 * state. Turn, Session, and Working Set changesets can offer operations on
 * their tracked edits without it.
 */
function requiresGitState(kind: ChangesetKind | undefined): boolean {
	return kind !== ChangesetKind.Turn && kind !== ChangesetKind.Session && kind !== ChangesetKind.WorkingSet;
}

/** Whether `operation` can be advertised before the Git state is known, or in a folder without Git. */
function isAvailableWithoutGitState(operation: ChangesetOperation): boolean {
	return operation.id === AGENT_HOST_DISCARD_CHANGES_OPERATION_ID || operation.id === AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID;
}

export class AgentHostChangesetOperationService extends Disposable implements IAgentHostChangesetOperationService {
	declare readonly _serviceBrand: undefined;

	private readonly _registry: IChangesetOperationRegistry;
	private readonly _handlerRegistrations = this._register(new DisposableMap<IChangesetOperationContribution>());
	private readonly _changesetOperationHandlers = new Map<string, IChangesetOperationHandler>();
	private readonly _credentialSourceIds = new WeakMap<IAgentHostCredentialSource, number>();
	private _nextCredentialSourceId = 0;
	private readonly _inFlightOperations = new Map<string, Promise<InvokeChangesetOperationResult>>();
	private readonly _operationLanes = new Map<string, Promise<InvokeChangesetOperationResult>>();
	private readonly _pendingSessionOperationUpdates = new Set<string>();
	private readonly _pendingOwnerOperationUpdates = new Set<string>();
	private _operationUpdateScheduled = false;

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostGitStateService private readonly _gitStateService: IAgentHostGitStateService,
		@IAgentHostChangesetSubscriptionService private readonly _changesetSubscriptions: IAgentHostChangesetSubscriptionService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostChatOwnershipService private readonly _chatOwnership: IAgentHostChatOwnershipService,
	) {
		super();

		this._registry = {
			registerChangesetOperationHandler: (operationId, handler) => this._registerChangesetOperationHandler(operationId, handler),
			refreshSessionGitState: (sessionKey, source) => this._refreshGitState(sessionKey, source),
			onDidChangeOperations: sessionKey => this.scheduleRelatedOperationsUpdate(sessionKey),
		};
	}

	override dispose(): void {
		this._pendingSessionOperationUpdates.clear();
		this._pendingOwnerOperationUpdates.clear();
		super.dispose();
	}

	private async _refreshGitState(owner: string, credentials?: IAgentHostCredentialSource): Promise<void> {
		const scope = resolveBranchChangesetScopeForOwner(this._stateManager, owner);
		const source = scope?.sourceUri ?? owner;
		const session = scope?.sessionUri ?? (isAhpChatChannel(owner) ? this._chatOwnership.getChatOwner(owner) : undefined);
		await Promise.all([
			this._gitStateService.refreshSessionGitState(source, undefined, credentials),
			...(session && session !== source ? [this._gitStateService.refreshSessionGitState(session, undefined, credentials)] : []),
		]);
	}

	registerContribution(contribution: IChangesetOperationContribution): IDisposable {
		if (this._handlerRegistrations.has(contribution)) {
			throw new Error('Changeset operation contribution already registered');
		}
		const handlerRegistrations = new DisposableStore();
		const registeredHandlers = new Set<IDisposable>();
		const registry: IChangesetOperationRegistry = {
			...this._registry,
			registerChangesetOperationHandler: (operationId, handler) => {
				const registration = handlerRegistrations.add(this._registry.registerChangesetOperationHandler(operationId, handler));
				registeredHandlers.add(registration);
				return registration;
			},
		};
		try {
			const registration = contribution.registerHandlers(registry);
			for (const registeredHandler of registeredHandlers) {
				handlerRegistrations.deleteAndLeak(registeredHandler);
			}
			handlerRegistrations.dispose();
			this._handlerRegistrations.set(contribution, registration);
		} catch (error) {
			handlerRegistrations.dispose();
			contribution.dispose();
			throw error;
		}
		return toDisposable(() => {
			this._handlerRegistrations.deleteAndDispose(contribution);
			contribution.dispose();
		});
	}

	getOperations(sessionKey: string, changeset: string, gitState?: ISessionGitState, gitHubState?: ISessionGitHubState): readonly ChangesetOperation[] {
		const parsed = parseChangesetUri(changeset);
		if (!parsed) {
			return [];
		}
		const ownerKey = parsed.ownerUri;
		sessionKey = this._containingSession(parsed) ?? sessionKey;
		const sourceKey = resolveChangesetOwnerScope(this._stateManager, ownerKey).sourceUri;

		if (!gitState) {
			gitState = this._gitStateService.getSessionGitState?.(sourceKey)
				?? (isAhpChatChannel(sourceKey) && !this._chatOwnership.isRegisteredDefaultChat(sourceKey) ? undefined : readSessionGitState(this._stateManager.getSessionState(sessionKey)?._meta));
			if (!gitState && requiresGitState(parsed.kind)) {
				return [];
			}
		}

		// Each folder has its own GitHub state; callers may pass the session folder's.
		const gitHubFolder = resolveGitHubStateFolder(this._stateManager, ownerKey);
		if (!gitHubFolder.isSessionFolder || !gitHubState) {
			gitHubState = readFolderGitHubState(this._stateManager.getSessionState(sessionKey)?._meta, gitHubFolder.folderKey);
		}

		// In a multi-folder session the per-turn `turn` and `compare-turns`
		// changesets advertise NO operations. Enforcing this centrally here — the
		// single chokepoint both the publish path (`_publishChangesetDiffs`) and
		// the recompute path (`updateOperations`) funnel through — guarantees the
		// rule can't be undone by a later recompute on active-turn / git-state
		// flips. Single-folder sessions and all other changeset kinds are
		// unaffected.
		if (this._shouldSuppressOperations(sourceKey, parsed.kind)) {
			return [];
		}

		const operations = this._getOperations({
			sessionKey,
			ownerKey,
			sourceKey,
			changesetUri: changeset,
			changesetKind: parsed.kind,
			gitState,
			gitHubState
		});
		return gitState ? operations : operations.filter(isAvailableWithoutGitState);
	}

	/**
	 * Whether operations must be suppressed for a changeset of `kind` in the
	 * given session. The per-turn `turn` and `compare-turns` changesets carry no
	 * operations in a multi-root session; every other kind and single-folder
	 * sessions are unaffected. Uses the effective working directories so the rule
	 * is provider-agnostic and tracks dynamic root changes.
	 */
	private _shouldSuppressOperations(sourceKey: string, kind: ChangesetKind): boolean {
		return (kind === ChangesetKind.Turn || kind === ChangesetKind.Compare)
			&& isMultiRootSession(this._configurationService.getEffectiveWorkingDirectories(sourceKey));
	}

	private _getOperations(context: IChangesetOperationContext): readonly ChangesetOperation[] {
		let operations: ChangesetOperation[] = [];
		for (const contribution of this._handlerRegistrations.keys()) {
			const contributed = contribution.getOperations(context);
			if (contributed) {
				operations.push(...contributed);
			}
		}
		// The Working Set only offers operations on its own changes, not the repository's.
		if (context.changesetKind === ChangesetKind.WorkingSet) {
			operations = operations.filter(operation => operation.id === AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID || operation.id === AGENT_HOST_DISCARD_CHANGES_OPERATION_ID);
		}
		const parsed = parseChangesetUri(context.changesetUri);
		const ownerKey = context.ownerKey ?? parsed?.ownerUri ?? context.sessionKey;
		const sourceKey = context.sourceKey ?? resolveChangesetOwnerScope(this._stateManager, ownerKey).sourceUri;
		const scopedOwner = isAhpChatChannel(ownerKey) || !!parseFolderChangesetOwnerUri(ownerKey);
		const isBranchChangeset = context.changesetKind === ChangesetKind.Branch;
		// Every folder scope's Branch and Uncommitted changesets offer pull request
		// workflows resolved against that scope, so they stay available regardless
		// of which changeset is selected; the direct merge stays with the default
		// chat's Branch changeset.
		const allowsPullRequestOperations = isBranchChangeset || context.changesetKind === ChangesetKind.Uncommitted;
		const allowsMergeOperation = isBranchChangeset && this._chatOwnership.isRegisteredDefaultChat(sourceKey);
		const scopedOperations = scopedOwner
			? operations.filter(operation => operation.id === AGENT_HOST_MERGE_CHANGESET_OPERATION_ID
				? allowsMergeOperation
				: allowsPullRequestOperations || (operation.group !== 'pull-request' && !AGENT_HOST_PULL_REQUEST_OPERATION_IDS.has(operation.id)))
			: operations;

		// Operations are disabled while a turn is active so the working tree /
		// branch state can't be mutated mid-request.
		const parsedChangeset = parseChangesetUri(context.changesetUri);
		const sessionKey = (parsedChangeset && this._containingSession(parsedChangeset)) ?? context.sessionKey;
		if (this._stateManager.hasActiveTurn(sessionKey)) {
			return scopedOperations.map(operation => ({
				...operation,
				status: ChangesetOperationStatus.Disabled
			}));
		}

		return scopedOperations;
	}

	updateOperations(sessionKey: string, changeset?: string, gitState?: ISessionGitState, gitHubState?: ISessionGitHubState): void {
		if (!changeset) {
			for (const owner of this._getOperationOwners(sessionKey)) {
				this._updateOwnerOperations(owner, gitState, gitHubState);
			}
			return;
		}
		this._updateOwnerOperations(sessionKey, gitState, gitHubState, changeset);
	}

	scheduleRelatedOperationsUpdate(resourceKey: string): void {
		this._pendingSessionOperationUpdates.add(resourceKey);
		this._scheduleOperationUpdates();
	}

	scheduleOwnerOperationsUpdate(ownerKey: string): void {
		this._pendingOwnerOperationUpdates.add(ownerKey);
		this._scheduleOperationUpdates();
	}

	private _scheduleOperationUpdates(): void {
		if (this._operationUpdateScheduled) {
			return;
		}
		this._operationUpdateScheduled = true;
		queueMicrotask(() => this._flushOperationUpdates());
	}

	private _flushOperationUpdates(): void {
		if (this._store.isDisposed) {
			return;
		}
		try {
			while (this._pendingSessionOperationUpdates.size > 0 || this._pendingOwnerOperationUpdates.size > 0) {
				const sessions = [...this._pendingSessionOperationUpdates];
				const owners = new Set(this._pendingOwnerOperationUpdates);
				this._pendingSessionOperationUpdates.clear();
				this._pendingOwnerOperationUpdates.clear();
				for (const session of sessions) {
					for (const owner of this._getOperationOwners(session)) {
						owners.add(owner);
					}
				}
				for (const owner of owners) {
					this._updateOwnerOperations(owner);
				}
			}
		} finally {
			this._operationUpdateScheduled = false;
		}
	}

	private _getOperationOwners(sessionKey: string): readonly string[] {
		if (parseFolderChangesetOwnerUri(sessionKey)) {
			return [sessionKey];
		}

		if (isAhpChatChannel(sessionKey)) {
			return [sessionKey, resolveBranchChangesetScopeForSource(this._stateManager, sessionKey).ownerUri];
		}

		const owners = new Set<string>([sessionKey]);
		const session = this._stateManager.getSessionState(sessionKey);
		for (const chatState of session?.chats ?? []) {
			owners.add(chatState.resource);
			owners.add(resolveBranchChangesetScopeForSource(this._stateManager, chatState.resource).ownerUri);
		}
		return [...owners];
	}

	private _updateOwnerOperations(sessionKey: string, gitState?: ISessionGitState, gitHubState?: ISessionGitHubState, changeset?: string): void {
		const ownerKey = changeset
			? parseChangesetUri(changeset)?.ownerUri ?? sessionKey
			: sessionKey;
		const parsedChangeset = changeset ? parseChangesetUri(changeset) : undefined;
		const containingSessionKey = changeset
			? (parsedChangeset && this._containingSession(parsedChangeset)) ?? sessionKey
			: resolveChangesetOwnerScope(this._stateManager, sessionKey).sessionUri;
		const changesets = changeset
			? [changeset]
			: resolveChangesetSubscriptions(
				ownerKey,
				this._changesetSubscriptions.getSessionSubscriptions(ownerKey),
				this._stateManager.getSessionState(containingSessionKey)?.config?.values,
				buildBranchChangesetUri(resolveBranchChangesetScopeForSource(this._stateManager, ownerKey).ownerUri),
			);

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
			if (parsed && this._shouldSuppressOperations(resolveChangesetOwnerScope(this._stateManager, parsed.ownerUri).sourceUri, parsed.kind)) {
				this._dispatchOperationsChanged(changeset, []);
				continue;
			}
			unsuppressed.push(changeset);
		}

		if (unsuppressed.length === 0) {
			return;
		}

		if (!gitState) {
			const sourceKey = resolveBranchChangesetScopeForOwner(this._stateManager, ownerKey)?.sourceUri ?? ownerKey;
			gitState = this._gitStateService.getSessionGitState?.(sourceKey)
				?? (!isAhpChatChannel(sourceKey) || this._chatOwnership.isRegisteredDefaultChat(sourceKey)
					? readSessionGitState(this._stateManager.getSessionState(containingSessionKey)?._meta)
					: undefined);
		}

		if (!gitHubState) {
			const sessionState = this._stateManager.getSessionState(containingSessionKey);
			gitHubState = readSessionGitHubState(sessionState?._meta, sessionState?.workingDirectories?.[0]);
		}

		for (const changeset of unsuppressed) {
			// Defer initial publication without Git state, but clear previously advertised actions.
			if (!gitState && requiresGitState(parseChangesetUri(changeset)?.kind) && !this._stateManager.getChangesetState(changeset)?.operations?.length) {
				continue;
			}
			const operations = this.getOperations(ownerKey, changeset, gitState, gitHubState);
			this._dispatchOperationsChanged(changeset, operations);
		}
	}

	private _dispatchOperationsChanged(changeset: string, operations: readonly ChangesetOperation[]): void {
		if (equals(this._stateManager.getChangesetState(changeset)?.operations, operations)) {
			return;
		}
		this._stateManager.dispatchServerAction(changeset, {
			type: ActionType.ChangesetOperationsChanged,
			operations: [...operations],
		});
	}

	async invokeChangesetOperation(params: InvokeChangesetOperationParams, source?: IAgentHostCredentialSource): Promise<InvokeChangesetOperationResult> {
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
		const containingSession = parsed && this._containingSession(parsed);
		if (containingSession && this._stateManager.hasActiveTurn(containingSession)) {
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
			&& isMultiRootSession(this._configurationService.getEffectiveWorkingDirectories(resolveChangesetOwnerScope(this._stateManager, parsed.ownerUri).sourceUri))) {
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

		return this._invokeChangesetOperation(handler, params, source);
	}

	private _invokeChangesetOperation(
		handler: IChangesetOperationHandler,
		params: InvokeChangesetOperationParams,
		source?: IAgentHostCredentialSource,
	): Promise<InvokeChangesetOperationResult> {
		const operationLane = `${params.channel}\x00${params.operationId}`;
		const executionSource = handler.captureCredentialSource?.(params, source) ?? source;
		let sourceId = 0;
		if (source) {
			sourceId = this._credentialSourceIds.get(source) ?? ++this._nextCredentialSourceId;
			this._credentialSourceIds.set(source, sourceId);
		}
		const captureKey = executionSource ? getCapturedCredentialSourceKey(executionSource) ?? '' : '';
		const operationKey = `${operationLane}\x00${sourceId}\x00${captureKey}\x00${stableStringify({ target: params.target ?? null, _meta: params._meta ?? null })}`;
		const inFlightOperationResult = this._inFlightOperations.get(operationKey);
		if (inFlightOperationResult && this._operationLanes.get(operationLane) === inFlightOperationResult) {
			return inFlightOperationResult;
		}

		const runningOperation = this._operationLanes.get(operationLane);
		const operationPromise = runningOperation
			? runningOperation.then(
				() => this._executeChangesetOperation(handler, params, executionSource),
				() => this._executeChangesetOperation(handler, params, executionSource),
			)
			: this._executeChangesetOperation(handler, params, executionSource);
		this._operationLanes.set(operationLane, operationPromise);
		this._inFlightOperations.set(operationKey, operationPromise);

		const clearOperation = () => {
			if (this._inFlightOperations.get(operationKey) === operationPromise) {
				this._inFlightOperations.delete(operationKey);
			}
			if (this._operationLanes.get(operationLane) === operationPromise) {
				this._operationLanes.delete(operationLane);
			}
		};
		void operationPromise.then(clearOperation, clearOperation);

		return operationPromise;
	}

	private async _executeChangesetOperation(handler: IChangesetOperationHandler, params: InvokeChangesetOperationParams, source?: IAgentHostCredentialSource): Promise<InvokeChangesetOperationResult> {
		this._stateManager.dispatchServerAction(params.channel, {
			type: ActionType.ChangesetOperationStatusChanged,
			operationId: params.operationId,
			status: ChangesetOperationStatus.Running,
		});

		try {
			const result = await handler.invoke(params, CancellationToken.None, source);
			this._stateManager.dispatchServerAction(params.channel, {
				type: ActionType.ChangesetOperationStatusChanged,
				operationId: params.operationId,
				status: ChangesetOperationStatus.Idle,
			});

			return result;
		} catch (error) {
			this._stateManager.dispatchServerAction(params.channel, {
				type: ActionType.ChangesetOperationStatusChanged,
				operationId: params.operationId,
				status: ChangesetOperationStatus.Error,
				error: toChangesetOperationError(error),
			});

			throw error;
		}
	}

	private _containingSession(parsed: { readonly ownerUri: string; readonly sessionUri: string | undefined }): string | undefined {
		return changesetSession(parsed, chat => this._chatOwnership.getChatOwner(chat));
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
