/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { OperatingSystem } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { ILogService } from '../../log/common/log.js';
import { IPathService } from '../../path/common/pathService.js';
import { AgentSession } from '../common/agent.js';
import { IAgentConnection, IAgentHostService } from '../common/agentService.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionInfo, IAgentHostConnectionsService, IAgentHostSessionIdentity, IAgentHostSessionResolution, IAgentHostSessionResolutionPolicy, LOCAL_AGENT_HOST_SCHEME_PREFIX } from '../common/agentHostConnectionsService.js';
import { findRemoteAgentHostSessionTypeAuthority, isRemoteAgentHostSessionType, remoteAgentHostSessionTypeAuthorityPrefix } from '../common/agentHostSessionType.js';
import { AGENT_HOST_SCHEME, agentHostAuthority } from '../common/agentHostUri.js';
import { IRemoteAgentHostService } from '../common/remoteAgentHostService.js';
import { getAgentHostOperatingSystem } from '../common/agentHostOperatingSystem.js';

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
	private readonly _onDidChangeSessionResolution = this._register(new Emitter<void>());
	readonly onDidChangeSessionResolution: Event<void> = this._onDidChangeSessionResolution.event;
	private readonly _sessionResolutionPolicies = new Map<string, IAgentHostSessionResolutionPolicy>();

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IPathService pathService: IPathService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(pathService.registerPathProvider(AGENT_HOST_SCHEME, {
			getOperatingSystem: resource => this._getOperatingSystem(resource),
		}));
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => this._fireConnectionsChanged()));
		// Ambient (re)start/exit changes whether the ambient connection is ready.
		this._register(this._agentHostService.onAgentHostStart(() => this._fireConnectionsChanged()));
		this._register(this._agentHostService.onAgentHostExit(() => this._fireConnectionsChanged()));
	}

	private _fireConnectionsChanged(): void {
		this._onDidChangeConnections.fire();
		this._onDidChangeSessionResolution.fire();
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
		if (authority === AMBIENT_AGENT_HOST_AUTHORITY || authority === this._ambientResourceAuthority) {
			return this._agentHostService;
		}
		return this._remoteAgentHostService.getConnectionByAuthority(authority);
	}

	private get _ambientResourceAuthority(): string | undefined {
		const resource = this._agentHostService.resourceUris.fromAgentHost(URI.from({ scheme: Schemas.file, path: '/' }));
		return resource.scheme === AGENT_HOST_SCHEME ? resource.authority : undefined;
	}

	private async _getOperatingSystem(resource: URI): Promise<OperatingSystem | undefined> {
		const remote = this._remoteAgentHostService.connections.find(info => agentHostAuthority(info.address) === resource.authority);
		if (remote?.operatingSystem !== undefined) {
			return remote.operatingSystem;
		}

		const connection = this.getConnectionByAuthority(resource.authority);
		if (!connection) {
			return undefined;
		}

		try {
			return await getAgentHostOperatingSystem(connection);
		} catch (error) {
			this._logService.error(`[AgentHostConnections] Failed to resolve the operating system for authority ${resource.authority}`, error);
			return undefined;
		}
	}

	getConnectionByAddress(address: string): IAgentConnection | undefined {
		return this._remoteAgentHostService.getConnection(address);
	}

	registerSessionResolutionPolicy(authority: string, policy: IAgentHostSessionResolutionPolicy): IDisposable {
		if (this._sessionResolutionPolicies.has(authority)) {
			throw new Error(`Agent Host session resolution policy already registered for '${authority}'`);
		}
		this._sessionResolutionPolicies.set(authority, policy);
		this._onDidChangeSessionResolution.fire();
		return toDisposable(() => {
			if (this._sessionResolutionPolicies.get(authority) === policy) {
				this._sessionResolutionPolicies.delete(authority);
				this._onDidChangeSessionResolution.fire();
			}
		});
	}

	resolveSessionResource(sessionResource: URI): IAgentHostSessionResolution | undefined {
		const identity = this.resolveSessionResourceIdentity(sessionResource);
		if (!identity) {
			return undefined;
		}
		const connection = this.getConnectionByAuthority(identity.connectionAuthority);
		return connection ? { ...identity, connection } : undefined;
	}

	resolveSessionResourceIdentity(sessionResource: URI): IAgentHostSessionIdentity | undefined {
		const scheme = sessionResource.scheme;
		const rawSessionId = sessionResource.path.substring(1);

		if (scheme.startsWith(LOCAL_AGENT_HOST_SCHEME_PREFIX)) {
			const provider = scheme.substring(LOCAL_AGENT_HOST_SCHEME_PREFIX.length);
			return provider
				? this._createSessionIdentity(AMBIENT_AGENT_HOST_AUTHORITY, provider, rawSessionId)
				: undefined;
		}

		if (isRemoteAgentHostSessionType(scheme)) {
			// `remote-<authority>-<provider>`: both segments may contain dashes,
			// so resolve the authority against the known connection/policy set (longest
			// match wins) rather than splitting the string blindly.
			const authorities = new Set([
				...this.connections.filter(c => !c.isAmbient).map(c => c.authority),
				...this._sessionResolutionPolicies.keys(),
			]);
			const authority = findRemoteAgentHostSessionTypeAuthority(scheme, authorities);
			if (authority) {
				const provider = scheme.substring(remoteAgentHostSessionTypeAuthorityPrefix(authority).length);
				if (provider) {
					return this._createSessionIdentity(authority, provider, rawSessionId);
				}
			}
		}

		return undefined;
	}

	private _createSessionIdentity(authority: string, provider: string, rawSessionId: string): IAgentHostSessionIdentity {
		const policy = this._sessionResolutionPolicies.get(authority);
		const alias = policy?.sessionSchemeAlias;
		const backendProvider = alias?.ui === provider ? alias.backend : provider;
		return {
			connectionAuthority: authority,
			backendSession: AgentSession.uri(backendProvider, rawSessionId),
			defaultChangesetKind: policy?.defaultChangesetKind,
		};
	}
}

registerSingleton(IAgentHostConnectionsService, AgentHostConnectionsService, InstantiationType.Delayed);
