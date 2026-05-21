/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageModelChatMessage, LanguageModelChatMessage2, LanguageModelTextPart, LanguageModelToolCallPart, LanguageModelToolResultPart } from 'vscode';

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

const ROLE_NAMES: Record<number, string> = { 1: 'user', 2: 'assistant', 3: 'system' };

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
		if (msg.role === 3 /* LanguageModelChatMessageRole.System */) {
			if (Array.isArray(msg.content)) {
				for (const p of msg.content) {
					if (p instanceof LanguageModelTextPart) {
						systemTexts.push(p.value);
					}
				}
			}
			continue;
		}
		const role = ROLE_NAMES[msg.role] ?? String(msg.role);
		const parts: OTelInputMessagePart[] = [];
		if (Array.isArray(msg.content)) {
			for (const p of msg.content) {
				if (p instanceof LanguageModelTextPart) {
					parts.push({ type: 'text', content: p.value });
				} else if (p instanceof LanguageModelToolCallPart) {
					parts.push({ type: 'tool_call', id: p.callId, name: p.name, arguments: p.input });
				} else if (p instanceof LanguageModelToolResultPart) {
					const resultText = p.content.map((c: unknown) => c instanceof LanguageModelTextPart ? c.value : '').join('');
					parts.push({ type: 'tool_call_response', id: p.callId, response: resultText });
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
