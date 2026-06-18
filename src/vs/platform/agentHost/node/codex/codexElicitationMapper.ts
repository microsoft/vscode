/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hasKey } from '../../../../base/common/types.js';
import { ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, type ChatInputAnswer, type ChatInputOption, type ChatInputQuestion, type ChatInputRequest } from '../../common/state/sessionState.js';
import type { JsonValue } from './protocol/generated/serde_json/JsonValue.js';
import type { McpElicitationPrimitiveSchema } from './protocol/generated/v2/McpElicitationPrimitiveSchema.js';
import type { McpServerElicitationRequestParams } from './protocol/generated/v2/McpServerElicitationRequestParams.js';
import type { McpServerElicitationRequestResponse } from './protocol/generated/v2/McpServerElicitationRequestResponse.js';

/**
 * Translate a codex `mcpServer/elicitation/request` into an agent-host
 * {@link ChatInputRequest}. Two modes are supported, mirroring the MCP
 * elicitation spec:
 *
 *  - `form` — projects each field of the requested JSON schema into a
 *    {@link ChatInputQuestion} (text / number / boolean / single- or
 *    multi-select), reusing the same chat-input surface as the model's
 *    `ask_user` tool.
 *  - `url` — surfaces the URL the server wants the user to open via
 *    {@link ChatInputRequest.url} with no questions.
 *
 * MCP field names are used directly as the stable question id (the key
 * the answer map is later read back by).
 */
export function buildElicitationRequest(requestId: string, params: McpServerElicitationRequestParams): ChatInputRequest {
	if (params.mode === 'url') {
		const request: ChatInputRequest = { id: requestId, message: params.message };
		if (params.url) {
			request.url = params.url;
		}
		return request;
	}
	const required = new Set(params.requestedSchema.required ?? []);
	const questions: ChatInputQuestion[] = [];
	for (const [name, field] of Object.entries(params.requestedSchema.properties)) {
		if (field) {
			questions.push(elicitationFieldToQuestion(name, field, required.has(name)));
		}
	}
	return questions.length > 0
		? { id: requestId, message: params.message, questions }
		: { id: requestId, message: params.message };
}

/**
 * Build the codex elicitation response from the client's answers. A
 * declined request maps to `decline`, a cancelled/closed request to
 * `cancel`, and an accepted request to `accept` with a `content` object
 * keyed by field name (omitting skipped/missing answers). `url`-mode
 * acceptances carry no content.
 */
export function elicitationResponseFromAnswers(
	params: McpServerElicitationRequestParams,
	response: ChatInputResponseKind,
	answers: Record<string, ChatInputAnswer> | undefined,
): McpServerElicitationRequestResponse {
	if (response === ChatInputResponseKind.Decline) {
		return { action: 'decline', content: null, _meta: null };
	}
	if (response !== ChatInputResponseKind.Accept) {
		return { action: 'cancel', content: null, _meta: null };
	}
	if (params.mode === 'url') {
		return { action: 'accept', content: null, _meta: null };
	}
	const content: { [key: string]: JsonValue } = {};
	for (const [name, field] of Object.entries(params.requestedSchema.properties)) {
		if (!field) {
			continue;
		}
		const value = elicitationAnswerToValue(answers?.[name]);
		if (value !== undefined) {
			content[name] = value;
		}
	}
	return { action: 'accept', content, _meta: null };
}

/** Decline response used when there is no session to route the elicitation to. */
export function declinedElicitationResponse(): McpServerElicitationRequestResponse {
	return { action: 'decline', content: null, _meta: null };
}

/** Cancel response used when the session is torn down mid-elicitation. */
export function cancelledElicitationResponse(): McpServerElicitationRequestResponse {
	return { action: 'cancel', content: null, _meta: null };
}

function elicitationFieldToQuestion(id: string, field: McpElicitationPrimitiveSchema, required: boolean): ChatInputQuestion {
	const base = { id, title: field.title, message: field.description ?? field.title ?? id, required };

	switch (field.type) {
		case 'boolean':
			return { ...base, kind: ChatInputQuestionKind.Boolean, defaultValue: field.default };
		case 'number':
		case 'integer':
			return {
				...base,
				kind: field.type === 'integer' ? ChatInputQuestionKind.Integer : ChatInputQuestionKind.Number,
				min: field.minimum,
				max: field.maximum,
				defaultValue: field.default,
			};
		case 'array':
			return {
				...base,
				kind: ChatInputQuestionKind.MultiSelect,
				options: hasKey(field.items, { anyOf: true })
					? field.items.anyOf.map((o): ChatInputOption => ({ id: o.const, label: o.title || o.const }))
					: field.items.enum.map((v): ChatInputOption => ({ id: v, label: v })),
				min: bigintToNumber(field.minItems),
				max: bigintToNumber(field.maxItems),
			};
		case 'string':
			// Titled single-select (`oneOf`), enum/legacy single-select (`enum`,
			// optionally `enumNames`), or a plain text field.
			if (hasKey(field, { oneOf: true })) {
				return {
					...base,
					kind: ChatInputQuestionKind.SingleSelect,
					options: field.oneOf.map((o): ChatInputOption => ({ id: o.const, label: o.title || o.const })),
				};
			}
			if (hasKey(field, { enum: true })) {
				const names: readonly string[] | undefined = (field as { enumNames?: readonly string[] }).enumNames;
				return {
					...base,
					kind: ChatInputQuestionKind.SingleSelect,
					options: field.enum.map((v, i): ChatInputOption => ({ id: v, label: names?.[i] || v })),
				};
			}
			return {
				...base,
				kind: ChatInputQuestionKind.Text,
				format: field.format,
				min: field.minLength,
				max: field.maxLength,
				defaultValue: field.default,
			};
	}
}

function elicitationAnswerToValue(answer: ChatInputAnswer | undefined): JsonValue | undefined {
	if (!answer || answer.state === ChatInputAnswerState.Skipped) {
		return undefined;
	}
	const { value } = answer;
	switch (value.kind) {
		case ChatInputAnswerValueKind.Text:
			return value.value;
		case ChatInputAnswerValueKind.Number:
			return value.value;
		case ChatInputAnswerValueKind.Boolean:
			return value.value;
		case ChatInputAnswerValueKind.Selected:
			return value.value;
		case ChatInputAnswerValueKind.SelectedMany:
			return value.value;
	}
}

function bigintToNumber(value: bigint | null | undefined): number | undefined {
	return value === null || value === undefined ? undefined : Number(value);
}
