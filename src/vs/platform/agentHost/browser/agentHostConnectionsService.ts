/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { AgentSession, IAgentConnection, IAgentHostService } from '../common/agentService.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionInfo, IAgentHostConnectionsService, IAgentHostSessionResolution, LOCAL_AGENT_HOST_SCHEME_PREFIX } from '../common/agentHostConnectionsService.js';
import { findRemoteAgentHostSessionTypeAuthority, isRemoteAgentHostSessionType, remoteAgentHostSessionTypeAuthorityPrefix } from '../common/agentHostSessionType.js';
import { agentHostAuthority } from '../common/agentHostUri.js';
import { IRemoteAgentHostService } from '../common/remoteAgentHostService.js';
import type { URI } from '../../../base/common/uri.js';

/**
 * Default {@link IAgentHostConnectionsService} that composes the ambient
 * `IAgentHostService` with the `IRemoteAgentHostService` registry. Works in
 * every entry point: where the remote registry is the `NullRemoteAgentHostService`
 * (e.g. web workbench) it simply surfaces the ambient connection only.
 */
export class AgentHostConnectionsService extends Disposable implements IAgentHostConnectionsService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConnections = this._register(new Emitter<void>());
	readonly onDidChangeConnections: Event<void> = this._onDidChangeConnections.event;

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
	) {
		super();

		this._register(this._remoteAgentHostService.onDidChangeConnections(() => this._onDidChangeConnections.fire()));
		// Ambient (re)start/exit changes whether the ambient connection is ready.
		this._register(this._agentHostService.onAgentHostStart(() => this._onDidChangeConnections.fire()));
		this._register(this._agentHostService.onAgentHostExit(() => this._onDidChangeConnections.fire()));
	}

	get ambientConnection(): IAgentConnection {
		return this._agentHostService;
	}

	get connections(): readonly IAgentHostConnectionInfo[] {
		const result: IAgentHostConnectionInfo[] = [{
			authority: AMBIENT_AGENT_HOST_AUTHORITY,
			address: undefined,
			name: localize('agentHost.connection.ambient', "Local"),
			isAmbient: true,
			connection: this._agentHostService,
		}];

		for (const info of this._remoteAgentHostService.connections) {
			result.push({
				authority: agentHostAuthority(info.address),
				address: info.address,
				name: info.name,
				isAmbient: false,
				connection: this._remoteAgentHostService.getConnection(info.address),
			});
		}

		return result;
	}

	getConnectionByAuthority(authority: string): IAgentConnection | undefined {
		if (authority === AMBIENT_AGENT_HOST_AUTHORITY) {
			return this._agentHostService;
		}
		return this._remoteAgentHostService.getConnectionByAuthority(authority);
	}

	getConnectionByAddress(address: string): IAgentConnection | undefined {
		return this._remoteAgentHostService.getConnection(address);
	}

	resolveSessionResource(sessionResource: URI): IAgentHostSessionResolution | undefined {
		const scheme = sessionResource.scheme;
		const rawSessionId = sessionResource.path.substring(1);

		if (scheme.startsWith(LOCAL_AGENT_HOST_SCHEME_PREFIX)) {
			const provider = scheme.substring(LOCAL_AGENT_HOST_SCHEME_PREFIX.length);
			return provider
				? { connection: this._agentHostService, backendSession: AgentSession.uri(provider, rawSessionId) }
				: undefined;
		}

		if (isRemoteAgentHostSessionType(scheme)) {
			// `remote-<authority>-<provider>`: both segments may contain dashes,
			// so resolve the authority against the live connection set (longest
			// match wins) rather than splitting the string blindly.
			const authority = findRemoteAgentHostSessionTypeAuthority(scheme, this.connections.filter(c => !c.isAmbient).map(c => c.authority));
			if (authority) {
				const provider = scheme.substring(remoteAgentHostSessionTypeAuthorityPrefix(authority).length);
				const connection = this.getConnectionByAuthority(authority);
				if (provider && connection) {
					return { connection, backendSession: AgentSession.uri(provider, rawSessionId) };
				}
			}
		}

		return undefined;
	}
}

registerSingleton(IAgentHostConnectionsService, AgentHostConnectionsService, InstantiationType.Delayed);
