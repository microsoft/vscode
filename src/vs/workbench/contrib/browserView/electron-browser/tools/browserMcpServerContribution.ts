/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { MCP } from '../../../../../platform/mcp/common/modelContextProtocol.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IToolInvocation, ILanguageModelToolsService } from '../../../chat/common/tools/languageModelToolsService.js';
import { IInternalMcpServer, IInternalMcpServerRegistry, IInternalMcpTool } from '../../../mcp/common/internalMcpServerRegistry.js';
import { toolResultToMcpCallToolResult } from '../../../mcp/common/internalMcpToolUtils.js';
import { OpenPageToolId } from './openBrowserTool.js';

/**
 * Stable id for the virtual MCP server that exposes VS Code's built-in
 * browser tools through the MCP gateway. Namespaced under `vscode-internal:`
 * to avoid collisions with real MCP server ids.
 */
const BROWSER_MCP_SERVER_ID = 'vscode-internal:browser';

/**
 * Set of internal browser tool ids exposed via the MCP gateway. Initially
 * limited to {@link OpenPageToolId} until the rest of the browser tools have
 * been validated through this transport.
 */
const EXPOSED_BROWSER_TOOL_IDS: ReadonlySet<string> = new Set([OpenPageToolId]);

/**
 * Workbench contribution that exposes a curated subset of VS Code's built-in
 * browser tools as a virtual MCP server through the
 * {@link IInternalMcpServerRegistry MCP gateway registry}.
 *
 * External MCP clients connected to the gateway (e.g. Copilot CLI, Claude Code)
 * see these tools as a regular MCP server alongside any user-installed MCP
 * servers — no client-side knowledge of VS Code internals is required.
 *
 * Tool invocations are routed through {@link ILanguageModelToolsService.invokeTool}
 * so the existing confirmation, telemetry and error-handling pipelines apply
 * uniformly whether a tool is invoked from the chat UI or via the gateway.
 */
export class BrowserMcpServerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'browserView.mcpServer';

	private readonly _serverRegistration = this._register(new MutableDisposable());

	constructor(
		@IInternalMcpServerRegistry private readonly _registry: IInternalMcpServerRegistry,
		@ILanguageModelToolsService private readonly _toolsService: ILanguageModelToolsService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		const tools = observableValue<readonly IInternalMcpTool[]>(this, []);

		const server: IInternalMcpServer = {
			id: BROWSER_MCP_SERVER_ID,
			label: localize('browser.mcpServer.label', 'VS Code Browser Tools'),
			tools,
		};

		const updateTools = () => {
			const next: IInternalMcpTool[] = [];
			for (const id of EXPOSED_BROWSER_TOOL_IDS) {
				const data = this._toolsService.getTool(id);
				if (!data) {
					// Tool not currently registered (e.g. browser sharing disabled). Skip.
					continue;
				}
				next.push({
					definition: {
						name: data.id,
						description: data.modelDescription,
						inputSchema: data.inputSchema as MCP.Tool['inputSchema'],
					},
					invoke: (args, _ctx, token) => this._invokeTool(data.id, args, token),
				});
			}
			tools.set(next, undefined);
		};

		updateTools();
		this._register(this._toolsService.onDidChangeTools(() => updateTools()));
		this._serverRegistration.value = this._registry.registerServer(server);
	}

	private async _invokeTool(toolId: string, args: Record<string, unknown>, token: CancellationToken): Promise<MCP.CallToolResult> {
		// Note: we deliberately invoke without a chat session context. The MCP
		// gateway forwards a session resource for correlation, but it does not
		// correspond to a chat session known to this VS Code window. Passing it
		// as `IToolInvocationContext.sessionResource` would fail the
		// chat-session lookup in `ILanguageModelToolsService.invokeTool`.
		// Without context, the service falls back to surfacing confirmations
		// through the dialog service, which is the desired behaviour for
		// gateway-initiated invocations.
		const invocation: IToolInvocation = {
			callId: generateUuid(),
			toolId,
			parameters: args,
			context: undefined,
		};

		try {
			const result = await this._toolsService.invokeTool(invocation, () => Promise.resolve(0), token);
			return toolResultToMcpCallToolResult(result);
		} catch (err) {
			if (isCancellationError(err)) {
				throw err;
			}
			const message = err instanceof Error ? err.message : String(err);
			this._logService.warn(`[BrowserMcpServer] Tool '${toolId}' failed: ${message}`);
			return {
				content: [{ type: 'text', text: message }],
				isError: true,
			};
		}
	}
}
