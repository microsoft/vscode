/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import type { AuthenticateParams, IAgent, IAgentModelSource } from '../common/agent.js';
import type { IAgentHostClientTelemetryContext } from '../common/agentHostTelemetry.js';
import type { ModelSourceAuthenticateTarget } from '../common/state/protocol/commands.js';
import { ModelSourceRetentionPolicy, ModelSourceStatus, type ModelSourceRegistration, type ModelSourceState, type ProtectedResourceMetadata, type RootState } from '../common/state/protocol/state.js';
import { ActionType, AuthRequiredReason, type ActionOrigin, type ClientModelSourceAction, type StateAction } from '../common/state/sessionActions.js';
import { AhpErrorCodes, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { ROOT_STATE_URI } from '../common/state/sessionState.js';

/** The parts of the host's state manager that {@link AgentHostModelSourceRegistry} uses. */
export interface IAgentHostModelSourceRegistryState {
	readonly rootState: RootState;
	dispatchServerAction(channel: string, action: StateAction): void;
	dispatchClientAction(channel: string, action: ClientModelSourceAction, origin: ActionOrigin, clientContext?: IAgentHostClientTelemetryContext): unknown;
	rejectClientAction(channel: string, action: StateAction, origin: ActionOrigin, reason: string): void;
}

/** What the host knows about a registration beyond root state. Never published: it holds the credential. */
interface IModelSourceEntry {
	readonly provider: string;
	readonly format: string;
	readonly definition: Record<string, unknown>;
	/** The registration's generation. Any change to the definition or the credential issues a new one. */
	nonce: string;
	credential: string | undefined;
	credentialResource: ProtectedResourceMetadata | undefined;
	state: ModelSourceState;
	/** Whether the agent lists the source's models: from its first `ready` until it is withdrawn. */
	listed: boolean;
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
	}

	/** Applies a client's registration change, or rejects it through the action's `rejectionReason`. */
	handleClientAction(action: ClientModelSourceAction, clientId: string, clientSeq: number, clientContext?: IAgentHostClientTelemetryContext): void {
		const origin: ActionOrigin = { clientId, clientSeq };
		if (action.type === ActionType.RootModelSourceRegistrationRemoved) {
			this._state.dispatchClientAction(ROOT_STATE_URI, action, origin, clientContext);
			this._remove(action.id);
			return;
		}
		const rejection = this._validate(action.registration, clientId);
		if (rejection) {
			this._logService.warn(`[AgentHostModelSourceRegistry] Rejected model source ${action.registration.id}: ${rejection}`);
			this._state.rejectClientAction(ROOT_STATE_URI, action, origin, rejection);
			return;
		}
		this._state.dispatchClientAction(ROOT_STATE_URI, action, origin, clientContext);
		this._apply(action.registration);
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
		if (params.token) {
			entry.credential = params.token;
			entry.state = { kind: ModelSourceStatus.Ready };
			entry.listed = true;
		} else {
			// A revoked credential is never sent again: `expired` makes clients renew it or ask for a new one.
			entry.credential = undefined;
			entry.state = { kind: ModelSourceStatus.AuthRequired, reason: AuthRequiredReason.Expired };
		}
		this._report(target.modelSourceId, entry);
		this._syncAgent(entry.provider);
	}

	/** Removes the registrations `clientId` contributed with `contributingClient` retention, once it has left. */
	removeClient(clientId: string): void {
		for (const registration of this._state.rootState.modelSourceRegistrations ?? []) {
			if (registration.clientId === clientId && (registration.retention ?? ModelSourceRetentionPolicy.ContributingClient) === ModelSourceRetentionPolicy.ContributingClient) {
				this._state.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootModelSourceRegistrationRemoved, id: registration.id });
				this._remove(registration.id);
			}
		}
	}

	private _validate(registration: ModelSourceRegistration, clientId: string): string | undefined {
		if (typeof registration.id !== 'string' || !registration.id || typeof registration.definition !== 'object' || registration.definition === null || Array.isArray(registration.definition)) {
			return 'A model source registration needs an id and a definition object';
		}
		const agent = this._getAgent(registration.provider);
		const formats = agent?.getDescriptor().capabilities?.modelSourceRegistration?.formats;
		if (!agent?.describeModelSource || !agent.setModelSources || !formats?.includes(registration.format)) {
			return `The agent '${registration.provider}' does not serve model sources in the format '${registration.format}'`;
		}
		if (registration.clientId !== clientId) {
			return 'A model source registration must name the dispatching client as its contributing client';
		}
		if (registration.state !== undefined || registration.credentialNonce !== undefined || registration.credentialResource !== undefined) {
			return 'Only the host reports a model source\'s state, credential nonce, and credential resource';
		}
		if (registration.retention !== undefined && registration.retention !== ModelSourceRetentionPolicy.ContributingClient && registration.retention !== ModelSourceRetentionPolicy.Host) {
			return `Unsupported model source retention: ${registration.retention}`;
		}
		return undefined;
	}

	private _apply(registration: ModelSourceRegistration): void {
		const previous = this._entries.get(registration.id);
		if (previous && previous.provider === registration.provider && previous.format === registration.format && equals(previous.definition, registration.definition)) {
			// Only the name, contributing client, or retention changed: the credential and nonce stay,
			// but the replaced registration lost its host-reported fields.
			this._report(registration.id, previous);
			this._onDidChange.fire();
			return;
		}
		const agent = this._getAgent(registration.provider)!;
		const entry: IModelSourceEntry = {
			provider: registration.provider,
			format: registration.format,
			definition: registration.definition,
			nonce: generateUuid(),
			credential: undefined,
			credentialResource: undefined,
			state: { kind: ModelSourceStatus.Starting },
			// Models whose upstream identity didn't change keep their IDs, and stay listed while a new credential is requested.
			listed: previous?.listed === true && previous.provider === registration.provider,
		};
		this._entries.set(registration.id, entry);
		try {
			const description = agent.describeModelSource!({ id: registration.id, format: registration.format, definition: registration.definition });
			entry.credentialResource = description.credentialResource;
			if (description.credentialResource) {
				entry.state = { kind: ModelSourceStatus.AuthRequired, reason: AuthRequiredReason.Required };
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

	private _remove(id: string): void {
		const entry = this._entries.get(id);
		if (!entry) {
			return;
		}
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
