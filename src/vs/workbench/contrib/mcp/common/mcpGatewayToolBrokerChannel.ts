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
import { IGatewayCallToolResult, IGatewayServerResources, IGatewayServerResourceTemplates } from '../../../../platform/mcp/common/mcpGateway.js';
import { MCP } from '../../../../platform/mcp/common/modelContextProtocol.js';
import { McpServer } from './mcpServer.js';
import { IMcpServer, IMcpService, McpCapability, McpServerCacheState, McpToolVisibility } from './mcpTypes.js';
import { startServerAndWaitForLiveTools } from './mcpTypesUtils.js';

interface ICallToolArgs {
	name: string;
	args: Record<string, unknown>;
}

interface IReadResourceArgs {
	serverIndex: number;
	uri: string;
}

export class McpGatewayToolBrokerChannel extends Disposable implements IServerChannel<unknown> {
	private readonly _onDidChangeTools = this._register(new Emitter<void>());
	private readonly _onDidChangeResources = this._register(new Emitter<void>());
	private readonly _serverIdMap = new Map<string, number>();
	private _nextServerIndex = 0;

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
	}

	private _getServerIndex(server: IMcpServer): number {
		const defId = server.definition.id;
		let index = this._serverIdMap.get(defId);
		if (index === undefined) {
			index = this._nextServerIndex++;
			this._serverIdMap.set(defId, index);
		}
		return index;
	}

	private _getServerByIndex(serverIndex: number): IMcpServer | undefined {
		for (const server of this._mcpService.servers.get()) {
			if (this._getServerIndex(server) === serverIndex) {
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
			// On first list call: wait up to the grace period for the server to start.
			// On subsequent calls: the stored promise is already resolved, returns immediately.
			// Outdated servers get the same grace period as Unknown — a prior fast startup
			// does not guarantee a fast restart.
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
		}

		throw new Error(`Invalid listen: ${event}`);
	}

	async call<T>(_ctx: unknown, command: string, arg?: unknown, cancellationToken?: CancellationToken): Promise<T> {
		this._logService.debug(`[McpGateway][ToolBroker] IPC call: ${command}`);

		switch (command) {
			case 'listTools': {
				const tools = await this._listTools();
				return tools as T;
			}
			case 'callTool': {
				const { name, args } = arg as ICallToolArgs;
				const result = await this._callTool(name, args || {}, cancellationToken);
				return result as T;
			}
			case 'listResources': {
				const resources = await this._listResources();
				return resources as T;
			}
			case 'readResource': {
				const { serverIndex, uri } = arg as IReadResourceArgs;
				const result = await this._readResource(serverIndex, uri, cancellationToken);
				return result as T;
			}
			case 'listResourceTemplates': {
				const templates = await this._listResourceTemplates();
				return templates as T;
			}
		}

		throw new Error(`Invalid call: ${command}`);
	}

	private async _listTools(): Promise<readonly MCP.Tool[]> {
		const servers = this._mcpService.servers.get();
		const perServer = await Promise.all(servers.map(async server => {
			if (!await this._shouldUseCachedData(server)) {
				this._logService.debug(`[McpGateway][ToolBroker] Server '${server.definition.id}' not ready, skipping tool listing`);
				return [] as MCP.Tool[];
			}
			return server.tools.get()
				.filter(t => t.visibility & McpToolVisibility.Model)
				.map(t => t.definition);
		}));

		const mcpTools = perServer.flat();
		this._logService.debug(`[McpGateway][ToolBroker] listTools result: ${mcpTools.length} tool(s): [${mcpTools.map(t => t.name).join(', ')}]`);

		return mcpTools;
	}

	private async _callTool(name: string, args: Record<string, unknown>, token: CancellationToken = CancellationToken.None): Promise<IGatewayCallToolResult> {
		this._logService.debug(`[McpGateway][ToolBroker] callTool '${name}' with args: ${JSON.stringify(args)}`);

		for (const server of this._mcpService.servers.get()) {
			const tool = server.tools.get().find(t =>
				t.definition.name === name && (t.visibility & McpToolVisibility.Model)
			);

			if (tool) {
				this._logService.debug(`[McpGateway][ToolBroker] Found tool '${name}' on server '${server.definition.id}' (index=${this._getServerIndex(server)})`);
				const result = await tool.call(args, undefined, token);
				this._logService.debug(`[McpGateway][ToolBroker] Tool '${name}' completed (isError=${result.isError ?? false}, content blocks=${result.content.length})`);
				return { result, serverIndex: this._getServerIndex(server) };
			}
		}

		this._logService.warn(`[McpGateway][ToolBroker] Tool '${name}' not found on any server`);
		throw new Error(`Unknown tool: ${name}`);
	}

	private async _listResources(): Promise<readonly IGatewayServerResources[]> {
		const results: IGatewayServerResources[] = [];
		const servers = this._mcpService.servers.get();
		this._logService.debug(`[McpGateway][ToolBroker] listResources: ${servers.length} server(s) known`);

		await Promise.all(servers.map(async server => {
			if (!await this._shouldUseCachedData(server)) {
				return;
			}

			const capabilities = server.capabilities.get();
			if (!capabilities || !(capabilities & McpCapability.Resources)) {
				this._logService.debug(`[McpGateway][ToolBroker] Server '${server.definition.id}' has no resource capability, skipping`);
				return;
			}

			try {
				const resources = await McpServer.callOn(server, h => h.listResources());
				this._logService.debug(`[McpGateway][ToolBroker] Server '${server.definition.id}' (index=${this._getServerIndex(server)}) listed ${resources.length} resource(s)`);
				results.push({ serverIndex: this._getServerIndex(server), resources });
			} catch (error) {
				this._logService.warn(`[McpGateway][ToolBroker] Server '${server.definition.id}' failed to list resources`, error);
			}
		}));

		this._logService.debug(`[McpGateway][ToolBroker] listResources result: ${results.length} server(s) with resources`);
		return results;
	}

	private async _readResource(serverIndex: number, uri: string, token: CancellationToken = CancellationToken.None): Promise<MCP.ReadResourceResult> {
		const server = this._getServerByIndex(serverIndex);
		if (!server) {
			this._logService.warn(`[McpGateway][ToolBroker] readResource: unknown server index ${serverIndex}`);
			throw new Error(`Unknown server index: ${serverIndex}`);
		}

		this._logService.debug(`[McpGateway][ToolBroker] readResource '${uri}' from server '${server.definition.id}' (index=${serverIndex})`);
		const result = await McpServer.callOn(server, h => h.readResource({ uri }, token), token);
		this._logService.debug(`[McpGateway][ToolBroker] readResource returned ${result.contents.length} content(s)`);
		return result;
	}

	private async _listResourceTemplates(): Promise<readonly IGatewayServerResourceTemplates[]> {
		const results: IGatewayServerResourceTemplates[] = [];
		const servers = this._mcpService.servers.get();
		this._logService.debug(`[McpGateway][ToolBroker] listResourceTemplates: ${servers.length} server(s) known`);

		await Promise.all(servers.map(async server => {
			if (!await this._shouldUseCachedData(server)) {
				return;
			}

			const capabilities = server.capabilities.get();
			if (!capabilities || !(capabilities & McpCapability.Resources)) {
				return;
			}

			try {
				const resourceTemplates = await McpServer.callOn(server, h => h.listResourceTemplates());
				this._logService.debug(`[McpGateway][ToolBroker] Server '${server.definition.id}' (index=${this._getServerIndex(server)}) listed ${resourceTemplates.length} resource template(s)`);
				results.push({ serverIndex: this._getServerIndex(server), resourceTemplates });
			} catch (error) {
				this._logService.warn(`[McpGateway][ToolBroker] Server '${server.definition.id}' failed to list resource templates`, error);
			}
		}));

		this._logService.debug(`[McpGateway][ToolBroker] listResourceTemplates result: ${results.length} server(s) with templates`);
		return results;
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
