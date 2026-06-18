/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageModelChatMessage, LanguageModelChatMessage2, LanguageModelChatMessageRole, LanguageModelTextPart, LanguageModelToolCallPart, LanguageModelToolResultPart } from 'vscode';

/** A single content part inside an OTel `gen_ai.input.messages` entry. */
export interface OTelInputMessagePart {
	type: string;
	content?: string;
	id?: string;
	name?: string;
	arguments?: unknown;
	response?: string;
}

/** A single OTel `gen_ai.input.messages` entry. */
export interface OTelInputMessage {
	role: string;
	parts: OTelInputMessagePart[];
}

function roleName(role: LanguageModelChatMessageRole | number): string {
	switch (role) {
		case LanguageModelChatMessageRole.User: return 'user';
		case LanguageModelChatMessageRole.Assistant: return 'assistant';
		case LanguageModelChatMessageRole.System: return 'system';
		default: return String(role);
	}
}

/**
 * Convert provider chat messages into OTel `gen_ai.system_instructions` text
 * and `gen_ai.input.messages` entries. System-role messages are surfaced via
 * `systemTexts` and excluded from `inputMsgs` to avoid double-rendering in
 * trace viewers. Non-text parts inside system messages are dropped.
 */
export function buildOTelInputFromChatMessages(
	messages: ReadonlyArray<LanguageModelChatMessage | LanguageModelChatMessage2>
): { systemTexts: string[]; inputMsgs: OTelInputMessage[] } {
	const systemTexts: string[] = [];
	const inputMsgs: OTelInputMessage[] = [];
	for (const msg of messages) {
		if (msg.role === LanguageModelChatMessageRole.System) {
			if (Array.isArray(msg.content)) {
				for (const p of msg.content) {
					if (p instanceof LanguageModelTextPart) {
						systemTexts.push(p.value);
					}
				}
			}
			continue;
		}
		const role = roleName(msg.role);
		const parts: OTelInputMessagePart[] = [];
		if (Array.isArray(msg.content)) {
			for (const p of msg.content) {
				if (p instanceof LanguageModelTextPart) {
					parts.push({ type: 'text', content: p.value });
				} else if (p instanceof LanguageModelToolCallPart) {
					parts.push({ type: 'tool_call', id: p.callId, name: p.name, arguments: p.input });
				} else if (p instanceof LanguageModelToolResultPart) {
					const resultText = p.content.map((c: unknown) => c instanceof LanguageModelTextPart ? c.value : '').join('');
					parts.push({ type: 'tool_call_response', id: p.callId, response: resultText || '[non-text content]' });
				}
			}
		}
		if (parts.length === 0) {
			parts.push({ type: 'text', content: '[non-text content]' });
		}
		inputMsgs.push({ role, parts });
	}
	return { systemTexts, inputMsgs };
}
