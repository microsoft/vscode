/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentSession, CODEX_AGENT_PROVIDER_ID } from '../../common/agentService.js';
import { buildOpenSessionLinkUri } from '../../common/openSessionLink.js';
import { SessionServerToolName } from '../../common/serverToolNames.js';
import type { JsonValue } from './protocol/generated/serde_json/JsonValue.js';
import type { ThreadItem } from './protocol/generated/v2/ThreadItem.js';

type DynamicToolCallItem = Extract<ThreadItem, { type: 'dynamicToolCall' }>;

export interface ICodexThreadCoordinationCall {
	readonly toolName: SessionServerToolName.CreateSession | SessionServerToolName.SendMessage;
	readonly targetThreadId: string;
	readonly openLink: string;
	readonly toolInput: JsonValue;
}

export interface ICodexCreatedThreadDirectives {
	readonly text: string;
	readonly threadIds: readonly string[];
}

const CREATE_THREAD_CALL_MARKER = 'tools.codex_app__create_thread';
const SEND_MESSAGE_CALL_MARKER = 'tools.codex_app__send_message_to_thread';

export function buildCodexThreadOpenLink(threadId: string): string {
	return buildOpenSessionLinkUri(AgentSession.uri(CODEX_AGENT_PROVIDER_ID, threadId));
}

/** Recognizes successful Codex thread-creation and message-sending tool outcomes. */
export function getCodexThreadCoordinationCall(item: DynamicToolCallItem): ICodexThreadCoordinationCall | undefined {
	if (item.namespace !== 'codex_app' || item.success === false || item.status !== 'completed') {
		return undefined;
	}

	let toolName: ICodexThreadCoordinationCall['toolName'];
	let targetThreadId: string | undefined;
	if (item.tool === 'create_thread') {
		toolName = SessionServerToolName.CreateSession;
		const result = readThreadResult(item);
		if (result?.hostId && result.hostId !== 'local') {
			return undefined;
		}
		targetThreadId = result?.threadId ?? result?.clientThreadId;
	} else if (item.tool === 'send_message_to_thread') {
		toolName = SessionServerToolName.SendMessage;
		const hostId = readStringProperty(item.arguments, 'hostId');
		if (hostId && hostId !== 'local') {
			return undefined;
		}
		targetThreadId = readStringProperty(item.arguments, 'threadId');
	} else {
		return undefined;
	}

	if (!targetThreadId) {
		return undefined;
	}
	return {
		toolName,
		targetThreadId,
		openLink: buildCodexThreadOpenLink(targetThreadId),
		toolInput: item.arguments,
	};
}

/** Recovers a completed thread-management call from its persisted invocation and output. */
export function getCodexRolloutThreadCoordinationCall(input: string, output: readonly string[]): ICodexThreadCoordinationCall | undefined {
	const result = readThreadResultText(output);
	const targetThreadId = result?.threadId ?? result?.clientThreadId;
	if (!targetThreadId) {
		return undefined;
	}

	let toolName: ICodexThreadCoordinationCall['toolName'];
	let label: string | undefined;
	if (input.includes(CREATE_THREAD_CALL_MARKER)) {
		toolName = SessionServerToolName.CreateSession;
		label = readScriptStringProperty(input, 'title') ?? readScriptStringProperty(input, 'prompt');
	} else if (input.includes(SEND_MESSAGE_CALL_MARKER)) {
		toolName = SessionServerToolName.SendMessage;
		label = readScriptStringProperty(input, 'prompt');
	} else {
		return undefined;
	}

	const hostId = result?.hostId ?? readScriptStringProperty(input, 'hostId');
	if (hostId && hostId !== 'local') {
		return undefined;
	}

	return {
		toolName,
		targetThreadId,
		openLink: buildCodexThreadOpenLink(targetThreadId),
		toolInput: { prompt: label ?? targetThreadId },
	};
}

/** Removes valid created-thread directives while preserving examples inside fenced code blocks. */
export function extractCodexCreatedThreadDirectives(text: string): ICodexCreatedThreadDirectives {
	const threadIds: string[] = [];
	const output: string[] = [];
	let fence: string | undefined;
	const lines = text.split(/\r?\n/);

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const fenceMatch = /^ {0,3}(?<marker>`{3,}|~{3,})(?<remainder>.*)$/.exec(line)?.groups;
		const fenceMarker = fenceMatch?.['marker'];
		if (fenceMarker) {
			if (!fence) {
				fence = fenceMarker;
			} else if (fenceMarker[0] === fence[0] && fenceMarker.length >= fence.length && !fenceMatch?.['remainder']?.trim()) {
				fence = undefined;
			}
			output.push(line);
			continue;
		}

		const directive = !fence
			? /^ {0,3}::created-thread\{\s*(?:threadId|clientThreadId)="(?<threadId>[^"\r\n]+)"\s*\}\s*$/.exec(line)?.groups
			: undefined;
		const threadId = directive?.['threadId']?.trim();
		if (threadId) {
			threadIds.push(threadId);
			if (output.at(-1)?.trim() === '' && lines[index + 1]?.trim() === '') {
				index++;
			}
		} else {
			output.push(line);
		}
	}

	return {
		text: threadIds.length > 0 ? output.join('\n').trimEnd() : text,
		threadIds,
	};
}

function readThreadResult(item: DynamicToolCallItem): { threadId?: string; clientThreadId?: string; hostId?: string } | undefined {
	return readThreadResultText((item.contentItems ?? []).flatMap(contentItem => contentItem.type === 'inputText' ? [contentItem.text] : []));
}

function readThreadResultText(output: readonly string[]): { threadId?: string; clientThreadId?: string; hostId?: string } | undefined {
	for (const text of output) {
		for (const candidate of [text, ...text.split(/\r?\n/).reverse()]) {
			try {
				const parsed = JSON.parse(candidate) as JsonValue;
				const threadId = readStringProperty(parsed, 'threadId');
				const clientThreadId = readStringProperty(parsed, 'clientThreadId');
				if (threadId || clientThreadId) {
					return {
						threadId,
						clientThreadId,
						hostId: readStringProperty(parsed, 'hostId'),
					};
				}
			} catch {
				// Tool output can contain status text alongside its JSON result.
			}
		}
	}
	return undefined;
}

function readScriptStringProperty(input: string, key: string): string | undefined {
	const literal = new RegExp(`\\b${key}\\s*:\\s*(?<literal>"(?:\\\\.|[^"\\\\])*")`).exec(input)?.groups?.['literal'];
	if (!literal) {
		return undefined;
	}
	try {
		const value = JSON.parse(literal);
		return typeof value === 'string' && value.length > 0 ? value : undefined;
	} catch {
		return undefined;
	}
}

function readStringProperty(value: JsonValue, key: string): string | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const property = value[key];
	return typeof property === 'string' && property.length > 0 ? property : undefined;
}
