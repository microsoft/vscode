/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Emitter } from '../../../base/common/event.js';
import { disposableTimeout } from '../../../base/common/async.js';
import { Disposable, MutableDisposable, toDisposable, type IDisposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import type { AuthenticateParams, IAgent, IAgentModelSource } from '../common/agent.js';
import type { IAgentHostClientTelemetryContext } from '../common/agentHostTelemetry.js';
import type { ModelSourceAuthenticateTarget } from '../common/state/protocol/commands.js';
import { ModelSourceAuthRequiredReason, ModelSourceRetentionPolicy, ModelSourceStatus, type ModelSourceRegistration, type ModelSourceState, type ProtectedResourceMetadata, type RootState } from '../common/state/protocol/state.js';
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
 * How long the host keeps a disconnected client's contributions before it treats
 * the client as having left. Advertised as the capability's `gracePeriod`.
 */
export const MODEL_SOURCE_GRACE_PERIOD = 30_000;

/** What the host knows about a registration beyond root state. Never published: it holds the credential. */
interface IModelSourceEntry {
	readonly provider: string;
	readonly format: string;
	readonly definition: Record<string, unknown>;
	/** The registration's generation. Any change to the definition or the credential issues a new one. */
	nonce: string;
	credential: string | undefined;
	/** The client's ID for the credential the host most recently accepted, which outlives it to say what happened to it. */
	credentialId: string | undefined;
	credentialResource: ProtectedResourceMetadata | undefined;
	credentialOrigins: readonly string[] | undefined;
	state: ModelSourceState;
	/** Whether the agent lists the source's models: from its first `ready` until it is withdrawn. */
	listed: boolean;
	/** Expires a credential delivered with a lifetime. */
	readonly lease: MutableDisposable<IDisposable>;
}

/**
 * The host side of the AHP model source registry. Validates client
 * registrations, reports each source's status, holds credentials in memory,
 * and hands the sources each agent serves to it with
 * {@link IAgent.setModelSources}. The agent owns the definition format.
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
				entry.lease.dispose();
			}
		}));
	}

	/** Applies a client's registration change, or rejects it through the action's `rejectionReason`. */
	handleClientAction(action: ClientModelSourceAction, clientId: string, clientSeq: number, clientContext?: IAgentHostClientTelemetryContext): void {
		const origin: ActionOrigin = { clientId, clientSeq };
		switch (action.type) {
			case ActionType.RootModelSourceRegistrationRemoved:
				this._state.dispatchClientAction(ROOT_STATE_URI, action, origin, clientContext);
				this._remove(action.id);
				return;
			case ActionType.RootModelSourceContributorRemoved: {
				if (action.clientId !== clientId) {
					this._state.rejectClientAction(ROOT_STATE_URI, action, origin, 'A client can only withdraw its own contribution');
					return;
				}
				const contributed = this._findRegistration(action.id)?.contributingClientIds?.includes(clientId);
				this._state.dispatchClientAction(ROOT_STATE_URI, action, origin, clientContext);
				// When the last contributor withdraws, the source goes away whatever its retention.
				if (contributed && !this._findRegistration(action.id)?.contributingClientIds?.length) {
					this._removeRegistration(action.id);
				}
				return;
			}
			case ActionType.RootModelSourceRegistrationSet: {
				const rejection = this._validate(action, clientId);
				if (rejection) {
					this._logService.warn(`[AgentHostModelSourceRegistry] Rejected model source ${action.registration.id}: ${rejection}`);
					this._state.rejectClientAction(ROOT_STATE_URI, action, origin, rejection);
					return;
				}
				this._state.dispatchClientAction(ROOT_STATE_URI, action, origin, clientContext);
				this._apply(action.registration);
				return;
			}
		}
	}

	/**
	 * Installs, rotates, or (with an empty token) revokes a registration's
	 * credential. Throws a {@link ProtocolError} for an unknown source, a stale
	 * nonce, or a resource other than the source's credential resource.
	 */
	authenticate(params: AuthenticateParams, target: ModelSourceAuthenticateTarget): void {
		const entry = this._entries.get(target.modelSourceId);
		if (!entry || !this._findRegistration(target.modelSourceId)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'The authentication target must identify a registered model source');
		}
		if (target.credentialNonce !== entry.nonce) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'The model source changed since this credential was requested');
		}
		if (!entry.credentialResource) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'The model source does not take a credential');
		}
		if (params.resource !== entry.credentialResource.resource) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'The resource must be the model source\'s credential resource');
		}
		entry.nonce = generateUuid();
		entry.lease.clear();
		if (params.token) {
			entry.credential = params.token;
			entry.credentialId = target.credentialId;
			entry.state = { kind: ModelSourceStatus.Ready };
			entry.listed = true;
			// A static key delivered with a lifetime is a lease: it lapses unless renewed.
			if (params.expiresIn !== undefined) {
				const nonce = entry.nonce;
				entry.lease.value = disposableTimeout(() => {
					if (this._entries.get(target.modelSourceId) === entry && entry.nonce === nonce) {
						this._dropCredential(target.modelSourceId, entry, { kind: ModelSourceStatus.AuthRequired, reason: ModelSourceAuthRequiredReason.Expired });
					}
				}, Math.max(0, params.expiresIn) * 1000);
			}
			this._report(target.modelSourceId, entry);
			this._syncAgent(entry.provider);
		} else {
			// A revoked credential is never sent again without the user's action.
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
		entry.nonce = generateUuid();
		this._dropCredential(id, entry, { kind: ModelSourceStatus.AuthRequired, reason: ModelSourceAuthRequiredReason.Rejected, description: localize('modelSource.credentialRejected', "The endpoint rejected the API key.") });
	}

	/**
	 * Withdraws `clientId`'s contributions once it has left. A source it was the
	 * last contributor to is removed, unless its retention is `host`.
	 */
	removeClient(clientId: string): void {
		for (const registration of this._state.rootState.modelSourceRegistrations ?? []) {
			if (!registration.contributingClientIds?.includes(clientId)) {
				continue;
			}
			this._state.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootModelSourceContributorRemoved, id: registration.id, clientId });
			const remaining = this._findRegistration(registration.id)?.contributingClientIds?.length ?? 0;
			if (!remaining && (registration.retention ?? ModelSourceRetentionPolicy.ContributingClient) === ModelSourceRetentionPolicy.ContributingClient) {
				this._removeRegistration(registration.id);
			}
		}
	}

	private _validate(action: Extract<ClientModelSourceAction, { readonly type: ActionType.RootModelSourceRegistrationSet }>, clientId: string): string | undefined {
		const registration = action.registration;
		if (typeof registration.id !== 'string' || !registration.id || typeof registration.definition !== 'object' || registration.definition === null || Array.isArray(registration.definition)) {
			return 'A model source registration needs an id and a definition object';
		}
		const agent = this._getAgent(registration.provider);
		const formats = agent?.getDescriptor().capabilities?.modelSourceRegistration?.formats;
		if (!agent?.describeModelSource || !agent.setModelSources || !formats?.includes(registration.format)) {
			return `The agent '${registration.provider}' does not serve model sources in the format '${registration.format}'`;
		}
		if (action.clientId !== clientId) {
			return 'A model source registration must name the dispatching client as its contributing client';
		}
		if (registration.contributingClientIds !== undefined || registration.state !== undefined || registration.credentialNonce !== undefined || registration.credentialResource !== undefined || registration.credentialOrigins !== undefined || registration.credentialId !== undefined) {
			return 'Only the host reports a model source\'s contributors, state, and credential fields';
		}
		if (registration.retention !== undefined && registration.retention !== ModelSourceRetentionPolicy.ContributingClient && registration.retention !== ModelSourceRetentionPolicy.Host) {
			return `Unsupported model source retention: ${registration.retention}`;
		}
		return undefined;
	}

	private _apply(registration: ModelSourceRegistration): void {
		const previous = this._entries.get(registration.id);
		if (previous && previous.provider === registration.provider && previous.format === registration.format && equals(previous.definition, registration.definition)) {
			// A join, or a new name or retention: the reducer kept the host-reported fields, and the credential stays.
			this._onDidChange.fire();
			return;
		}
		previous?.lease.dispose();
		const agent = this._getAgent(registration.provider)!;
		const entry: IModelSourceEntry = {
			provider: registration.provider,
			format: registration.format,
			definition: registration.definition,
			nonce: generateUuid(),
			credential: undefined,
			credentialId: undefined,
			credentialResource: undefined,
			credentialOrigins: undefined,
			state: { kind: ModelSourceStatus.Starting },
			// Models whose upstream identity didn't change keep their IDs, and stay listed while a new credential is requested.
			listed: previous?.listed === true && previous.provider === registration.provider,
			lease: new MutableDisposable(),
		};
		this._entries.set(registration.id, entry);
		try {
			const description = agent.describeModelSource!({ id: registration.id, format: registration.format, definition: registration.definition });
			entry.credentialResource = description.credentialResource;
			entry.credentialOrigins = description.credentialOrigins;
			if (description.credentialResource) {
				entry.state = { kind: ModelSourceStatus.AuthRequired, reason: ModelSourceAuthRequiredReason.Required };
			} else {
				entry.state = { kind: ModelSourceStatus.Ready };
				entry.listed = true;
			}
		} catch (error) {
			this._logService.warn(`[AgentHostModelSourceRegistry] Model source ${registration.id} cannot be served: ${toErrorMessage(error)}`);
			entry.state = { kind: ModelSourceStatus.Error, error: { errorType: 'invalidModelSource', message: toErrorMessage(error) } };
			entry.listed = false;
		}
		this._report(registration.id, entry);
		if (previous && previous.provider !== registration.provider) {
			this._syncAgent(previous.provider);
		}
		this._syncAgent(registration.provider);
	}

	private _dropCredential(id: string, entry: IModelSourceEntry, state: ModelSourceState): void {
		entry.lease.clear();
		entry.credential = undefined;
		entry.state = state;
		this._report(id, entry);
		this._syncAgent(entry.provider);
	}

	/** Removes a registration from root state, and stops serving it. */
	private _removeRegistration(id: string): void {
		this._state.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootModelSourceRegistrationRemoved, id });
		this._remove(id);
	}

	private _remove(id: string): void {
		const entry = this._entries.get(id);
		if (!entry) {
			return;
		}
		entry.lease.dispose();
		this._entries.delete(id);
		this._syncAgent(entry.provider);
	}

	private _report(id: string, entry: IModelSourceEntry): void {
		this._state.dispatchServerAction(ROOT_STATE_URI, {
			type: ActionType.RootModelSourceStateChanged,
			id,
			state: entry.state,
			credentialNonce: entry.nonce,
			...(entry.credentialResource ? { credentialResource: entry.credentialResource } : {}),
			...(entry.credentialOrigins ? { credentialOrigins: [...entry.credentialOrigins] } : {}),
			...(entry.credentialId !== undefined ? { credentialId: entry.credentialId } : {}),
		});
	}

	private _syncAgent(provider: string): void {
		const sources: IAgentModelSource[] = [];
		for (const [id, entry] of this._entries) {
			if (entry.provider === provider && entry.listed) {
				sources.push({ id, format: entry.format, definition: entry.definition, ...(entry.credential ? { credential: entry.credential } : {}) });
			}
		}
		this._getAgent(provider)?.setModelSources?.(sources);
		this._onDidChange.fire();
	}

	private _findRegistration(id: string): ModelSourceRegistration | undefined {
		return this._state.rootState.modelSourceRegistrations?.find(registration => registration.id === id);
	}
}
