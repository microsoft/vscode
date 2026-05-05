/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { MCP } from '../../../../platform/mcp/common/modelContextProtocol.js';

export const IInternalMcpServerRegistry = createDecorator<IInternalMcpServerRegistry>('internalMcpServerRegistry');

/**
 * Context provided to an internal MCP tool invocation through the
 * {@link McpGatewayToolBrokerChannel}. Mirrors the context that real MCP tool
 * calls receive so handlers can correlate calls with the requesting chat
 * session when one exists.
 */
export interface IInternalMcpToolInvocationContext {
	/**
	 * The chat session resource on whose behalf the tool is being invoked, if
	 * any. May be `undefined` when the tool is called outside of a chat
	 * session (e.g. from an external CLI client without a session resource).
	 */
	readonly chatSessionResource?: URI;
}

/**
 * A single tool exposed by an {@link IInternalMcpServer}.
 *
 * The {@link definition} is the MCP-shaped descriptor returned to gateway
 * clients via `tools/list`, and {@link invoke} is the handler invoked when
 * the gateway receives a `tools/call` request for this tool.
 */
export interface IInternalMcpTool {
	readonly definition: MCP.Tool;

	/**
	 * Invoke the tool with the given arguments. Implementations MUST report
	 * tool failures as `{ isError: true, content: [...] }` rather than
	 * throwing — throwing surfaces as an MCP protocol error and the model
	 * cannot self-correct from it.
	 */
	invoke(args: Record<string, unknown>, context: IInternalMcpToolInvocationContext, token: CancellationToken): Promise<MCP.CallToolResult>;
}

/**
 * A virtual MCP server whose tools are implemented in-process by VS Code
 * itself rather than by a real MCP server (HTTP endpoint or spawned process).
 *
 * Internal servers are surfaced through the {@link McpGatewayToolBrokerChannel}
 * alongside real MCP servers so external gateway clients (e.g. Copilot CLI,
 * Claude Code) see them transparently as MCP tools.
 *
 * Internal servers MUST be always-ready: they are not subject to the gateway's
 * server startup / cache state grace period.
 */
export interface IInternalMcpServer {
	/**
	 * Stable identifier used as the gateway server id. SHOULD be namespaced
	 * (e.g. `vscode-internal:browser`) to avoid collisions with real MCP
	 * server ids.
	 */
	readonly id: string;

	/** User-facing label for this server. */
	readonly label: string;

	/**
	 * Observable list of tools exposed by this server. Updates fire
	 * `notifications/tools/list_changed` to gateway clients.
	 */
	readonly tools: IObservable<readonly IInternalMcpTool[]>;
}

/**
 * Registry of in-process virtual MCP servers exposed through the MCP gateway.
 *
 * Workbench contributions register virtual servers here to make their tools
 * available to external gateway clients (Copilot CLI, Claude Code) without
 * requiring those clients to know anything VS Code-specific.
 */
export interface IInternalMcpServerRegistry {
	readonly _serviceBrand: undefined;

	/** Observable list of currently registered internal servers. */
	readonly servers: IObservable<readonly IInternalMcpServer[]>;

	/**
	 * Register a virtual MCP server.
	 *
	 * @returns A disposable that, when disposed, unregisters the server.
	 * @throws If a server with the same {@link IInternalMcpServer.id id} is
	 * already registered.
	 */
	registerServer(server: IInternalMcpServer): IDisposable;
}

export class InternalMcpServerRegistry extends Disposable implements IInternalMcpServerRegistry {
	declare readonly _serviceBrand: undefined;

	private readonly _servers = observableValue<readonly IInternalMcpServer[]>(this, []);
	readonly servers: IObservable<readonly IInternalMcpServer[]> = this._servers;

	registerServer(server: IInternalMcpServer): IDisposable {
		const current = this._servers.get();
		if (current.some(s => s.id === server.id)) {
			throw new Error(`Internal MCP server with id '${server.id}' is already registered`);
		}
		this._servers.set([...current, server], undefined);
		return toDisposable(() => {
			const next = this._servers.get().filter(s => s !== server);
			if (next.length !== this._servers.get().length) {
				this._servers.set(next, undefined);
			}
		});
	}
}
