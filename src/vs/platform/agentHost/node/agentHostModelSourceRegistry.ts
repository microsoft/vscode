/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { disposableTimeout } from '../../../base/common/async.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Disposable, MutableDisposable, toDisposable, type IDisposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import type { AuthenticateParams, IAgent, IAgentModelSource, IAgentModelSourceDescription } from '../common/agent.js';
import type { IAgentHostClientTelemetryContext } from '../common/agentHostTelemetry.js';
import type { ModelSourceAuthenticateTarget } from '../common/state/protocol/commands.js';
import { ModelSourceAuthRequiredReason, ModelSourceRetentionPolicy, ModelSourceStatus, type ModelSource, type ModelSourceRegistration, type ModelSourceState, type ProtectedResourceMetadata, type RootState } from '../common/state/protocol/state.js';
import { ActionType, type ActionOrigin, type ClientModelSourceAction, type StateAction } from '../common/state/sessionActions.js';
import { JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { ROOT_STATE_URI } from '../common/state/sessionState.js';

/** The parts of the host's state manager that {@link AgentHostModelSourceRegistry} uses. */
export interface IAgentHostModelSourceRegistryState {
	readonly rootState: RootState;
	dispatchServerAction(channel: string, action: StateAction): void;
	dispatchClientAction(channel: string, action: ClientModelSourceAction, origin: ActionOrigin, clientContext?: IAgentHostClientTelemetryContext): unknown;
	rejectClientAction(channel: string, action: StateAction, origin: ActionOrigin, reason: string): void;
}

/** A model source as a client registered it, without the status and credential fields the host reports. */
type RegisteredModelSource = Omit<ModelSource, 'state' | 'credentialResource' | 'accountId'> & { readonly registration: ModelSourceRegistration };

/** A registration request the host accepted, and what the agent read from its definition. */
interface IValidatedRegistration {
	readonly source: RegisteredModelSource;
	readonly retention: ModelSourceRetentionPolicy;
	readonly description: IAgentModelSourceDescription;
}

/** What the host knows about a registered model source, which it publishes with `root/modelSourceSet`, apart from the credential. */
interface IModelSourceEntry {
	/** The source from the latest request to register it. */
	source: RegisteredModelSource;
	/** What happens when the last contributing client leaves, from the latest request. Never in state. */
	retention: ModelSourceRetentionPolicy;
	/** The clients that requested this registration, from each request's origin. Never in state. */
	readonly contributors: Set<string>;
	credential: string | undefined;
	/** When the host accepted {@link credential}, in `Date.now()` time. */
	credentialSince: number;
	/** The `accountId` sent with the credential the host most recently accepted, which outlives it to say what happened to it. */
	accountId: string | undefined;
	credentialResource: ProtectedResourceMetadata | undefined;
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
 * registrations, keeps their contributing clients privately,
 * reports each source's status, holds credentials in memory, and hands the
 * sources each agent serves to it with {@link IAgent.setModelSources}. The
 * agent owns the definition format.
 */
export class AgentHostModelSourceRegistry extends Disposable {

	private readonly _entries = new Map<string, IModelSourceEntry>();

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
				this._remove(action.modelSourceId);
				return;
			case ActionType.RootModelSourceRegisterRequested: {
				const validation = this._validate(action);
				if (typeof validation === 'string') {
					this._logService.warn(`[AgentHostModelSourceRegistry] Rejected model source ${typeof action.modelSourceId === 'string' ? action.modelSourceId : '(invalid)'}: ${validation}`);
					this._state.rejectClientAction(ROOT_STATE_URI, action, origin, validation);
					return;
				}
				// Published before the request is confirmed, so the client finds the source when it is.
				this._apply(validation, clientId);
				this._state.dispatchClientAction(ROOT_STATE_URI, action, origin, clientContext);
				return;
			}
		}
	}

	/**
	 * Installs, replaces, or (with an empty token) revokes a source's
	 * credential. Throws a {@link ProtocolError} for an unknown source, or a
	 * resource other than the source's credential resource.
	 */
	authenticate(params: AuthenticateParams, target: ModelSourceAuthenticateTarget): void {
		const entry = this._entries.get(target.modelSourceId);
		if (!entry || !this._findModelSource(target.modelSourceId)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'The authentication target must identify a registered model source');
		}
		if (!entry.credentialResource) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'The model source does not take a credential');
		}
		if (params.resource !== entry.credentialResource.resource) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'The resource must be the model source\'s credential resource');
		}
		// A new credential, or a revocation, ends the previous credential's lease.
		entry.lease.clear();
		if (params.token) {
			entry.credential = params.token;
			entry.credentialSince = Date.now();
			entry.accountId = params.accountId;
			entry.state = { kind: ModelSourceStatus.Ready };
			entry.listed = true;
			// A static key delivered with a lifetime is a lease: it lapses unless renewed.
			if (params.expiresIn !== undefined) {
				entry.lease.value = disposableTimeout(() => {
					if (this._entries.get(target.modelSourceId) === entry) {
						this._dropCredential(target.modelSourceId, entry, { kind: ModelSourceStatus.AuthRequired, reason: ModelSourceAuthRequiredReason.Expired });
					}
				}, Math.max(0, params.expiresIn) * 1000);
			}
			this._publish(entry);
			this._syncAgent(entry.source.provider);
		} else {
			// A revoked credential is never sent again without the user's action. `accountId` still names it.
			this._dropCredential(target.modelSourceId, entry, { kind: ModelSourceStatus.AuthRequired, reason: ModelSourceAuthRequiredReason.Revoked });
		}
	}

	/**
	 * Drops a credential the source's endpoint rejected in a turn that started
	 * at `turnStartedAt`. A client replaces it rather than sending the same one
	 * again. A credential delivered after the turn started is kept: the endpoint
	 * rejected an earlier one.
	 */
	rejectCredential(id: string, turnStartedAt: number): void {
		const entry = this._entries.get(id);
		if (!entry?.credential || entry.credentialSince > turnStartedAt) {
			return;
		}
		this._logService.warn(`[AgentHostModelSourceRegistry] The endpoint of model source ${id} rejected its credential`);
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
			if (entry.retention === ModelSourceRetentionPolicy.ContributingClient) {
				this._drain(id, entry);
			}
		}
	}

	private _drain(id: string, entry: IModelSourceEntry): void {
		const cts = new CancellationTokenSource();
		entry.drain.value = cts;
		// The agent withdraws the source's models, and keeps its credential only for the turns running on it.
		this._syncAgent(entry.source.provider);
		const idle = this._getAgent(entry.source.provider)?.whenModelSourceIdle?.(id, cts.token) ?? Promise.resolve();
		idle.then(() => {
			if (!cts.token.isCancellationRequested && this._entries.get(id) === entry && entry.drain.value === cts) {
				entry.drain.clear();
				this._state.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootModelSourceRemoved, modelSourceId: id });
				this._remove(id);
			}
		}, error => this._logService.warn(`[AgentHostModelSourceRegistry] Failed to wait for the turns on model source ${id}: ${toErrorMessage(error)}`));
	}

	/** The source and what the agent read from its definition, or why the host declines the request. */
	private _validate(action: Extract<ClientModelSourceAction, { readonly type: ActionType.RootModelSourceRegisterRequested }>): IValidatedRegistration | string {
		const { modelSourceId: id, provider, displayName, registration, retention = ModelSourceRetentionPolicy.ContributingClient } = action;
		if (typeof id !== 'string' || !id || typeof provider !== 'string' || typeof displayName !== 'string' || !isModelSourceRegistration(registration)) {
			return 'A model source registration needs an id, a provider, a display name, a format, and a definition object';
		}
		const { format, definition } = registration;
		const agent = this._getAgent(provider);
		const formats = agent?.getDescriptor().capabilities?.modelSourceRegistration?.formats;
		if (!agent?.describeModelSource || !agent.setModelSources || !formats?.some(info => info.format === format)) {
			return `The agent '${provider}' does not serve model sources in the format '${format}'`;
		}
		if (retention !== ModelSourceRetentionPolicy.ContributingClient && retention !== ModelSourceRetentionPolicy.Host) {
			return `Unsupported model source retention: ${retention}`;
		}
		const source: RegisteredModelSource = {
			id,
			provider,
			displayName,
			...(action.icons ? { icons: action.icons } : {}),
			registration: { format, definition },
			...(action._meta ? { _meta: action._meta } : {}),
		};
		// Every client reads root state, so a definition the agent can't serve isn't stored there.
		try {
			return { source, retention, description: agent.describeModelSource({ id, format, definition }) };
		} catch (error) {
			return toErrorMessage(error);
		}
	}

	/** Whether `entry` has the same agent, format, and definition as `source`, so it keeps its status and credential. */
	private _isReregistration(entry: IModelSourceEntry, source: RegisteredModelSource): boolean {
		return entry.source.provider === source.provider && entry.source.registration.format === source.registration.format && equals(entry.source.registration.definition, source.registration.definition);
	}

	private _apply({ source, retention, description }: IValidatedRegistration, clientId: string): void {
		const previous = this._entries.get(source.id);
		if (previous && this._isReregistration(previous, source)) {
			// A re-registration, or a new name or retention: the status and credential stay.
			previous.contributors.add(clientId);
			previous.retention = retention;
			const changed = !equals(previous.source, source);
			previous.source = source;
			if (previous.drain.value) {
				// A client registered the source again before it went away.
				previous.drain.value.cancel();
				previous.drain.clear();
				this._syncAgent(source.provider);
			}
			if (changed) {
				this._publish(previous);
			}
			return;
		}
		if (previous) {
			this._disposeEntry(previous);
		}
		// An update makes the dispatching client the only contributor: the others registered a different definition.
		const entry: IModelSourceEntry = {
			source,
			retention,
			contributors: new Set([clientId]),
			credential: undefined,
			credentialSince: 0,
			accountId: undefined,
			credentialResource: description.credentialResource,
			state: description.credentialResource ? { kind: ModelSourceStatus.AuthRequired, reason: ModelSourceAuthRequiredReason.Required } : { kind: ModelSourceStatus.Ready },
			// Models whose upstream identity didn't change keep their IDs, and stay listed while a new credential is requested.
			listed: !description.credentialResource || (previous?.listed === true && previous.source.provider === source.provider),
			lease: new MutableDisposable(),
			drain: new MutableDisposable(),
		};
		this._entries.set(source.id, entry);
		this._publish(entry);
		if (previous && previous.source.provider !== source.provider) {
			this._syncAgent(previous.source.provider);
		}
		this._syncAgent(source.provider);
	}

	private _dropCredential(id: string, entry: IModelSourceEntry, state: ModelSourceState): void {
		entry.lease.clear();
		entry.credential = undefined;
		entry.state = state;
		this._publish(entry);
		this._syncAgent(entry.source.provider);
	}

	private _remove(id: string): void {
		const entry = this._entries.get(id);
		if (!entry) {
			return;
		}
		this._disposeEntry(entry);
		this._entries.delete(id);
		this._syncAgent(entry.source.provider);
	}

	private _disposeEntry(entry: IModelSourceEntry): void {
		entry.lease.dispose();
		// Disposing cancels a pending drain, whose source is gone or replaced.
		entry.drain.value?.cancel();
		entry.drain.dispose();
	}

	/** Publishes the whole source: only the host dispatches `root/modelSourceSet`, for every change. */
	private _publish(entry: IModelSourceEntry): void {
		this._state.dispatchServerAction(ROOT_STATE_URI, {
			type: ActionType.RootModelSourceSet,
			modelSource: {
				...entry.source,
				state: entry.state,
				...(entry.credentialResource ? { credentialResource: entry.credentialResource } : {}),
				...(entry.accountId !== undefined ? { accountId: entry.accountId } : {}),
			},
		});
	}

	private _syncAgent(provider: string): void {
		const sources: IAgentModelSource[] = [];
		for (const [id, entry] of this._entries) {
			if (entry.source.provider === provider && entry.listed) {
				const { format, definition } = entry.source.registration;
				sources.push({ id, format, definition, ...(entry.credential ? { credential: entry.credential } : {}), ...(entry.drain.value ? { draining: true } : {}) });
			}
		}
		this._getAgent(provider)?.setModelSources?.(sources);
	}

	private _findModelSource(id: string): ModelSource | undefined {
		return this._state.rootState.modelSources?.find(modelSource => modelSource.id === id);
	}
}

function isModelSourceRegistration(registration: ModelSourceRegistration | undefined): registration is ModelSourceRegistration {
	const definition = registration?.definition;
	return typeof registration?.format === 'string' && typeof definition === 'object' && definition !== null && !Array.isArray(definition);
}
