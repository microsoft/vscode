/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IMcpServer, IMcpService, McpServerCacheState, McpToolVisibility } from './mcpTypes.js';
import { MCP } from '../../../../platform/mcp/common/modelContextProtocol.js';
import { startServerAndWaitForLiveTools } from './mcpTypesUtils.js';

interface ICallToolArgs {
	name: string;
	args: Record<string, unknown>;
}

export class McpGatewayToolBrokerChannel extends Disposable implements IServerChannel<unknown> {
	private readonly _onDidChangeTools = this._register(new Emitter<void>());

	constructor(
		private readonly _mcpService: IMcpService,
	) {
		super();

		let initialized = false;
		this._register(autorun(reader => {
			for (const server of this._mcpService.servers.read(reader)) {
				server.tools.read(reader);
			}

			if (initialized) {
				this._onDidChangeTools.fire();
			} else {
				initialized = true;
			}
		}));
	}

	listen<T>(_ctx: unknown, event: string): Event<T> {
		switch (event) {
			case 'onDidChangeTools':
				return this._onDidChangeTools.event as Event<T>;
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
		}

		throw new Error(`Invalid call: ${command}`);
	}

	private async _listTools(): Promise<readonly MCP.Tool[]> {
		const mcpTools: MCP.Tool[] = [];
		const servers = this._mcpService.servers.get();
		await Promise.all(servers.map(server => this._ensureServerReady(server)));

		for (const server of servers) {
			const cacheState = server.cacheState.get();
			if (cacheState !== McpServerCacheState.Live && cacheState !== McpServerCacheState.Cached && cacheState !== McpServerCacheState.RefreshingFromCached) {
				continue;
			}

			for (const tool of server.tools.get()) {
				if (!(tool.visibility & McpToolVisibility.Model)) {
					continue;
				}

				mcpTools.push(tool.definition);
			}
		}

		return mcpTools;
	}

	private async _callTool(name: string, args: Record<string, unknown>, token: CancellationToken = CancellationToken.None): Promise<MCP.CallToolResult> {
		for (const server of this._mcpService.servers.get()) {
			const tool = server.tools.get().find(t =>
				t.definition.name === name && (t.visibility & McpToolVisibility.Model)
			);

			if (tool) {
				return tool.call(args, undefined, token);
			}
		}

		throw new Error(`Unknown tool: ${name}`);
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
