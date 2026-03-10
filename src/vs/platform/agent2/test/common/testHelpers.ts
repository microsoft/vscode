/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared test helpers for agent2 tests.
 *
 * These helpers are used by both unit tests (agentLoop.test.ts) and scenario
 * tests (scenarios.test.ts). Centralizing them avoids duplication and ensures
 * a consistent mock API across all test files.
 */

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { AgentLoop, IAgentLoopConfig } from '../../common/agentLoop.js';
import { IConversationMessage, IModelIdentity } from '../../common/conversation.js';
import { AgentLoopEvent, IAgentLoopEventMap } from '../../common/events.js';
import { IModelProvider, IModelRequestConfig, ModelResponseChunk } from '../../common/modelProvider.js';
import { IAgentTool, IAgentToolDefinition, IToolContext, IToolResult } from '../../common/tools.js';
import { IAgentProgressEvent } from '../../../agent/common/agentService.js';

export const testModel: IModelIdentity = { provider: 'test', modelId: 'test-model' };

// -- Mock providers -----------------------------------------------------------

/**
 * Creates a mock model provider that returns a fixed sequence of responses.
 * Each response is a sequence of chunks yielded in order.
 */
export function createMockProvider(responses: ModelResponseChunk[][]): IModelProvider {
	let callIndex = 0;
	return {
		providerId: 'test',
		async *sendRequest(
			_systemPrompt: string,
			_messages: readonly IConversationMessage[],
			_tools: readonly IAgentToolDefinition[],
			_config: IModelRequestConfig,
			_token: CancellationToken,
		): AsyncGenerator<ModelResponseChunk> {
			const chunks = responses[callIndex++];
			if (!chunks) {
				throw new Error('Mock provider: no more responses');
			}
			for (const chunk of chunks) {
				yield chunk;
			}
		},
		async listModels() { return []; },
	};
}

/**
 * Creates a mock provider that captures the messages sent to each model call,
 * and uses a callback to decide what to yield.
 */
export function createCapturingProvider(
	handler: (callIndex: number, messages: readonly IConversationMessage[]) => ModelResponseChunk[],
): { provider: IModelProvider; capturedCalls: IConversationMessage[][] } {
	const capturedCalls: IConversationMessage[][] = [];
	let callIndex = 0;
	const provider: IModelProvider = {
		providerId: 'test',
		async *sendRequest(
			_systemPrompt: string,
			messages: readonly IConversationMessage[],
		): AsyncGenerator<ModelResponseChunk> {
			capturedCalls.push([...messages]);
			const chunks = handler(callIndex++, messages);
			for (const chunk of chunks) {
				yield chunk;
			}
		},
		async listModels() { return []; },
	};
	return { provider, capturedCalls };
}

// -- Mock tools ---------------------------------------------------------------

/**
 * Creates a mock tool with a simple handler.
 */
export function createMockTool(
	name: string,
	readOnly: boolean,
	handler: (args: Record<string, unknown>, context: IToolContext) => string | Promise<string>,
): IAgentTool {
	return {
		name,
		description: `Test tool: ${name}`,
		parametersSchema: { type: 'object', properties: {} },
		readOnly,
		async execute(args: Record<string, unknown>, context: IToolContext): Promise<IToolResult> {
			const content = await handler(args, context);
			return { content };
		},
	};
}

/**
 * Creates a tool that always throws.
 */
export function createErrorTool(name: string, error: string): IAgentTool {
	return {
		name,
		description: `Test error tool: ${name}`,
		parametersSchema: { type: 'object', properties: {} },
		readOnly: false,
		async execute(_args: Record<string, unknown>, _context: IToolContext): Promise<IToolResult> {
			throw new Error(error);
		},
	};
}

// -- Config helpers -----------------------------------------------------------

/**
 * Builds a config with defaults, overriding only the provided fields.
 */
export function defaultConfig(overrides: Partial<IAgentLoopConfig>): IAgentLoopConfig {
	return {
		modelProvider: overrides.modelProvider ?? createMockProvider([]),
		modelIdentity: overrides.modelIdentity ?? testModel,
		systemPrompt: overrides.systemPrompt ?? 'You are a test assistant.',
		tools: overrides.tools ?? [],
		requestConfig: overrides.requestConfig,
		middleware: overrides.middleware,
		maxIterations: overrides.maxIterations,
		scratchpad: overrides.scratchpad,
		workingDirectory: overrides.workingDirectory,
	};
}

// -- Event collection ---------------------------------------------------------

/**
 * Runs the agent loop to completion and returns all emitted events.
 */
export async function runAgentAndCollectEvents(
	messages: readonly IConversationMessage[],
	config: IAgentLoopConfig,
	token: CancellationToken = CancellationToken.None,
): Promise<AgentLoopEvent[]> {
	const events: AgentLoopEvent[] = [];
	const loop = new AgentLoop(config);
	for await (const event of loop.run(messages, token)) {
		events.push(event);
	}
	return events;
}

/**
 * Filters collected events by type, with proper type narrowing.
 */
export function findEvents<K extends keyof IAgentLoopEventMap>(events: AgentLoopEvent[], type: K): IAgentLoopEventMap[K][] {
	return events.filter(e => e.type === type) as IAgentLoopEventMap[K][];
}

// -- Snapshot helpers ---------------------------------------------------------

/**
 * Summarizes an AgentLoopEvent into a compact, readable string.
 * Tool results longer than 60 chars are truncated with "...".
 */
export function summarizeLoopEvent(event: AgentLoopEvent): string {
	switch (event.type) {
		case 'model-call-start': return 'model-call-start';
		case 'model-call-complete': return 'model-call-complete';
		case 'assistant-delta': return `delta: ${JSON.stringify(event.text)}`;
		case 'assistant-message': {
			const parts = event.message.content.map(p => {
				switch (p.type) {
					case 'text': return `text(${JSON.stringify(p.text)})`;
					case 'tool-call': return `tool-call(${p.toolName})`;
					case 'thinking': return `thinking(${JSON.stringify(truncate(p.text, 40))})`;
					case 'redacted-thinking': return 'redacted-thinking';
				}
			});
			return `assistant-message: [${parts.join(', ')}]`;
		}
		case 'reasoning-delta': return `reasoning: ${JSON.stringify(truncate(event.text, 40))}`;
		case 'tool-start': return `tool-start: ${event.toolName}`;
		case 'tool-complete': {
			const status = event.isError ? 'ERROR' : 'ok';
			return `tool-complete: ${event.toolName} (${status}) ${JSON.stringify(truncate(event.result, 60))}`;
		}
		case 'usage': return `usage: in=${event.inputTokens} out=${event.outputTokens}`;
		case 'error': return `error: ${event.error.message}`;
		case 'turn-boundary': return 'turn-boundary';
	}
}

/**
 * Summarizes an IAgentProgressEvent (the IPC-level events from LocalAgent)
 * into a compact, readable string.
 */
export function summarizeProgressEvent(event: IAgentProgressEvent): string {
	switch (event.type) {
		case 'delta': return `delta: ${JSON.stringify(event.content)}`;
		case 'message': {
			const toolInfo = event.toolRequests?.length
				? ` + ${event.toolRequests.length} tool calls`
				: '';
			return `message(${event.role}): ${JSON.stringify(truncate(event.content, 60))}${toolInfo}`;
		}
		case 'idle': return 'idle';
		case 'tool_start': return `tool-start: ${event.toolName}(${truncate(event.invocationMessage, 50)})`;
		case 'tool_complete': {
			const status = event.success ? 'ok' : 'ERROR';
			return `tool-complete: ${event.toolCallId} (${status})`;
		}
		case 'error': return `error: ${event.message}`;
		case 'usage': return `usage: in=${event.inputTokens} out=${event.outputTokens}`;
		case 'reasoning': return `reasoning: ${JSON.stringify(truncate(event.content, 40))}`;
		case 'title_changed': return `title: ${JSON.stringify(event.title)}`;
		case 'permission_request': return `permission: ${event.permissionKind}`;
	}
}

function truncate(s: string, max: number): string {
	return s.length > max ? s.slice(0, max) + '...' : s;
}

/**
 * Snapshot assertion for AgentLoopEvents. Converts events to a human-readable
 * multi-line string and compares with `assert.strictEqual` for clean diffs.
 *
 * Usage:
 * ```
 * assertLoopSnapshot(events, `
 *   model-call-start
 *   delta: "Hello"
 *   model-call-complete
 *   assistant-message: [text("Hello")]
 *   turn-boundary
 * `);
 * ```
 */
export function assertLoopSnapshot(events: AgentLoopEvent[], expected: string): void {
	const actual = events.map(summarizeLoopEvent).join('\n');
	assert.strictEqual(actual, normalizeSnapshot(expected));
}

/**
 * Snapshot assertion for IAgentProgressEvents (IPC-level events from LocalAgent).
 */
export function assertProgressSnapshot(events: IAgentProgressEvent[], expected: string): void {
	const actual = events.map(summarizeProgressEvent).join('\n');
	assert.strictEqual(actual, normalizeSnapshot(expected));
}

/**
 * Normalizes a template-string snapshot: strips leading/trailing blank lines,
 * removes a consistent leading indent (based on the first non-empty line).
 */
function normalizeSnapshot(s: string): string {
	const lines = s.split('\n');
	// Strip leading and trailing empty lines
	while (lines.length > 0 && lines[0].trim() === '') { lines.shift(); }
	while (lines.length > 0 && lines[lines.length - 1].trim() === '') { lines.pop(); }
	// Find minimum indent
	const indents = lines.filter(l => l.trim() !== '').map(l => l.match(/^(\s*)/)![1].length);
	const minIndent = indents.length > 0 ? Math.min(...indents) : 0;
	return lines.map(l => l.slice(minIndent)).join('\n');
}
