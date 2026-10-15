/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAgentHost } from './host';
import { ApprovalRequiredTool } from './approvalTool';
import { findInputHazards, validateJsonSchema } from './jsonSchema';
import { FinishReason, ILlmClient, LlmMessage, LlmToolCall } from './llm';
import { ToolContext, ToolError, toToolSpec } from './tool';
import { IToolSet } from './toolRegistry';

export interface AgentProfile {
	/** Stable id, e.g. `fw-dev`; used in approvals, logs and the audit trail. */
	readonly id: string;
	readonly systemPrompt: string;
	/** Model calls per run before giving up (default 20). */
	readonly maxSteps?: number;
	/** Longer tool results are cut, so one memory dump cannot flood the context (default 20000). */
	readonly maxToolResultChars?: number;
	/** Tool calls run per model step; the rest are refused (default 16). */
	readonly maxToolCallsPerStep?: number;
}

export interface AgentRunOptions {
	readonly signal?: AbortSignal;
	/** Earlier turns of the same conversation. */
	readonly history?: readonly LlmMessage[];
	readonly onEvent?: (event: AgentEvent) => void;
}

export type AgentEvent =
	| { readonly kind: 'step'; readonly step: number }
	| { readonly kind: 'text-delta'; readonly text: string }
	| { readonly kind: 'tool-call'; readonly call: LlmToolCall }
	| { readonly kind: 'tool-result'; readonly callId: string; readonly name: string; readonly ok: boolean; readonly content: string };

export type AgentStopReason = 'done' | 'max-steps' | 'cancelled' | 'length' | 'content-filter' | 'error';

export interface AgentRunResult {
	/** The model's final answer (text of the last step). */
	readonly text: string;
	readonly stopReason: AgentStopReason;
	readonly steps: number;
	/** Full conversation including this run, to pass back as `history`. */
	readonly messages: readonly LlmMessage[];
}

/**
 * Template Method: `run` is the ReAct loop (ask the model → run the tools it asked for → feed
 * the results back → repeat) and is the same for every agent. Subclasses supply the profile and
 * may override the hooks. Tools run one at a time, in order: hardware tools must never overlap.
 * Every non-read tool goes through approval here, whether or not the caller wrapped it.
 */
export abstract class Agent {
	constructor(
		protected readonly llm: ILlmClient,
		protected readonly tools: IToolSet,
		protected readonly host: IAgentHost,
	) { }

	protected abstract readonly profile: AgentProfile;

	get id(): string {
		return this.profile.id;
	}

	async run(task: string, options: AgentRunOptions = {}): Promise<AgentRunResult> {
		const signal = options.signal ?? new AbortController().signal;
		const emit = options.onEvent ?? (() => { });
		const maxSteps = this.profile.maxSteps ?? 20;
		const messages: LlmMessage[] = [...options.history ?? [], { role: 'user', content: this.buildTaskMessage(task) }];
		const toolSpecs = this.tools.list().map(toToolSpec);
		const system = this.buildSystemPrompt();
		let text = '';

		for (let step = 1; step <= maxSteps; step++) {
			if (signal.aborted) {
				return { text, stopReason: 'cancelled', steps: step - 1, messages };
			}
			emit({ kind: 'step', step });
			text = '';
			const calls: LlmToolCall[] = [];
			let finish: FinishReason = 'stop';
			try {
				for await (const event of this.llm.chat({ system, messages, tools: toolSpecs }, signal)) {
					if (event.kind === 'text-delta') {
						text += event.text;
						emit(event);
					} else if (event.kind === 'tool-call') {
						calls.push(event.call);
						emit(event);
					} else {
						finish = event.reason;
					}
				}
			} catch (err) {
				if (signal.aborted) {
					return { text, stopReason: 'cancelled', steps: step, messages };
				}
				throw err;
			}

			messages.push({ role: 'assistant', content: text, ...calls.length ? { toolCalls: calls } : {} });
			if (!calls.length) {
				return { text, stopReason: finish === 'tool-calls' || finish === 'stop' ? 'done' : finish, steps: step, messages };
			}
			const maxCalls = this.profile.maxToolCallsPerStep ?? 16;
			for (const [i, call] of calls.entries()) {
				// Every tool call needs a result, or the history is invalid for the next request.
				const { ok, content } = signal.aborted
					? this.failure('Cancelled before this tool ran.')
					: i >= maxCalls
						? this.failure(`Too many tool calls in one step (limit ${maxCalls}); this one was not run.`)
						: await this.executeToolCall(call, signal);
				messages.push({ role: 'tool', toolCallId: call.id, content });
				emit({ kind: 'tool-result', callId: call.id, name: call.name, ok, content });
			}
			if (signal.aborted) {
				return { text, stopReason: 'cancelled', steps: step, messages };
			}
		}
		return { text, stopReason: 'max-steps', steps: maxSteps, messages };
	}

	/** Hook: the system prompt (default: the profile's). */
	protected buildSystemPrompt(): string {
		return this.profile.systemPrompt;
	}

	/** Hook: wraps the task before it goes to the model (default: unchanged). */
	protected buildTaskMessage(task: string): string {
		return task;
	}

	/** Hook: turns a tool's return value into the text the model sees. */
	protected formatToolResult(value: unknown): string {
		return typeof value === 'string' ? value : JSON.stringify(value ?? null);
	}

	private async executeToolCall(call: LlmToolCall, signal: AbortSignal): Promise<{ ok: boolean; content: string }> {
		const found = this.tools.get(call.name);
		if (!found) {
			const available = this.tools.list().map(t => t.name).join(', ');
			return this.failure(`Unknown tool "${call.name}". Available tools: ${available || 'none'}.`);
		}
		if (call.inputError) {
			return this.failure(`Arguments for "${call.name}" are not valid JSON (${call.inputError}).`);
		}
		const tool = found instanceof ApprovalRequiredTool ? found : new ApprovalRequiredTool(found);
		const input = call.input ?? {};
		const context: ToolContext = { host: this.host, signal, agentId: this.profile.id, callId: call.id };
		try {
			// Hazards first: schema validation recurses, so it only sees input of bounded depth.
			const hazards = findInputHazards(input);
			const problems = hazards.length ? hazards : validateJsonSchema(tool.inputSchema, input);
			if (problems.length) {
				return this.failure(`Invalid arguments for "${call.name}": ${[...new Set(problems)].join('; ')}.`);
			}
			const value = await tool.invoke(input, context);
			return { ok: true, content: this.truncate(this.formatToolResult(value)) };
		} catch (err) {
			if (err instanceof ToolError) {
				return this.failure(err.message, err.details);
			}
			this.host.log('error', `[${this.profile.id}] tool ${call.name} crashed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
			return this.failure(`Tool "${call.name}" failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private failure(message: string, details?: unknown): { ok: false; content: string } {
		return { ok: false, content: this.truncate(JSON.stringify(details === undefined ? { error: message } : { error: message, details })) };
	}

	private truncate(content: string): string {
		const max = this.profile.maxToolResultChars ?? 20000;
		return content.length <= max ? content : `${content.slice(0, max)}\n…[truncated ${content.length - max} characters]`;
	}
}
