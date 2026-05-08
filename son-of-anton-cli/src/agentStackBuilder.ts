/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentManager } from 'son-of-anton-core/dist/agents/AgentManager';
import { createAgentStack, type AgentStack } from 'son-of-anton-core/dist/agents/AgentStackFactory';
import type { CoreHost, Disposable } from 'son-of-anton-core/dist/host';
import { LlmClient } from 'son-of-anton-core/dist/llm/LlmClient';
import { McpClient, type McpClientDeps } from 'son-of-anton-core/dist/mcp/McpClient';

/**
 * Construct the canonical agent stack for the CLI. Mirrors the extension's
 * activation wiring (`extensions/son-of-anton/src/extension.ts`) but uses the
 * file-backed CoreHost from `cliHost.ts` and supplies a no-op MCP server list.
 *
 * The CLI v1 deliberately ships without MCP servers — graph queries will fail
 * gracefully (the orchestrator's `gatherGraphContext` already wraps the call
 * in try/catch and surfaces "(Code graph not available)") so the stack still
 * produces a usable response.
 */
export function buildCliAgentStack(host: CoreHost): { stack: AgentStack; llm: LlmClient; agentManager: AgentManager; mcpClient: McpClient; dispose: () => void } {
	const llm = new LlmClient(host.secrets, host.config);

	// MCP deps wired to "no servers, no live updates". The CLI doesn't
	// currently surface a settings-change hook, so the listener immediately
	// returns a no-op disposable.
	const mcpDeps: McpClientDeps = {
		readServersSetting: () => host.config.get<unknown>('sota.mcp.servers') ?? [],
		getWorkspaceRoot: () => host.workspace.folders[0]?.fsPath,
		onSettingChange: (_listener) => ({ dispose: () => { /* no-op */ } } as Disposable),
	};
	const mcpClient = new McpClient(mcpDeps);

	const agentManager = new AgentManager(llm);
	const stack = createAgentStack({
		llmClient: llm,
		mcpClient,
		agentManager,
		globalState: host.globalState,
		workspaceRoot: host.workspace.folders[0]?.fsPath,
		projectContext: host.projectContext,
	});

	const dispose = (): void => {
		try { stack.dispose(); } catch { /* swallow on shutdown */ }
		try { mcpClient.dispose(); } catch { /* swallow on shutdown */ }
	};

	return { stack, llm, agentManager, mcpClient, dispose };
}
