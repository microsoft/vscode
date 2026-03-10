/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatDebugEvent } from './chatDebugService.js';

/**
 * Descriptions of each debug event kind for the model. Adding a new event kind
 * to {@link IChatDebugEvent} without adding an entry here will cause a compile error.
 */
export const debugEventKindDescriptions: Record<IChatDebugEvent['kind'], string> = {
	generic: '- generic (category: "discovery"): File discovery for instructions, skills, agents, hooks. Resolving returns a fileList with full file paths, load status, skip reasons, and source folders. Always resolve these for questions about customization files.\n'
		+ '- generic (other): Miscellaneous logs. Resolving returns additional text details.',
	toolCall: '- toolCall: A tool invocation. Resolving returns tool name, input, output, status, and duration.',
	modelTurn: '- modelTurn: An LLM round-trip. Resolving returns model name, token usage, timing, errors, and prompt sections.',
	subagentInvocation: '- subagentInvocation: A sub-agent spawn. Resolving returns agent name, status, duration, and counts.',
	userMessage: '- userMessage: The full prompt sent to the model. Resolving returns the complete message and all prompt sections (system prompt, instructions, context). Essential for understanding what the model received.',
	agentResponse: '- agentResponse: The model\'s response. Resolving returns the full response text and sections.',
};

/**
 * Formats debug events into a compact log-style summary for context attachment.
 */
export function formatDebugEventsForContext(events: readonly IChatDebugEvent[]): string {
	const lines: string[] = [];
	for (const event of events) {
		const ts = event.created.toISOString();
		const id = event.id ? ` [id=${event.id}]` : '';
		switch (event.kind) {
			case 'generic':
				lines.push(`[${ts}]${id} ${event.level >= 3 ? 'ERROR' : event.level >= 2 ? 'WARN' : 'INFO'}: ${event.name}${event.details ? ' - ' + event.details : ''}${event.category ? ' (category: ' + event.category + ')' : ''}`);
				break;
			case 'toolCall':
				lines.push(`[${ts}]${id} TOOL_CALL: ${event.toolName}${event.result ? ' result=' + event.result : ''}${event.durationInMillis !== undefined ? ' duration=' + event.durationInMillis + 'ms' : ''}`);
				break;
			case 'modelTurn':
				lines.push(`[${ts}]${id} MODEL_TURN: ${event.requestName ?? 'unknown'}${event.model ? ' model=' + event.model : ''}${event.inputTokens !== undefined ? ' tokens(in=' + event.inputTokens + ',out=' + (event.outputTokens ?? '?') + ')' : ''}${event.durationInMillis !== undefined ? ' duration=' + event.durationInMillis + 'ms' : ''}`);
				break;
			case 'subagentInvocation':
				lines.push(`[${ts}]${id} SUBAGENT: ${event.agentName}${event.status ? ' status=' + event.status : ''}${event.durationInMillis !== undefined ? ' duration=' + event.durationInMillis + 'ms' : ''}`);
				break;
			case 'userMessage':
				lines.push(`[${ts}]${id} USER_MESSAGE: ${event.message.substring(0, 200)}${event.message.length > 200 ? '...' : ''} (${event.sections.length} sections)`);
				break;
			case 'agentResponse':
				lines.push(`[${ts}]${id} AGENT_RESPONSE: ${event.message.substring(0, 200)}${event.message.length > 200 ? '...' : ''} (${event.sections.length} sections)`);
				break;
			default: {
				const _: never = event;
				void _;
				break;
			}
		}
	}
	return lines.join('\n');
}

/**
 * Constructs the model description for the debug events attachment,
 * explaining to the model how to use the resolveDebugEventDetails tool.
 */
export function getDebugEventsModelDescription(): string {
	return 'These are the debug event logs from the current chat conversation. Analyze them to help answer the user\'s troubleshooting question.\n'
		+ '\n'
		+ 'CRITICAL INSTRUCTION: You MUST call the resolveDebugEventDetails tool on relevant events BEFORE answering. The log lines below are only summaries — they do NOT contain the actual data (file paths, prompt content, tool I/O, etc.). The real information is only available by resolving events. Never answer based solely on the summary lines. Always resolve first, then answer.\n'
		+ '\n'
		+ 'Call resolveDebugEventDetails in parallel on all events that could be relevant to the user\'s question. When in doubt, resolve more events rather than fewer.\n'
		+ '\n'
		+ 'IMPORTANT: Do NOT mention event IDs, tool resolution steps, or internal debug mechanics in your response. The user does not know about debug events or event IDs. Present your findings directly and naturally, as if you simply know the answer. Never say things like "I need to resolve events" or show event IDs.\n'
		+ '\n'
		+ 'Event types and what resolving them returns:\n'
		+ Object.values(debugEventKindDescriptions).join('\n');
}
