/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { IDebugLogEntry } from '../../../platform/chat/common/chatDebugFileLoggerService';
import { CopilotChatAttr, GenAiAttr } from '../../../platform/otel/common/index';
import type { ICompletedSpanData } from '../../../platform/otel/common/otelService';

/**
 * Extract the session ID from a span's attributes.
 */
export function extractSessionId(span: ICompletedSpanData): string | undefined {
	return asString(span.attributes[CopilotChatAttr.SESSION_ID])
		?? asString(span.attributes[GenAiAttr.CONVERSATION_ID]);
}

function asString(v: unknown): string | undefined {
	return typeof v === 'string' ? v : undefined;
}

function extractJsonField(json: string | undefined, field: string): string | undefined {
	if (!json) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(json);
		const value = parsed[field];
		return typeof value === 'string' ? value : undefined;
	} catch {
		return undefined;
	}
}

function truncate(s: string, maxLen: number): string {
	return s.length > maxLen ? s.slice(0, maxLen) + '...' : s;
}

// ── IDebugLogEntry → ChatDebugEvent converters ──

/**
 * Convert a JSONL debug log entry into a VS Code debug panel event.
 * Returns undefined for entry types that are not displayed in the panel
 * (session_start, turn boundaries, errors) and for filtered child session
 * references (categorization, title). Non-filtered child_session_ref entries
 * are converted into generic events with category 'subagent'.
 *
 * @param skipCoreEvents When true, skip `discovery` and core-sourced `generic`
 *   entries because VS Code core is already displaying them for live sessions.
 *   Set to false for historical sessions where core won't fire those events.
 */
export function debugLogEntryToDebugEvent(entry: IDebugLogEntry, skipCoreEvents = true): vscode.ChatDebugEvent | undefined {
	switch (entry.type) {
		case 'tool_call':
			return entryToToolCallEvent(entry);
		case 'llm_request':
			return entryToModelTurnEvent(entry);
		case 'user_message':
			return entryToUserMessageEvent(entry);
		case 'agent_response':
			return entryToAgentResponseEvent(entry);
		case 'subagent':
			return entryToSubagentEvent(entry);
		case 'hook':
			return entryToHookEvent(entry);
		case 'child_session_ref':
			return entryToChildSessionRefEvent(entry);
		case 'discovery':
			// Discovery events (Load Agents, Load Skills, etc.) are already displayed
			// by VS Code core via onDidReceiveChatDebugEvent for live sessions.
			return skipCoreEvents ? undefined : entryToGenericEvent(entry);
		case 'generic':
			// Generic events from core (e.g. Resolve Customizations) are also displayed
			// by VS Code core directly for live sessions.
			if (skipCoreEvents && entry.attrs.source === 'core') {
				return undefined;
			}
			return entryToGenericEvent(entry);
		case 'session_start':
		case 'turn_start':
		case 'turn_end':
		case 'error':
			return undefined;
		default:
			return undefined;
	}
}

/**
 * Generate dedup key for an entry. Uses type + spanId + timestamp to handle
 * spanId collisions from OTel counter resets across VS Code restarts.
 */
export function entryDedupKey(entry: IDebugLogEntry): string {
	return `${entry.type}:${entry.spanId}:${entry.ts}`;
}

function entryToToolCallEvent(entry: IDebugLogEntry): vscode.ChatDebugToolCallEvent {
	let displayName = entry.name;
	// For runSubagent, extract the description from args for a more informative display
	if (entry.name === 'runSubagent') {
		const desc = extractJsonField(entry.attrs.args as string | undefined, 'description');
		if (desc) {
			displayName = `runSubagent: ${desc}`;
		}
	}
	const evt = new vscode.ChatDebugToolCallEvent(displayName, new Date(entry.ts));
	evt.id = entry.spanId;
	evt.parentEventId = entry.parentSpanId;
	evt.input = entry.attrs.args as string | undefined;
	evt.output = entry.attrs.result as string | undefined;
	evt.result = entry.status === 'error'
		? vscode.ChatDebugToolCallResult.Error
		: entry.status === 'ok'
			? vscode.ChatDebugToolCallResult.Success
			: undefined;
	evt.durationInMillis = entry.dur;
	return evt;
}

function entryToModelTurnEvent(entry: IDebugLogEntry): vscode.ChatDebugModelTurnEvent {
	const evt = new vscode.ChatDebugModelTurnEvent(new Date(entry.ts));
	evt.id = entry.spanId;
	evt.parentEventId = entry.parentSpanId;
	evt.model = entry.attrs.model as string | undefined;
	evt.inputTokens = entry.attrs.inputTokens as number | undefined;
	evt.outputTokens = entry.attrs.outputTokens as number | undefined;
	evt.cachedTokens = entry.attrs.cachedTokens as number | undefined;
	evt.totalTokens = ((entry.attrs.inputTokens as number | undefined) ?? 0)
		+ ((entry.attrs.outputTokens as number | undefined) ?? 0);
	evt.durationInMillis = entry.dur;
	evt.timeToFirstTokenInMillis = entry.attrs.ttft as number | undefined;
	evt.maxOutputTokens = entry.attrs.maxTokens as number | undefined;
	evt.requestName = (entry.attrs.debugName as string | undefined) ?? entry.name;
	evt.status = entry.status === 'error' ? 'error' : 'success';
	evt.copilotUsageNanoAiu = entry.attrs.copilotUsageNanoAiu as number | undefined;
	return evt;
}

function entryToUserMessageEvent(entry: IDebugLogEntry): vscode.ChatDebugUserMessageEvent {
	const content = (entry.attrs.content as string) ?? '';
	const evt = new vscode.ChatDebugUserMessageEvent(
		truncate(content, 200),
		new Date(entry.ts),
	);
	evt.id = entry.spanId;
	evt.parentEventId = entry.parentSpanId;
	return evt;
}

function entryToAgentResponseEvent(entry: IDebugLogEntry): vscode.ChatDebugAgentResponseEvent {
	const response = (entry.attrs.response as string) ?? '';
	const evt = new vscode.ChatDebugAgentResponseEvent(
		truncate(response, 200),
		new Date(entry.ts),
	);
	evt.id = entry.spanId;
	evt.parentEventId = entry.parentSpanId;
	return evt;
}

function entryToSubagentEvent(entry: IDebugLogEntry): vscode.ChatDebugSubagentInvocationEvent {
	const agentName = (entry.attrs.agentName as string) ?? entry.name;
	const evt = new vscode.ChatDebugSubagentInvocationEvent(entry.name, new Date(entry.ts));
	evt.id = entry.spanId;
	evt.parentEventId = entry.parentSpanId;
	evt.durationInMillis = entry.dur;
	evt.description = (entry.attrs.description as string) ?? `Subagent: ${agentName}`;
	evt.status = entry.status === 'error'
		? vscode.ChatDebugSubagentStatus.Failed
		: vscode.ChatDebugSubagentStatus.Completed;
	return evt;
}

function entryToHookEvent(entry: IDebugLogEntry): vscode.ChatDebugGenericEvent {
	const resultKind = entry.attrs.resultKind as string | undefined;
	const level = resultKind === 'error'
		? vscode.ChatDebugLogLevel.Error
		: resultKind === 'non_blocking_error'
			? vscode.ChatDebugLogLevel.Warning
			: vscode.ChatDebugLogLevel.Info;
	const evt = new vscode.ChatDebugGenericEvent(`Hook: ${entry.name}`, level, new Date(entry.ts));
	evt.id = entry.spanId;
	evt.parentEventId = entry.parentSpanId;
	const command = entry.attrs.command as string | undefined;
	const prefix = command ? `${command} ` : '';
	evt.details = `${prefix}(${entry.dur}ms, ${resultKind ?? 'unknown'})`;
	evt.category = 'discovery';
	return evt;
}

function entryToChildSessionRefEvent(entry: IDebugLogEntry): vscode.ChatDebugGenericEvent | undefined {
	const label = entry.attrs.label as string | undefined ?? entry.name;
	// Filter out internal infrastructure entries
	if (label === 'categorization' || label === 'title') {
		return undefined;
	}
	const evt = new vscode.ChatDebugGenericEvent(label, vscode.ChatDebugLogLevel.Info, new Date(entry.ts));
	evt.id = entry.spanId;
	evt.parentEventId = entry.parentSpanId;
	evt.category = 'subagent';
	return evt;
}

function entryToGenericEvent(entry: IDebugLogEntry): vscode.ChatDebugGenericEvent {
	const level = entry.status === 'error'
		? vscode.ChatDebugLogLevel.Error
		: vscode.ChatDebugLogLevel.Info;
	const evt = new vscode.ChatDebugGenericEvent(entry.name, level, new Date(entry.ts));
	evt.id = entry.spanId;
	evt.parentEventId = entry.parentSpanId;
	evt.details = entry.attrs.details as string | undefined;
	evt.category = entry.attrs.category as string | undefined;
	return evt;
}

// ── IDebugLogEntry detail resolution ──

/**
 * Resolve the full content of a debug log entry for the detail view.
 * For model turns, can optionally read companion files (system prompt, tools)
 * from the session directory.
 */
export async function resolveDebugLogEntry(
	entry: IDebugLogEntry,
	readCompanionFile?: (fileName: string) => Promise<string | undefined>,
): Promise<vscode.ChatDebugResolvedEventContent | undefined> {
	switch (entry.type) {
		case 'tool_call':
			return resolveToolCallEntry(entry);
		case 'llm_request':
			return resolveModelTurnEntry(entry, readCompanionFile);
		case 'user_message':
			return resolveUserMessageEntry(entry);
		case 'agent_response':
			return resolveAgentResponseEntry(entry);
		case 'hook':
			return resolveHookEntry(entry);
		default:
			return undefined;
	}
}

function resolveToolCallEntry(entry: IDebugLogEntry): vscode.ChatDebugEventToolCallContent {
	const content = new vscode.ChatDebugEventToolCallContent(entry.name);
	content.input = entry.attrs.args as string | undefined;
	content.output = entry.attrs.result as string | undefined;
	content.result = entry.status === 'error'
		? vscode.ChatDebugToolCallResult.Error
		: entry.status === 'ok'
			? vscode.ChatDebugToolCallResult.Success
			: undefined;
	content.durationInMillis = entry.dur;
	return content;
}

async function resolveModelTurnEntry(
	entry: IDebugLogEntry,
	readCompanionFile?: (fileName: string) => Promise<string | undefined>,
): Promise<vscode.ChatDebugEventModelTurnContent> {
	const content = new vscode.ChatDebugEventModelTurnContent(entry.name);
	content.model = entry.attrs.model as string | undefined;
	content.status = entry.status === 'error' ? 'error' : 'success';
	content.durationInMillis = entry.dur;
	content.timeToFirstTokenInMillis = entry.attrs.ttft as number | undefined;
	content.requestId = entry.attrs.responseId as string | undefined;
	content.requestOptions = entry.attrs.requestOptions as string | undefined;
	content.maxOutputTokens = entry.attrs.maxTokens as number | undefined;
	content.inputTokens = entry.attrs.inputTokens as number | undefined;
	content.outputTokens = entry.attrs.outputTokens as number | undefined;
	content.cachedTokens = entry.attrs.cachedTokens as number | undefined;
	content.totalTokens = ((entry.attrs.inputTokens as number | undefined) ?? 0)
		+ ((entry.attrs.outputTokens as number | undefined) ?? 0);

	const sections: vscode.ChatDebugMessageSection[] = [];

	// Read system prompt from companion file
	const systemPromptFile = entry.attrs.systemPromptFile as string | undefined;
	if (systemPromptFile && readCompanionFile) {
		const systemPrompt = await readCompanionFile(systemPromptFile);
		if (systemPrompt) {
			sections.push(new vscode.ChatDebugMessageSection('System', systemPrompt));
		}
	}

	const inputMessages = entry.attrs.inputMessages as string | undefined;
	if (inputMessages) {
		sections.push(new vscode.ChatDebugMessageSection('Input Messages', inputMessages));
	}
	const requestShape = entry.attrs.requestShape as string | undefined;
	if (requestShape) {
		sections.push(new vscode.ChatDebugMessageSection('Request Shape', requestShape));
	}

	// Read tools from companion file
	const toolsFile = entry.attrs.toolsFile as string | undefined;
	if (toolsFile && readCompanionFile) {
		const tools = await readCompanionFile(toolsFile);
		if (tools) {
			sections.push(new vscode.ChatDebugMessageSection('Tools', tools));
		}
	}

	const userRequest = entry.attrs.userRequest as string | undefined;
	if (userRequest) {
		sections.push(new vscode.ChatDebugMessageSection('User Request', userRequest));
	}

	if (sections.length > 0) {
		content.sections = sections;
	}
	if (entry.status === 'error' && entry.attrs.error) {
		content.errorMessage = entry.attrs.error as string;
	}
	return content;
}

function resolveUserMessageEntry(entry: IDebugLogEntry): vscode.ChatDebugUserMessageEvent {
	const content = (entry.attrs.content as string) ?? '';
	const evt = new vscode.ChatDebugUserMessageEvent(truncate(content, 200), new Date(entry.ts));
	evt.id = entry.spanId;
	if (content) {
		evt.sections = [new vscode.ChatDebugMessageSection('User Request', content)];
	}
	return evt;
}

function resolveAgentResponseEntry(entry: IDebugLogEntry): vscode.ChatDebugAgentResponseEvent {
	const response = (entry.attrs.response as string) ?? '';
	const reasoning = entry.attrs.reasoning as string | undefined;
	const sections: vscode.ChatDebugMessageSection[] = [];

	if (response) {
		sections.push(new vscode.ChatDebugMessageSection('Response', response));
	}
	if (reasoning) {
		sections.push(new vscode.ChatDebugMessageSection('Reasoning', reasoning));
	}

	const evt = new vscode.ChatDebugAgentResponseEvent(truncate(response, 200), new Date(entry.ts));
	evt.id = entry.spanId;
	evt.sections = sections;
	return evt;
}

function resolveHookEntry(entry: IDebugLogEntry): vscode.ChatDebugEventHookContent {
	const hookType = entry.name;
	const content = new vscode.ChatDebugEventHookContent(hookType);
	content.command = entry.attrs.command as string | undefined;
	const resultKind = entry.attrs.resultKind as string | undefined;
	content.result = resultKind === 'success'
		? vscode.ChatDebugHookResult.Success
		: resultKind === 'error'
			? vscode.ChatDebugHookResult.Error
			: resultKind === 'non_blocking_error'
				? vscode.ChatDebugHookResult.NonBlockingError
				: undefined;
	content.durationInMillis = entry.dur;
	content.input = entry.attrs.input as string | undefined;
	content.output = entry.attrs.output as string | undefined;
	if (entry.status === 'error' && entry.attrs.error) {
		content.errorMessage = entry.attrs.error as string;
	}
	return content;
}
