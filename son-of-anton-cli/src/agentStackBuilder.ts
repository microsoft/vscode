/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { AgentManager } from 'son-of-anton-core/dist/agents/AgentManager';
import { createAgentStack, type AgentStack } from 'son-of-anton-core/dist/agents/AgentStackFactory';
import type { CoreHost, Disposable } from 'son-of-anton-core/dist/host';
import { LlmClient } from 'son-of-anton-core/dist/llm/LlmClient';
import { McpClient, type McpClientDeps } from 'son-of-anton-core/dist/mcp/McpClient';
import { HookRunner, hooksFilePath } from './persistence/HookRunner';
import { instrumentToolExecutionContext } from './persistence/instrumentToolExecutionContext';
import { buildCliToolExecutionContext } from './toolExecutionContext';

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
	// Construct a real ToolExecutionContext when a workspace root is known so
	// CodeGeneratorAgent's H1 native tool-use loop fires. CLI invocations
	// without a workspace (rare — mostly happens in tests) skip the context
	// and fall back to the legacy diff-parse path.
	const workspaceRoot = host.workspace.folders[0]?.fsPath;
	const baseToolExecutionContext = workspaceRoot ? buildCliToolExecutionContext(workspaceRoot, host) : undefined;
	// Wrap the tool execution context with the hooks runtime when the workspace
	// is trusted AND `.son-of-anton/hooks.json` exists. We skip instantiation
	// (rather than relying solely on the runner's no-op behaviour for empty
	// configs) so untrusted or hook-less workspaces pay zero overhead.
	const hookRunner = workspaceRoot && host.workspace.isTrusted && fs.existsSync(hooksFilePath(workspaceRoot))
		? new HookRunner(host)
		: undefined;
	const toolExecutionContext = baseToolExecutionContext && hookRunner
		? instrumentToolExecutionContext(baseToolExecutionContext, hookRunner)
		: baseToolExecutionContext;
	// `configStore` lets the factory read per-agent model overrides at
	// construction (`sota.agents.<handle>.model` settings in
	// `~/.son-of-anton/config.json`). The CLI process is short-lived so
	// any setting change is picked up on the next `sota` invocation
	// without reload churn.
	const stack = createAgentStack({
		llmClient: llm,
		mcpClient,
		agentManager,
		globalState: host.globalState,
		workspaceRoot,
		projectContext: host.projectContext,
		toolExecutionContext,
		configStore: host.config,
	});

	const dispose = (): void => {
		try { stack.dispose(); } catch { /* swallow on shutdown */ }
		try { mcpClient.dispose(); } catch { /* swallow on shutdown */ }
	};

	return { stack, llm, agentManager, mcpClient, dispose };
}
