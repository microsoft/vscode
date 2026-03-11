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

/**
 * Checks whether a debug event matches a single text search term.
 * Used by both the debug panel filter and the listDebugEvents tool.
 */
export function debugEventMatchesText(event: IChatDebugEvent, term: string): boolean {
	if (event.kind.toLowerCase().includes(term)) {
		return true;
	}
	switch (event.kind) {
		case 'toolCall':
			return event.toolName.toLowerCase().includes(term)
				|| (event.input?.toLowerCase().includes(term) ?? false)
				|| (event.output?.toLowerCase().includes(term) ?? false);
		case 'modelTurn':
			return (event.model?.toLowerCase().includes(term) ?? false)
				|| (event.requestName?.toLowerCase().includes(term) ?? false);
		case 'generic':
			return event.name.toLowerCase().includes(term)
				|| (event.details?.toLowerCase().includes(term) ?? false)
				|| (event.category?.toLowerCase().includes(term) ?? false);
		case 'subagentInvocation':
			return event.agentName.toLowerCase().includes(term)
				|| (event.description?.toLowerCase().includes(term) ?? false);
		case 'userMessage':
		case 'agentResponse':
			return event.message.toLowerCase().includes(term)
				|| event.sections.some(s => s.name.toLowerCase().includes(term) || s.content.toLowerCase().includes(term));
	}
}

/**
 * Regex used to match `before:` and `after:` timestamp tokens inside filter text.
 */
const timestampTokenPattern = /\b(?:before|after):\d{4}(?:-\d{2}(?:-\d{2}(?:t\d{1,2}(?::\d{2}(?::\d{2})?)?)?)?)?(\b|$)/g;

/**
 * Parse a `before:YYYY[-MM[-DD[THH[:MM[:SS]]]]]` or `after:…` token from
 * free-form filter text. Each component after the year is optional.
 *
 * For `before:`, the timestamp is rounded **up** to the end of the most
 * specific unit given (e.g. `before:2026-03` → end-of-March).
 * For `after:`, the timestamp is the **start** of the most specific unit.
 */
export function parseTimeToken(text: string, prefix: string): number | undefined {
	const regex = new RegExp(`${prefix}:(\\d{4})(?:-(\\d{2})(?:-(\\d{2})(?:t(\\d{1,2})(?::(\\d{2})(?::(\\d{2}))?)?)?)?)?(?!\\w)`);
	const m = regex.exec(text);
	if (!m) {
		return undefined;
	}

	const year = parseInt(m[1], 10);
	const month = m[2] !== undefined ? parseInt(m[2], 10) - 1 : undefined;
	const day = m[3] !== undefined ? parseInt(m[3], 10) : undefined;
	const hour = m[4] !== undefined ? parseInt(m[4], 10) : undefined;
	const minute = m[5] !== undefined ? parseInt(m[5], 10) : undefined;
	const second = m[6] !== undefined ? parseInt(m[6], 10) : undefined;

	if (prefix === 'before') {
		if (second !== undefined) {
			return new Date(year, month!, day!, hour!, minute!, second, 999).getTime();
		} else if (minute !== undefined) {
			return new Date(year, month!, day!, hour!, minute, 59, 999).getTime();
		} else if (hour !== undefined) {
			return new Date(year, month!, day!, hour, 59, 59, 999).getTime();
		} else if (day !== undefined) {
			return new Date(year, month!, day, 23, 59, 59, 999).getTime();
		} else if (month !== undefined) {
			return new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
		} else {
			return new Date(year, 11, 31, 23, 59, 59, 999).getTime();
		}
	} else {
		return new Date(
			year,
			month ?? 0,
			day ?? 1,
			hour ?? 0,
			minute ?? 0,
			second ?? 0,
			0,
		).getTime();
	}
}

/**
 * Strips `before:…` and `after:…` timestamp tokens from filter text,
 * returning only the plain text search portion.
 */
export function stripTimestampTokens(text: string): string {
	return text.replace(timestampTokenPattern, '').trim();
}

/**
 * Filters debug events by comma-separated text terms and optional
 * `before:`/`after:` timestamp tokens.
 *
 * Terms prefixed with `!` are exclusions; all others are inclusions.
 * At least one inclusion term must match (if any are present).
 * Timestamp tokens are parsed and applied as date-range bounds, then
 * stripped before text matching.
 */
export function filterDebugEventsByText(events: readonly IChatDebugEvent[], filterText: string): readonly IChatDebugEvent[] {
	const beforeTimestamp = parseTimeToken(filterText, 'before');
	const afterTimestamp = parseTimeToken(filterText, 'after');

	// Strip timestamp tokens before splitting into text search terms
	const textOnly = stripTimestampTokens(filterText);
	const terms = textOnly.split(/\s*,\s*/).filter(t => t.length > 0);
	const includeTerms = terms.filter(t => !t.startsWith('!')).map(t => t.trim());
	const excludeTerms = terms.filter(t => t.startsWith('!')).map(t => t.slice(1).trim()).filter(t => t.length > 0);

	return events.filter(e => {
		// Timestamp bounds
		const time = e.created.getTime();
		if (beforeTimestamp !== undefined && time > beforeTimestamp) {
			return false;
		}
		if (afterTimestamp !== undefined && time < afterTimestamp) {
			return false;
		}
		// Text matching
		if (excludeTerms.some(term => debugEventMatchesText(e, term))) {
			return false;
		}
		if (includeTerms.length > 0) {
			return includeTerms.some(term => debugEventMatchesText(e, term));
		}
		return true;
	});
}

/**
 * Description of the text filter syntax for tool schemas and documentation.
 */
export const debugEventFilterDescription = 'Comma-separated text search terms. Prefix a term with ! to exclude it. Matches against event kind, tool names, model names, agent names, categories, event names, and message content. Also supports before:YYYY[-MM[-DD[THH[:MM[:SS]]]]] and after:YYYY[-MM[-DD[THH[:MM[:SS]]]]] to filter by timestamp.';

export interface DebugEventFilterOptions {
	readonly kind?: string;
	readonly filter?: string;
	readonly limit?: number;
}

/**
 * Applies kind, text, and limit filters to debug events.
 * Used by the listDebugEvents tool to consolidate all filtering in one place.
 */
export function filterDebugEvents(events: readonly IChatDebugEvent[], options: DebugEventFilterOptions): readonly IChatDebugEvent[] {
	let result = events;

	if (options.kind) {
		result = result.filter(e => e.kind === options.kind);
	}

	if (options.filter) {
		result = filterDebugEventsByText(result, options.filter);
	}

	if (options.limit !== undefined && options.limit > 0 && result.length > options.limit) {
		result = result.slice(result.length - options.limit);
	}

	return result;
}
