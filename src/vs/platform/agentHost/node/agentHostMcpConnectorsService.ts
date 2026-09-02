/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IMcpRemoteServerConfiguration, McpServerType } from '../../mcp/common/mcpPlatformTypes.js';
import { IAgentHostAuthenticationService } from './agentHostAuthenticationService.js';
import { IAgentHostGitHubEndpointService } from './agentHostGitHubEndpointService.js';

const MCP_CONNECTORS_REQUEST_TIMEOUT_MS = 10_000;

interface ICachedConnectorRepresentation {
	readonly url: string;
	readonly etag: string;
	readonly body: string;
}

export interface IAgentHostMcpConnector {
	readonly pluginName: string;
	readonly displayName: string;
	readonly serverName: string;
	readonly configuration: IMcpRemoteServerConfiguration;
	readonly protectedResourceMetadataUrl?: string;
	readonly scopes: readonly string[];
}

export const IAgentHostMcpConnectorsService = createDecorator<IAgentHostMcpConnectorsService>('agentHostMcpConnectorsService');

export interface IAgentHostMcpConnectorsService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;

	/** Returns the current in-memory connector set without performing I/O. */
	getCachedConnectors(): readonly IAgentHostMcpConnector[];

	/** Returns the last fetched connector set, fetching it on first use. */
	getConnectors(): Promise<readonly IAgentHostMcpConnector[]>;

	/** Revalidates the connected-plugin catalog with the service. */
	refresh(): Promise<readonly IAgentHostMcpConnector[]>;
}

export function toMcpServerConfigurationMap(connectors: readonly IAgentHostMcpConnector[]): Record<string, IMcpRemoteServerConfiguration> {
	const servers = new Map<string, IMcpRemoteServerConfiguration>();
	for (const connector of connectors) {
		if (!servers.has(connector.serverName)) {
			servers.set(connector.serverName, connector.configuration);
		}
	}
	return Object.fromEntries(servers);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: undefined;
}

function isHttpUrl(value: string): boolean {
	if (!value || value.trim() !== value) {
		return false;
	}
	try {
		const protocol = new URL(value).protocol;
		return protocol === 'http:' || protocol === 'https:';
	} catch {
		return false;
	}
}

function parseConnectedConnectors(body: string, token: string, onDuplicateServerName?: (serverName: string, firstPluginName: string, duplicatePluginName: string) => void): readonly IAgentHostMcpConnector[] {
	const document = asRecord(JSON.parse(body));
	const plugins = document?.['plugins'];
	if (!Array.isArray(plugins)) {
		throw new Error('Connected plugins response does not contain a plugins array');
	}

	const connectors: IAgentHostMcpConnector[] = [];
	const serverOwners = new Map<string, string>();
	for (const value of plugins) {
		const plugin = asRecord(value);
		const pluginName = plugin?.['name'];
		const connection = asRecord(plugin?.['connection']);
		if (typeof pluginName !== 'string' || !pluginName || connection?.['status'] !== 'connected') {
			continue;
		}

		const metadata = asRecord(plugin['metadata']);
		const configuredDisplayName = metadata?.['displayName'];
		const displayName = typeof configuredDisplayName === 'string' && configuredDisplayName ? configuredDisplayName : pluginName;
		const protectedResourceMetadataUrl = connection['protectedResourceMetadataUrl'];
		const configuredScopes = connection['scopes'];
		const scopes = Array.isArray(configuredScopes) ? configuredScopes.filter(scope => typeof scope === 'string') : [];
		const mcpServers = asRecord(asRecord(plugin['mcpServers'])?.['mcpServers']);
		for (const [serverName, serverValue] of Object.entries(mcpServers ?? {})) {
			const server = asRecord(serverValue);
			const url = server?.['url'];
			if (!serverName || server?.['type'] !== 'http' || typeof url !== 'string' || !isHttpUrl(url)) {
				continue;
			}
			const firstPluginName = serverOwners.get(serverName);
			if (firstPluginName !== undefined) {
				onDuplicateServerName?.(serverName, firstPluginName, pluginName);
				continue;
			}
			serverOwners.set(serverName, pluginName);
			connectors.push({
				pluginName,
				displayName,
				serverName,
				configuration: {
					type: McpServerType.REMOTE,
					url,
					headers: { Authorization: `Bearer ${token}` },
				},
				...(typeof protectedResourceMetadataUrl === 'string' && protectedResourceMetadataUrl ? { protectedResourceMetadataUrl } : {}),
				scopes,
			});
		}
	}
	return connectors;
}

function canStoreResponse(response: Response): boolean {
	return !response.headers.get('cache-control')
		?.split(',')
		.some(directive => directive.trim().toLowerCase() === 'no-store');
}

export class AgentHostMcpConnectorsService extends Disposable implements IAgentHostMcpConnectorsService {
	declare readonly _serviceBrand: undefined;

	private readonly _fetch: typeof globalThis.fetch;
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _connectors: readonly IAgentHostMcpConnector[] = [];
	private _cachedRepresentation: ICachedConnectorRepresentation | undefined;
	private _initialized = false;
	private _generation = 0;
	private _refreshPromise: Promise<readonly IAgentHostMcpConnector[]> | undefined;
	private _currentToken: string | undefined;
	private _currentApiBaseUrl: string | undefined;

	constructor(
		fetchFn: typeof globalThis.fetch | undefined,
		private readonly _configuredApiBaseUrl: string | undefined,
		@IAgentHostAuthenticationService private readonly _authenticationService: IAgentHostAuthenticationService,
		@IAgentHostGitHubEndpointService private readonly _gitHubEndpointService: IAgentHostGitHubEndpointService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._fetch = fetchFn ?? globalThis.fetch;
		this._register(this._authenticationService.onDidChangeAuthToken(event => {
			if (event.resource !== this._gitHubEndpointService.getCopilotResource().resource) {
				return;
			}
			this._invalidate();
			void this.refresh();
		}));
		this._register(this._gitHubEndpointService.onDidChange(() => {
			this._invalidate();
			void this.refresh();
		}));
	}

	async getConnectors(): Promise<readonly IAgentHostMcpConnector[]> {
		this._updateContext();
		return this._initialized ? this._connectors : this.refresh();
	}

	getCachedConnectors(): readonly IAgentHostMcpConnector[] {
		this._updateContext();
		return this._connectors;
	}

	refresh(): Promise<readonly IAgentHostMcpConnector[]> {
		this._updateContext();
		if (!this._currentToken || !this._currentApiBaseUrl) {
			this._initialized = true;
			return Promise.resolve(this._connectors);
		}
		if (this._refreshPromise) {
			return this._refreshPromise;
		}

		const generation = this._generation;
		const token = this._currentToken;
		const url = `${this._currentApiBaseUrl}/plugins/connected`;
		const promise = this._doRefresh(generation, url, token).finally(() => {
			if (this._refreshPromise === promise) {
				this._refreshPromise = undefined;
			}
		});
		this._refreshPromise = promise;
		return promise;
	}

	private async _doRefresh(generation: number, url: string, token: string): Promise<readonly IAgentHostMcpConnector[]> {
		try {
			let cached = this._cachedRepresentation?.url === url ? this._cachedRepresentation : undefined;
			let response = await this._request(url, token, cached?.etag);
			if (response.status === 304 && !cached) {
				response = await this._request(url, token);
			}
			if (generation !== this._generation) {
				return this._connectors;
			}
			if (response.status === 304) {
				if (!cached) {
					this._logService.warn('[AgentHostMcpConnectorsService] Connected plugins returned 304 without a cached representation');
					this._initialized = true;
					return this._connectors;
				}
				this._setConnectors(this._parseConnectors(cached.body, token));
				this._initialized = true;
				return this._connectors;
			}
			if (!response.ok) {
				this._logService.warn(`[AgentHostMcpConnectorsService] Connected plugins request failed: ${response.status} ${response.statusText}`);
				if (response.status === 401 || response.status === 403 || response.status === 404) {
					this._initialized = true;
					this._setConnectors([]);
				}
				return this._connectors;
			}

			const body = await response.text();
			const connectors = this._parseConnectors(body, token);
			if (generation !== this._generation) {
				return this._connectors;
			}
			const etag = canStoreResponse(response) ? response.headers.get('etag') : undefined;
			cached = etag ? { url, etag, body } : undefined;
			this._cachedRepresentation = cached;
			this._initialized = true;
			this._setConnectors(connectors);
			return this._connectors;
		} catch (error) {
			if (generation === this._generation) {
				this._logService.warn(`[AgentHostMcpConnectorsService] Failed to refresh connected plugins: ${error instanceof Error ? error.message : String(error)}`);
			}
			return this._connectors;
		}
	}

	private _parseConnectors(body: string, token: string): readonly IAgentHostMcpConnector[] {
		return parseConnectedConnectors(body, token, (serverName, firstPluginName, duplicatePluginName) => {
			this._logService.warn(`[AgentHostMcpConnectorsService] Ignoring duplicate MCP server '${serverName}' from plugin '${duplicatePluginName}'; plugin '${firstPluginName}' already owns that name`);
		});
	}

	private _request(url: string, token: string, etag?: string): Promise<Response> {
		const headers: Record<string, string> = {
			'Accept': 'application/json',
			'Authorization': `Bearer ${token}`,
		};
		if (etag) {
			headers['If-None-Match'] = etag;
		}
		return this._fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(MCP_CONNECTORS_REQUEST_TIMEOUT_MS) });
	}

	private _updateContext(): void {
		const resource = this._gitHubEndpointService.getCopilotResource();
		const token = this._authenticationService.getAuthToken({ resource: resource.resource, scopes: resource.scopes_supported });
		const apiBaseUrl = this._gitHubEndpointService.getEnterpriseHost() === undefined
			? this._configuredApiBaseUrl?.replace(/\/+$/, '')
			: undefined;
		if (token === this._currentToken && apiBaseUrl === this._currentApiBaseUrl) {
			return;
		}
		this._currentToken = token;
		this._currentApiBaseUrl = apiBaseUrl;
		this._invalidate();
	}

	private _invalidate(): void {
		this._generation++;
		this._initialized = false;
		this._cachedRepresentation = undefined;
		this._refreshPromise = undefined;
		this._setConnectors([]);
	}

	private _setConnectors(connectors: readonly IAgentHostMcpConnector[]): void {
		if (equals(this._connectors, connectors)) {
			return;
		}
		this._connectors = connectors;
		this._onDidChange.fire();
	}
}
