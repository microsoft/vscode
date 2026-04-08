/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GenAiAttr, GenAiOperationName, StdAttr } from './genAiAttributes';
import { truncateForOTel } from './messageFormatters';
import type { IOTelService } from './otelService';
import { type WorkspaceOTelMetadata, workspaceMetadataToOTelAttributes } from './workspaceOTelMetadata';

/**
 * Emit OTel GenAI standard events via the IOTelService abstraction.
 */
export function emitInferenceDetailsEvent(
	otel: IOTelService,
	request: {
		model: string;
		temperature?: number;
		maxTokens?: number;
		messages?: unknown;
		systemMessage?: unknown;
		tools?: unknown;
	},
	response: {
		id?: string;
		model?: string;
		finishReasons?: string[];
		inputTokens?: number;
		outputTokens?: number;
	} | undefined,
	error?: { type: string; message: string },
): void {
	const attributes: Record<string, unknown> = {
		'event.name': 'gen_ai.client.inference.operation.details',
		[GenAiAttr.OPERATION_NAME]: GenAiOperationName.CHAT,
		[GenAiAttr.REQUEST_MODEL]: request.model,
	};

	if (response) {
		if (response.model) { attributes[GenAiAttr.RESPONSE_MODEL] = response.model; }
		if (response.id) { attributes[GenAiAttr.RESPONSE_ID] = response.id; }
		if (response.finishReasons) { attributes[GenAiAttr.RESPONSE_FINISH_REASONS] = response.finishReasons; }
		if (response.inputTokens !== undefined) { attributes[GenAiAttr.USAGE_INPUT_TOKENS] = response.inputTokens; }
		if (response.outputTokens !== undefined) { attributes[GenAiAttr.USAGE_OUTPUT_TOKENS] = response.outputTokens; }
	}

	if (request.temperature !== undefined) { attributes[GenAiAttr.REQUEST_TEMPERATURE] = request.temperature; }
	if (request.maxTokens !== undefined) { attributes[GenAiAttr.REQUEST_MAX_TOKENS] = request.maxTokens; }

	if (error) {
		attributes[StdAttr.ERROR_TYPE] = error.type;
	}

	// Full content capture with truncation to prevent OTLP batch failures
	if (otel.config.captureContent) {
		if (request.messages !== undefined) {
			attributes[GenAiAttr.INPUT_MESSAGES] = truncateForOTel(JSON.stringify(request.messages));
		}
		if (request.systemMessage !== undefined) {
			attributes[GenAiAttr.SYSTEM_INSTRUCTIONS] = truncateForOTel(JSON.stringify(request.systemMessage));
		}
		if (request.tools !== undefined) {
			attributes[GenAiAttr.TOOL_DEFINITIONS] = truncateForOTel(JSON.stringify(request.tools));
		}
	}

	otel.emitLogRecord(`GenAI inference: ${request.model}`, attributes);
}

/**
 * Emit extension-specific events.
 */
export function emitSessionStartEvent(
	otel: IOTelService,
	sessionId: string,
	model: string,
	participant: string,
): void {
	otel.emitLogRecord('copilot_chat.session.start', {
		'event.name': 'copilot_chat.session.start',
		'session.id': sessionId,
		[GenAiAttr.REQUEST_MODEL]: model,
		[GenAiAttr.AGENT_NAME]: participant,
	});
}

export function emitToolCallEvent(
	otel: IOTelService,
	toolName: string,
	durationMs: number,
	success: boolean,
	error?: string,
): void {
	otel.emitLogRecord(`copilot_chat.tool.call: ${toolName}`, {
		'event.name': 'copilot_chat.tool.call',
		[GenAiAttr.TOOL_NAME]: toolName,
		'duration_ms': durationMs,
		'success': success,
		...(error ? { [StdAttr.ERROR_TYPE]: error } : {}),
	});
}

export function emitAgentTurnEvent(
	otel: IOTelService,
	turnIndex: number,
	inputTokens: number,
	outputTokens: number,
	toolCallCount: number,
): void {
	otel.emitLogRecord(`copilot_chat.agent.turn: ${turnIndex}`, {
		'event.name': 'copilot_chat.agent.turn',
		'turn.index': turnIndex,
		[GenAiAttr.USAGE_INPUT_TOKENS]: inputTokens,
		[GenAiAttr.USAGE_OUTPUT_TOKENS]: outputTokens,
		'tool_call_count': toolCallCount,
	});
}

// ── Agent Activity & Outcome Events ──

export function emitEditFeedbackEvent(
	otel: IOTelService,
	outcome: string,
	languageId: string,
	participant: string,
	requestId: string,
	editSurface: string,
	hasRemainingEdits: boolean,
	isNotebook: boolean,
	workspace?: WorkspaceOTelMetadata,
): void {
	otel.emitLogRecord(`copilot_chat.edit.feedback: ${outcome}`, {
		'event.name': 'copilot_chat.edit.feedback',
		'outcome': outcome,
		'language_id': languageId,
		'participant': participant,
		'request_id': requestId,
		'edit_surface': editSurface,
		'has_remaining_edits': hasRemainingEdits,
		'is_notebook': isNotebook,
		...workspaceMetadataToOTelAttributes(workspace),
	});
}

export function emitEditHunkActionEvent(
	otel: IOTelService,
	outcome: string,
	languageId: string,
	requestId: string,
	lineCount: number,
	linesAdded: number,
	linesRemoved: number,
	workspace?: WorkspaceOTelMetadata,
): void {
	otel.emitLogRecord(`copilot_chat.edit.hunk.action: ${outcome}`, {
		'event.name': 'copilot_chat.edit.hunk.action',
		'outcome': outcome,
		'language_id': languageId,
		'request_id': requestId,
		'line_count': lineCount,
		'lines_added': linesAdded,
		'lines_removed': linesRemoved,
		...workspaceMetadataToOTelAttributes(workspace),
	});
}

export function emitInlineDoneEvent(
	otel: IOTelService,
	accepted: boolean,
	languageId: string,
	editCount: number,
	editLineCount: number,
	replyType: string,
	isNotebook: boolean,
	workspace?: WorkspaceOTelMetadata,
): void {
	otel.emitLogRecord(`copilot_chat.inline.done: ${accepted ? 'accepted' : 'rejected'}`, {
		'event.name': 'copilot_chat.inline.done',
		'accepted': accepted,
		'language_id': languageId,
		'edit_count': editCount,
		'edit_line_count': editLineCount,
		'reply_type': replyType,
		'is_notebook': isNotebook,
		...workspaceMetadataToOTelAttributes(workspace),
	});
}

export function emitEditSurvivalEvent(
	otel: IOTelService,
	editSource: string,
	survivalRateFourGram: number,
	survivalRateNoRevert: number,
	timeDelayMs: number,
	didBranchChange: boolean,
	requestId: string,
	workspace?: WorkspaceOTelMetadata,
): void {
	otel.emitLogRecord(`copilot_chat.edit.survival: ${editSource}`, {
		'event.name': 'copilot_chat.edit.survival',
		'edit_source': editSource,
		'survival_rate_four_gram': survivalRateFourGram,
		'survival_rate_no_revert': survivalRateNoRevert,
		'time_delay_ms': timeDelayMs,
		'did_branch_change': didBranchChange,
		'request_id': requestId,
		...workspaceMetadataToOTelAttributes(workspace),
	});
}

export function emitUserFeedbackEvent(
	otel: IOTelService,
	rating: string,
	participant: string,
	conversationId: string,
	requestId: string,
): void {
	otel.emitLogRecord(`copilot_chat.user.feedback: ${rating}`, {
		'event.name': 'copilot_chat.user.feedback',
		'rating': rating,
		'participant': participant,
		'conversation_id': conversationId,
		'request_id': requestId,
	});
}

export function emitCloudSessionInvokeEvent(
	otel: IOTelService,
	partnerAgent: string,
	model: string,
	requestId: string,
): void {
	otel.emitLogRecord(`copilot_chat.cloud.session.invoke: ${partnerAgent}`, {
		'event.name': 'copilot_chat.cloud.session.invoke',
		'partner_agent': partnerAgent,
		'model': model,
		'request_id': requestId,
	});
}
