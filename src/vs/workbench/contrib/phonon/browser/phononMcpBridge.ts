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
import { ICompositionIntent, CompositionLayout } from '../common/liquidGraftTypes.js';
import { ICompositionEngine } from './liquidCompositor.js';
import { validateIntent as validateGatekeeperIntent } from './liquidGatekeeper.js';
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
 * Also processes composition intents in two formats:
 *   1. Composed intent: { layout, slots } -- validated via registry, fired directly.
 *   2. Raw intent: { action, entities } -- validated via 7-gate gatekeeper,
 *      composed via compositor, then fired.
 */
export class PhononMcpBridge extends Disposable {

	private readonly _serverToolMap = new Map<string, { server: IMcpServer; toolName: string }>();

	private readonly _onDidReceiveIntent = this._register(new Emitter<ICompositionIntent>());
	readonly onDidReceiveIntent: Event<ICompositionIntent> = this._onDidReceiveIntent.event;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IMcpService private readonly mcpService: IMcpService,
		@IPhononAgentPoolService private readonly agentPoolService: IPhononAgentPoolService,
		@ILiquidModuleRegistry private readonly liquidModuleRegistry: ILiquidModuleRegistry,
		@ICompositionEngine private readonly compositionEngine: ICompositionEngine,
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
	 * Process arbitrary chat output for intent blocks.
	 * Used by the chat agent for solo mode output (which bypasses the agent pool).
	 */
	processOutput(output: string): void {
		this._processIntentBlocks(output);
	}

	/**
	 * Scan output for composition intent blocks, validate, and fire onDidReceiveIntent.
	 *
	 * Supports two intent formats:
	 *   1. Raw intent: { action, entities, depth?, preferredLayout?, params? }
	 *      Validated via 7-gate gatekeeper, then composed via compositor.
	 *   2. Composed intent: { layout, slots }
	 *      Validated via registry.validateIntent(), fired directly.
	 *
	 * Extraction strategy:
	 *   1. ```phonon-intent fenced blocks (preferred, unambiguous)
	 *   2. ```json fenced blocks that contain intent-like keys
	 *   3. Bare JSON objects with bracket-counting
	 */
	private _processIntentBlocks(output: string): void {
		const candidates: string[] = [];

		// Pattern 1: ```phonon-intent fenced blocks (unambiguous)
		const phononFenceRe = /```phonon-intent\s*\n([\s\S]*?)\n```/g;
		let match: RegExpExecArray | null;
		while ((match = phononFenceRe.exec(output)) !== null) {
			candidates.push(match[1]);
		}

		// Pattern 2: ```json fenced blocks, only if they contain intent-like keys
		if (candidates.length === 0) {
			const jsonFenceRe = /```json\s*\n([\s\S]*?)\n```/g;
			while ((match = jsonFenceRe.exec(output)) !== null) {
				const content = match[1];
				const hasComposedKeys = content.includes('"layout"') && content.includes('"slots"');
				const hasRawKeys = content.includes('"action"') || content.includes('"entities"');
				if (hasComposedKeys || hasRawKeys) {
					candidates.push(content);
				}
			}
		}

		// allow-any-unicode-next-line
		// Pattern 3: bare JSON -- bracket-counting parser for nested objects
		if (candidates.length === 0) {
			const bareResults = this._extractBareIntentJSON(output);
			for (const result of bareResults) {
				candidates.push(result);
			}
		}

		for (const raw of candidates) {
			let parsed: Record<string, unknown>;
			try {
				parsed = JSON.parse(raw) as Record<string, unknown>;
			} catch {
				this.logService.warn('[Phonon MCP Bridge] Failed to parse phonon-intent JSON');
				continue;
			}

			// Detect format: raw intent (action/entities) vs composed intent (layout/slots)
			if ((parsed.action !== undefined || parsed.entities !== undefined) && parsed.layout === undefined) {
				this._processRawIntent(parsed);
				continue;
			}

			this._processComposedIntent(parsed);
		}
	}

	/**
	 * Process a raw intent through the 7-gate gatekeeper then the compositor.
	 */
	private _processRawIntent(parsed: Record<string, unknown>): void {
		const gateResult = validateGatekeeperIntent(parsed, this.liquidModuleRegistry);
		if (!gateResult.valid) {
			this.logService.warn(`[Phonon MCP Bridge] Gatekeeper rejected: gate ${gateResult.gate} (${gateResult.gateName}) - ${gateResult.error}`);
			return;
		}

		const sp = gateResult.sanitizedParams!;
		const entities = (sp.entities as string[]) ?? [];
		const action = (sp.action as string) ?? 'show';
		const depth = (sp.depth as number) ?? 0;
		const preferredLayout = sp.preferredLayout as CompositionLayout | undefined;

		const composed = this.compositionEngine.composeFromIntent(entities, action, depth, preferredLayout);
		if (composed) {
			this.logService.info(`[Phonon MCP Bridge] Raw intent composed: layout=${composed.layout}, slots=${composed.slots.length}`);
			this._onDidReceiveIntent.fire(composed);
		} else {
			this.logService.warn('[Phonon MCP Bridge] Compositor returned no intent for raw input');
		}
	}

	/**
	 * Process a composed intent (layout + slots) via registry validation.
	 */
	private _processComposedIntent(parsed: Record<string, unknown>): void {
		const intent = parsed as unknown as ICompositionIntent;

		// Structural check: must have layout and slots array
		if (!intent.layout || !Array.isArray(intent.slots)) {
			return;
		}

		const validation = this.liquidModuleRegistry.validateIntent(intent);
		if (validation.valid) {
			this.logService.info(`[Phonon MCP Bridge] Valid composition intent: layout=${intent.layout}, slots=${intent.slots.length}`);
			this._onDidReceiveIntent.fire(intent);
		} else {
			this.logService.warn(`[Phonon MCP Bridge] Invalid composition intent: ${validation.errors.join('; ')}`);
		}
	}

	/**
	 * Bracket-counting JSON extraction: finds `{` characters in text,
	 * counts nested braces to find the matching `}`, and attempts
	 * JSON.parse. Only returns objects that have intent-like keys.
	 */
	private _extractBareIntentJSON(output: string): string[] {
		const results: string[] = [];
		// allow-any-unicode-next-line
		// Find positions where intent-like keys appear -- only scan from nearby `{`
		const intentKeyRe = /"(?:layout|action)"\s*:/g;
		let keyMatch: RegExpExecArray | null;

		while ((keyMatch = intentKeyRe.exec(output)) !== null) {
			// Walk backwards to find the opening `{`
			let start = keyMatch.index;
			while (start > 0 && output[start] !== '{') {
				start--;
			}
			if (output[start] !== '{') {
				continue;
			}

			// Bracket-counting forward to find matching `}`
			let depth = 0;
			let end = start;
			for (; end < output.length; end++) {
				if (output[end] === '{') {
					depth++;
				} else if (output[end] === '}') {
					depth--;
					if (depth === 0) {
						break;
					}
				}
			}

			if (depth !== 0) {
				continue;
			}

			const candidate = output.substring(start, end + 1);
			const hasIntentShape = candidate.includes('"slots"') || candidate.includes('"entities"');
			if (hasIntentShape) {
				try {
					JSON.parse(candidate); // validate it's parseable
					results.push(candidate);
				} catch {
					// not valid JSON, skip
				}
			}
		}

		return results;
	}
}
