/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LogLevel as ProxyLogLevel, ProxyAgentParams, ProxySupportSetting, createFetchPatch, createProxyResolver, loadSystemCertificates } from '@vscode/proxy-agent';
import { IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService, LogLevel } from '../../log/common/log.js';
import { systemCertificatesNodeDefault } from '../../request/common/request.js';
import { IAgentHostClientProxyConnection } from '../common/agentHostClientProxyChannel.js';

export const IAgentHostProxyResolver = createDecorator<IAgentHostProxyResolver>('agentHostProxyResolver');

/**
 * Node-side registry of renderer {@link IAgentHostClientProxyConnection}s keyed
 * by client id. Populated by the agent host's connection lifecycle (one entry
 * per connected renderer) and consumed by {@link CopilotAgent} to resolve the
 * CAPI proxy through VS Code's Electron session before spawning the Copilot SDK.
 *
 * Proxy configuration is a property of the machine, not of a particular window,
 * so any connected renderer can serve the lookup; the resolver calls the first
 * available connection and falls through to the next on failure.
 */
export interface IAgentHostProxyResolver {
	readonly _serviceBrand: undefined;

	/** Register a renderer connection. Disposing the result removes it. */
	register(clientId: string, connection: IAgentHostClientProxyConnection): IDisposable;

	/**
	 * Resolve the proxy URL for `url` (e.g. `http://host:port`), or `undefined`
	 * for a direct connection. Reuses `@vscode/proxy-agent`'s `resolveProxyURL`
	 * so the same precedence as the rest of VS Code applies: `http.noProxy` →
	 * `http.proxy` setting → `HTTP(S)_PROXY` env vars → the host proxy resolution
	 * that runs in VS Code (Electron session) via the reverse channel.
	 */
	resolveProxy(url: string): Promise<string | undefined>;

	/** Fetch using the same proxy, certificate, and host/PAC resolution as {@link resolveProxy}. */
	fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

export class AgentHostProxyResolver implements IAgentHostProxyResolver {

	declare readonly _serviceBrand: undefined;

	private readonly _connections = new Map<string, IAgentHostClientProxyConnection>();
	private _proxyResolver: ReturnType<typeof createProxyResolver> | undefined;
	private _proxyAgentParams: ProxyAgentParams | undefined;
	private _fetch: typeof globalThis.fetch | undefined;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) { }

	register(clientId: string, connection: IAgentHostClientProxyConnection): IDisposable {
		this._connections.set(clientId, connection);
		return toDisposable(() => {
			if (this._connections.get(clientId) === connection) {
				this._connections.delete(clientId);
			}
		});
	}

	resolveProxy(url: string): Promise<string | undefined> {
		return this._getProxyResolver().resolveProxyURL(url);
	}

	fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
		if (!this._fetch) {
			const proxyResolver = this._getProxyResolver();
			this._fetch = createFetchPatch(this._proxyAgentParams!, globalThis.fetch, proxyResolver.resolveProxyURL);
		}
		return this._fetch(input, init);
	}

	private _getProxyResolver(): ReturnType<typeof createProxyResolver> {
		if (!this._proxyResolver) {
			// Mirror `workbench/api/node/proxyResolver.ts`.
			const config = <T>(key: string): T | undefined => this._configurationService.getValue<T>(key);
			const systemCertificatesV2 = () => config<boolean>('http.experimental.systemCertificatesV2') ?? false;
			const systemCertificates = () => !!config<boolean>('http.systemCertificates');
			// TODO @chrmarti: Add lookupProxyAuthorization.
			const params: ProxyAgentParams = {
				// The host proxy resolution runs in VS Code: reverse-call a connected
				// renderer, whose IRequestService.resolveProxy hits the Electron
				// session (system settings / PAC scripts).
				resolveProxy: (url) => this._hostResolveProxy(url),
				getProxyURL: () => config<string>('http.proxy'),
				getProxySupport: () => config<ProxySupportSetting>('http.proxySupport') || 'off',
				getNoProxyConfig: () => config<string[]>('http.noProxy') || [],
				isAdditionalFetchSupportEnabled: () => config<boolean>('http.fetchAdditionalSupport') ?? true,
				isWebSocketPatchEnabled: () => config<boolean>('http.webSocketAdditionalSupport') ?? true,
				addCertificatesV1: () => !systemCertificatesV2() && systemCertificates(),
				addCertificatesV2: () => systemCertificatesV2() && systemCertificates(),
				loadSystemCertificatesFromNode: () => config<boolean>('http.systemCertificatesNode') ?? systemCertificatesNodeDefault,
				loadAdditionalCertificates: async () => loadSystemCertificates({
					loadSystemCertificatesFromNode: () => config<boolean>('http.systemCertificatesNode') ?? systemCertificatesNodeDefault,
					log: this._logService,
				}),
				log: this._logService,
				getLogLevel: () => {
					switch (this._logService.getLevel()) {
						case LogLevel.Trace: return ProxyLogLevel.Trace;
						case LogLevel.Debug: return ProxyLogLevel.Debug;
						case LogLevel.Info: return ProxyLogLevel.Info;
						case LogLevel.Warning: return ProxyLogLevel.Warning;
						case LogLevel.Error: return ProxyLogLevel.Error;
						case LogLevel.Off: return ProxyLogLevel.Off;
						default: return ProxyLogLevel.Info;
					}
				},
				proxyResolveTelemetry: () => { },
				// Only the local agent host wires the reverse proxy channel
				// and we want to look up the client's proxy settings only
				// when the agent host is local (i.e., on the same machine as
				// the client).
				isUseHostProxyEnabled: () => this._connections.size > 0,
				getNetworkInterfaceCheckInterval: () => (config<number>('http.experimental.networkInterfaceCheckInterval') ?? 300) * 1000,
				env: process.env,
			};
			this._proxyAgentParams = params;
			this._proxyResolver = createProxyResolver(params);
		}
		return this._proxyResolver;
	}

	private async _hostResolveProxy(url: string): Promise<string | undefined> {
		for (const connection of this._connections.values()) {
			try {
				return await connection.resolveProxy(url);
			} catch {
				// This renderer could not serve the lookup; try the next one.
			}
		}
		return undefined;
	}
}
