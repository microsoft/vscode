/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IMcpService, IMcpServer } from '../../mcp/common/mcpTypes.js';
import { IPhononAgentPoolService, IPhononAgentOutput } from '../common/phononAgentPool.js';
import { ILiquidModuleRegistry } from '../common/liquidModule.js';
import { ICompositionIntent } from '../common/liquidModuleTypes.js';
import { autorun } from '../../../../base/common/observable.js';

/**
 * Pattern for MCP tool invocations in agent output:
 *   [MCP:tool_name]({"param": "value"})
 *
 * The bridge intercepts these patterns from completed agent output,
 * executes the tool on the corresponding MCP server, and sends the
 * result back to the agent as a follow-up prompt.
 */
const MCP_TOOL_CALL_RE = /\[MCP:(\w[\w.-]*)\]\((\{[\s\S]*?\})\)/g;

export interface IMcpToolCallResult {
	readonly toolName: string;
	readonly success: boolean;
	readonly content: string;
}

/**
 * Bridges MCP tool invocations from Phonon agent output to the MCP server infrastructure.
 *
 * Flow:
 *   Agent output contains [MCP:tool_name](params) → bridge parses →
 *   finds tool on MCP server → calls tool.call(params) →
 *   result injected as follow-up to agent
 */
export class PhononMcpBridge extends Disposable {

	private static readonly INTENT_BLOCK_RE = /```phonon-intent\s*\n([\s\S]*?)\n```/g;

	private readonly _serverToolMap = new Map<string, { server: IMcpServer; toolName: string }>();

	private readonly _onDidReceiveIntent = this._register(new Emitter<ICompositionIntent>());
	readonly onDidReceiveIntent: Event<ICompositionIntent> = this._onDidReceiveIntent.event;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IMcpService private readonly mcpService: IMcpService,
		@IPhononAgentPoolService private readonly agentPoolService: IPhononAgentPoolService,
		@ILiquidModuleRegistry private readonly liquidModuleRegistry: ILiquidModuleRegistry,
	) {
		super();
		this._observeServers();
		this._observeAgentOutput();
	}

	/**
	 * Track available MCP tools across all servers.
	 * Rebuilds the tool map whenever servers change.
	 */
	private _observeServers(): void {
		this._register(autorun(reader => {
			const servers = this.mcpService.servers.read(reader);
			this._serverToolMap.clear();

			for (const server of servers) {
				const tools = server.tools.read(reader);
				for (const tool of tools) {
					const name = tool.referenceName ?? tool.definition.name;
					this._serverToolMap.set(name, { server, toolName: tool.definition.name });
				}
			}

			this.logService.trace(`[Phonon MCP Bridge] Tool map rebuilt: ${this._serverToolMap.size} tools from ${servers.length} servers`);
		}));
	}

	/**
	 * Listen for final agent output and scan for MCP tool call patterns.
	 */
	private _observeAgentOutput(): void {
		this._register(this.agentPoolService.onDidAgentOutput((event: IPhononAgentOutput) => {
			if (!event.isFinal) {
				return;
			}

			// Get full output from the agent
			const agent = this.agentPoolService.agents.find(a => a.id === event.agentId);
			if (!agent?.outputSoFar) {
				return;
			}

			this._processToolCalls(event.agentId, agent.outputSoFar);
			this._processIntentBlocks(agent.outputSoFar);
		}));
	}

	/**
	 * Parse output for [MCP:tool](params) patterns and execute found calls.
	 */
	private async _processToolCalls(agentId: string, output: string): Promise<void> {
		const calls: Array<{ toolName: string; params: Record<string, unknown> }> = [];

		let match: RegExpExecArray | null;
		MCP_TOOL_CALL_RE.lastIndex = 0;
		while ((match = MCP_TOOL_CALL_RE.exec(output)) !== null) {
			const toolName = match[1];
			try {
				const params = JSON.parse(match[2]) as Record<string, unknown>;
				calls.push({ toolName, params });
			} catch {
				this.logService.warn(`[Phonon MCP Bridge] Failed to parse params for tool ${toolName}`);
			}
		}

		if (calls.length === 0) {
			return;
		}

		this.logService.info(`[Phonon MCP Bridge] Found ${calls.length} MCP tool call(s) in agent ${agentId} output`);

		const results: IMcpToolCallResult[] = [];
		for (const call of calls) {
			const result = await this._executeTool(call.toolName, call.params);
			results.push(result);
		}

		// Inject results back to the agent
		const resultText = results.map(r => {
			const status = r.success ? 'OK' : 'ERROR';
			return `## MCP Tool Result: ${r.toolName} [${status}]\n\n${r.content}`;
		}).join('\n\n---\n\n');

		try {
			await this.agentPoolService.sendToAgent(agentId, `The following MCP tool calls have been executed:\n\n${resultText}\n\nContinue based on these results.`);
		} catch (err) {
			this.logService.warn(`[Phonon MCP Bridge] Failed to send tool results to agent ${agentId}: ${err}`);
		}
	}

	/**
	 * Execute a single MCP tool call by finding it on a server and calling it.
	 */
	private async _executeTool(toolName: string, params: Record<string, unknown>): Promise<IMcpToolCallResult> {
		const entry = this._serverToolMap.get(toolName);
		if (!entry) {
			return {
				toolName,
				success: false,
				content: `Tool '${toolName}' not found on any MCP server`,
			};
		}

		const { server, toolName: serverToolName } = entry;
		const tool = server.tools.get().find(t => t.definition.name === serverToolName);
		if (!tool) {
			return {
				toolName,
				success: false,
				content: `Tool '${toolName}' no longer available on server '${server.definition.label}'`,
			};
		}

		try {
			this.logService.info(`[Phonon MCP Bridge] Calling tool '${toolName}' on server '${server.definition.label}'`);
			const result = await tool.call(params, undefined, CancellationToken.None);

			const contentParts: string[] = [];
			if (result.content) {
				for (const part of result.content) {
					if (part.type === 'text') {
						contentParts.push(part.text);
					} else if (part.type === 'image') {
						contentParts.push(`[image: ${(part as { mimeType?: string }).mimeType ?? 'unknown'}]`);
					} else {
						contentParts.push(JSON.stringify(part));
					}
				}
			}

			return {
				toolName,
				success: !result.isError,
				content: contentParts.join('\n') || '(empty result)',
			};
		} catch (err) {
			this.logService.warn(`[Phonon MCP Bridge] Tool '${toolName}' call failed: ${err}`);
			return {
				toolName,
				success: false,
				content: `${err}`,
			};
		}
	}

	/**
	 * Scan output for ```phonon-intent blocks, validate them via the liquid
	 * module registry, and fire onDidReceiveIntent for valid intents.
	 */
	private _processIntentBlocks(output: string): void {
		let match: RegExpExecArray | null;
		PhononMcpBridge.INTENT_BLOCK_RE.lastIndex = 0;
		while ((match = PhononMcpBridge.INTENT_BLOCK_RE.exec(output)) !== null) {
			let intent: ICompositionIntent;
			try {
				intent = JSON.parse(match[1]) as ICompositionIntent;
			} catch {
				this.logService.warn('[Phonon MCP Bridge] Failed to parse phonon-intent JSON');
				continue;
			}

			const validation = this.liquidModuleRegistry.validateIntent(intent);
			if (validation.valid) {
				this.logService.info(`[Phonon MCP Bridge] Valid composition intent: layout=${intent.layout}, slots=${intent.slots.length}`);
				this._onDidReceiveIntent.fire(intent);
			} else {
				this.logService.warn(`[Phonon MCP Bridge] Invalid composition intent: ${validation.errors.join('; ')}`);
			}
		}
	}
}
