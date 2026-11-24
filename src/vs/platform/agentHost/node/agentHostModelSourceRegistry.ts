/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Emitter } from '../../../base/common/event.js';
import { disposableTimeout } from '../../../base/common/async.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Disposable, MutableDisposable, toDisposable, type IDisposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import type { AuthenticateParams, IAgent, IAgentModelSource } from '../common/agent.js';
import type { IAgentHostClientTelemetryContext } from '../common/agentHostTelemetry.js';
import type { ModelSourceAuthenticateTarget } from '../common/state/protocol/commands.js';
import { ModelSourceAuthRequiredReason, ModelSourceRetentionPolicy, ModelSourceStatus, type ModelSource, type ModelSourceState, type ProtectedResourceMetadata, type RootState } from '../common/state/protocol/state.js';
import { ActionType, type ActionOrigin, type ClientModelSourceAction, type StateAction } from '../common/state/sessionActions.js';
import { AhpErrorCodes, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { ROOT_STATE_URI } from '../common/state/sessionState.js';

/** The parts of the host's state manager that {@link AgentHostModelSourceRegistry} uses. */
export interface IAgentHostModelSourceRegistryState {
	readonly rootState: RootState;
	dispatchServerAction(channel: string, action: StateAction): void;
	dispatchClientAction(channel: string, action: ClientModelSourceAction, origin: ActionOrigin, clientContext?: IAgentHostClientTelemetryContext): unknown;
	rejectClientAction(channel: string, action: StateAction, origin: ActionOrigin, reason: string): void;
}

/**
 * How long the host keeps counting a disconnected client as a contributor.
 * Advertised as the capability's `gracePeriod`.
 */
export const MODEL_SOURCE_GRACE_PERIOD = 30_000;

/** The host-reported fields of a model source, which a client never sends. */
const HOST_REPORTED_FIELDS = ['state', 'credentialNonce', 'credentialResource', 'credentialOrigins', 'accountId'] as const;

/** What the host knows about a model source beyond root state. Never published: it holds the definition and the credential. */
interface IModelSourceEntry {
	readonly provider: string;
	readonly format: string;
	/** The client's version token for {@link definition}. */
	readonly nonce: string;
	readonly definition: Record<string, unknown>;
	/** The clients that registered this definition, from each `Set`'s origin. Never in state. */
	readonly contributors: Set<string>;
	/** The source's generation. Any change to the definition or the credential issues a new one. */
	credentialNonce: string;
	credential: string | undefined;
	/** The `accountId` sent with the credential the host most recently accepted, which outlives it to say what happened to it. */
	accountId: string | undefined;
	credentialResource: ProtectedResourceMetadata | undefined;
	credentialOrigins: readonly string[] | undefined;
	state: ModelSourceState;
	/** Whether the agent lists the source's models: from its first `ready` until it is withdrawn. */
	listed: boolean;
	/** Expires a credential delivered with a lifetime. */
	readonly lease: MutableDisposable<IDisposable>;
	/**
	 * Set while the source's last contributing client has left: running turns on it finish, and then the host
	 * removes it. Cancelled when a client registers it again.
	 */
	readonly drain: MutableDisposable<CancellationTokenSource>;
}

/**
 * The host side of the AHP model source registry. Validates client
 * registrations, keeps their definitions and contributing clients privately,
 * reports each source's status, holds credentials in memory, and hands the
 * sources each agent serves to it with {@link IAgent.setModelSources}. The
 * agent owns the definition format.
 */
export class AgentHostModelSourceRegistry extends Disposable {

	private readonly _entries = new Map<string, IModelSourceEntry>();

	private readonly _onDidChange = this._register(new Emitter<void>());
	/** Fires when the sources an agent serves, or their registrations, change. */
	readonly onDidChange = this._onDidChange.event;

	constructor(
		private readonly _state: IAgentHostModelSourceRegistryState,
		private readonly _getAgent: (provider: string) => IAgent | undefined,
		private readonly _logService: ILogService,
	) {
		super();
		this._register(toDisposable(() => {
			for (const entry of this._entries.values()) {
				this._disposeEntry(entry);
			}
		}));
	}

	/** Applies a client's registry change, or rejects it through the action's `rejectionReason`. */
	handleClientAction(action: ClientModelSourceAction, clientId: string, clientSeq: number, clientContext?: IAgentHostClientTelemetryContext): void {
		const origin: ActionOrigin = { clientId, clientSeq };
		switch (action.type) {
			case ActionType.RootModelSourceRemoved:
				// Removal applies to every client. A client that still has the source configured registers it again when it reconnects.
				this._state.dispatchClientAction(ROOT_STATE_URI, action, origin, clientContext);
				this._remove(action.id);
				return;
			case ActionType.RootModelSourceSet: {
				const rejection = this._validate(action);
				if (rejection) {
					this._logService.warn(`[AgentHostModelSourceRegistry] Rejected model source ${typeof action.modelSource?.id === 'string' ? action.modelSource.id : '(invalid)'}: ${rejection}`);
					this._state.rejectClientAction(ROOT_STATE_URI, action, origin, rejection);
					return;
				}
				this._state.dispatchClientAction(ROOT_STATE_URI, action, origin, clientContext);
				this._apply(action.modelSource, action.definition, clientId);
				return;
			}
		}
	}

	/**
	 * Installs, rotates, or (with an empty token) revokes a source's
	 * credential. Throws a {@link ProtocolError} for an unknown source, a stale
	 * nonce, or a resource other than the source's credential resource.
	 */
	authenticate(params: AuthenticateParams, target: ModelSourceAuthenticateTarget): void {
		const entry = this._entries.get(target.modelSourceId);
		if (!entry || !this._findModelSource(target.modelSourceId)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'The authentication target must identify a registered model source');
		}
		if (target.credentialNonce !== entry.credentialNonce) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'The model source changed since this credential was requested');
		}
		if (!entry.credentialResource) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'The model source does not take a credential');
		}
		if (params.resource !== entry.credentialResource.resource) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'The resource must be the model source\'s credential resource');
		}
		entry.credentialNonce = generateUuid();
		entry.lease.clear();
		if (params.token) {
			entry.credential = params.token;
			entry.accountId = params.accountId;
			entry.state = { kind: ModelSourceStatus.Ready };
			entry.listed = true;
			// A static key delivered with a lifetime is a lease: it lapses unless renewed.
			if (params.expiresIn !== undefined) {
				const credentialNonce = entry.credentialNonce;
				entry.lease.value = disposableTimeout(() => {
					if (this._entries.get(target.modelSourceId) === entry && entry.credentialNonce === credentialNonce) {
						entry.credentialNonce = generateUuid();
						this._dropCredential(target.modelSourceId, entry, { kind: ModelSourceStatus.AuthRequired, reason: ModelSourceAuthRequiredReason.Expired });
					}
				}, Math.max(0, params.expiresIn) * 1000);
			}
			this._report(target.modelSourceId, entry);
			this._syncAgent(entry.provider);
		} else {
			// A revoked credential is never sent again without the user's action. `accountId` still names it.
			this._dropCredential(target.modelSourceId, entry, { kind: ModelSourceStatus.AuthRequired, reason: ModelSourceAuthRequiredReason.Revoked });
		}
	}

	/**
	 * Drops a credential the source's endpoint rejected. A client replaces it
	 * rather than sending the same one again.
	 */
	rejectCredential(id: string): void {
		const entry = this._entries.get(id);
		if (!entry?.credential) {
			return;
		}
		this._logService.warn(`[AgentHostModelSourceRegistry] The endpoint of model source ${id} rejected its credential`);
		entry.credentialNonce = generateUuid();
		this._dropCredential(id, entry, { kind: ModelSourceStatus.AuthRequired, reason: ModelSourceAuthRequiredReason.Rejected, description: localize('modelSource.credentialRejected', "The endpoint rejected the API key.") });
	}

	/**
	 * Stops counting `clientId` as a contributor once it has left. A source it
	 * was the last contributor to goes away, unless its retention is `host`:
	 * new work on it fails at once, but running turns finish before the host
	 * removes it and drops its credential.
	 */
	removeClient(clientId: string): void {
		for (const [id, entry] of [...this._entries]) {
			if (!entry.contributors.delete(clientId) || entry.contributors.size) {
				continue;
			}
			const retention = this._findModelSource(id)?.retention ?? ModelSourceRetentionPolicy.ContributingClient;
			if (retention === ModelSourceRetentionPolicy.ContributingClient) {
				this._drain(id, entry);
			}
		}
	}

	private _drain(id: string, entry: IModelSourceEntry): void {
		const cts = new CancellationTokenSource();
		entry.drain.value = cts;
		// The agent withdraws the source's models, and keeps its credential only for the turns running on it.
		this._syncAgent(entry.provider);
		const idle = this._getAgent(entry.provider)?.whenModelSourceIdle?.(id, cts.token) ?? Promise.resolve();
		idle.then(() => {
			if (!cts.token.isCancellationRequested && this._entries.get(id) === entry && entry.drain.value === cts) {
				entry.drain.clear();
				this._state.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootModelSourceRemoved, id });
				this._remove(id);
			}
		}, error => this._logService.warn(`[AgentHostModelSourceRegistry] Failed to wait for the turns on model source ${id}: ${toErrorMessage(error)}`));
	}

	private _validate(action: Extract<ClientModelSourceAction, { readonly type: ActionType.RootModelSourceSet }>): string | undefined {
		const { modelSource, definition } = action;
		if (typeof modelSource?.id !== 'string' || !modelSource.id || typeof modelSource.nonce !== 'string' || !modelSource.nonce
			|| typeof definition !== 'object' || definition === null || Array.isArray(definition)) {
			return 'A model source needs an id, a nonce, and a definition object';
		}
		const agent = this._getAgent(modelSource.provider);
		const formats = agent?.getDescriptor().capabilities?.modelSourceRegistration?.formats;
		if (!agent?.describeModelSource || !agent.setModelSources || !formats?.includes(modelSource.format)) {
			return `The agent '${modelSource.provider}' does not serve model sources in the format '${modelSource.format}'`;
		}
		if (HOST_REPORTED_FIELDS.some(field => modelSource[field] !== undefined)) {
			return 'Only the host reports a model source\'s state and credential fields';
		}
		if (modelSource.retention !== undefined && modelSource.retention !== ModelSourceRetentionPolicy.ContributingClient && modelSource.retention !== ModelSourceRetentionPolicy.Host) {
			return `Unsupported model source retention: ${modelSource.retention}`;
		}
		// The reducer keeps the credential for a re-registration, so it must not carry a different definition.
		const existing = this._entries.get(modelSource.id);
		if (existing && this._isReregistration(existing, modelSource) && !equals(existing.definition, definition)) {
			return 'A model source registered again with the same nonce must have the same definition';
		}
		return undefined;
	}

	private _isReregistration(entry: IModelSourceEntry, modelSource: ModelSource): boolean {
		return entry.provider === modelSource.provider && entry.format === modelSource.format && entry.nonce === modelSource.nonce;
	}

	private _apply(modelSource: ModelSource, definition: Record<string, unknown>, clientId: string): void {
		const previous = this._entries.get(modelSource.id);
		if (previous && this._isReregistration(previous, modelSource)) {
			// A re-registration, or a new name or retention: the reducer kept the host-reported fields, and the credential stays.
			previous.contributors.add(clientId);
			if (previous.drain.value) {
				// A client registered the source again before it went away.
				previous.drain.value.cancel();
				previous.drain.clear();
				this._syncAgent(previous.provider);
				return;
			}
			this._onDidChange.fire();
			return;
		}
		if (previous) {
			this._disposeEntry(previous);
		}
		const agent = this._getAgent(modelSource.provider)!;
		// An update makes the dispatching client the only contributor: the others registered a different definition.
		const entry: IModelSourceEntry = {
			provider: modelSource.provider,
			format: modelSource.format,
			nonce: modelSource.nonce,
			definition,
			contributors: new Set([clientId]),
			credentialNonce: generateUuid(),
			credential: undefined,
			accountId: undefined,
			credentialResource: undefined,
			credentialOrigins: undefined,
			state: { kind: ModelSourceStatus.Starting },
			// Models whose upstream identity didn't change keep their IDs, and stay listed while a new credential is requested.
			listed: previous?.listed === true && previous.provider === modelSource.provider,
			lease: new MutableDisposable(),
			drain: new MutableDisposable(),
		};
		this._entries.set(modelSource.id, entry);
		try {
			const description = agent.describeModelSource!({ id: modelSource.id, format: modelSource.format, definition });
			entry.credentialResource = description.credentialResource;
			entry.credentialOrigins = description.credentialOrigins;
			if (description.credentialResource) {
				entry.state = { kind: ModelSourceStatus.AuthRequired, reason: ModelSourceAuthRequiredReason.Required };
			} else {
				entry.state = { kind: ModelSourceStatus.Ready };
				entry.listed = true;
			}
		} catch (error) {
			this._logService.warn(`[AgentHostModelSourceRegistry] Model source ${modelSource.id} cannot be served: ${toErrorMessage(error)}`);
			entry.state = { kind: ModelSourceStatus.Error, error: { errorType: 'invalidModelSource', message: toErrorMessage(error) } };
			entry.listed = false;
		}
		this._report(modelSource.id, entry);
		if (previous && previous.provider !== modelSource.provider) {
			this._syncAgent(previous.provider);
		}
		this._syncAgent(modelSource.provider);
	}

	private _dropCredential(id: string, entry: IModelSourceEntry, state: ModelSourceState): void {
		entry.lease.clear();
		entry.credential = undefined;
		entry.state = state;
		this._report(id, entry);
		this._syncAgent(entry.provider);
	}

	private _remove(id: string): void {
		const entry = this._entries.get(id);
		if (!entry) {
			return;
		}
		this._disposeEntry(entry);
		this._entries.delete(id);
		this._syncAgent(entry.provider);
	}

	private _disposeEntry(entry: IModelSourceEntry): void {
		entry.lease.dispose();
		// Disposing cancels a pending drain, whose source is gone or replaced.
		entry.drain.value?.cancel();
		entry.drain.dispose();
	}

	private _report(id: string, entry: IModelSourceEntry): void {
		this._state.dispatchServerAction(ROOT_STATE_URI, {
			type: ActionType.RootModelSourceStateChanged,
			id,
			state: entry.state,
			credentialNonce: entry.credentialNonce,
			...(entry.credentialResource ? { credentialResource: entry.credentialResource } : {}),
			...(entry.credentialOrigins ? { credentialOrigins: [...entry.credentialOrigins] } : {}),
			...(entry.accountId !== undefined ? { accountId: entry.accountId } : {}),
		});
	}

	private _syncAgent(provider: string): void {
		const sources: IAgentModelSource[] = [];
		for (const [id, entry] of this._entries) {
			if (entry.provider === provider && entry.listed) {
				sources.push({ id, format: entry.format, definition: entry.definition, ...(entry.credential ? { credential: entry.credential } : {}), ...(entry.drain.value ? { draining: true } : {}) });
			}
		}
		this._getAgent(provider)?.setModelSources?.(sources);
		this._onDidChange.fire();
	}

	private _findModelSource(id: string): ModelSource | undefined {
		return this._state.rootState.modelSources?.find(modelSource => modelSource.id === id);
	}
}
