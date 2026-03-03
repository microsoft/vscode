/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
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
	 */
	private readonly _startupGrace = new Map<string, Promise<boolean>>();

	constructor(
		private readonly _mcpService: IMcpService,
		private readonly _startupGracePeriodMs = 5000,
	) {
		super();

		let toolsInitialized = false;
		this._register(autorun(reader => {
			for (const server of this._mcpService.servers.read(reader)) {
				server.tools.read(reader);
			}

			if (toolsInitialized) {
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
				this._onDidChangeResources.fire();
			} else {
				resourcesInitialized = true;
			}
		}));

		// Invalidate _startupGrace entries when a server's cacheState transitions
		// back to Unknown or Outdated (e.g. after a cache reset), so the next list
		// call will re-wait for the server instead of using a stale resolved promise.
		this._register(autorun(reader => {
			for (const server of this._mcpService.servers.read(reader)) {
				const cacheState = server.cacheState.read(reader);
				if (cacheState === McpServerCacheState.Unknown || cacheState === McpServerCacheState.Outdated) {
					this._startupGrace.delete(server.definition.id);
				}
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
		if (!this._startupGrace.has(id)) {
			this._startupGrace.set(id, Promise.race([
				this._ensureServerReady(server),
				new Promise<boolean>(resolve => setTimeout(() => resolve(false), this._startupGracePeriodMs)),
			]));
		}
		return this._startupGrace.get(id)!;
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
				return [] as MCP.Tool[];
			}
			return server.tools.get()
				.filter(t => t.visibility & McpToolVisibility.Model)
				.map(t => t.definition);
		}));
		return perServer.flat();
	}

	private async _callTool(name: string, args: Record<string, unknown>, token: CancellationToken = CancellationToken.None): Promise<IGatewayCallToolResult> {
		for (const server of this._mcpService.servers.get()) {
			const tool = server.tools.get().find(t =>
				t.definition.name === name && (t.visibility & McpToolVisibility.Model)
			);

			if (tool) {
				const result = await tool.call(args, undefined, token);
				return { result, serverIndex: this._getServerIndex(server) };
			}
		}

		throw new Error(`Unknown tool: ${name}`);
	}

	private async _listResources(): Promise<readonly IGatewayServerResources[]> {
		const results: IGatewayServerResources[] = [];
		const servers = this._mcpService.servers.get();
		await Promise.all(servers.map(async server => {
			if (!await this._shouldUseCachedData(server)) {
				return;
			}

			const capabilities = server.capabilities.get();
			if (!capabilities || !(capabilities & McpCapability.Resources)) {
				return;
			}

			try {
				const resources = await McpServer.callOn(server, h => h.listResources());
				results.push({ serverIndex: this._getServerIndex(server), resources });
			} catch {
				// Server failed; skip
			}
		}));

		return results;
	}

	private async _readResource(serverIndex: number, uri: string, token: CancellationToken = CancellationToken.None): Promise<MCP.ReadResourceResult> {
		const server = this._getServerByIndex(serverIndex);
		if (!server) {
			throw new Error(`Unknown server index: ${serverIndex}`);
		}

		return McpServer.callOn(server, h => h.readResource({ uri }, token), token);
	}

	private async _listResourceTemplates(): Promise<readonly IGatewayServerResourceTemplates[]> {
		const results: IGatewayServerResourceTemplates[] = [];
		const servers = this._mcpService.servers.get();

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
				results.push({ serverIndex: this._getServerIndex(server), resourceTemplates });
			} catch {
				// Server failed; skip
			}
		}));

		return results;
	}

	private async _ensureServerReady(server: IMcpServer): Promise<boolean> {
		const cacheState = server.cacheState.get();
		if (cacheState !== McpServerCacheState.Unknown && cacheState !== McpServerCacheState.Outdated) {
			return true;
		}

		try {
			return await startServerAndWaitForLiveTools(server, {
				promptType: 'all-untrusted',
				errorOnUserInteraction: true,
			});
		} catch {
			return false;
		}
	}
}
