/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IMcpGatewayServerDescriptor } from '../../../../platform/mcp/common/mcpGateway.js';
import { MCP } from '../../../../platform/mcp/common/modelContextProtocol.js';
import { McpServer } from './mcpServer.js';
import { IMcpServer, IMcpService, McpCapability, McpServerCacheState, McpToolVisibility } from './mcpTypes.js';
import { startServerAndWaitForLiveTools } from './mcpTypesUtils.js';

interface ICallToolForServerArgs {
	serverId: string;
	name: string;
	args: Record<string, unknown>;
}

interface IReadResourceForServerArgs {
	serverId: string;
	uri: string;
}

interface IServerIdArg {
	serverId: string;
}

export class McpGatewayToolBrokerChannel extends Disposable implements IServerChannel<unknown> {
	private readonly _onDidChangeTools = this._register(new Emitter<void>());
	private readonly _onDidChangeResources = this._register(new Emitter<void>());
	private readonly _onDidChangeServers = this._register(new Emitter<readonly IMcpGatewayServerDescriptor[]>());

	/**
	 * Per-server promise that races server startup against the grace period timeout.
	 * Once set for a server, subsequent list calls await the already-resolved promise
	 * and return immediately instead of waiting again.
	 *
	 * The `resolved` flag tracks whether the promise has settled. If a server's
	 * cacheState regresses to Unknown/Outdated after the promise resolved (e.g.
	 * after a cache reset), `_waitForStartup` discards the stale entry and creates
	 * a fresh race so the server gets another chance to start.
	 */
	private readonly _startupGrace = new Map<string, { promise: Promise<boolean>; resolved: boolean }>();

	constructor(
		private readonly _mcpService: IMcpService,
		private readonly _logService: ILogService,
		private readonly _startupGracePeriodMs = 5000,
	) {
		super();
		this._logService.debug('[McpGateway][ToolBroker] Initialized');

		let toolsInitialized = false;
		this._register(autorun(reader => {
			for (const server of this._mcpService.servers.read(reader)) {
				server.tools.read(reader);
			}

			if (toolsInitialized) {
				this._logService.debug('[McpGateway][ToolBroker] Tools changed, firing onDidChangeTools');
				this._onDidChangeTools.fire();
			} else {
				toolsInitialized = true;
			}
		}));

		let resourcesInitialized = false;
		this._register(autorun(reader => {
			for (const server of this._mcpService.servers.read(reader)) {
				server.capabilities.read(reader);
			}

			if (resourcesInitialized) {
				this._logService.debug('[McpGateway][ToolBroker] Resources changed, firing onDidChangeResources');
				this._onDidChangeResources.fire();
			} else {
				resourcesInitialized = true;
			}
		}));

		let serversInitialized = false;
		this._register(autorun(reader => {
			const servers = this._mcpService.servers.read(reader);

			if (serversInitialized) {
				this._logService.debug('[McpGateway][ToolBroker] Servers changed, firing onDidChangeServers');
				this._onDidChangeServers.fire(servers.map(s => ({ id: s.definition.id, label: s.definition.label })));
			} else {
				serversInitialized = true;
			}
		}));
	}

	private _getServerById(serverId: string): IMcpServer | undefined {
		for (const server of this._mcpService.servers.get()) {
			if (server.definition.id === serverId) {
				return server;
			}
		}
		return undefined;
	}

	private _waitForStartup(server: IMcpServer): Promise<boolean> {
		const id = server.definition.id;
		const existing = this._startupGrace.get(id);
		// If the previous grace promise already resolved but the server is still
		// Unknown/Outdated, the entry is stale (e.g. caches were reset). Discard
		// it so we create a fresh race below.
		if (existing?.resolved) {
			const state = server.cacheState.get();
			if (state === McpServerCacheState.Unknown || state === McpServerCacheState.Outdated) {
				this._startupGrace.delete(id);
			}
		}
		if (!this._startupGrace.has(id)) {
			const entry: { promise: Promise<boolean>; resolved: boolean } = {
				promise: Promise.race([
					this._ensureServerReady(server),
					new Promise<boolean>(resolve => setTimeout(() => resolve(false), this._startupGracePeriodMs)),
				]),
				resolved: false,
			};
			entry.promise.then(() => { entry.resolved = true; });
			this._startupGrace.set(id, entry);
		}
		return this._startupGrace.get(id)!.promise;
	}

	private async _shouldUseCachedData(server: IMcpServer): Promise<boolean> {
		const cacheState = server.cacheState.get();
		if (cacheState === McpServerCacheState.Unknown || cacheState === McpServerCacheState.Outdated) {
			await this._waitForStartup(server);
			const newState = server.cacheState.get();
			return newState === McpServerCacheState.Live
				|| newState === McpServerCacheState.Cached
				|| newState === McpServerCacheState.RefreshingFromCached;
		}
		return cacheState === McpServerCacheState.Live
			|| cacheState === McpServerCacheState.Cached
			|| cacheState === McpServerCacheState.RefreshingFromCached;
	}

	listen<T>(_ctx: unknown, event: string): Event<T> {
		switch (event) {
			case 'onDidChangeTools':
				return this._onDidChangeTools.event as Event<T>;
			case 'onDidChangeResources':
				return this._onDidChangeResources.event as Event<T>;
			case 'onDidChangeServers':
				return this._onDidChangeServers.event as Event<T>;
		}

		throw new Error(`Invalid listen: ${event}`);
	}

	async call<T>(_ctx: unknown, command: string, arg?: unknown, cancellationToken?: CancellationToken): Promise<T> {
		this._logService.debug(`[McpGateway][ToolBroker] IPC call: ${command}`);

		switch (command) {
			case 'listServers': {
				const servers = this._listServers();
				return servers as T;
			}
			case 'listToolsForServer': {
				const { serverId } = arg as IServerIdArg;
				const tools = await this._listToolsForServer(serverId);
				return tools as T;
			}
			case 'callToolForServer': {
				const { serverId, name, args } = arg as ICallToolForServerArgs;
				const result = await this._callToolForServer(serverId, name, args || {}, cancellationToken);
				return result as T;
			}
			case 'listResourcesForServer': {
				const { serverId } = arg as IServerIdArg;
				const resources = await this._listResourcesForServer(serverId);
				return resources as T;
			}
			case 'readResourceForServer': {
				const { serverId, uri } = arg as IReadResourceForServerArgs;
				const result = await this._readResourceForServer(serverId, uri, cancellationToken);
				return result as T;
			}
			case 'listResourceTemplatesForServer': {
				const { serverId } = arg as IServerIdArg;
				const templates = await this._listResourceTemplatesForServer(serverId);
				return templates as T;
			}
		}

		throw new Error(`Invalid call: ${command}`);
	}

	private _listServers(): readonly IMcpGatewayServerDescriptor[] {
		const servers = this._mcpService.servers.get();
		const result: IMcpGatewayServerDescriptor[] = [];
		for (const server of servers) {
			result.push({ id: server.definition.id, label: server.definition.label });
		}
		this._logService.debug(`[McpGateway][ToolBroker] listServers result: ${result.length} server(s): [${result.map(s => s.label).join(', ')}]`);
		return result;
	}

	private async _listToolsForServer(serverId: string): Promise<readonly MCP.Tool[]> {
		const server = this._getServerById(serverId);
		if (!server) {
			this._logService.warn(`[McpGateway][ToolBroker] listToolsForServer: unknown server '${serverId}'`);
			return [];
		}
		if (!await this._shouldUseCachedData(server)) {
			this._logService.debug(`[McpGateway][ToolBroker] Server '${serverId}' not ready, skipping tool listing`);
			return [];
		}
		const tools = server.tools.get()
			.filter(t => t.visibility & McpToolVisibility.Model)
			.map(t => t.definition);
		this._logService.debug(`[McpGateway][ToolBroker] listToolsForServer '${serverId}': ${tools.length} tool(s)`);
		return tools;
	}

	private async _callToolForServer(serverId: string, name: string, args: Record<string, unknown>, token: CancellationToken = CancellationToken.None): Promise<MCP.CallToolResult> {
		this._logService.debug(`[McpGateway][ToolBroker] callToolForServer '${serverId}' tool '${name}' with args: ${JSON.stringify(args)}`);

		const server = this._getServerById(serverId);
		if (!server) {
			throw new Error(`Unknown server: ${serverId}`);
		}

		const tool = server.tools.get().find(t =>
			t.definition.name === name && (t.visibility & McpToolVisibility.Model)
		);
		if (!tool) {
			throw new Error(`Unknown tool '${name}' on server '${serverId}'`);
		}

		const result = await tool.call(args, undefined, token);
		this._logService.debug(`[McpGateway][ToolBroker] Tool '${name}' on '${serverId}' completed (isError=${result.isError ?? false}, content blocks=${result.content.length})`);
		return result;
	}

	private async _listResourcesForServer(serverId: string): Promise<readonly MCP.Resource[]> {
		const server = this._getServerById(serverId);
		if (!server) {
			this._logService.warn(`[McpGateway][ToolBroker] listResourcesForServer: unknown server '${serverId}'`);
			return [];
		}
		if (!await this._shouldUseCachedData(server)) {
			return [];
		}

		const capabilities = server.capabilities.get();
		if (!capabilities || !(capabilities & McpCapability.Resources)) {
			this._logService.debug(`[McpGateway][ToolBroker] Server '${serverId}' has no resource capability`);
			return [];
		}

		try {
			const resources = await McpServer.callOn(server, h => h.listResources());
			this._logService.debug(`[McpGateway][ToolBroker] Server '${serverId}' listed ${resources.length} resource(s)`);
			return resources;
		} catch (error) {
			this._logService.warn(`[McpGateway][ToolBroker] Server '${serverId}' failed to list resources`, error);
			return [];
		}
	}

	private async _readResourceForServer(serverId: string, uri: string, token: CancellationToken = CancellationToken.None): Promise<MCP.ReadResourceResult> {
		const server = this._getServerById(serverId);
		if (!server) {
			throw new Error(`Unknown server: ${serverId}`);
		}

		this._logService.debug(`[McpGateway][ToolBroker] readResourceForServer '${uri}' from server '${serverId}'`);
		const result = await McpServer.callOn(server, h => h.readResource({ uri }, token), token);
		this._logService.debug(`[McpGateway][ToolBroker] readResourceForServer returned ${result.contents.length} content(s)`);
		return result;
	}

	private async _listResourceTemplatesForServer(serverId: string): Promise<readonly MCP.ResourceTemplate[]> {
		const server = this._getServerById(serverId);
		if (!server) {
			this._logService.warn(`[McpGateway][ToolBroker] listResourceTemplatesForServer: unknown server '${serverId}'`);
			return [];
		}
		if (!await this._shouldUseCachedData(server)) {
			return [];
		}

		const capabilities = server.capabilities.get();
		if (!capabilities || !(capabilities & McpCapability.Resources)) {
			return [];
		}

		try {
			const resourceTemplates = await McpServer.callOn(server, h => h.listResourceTemplates());
			this._logService.debug(`[McpGateway][ToolBroker] Server '${serverId}' listed ${resourceTemplates.length} resource template(s)`);
			return resourceTemplates;
		} catch (error) {
			this._logService.warn(`[McpGateway][ToolBroker] Server '${serverId}' failed to list resource templates`, error);
			return [];
		}
	}

	private async _ensureServerReady(server: IMcpServer): Promise<boolean> {
		const cacheState = server.cacheState.get();
		if (cacheState !== McpServerCacheState.Unknown && cacheState !== McpServerCacheState.Outdated) {
			return true;
		}

		this._logService.debug(`[McpGateway][ToolBroker] Server '${server.definition.id}' not ready (cacheState=${cacheState}), starting...`);
		try {
			const ready = await startServerAndWaitForLiveTools(server, {
				promptType: 'all-untrusted',
				errorOnUserInteraction: true,
			});
			this._logService.debug(`[McpGateway][ToolBroker] Server '${server.definition.id}' ready=${ready}`);
			return ready;
		} catch (error) {
			this._logService.warn(`[McpGateway][ToolBroker] Server '${server.definition.id}' failed to start`, error);
			return false;
		}
	}
}
