/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GenAiAttr, GenAiOperationName, StdAttr } from './genAiAttributes';
import { normalizeProviderMessages, stringifyToolsRawForTelemetry, toSystemInstructions, truncateForOTel } from './messageFormatters';
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

	// Full content capture (optionally truncated per OTelConfig.maxAttributeSizeChars).
	// Normalize to OTel GenAI semantic convention format.
	if (otel.config.captureContent) {
		const maxLen = otel.config.maxAttributeSizeChars;
		if (request.messages !== undefined) {
			const msgs = Array.isArray(request.messages) ? request.messages as ReadonlyArray<Record<string, unknown>> : undefined;
			attributes[GenAiAttr.INPUT_MESSAGES] = truncateForOTel(JSON.stringify(
				msgs ? normalizeProviderMessages(msgs) : request.messages
			), maxLen);
		}
		if (request.systemMessage !== undefined) {
			const systemText = typeof request.systemMessage === 'string'
				? request.systemMessage
				: JSON.stringify(request.systemMessage);
			const systemInstructions = toSystemInstructions(systemText);
			if (systemInstructions !== undefined) {
				attributes[GenAiAttr.SYSTEM_INSTRUCTIONS] = truncateForOTel(JSON.stringify(systemInstructions), maxLen);
			}
		}
		if (request.tools !== undefined) {
			const toolsJson = stringifyToolsRawForTelemetry(request.tools as ReadonlyArray<unknown> | undefined);
			if (toolsJson !== undefined) {
				attributes[GenAiAttr.TOOL_DEFINITIONS] = truncateForOTel(toolsJson, maxLen);
			}
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

/**
 * Rating outcomes for the inline agent-quality survey.
 */
export type InlineAgentSurveyRating = 'yes' | 'partly' | 'no';

/**
 * Structured, validated payload for the inline agent-quality survey.
 *
 * This event intentionally carries only correlation identifiers and coarse
 * structured feedback (rating + finite reason IDs + trigger/surface metadata).
 * It must never include transcript, code, or free-text content.
 */
export interface IInlineAgentSurveyEvent {
	/** Task-outcome rating selected by the user. */
	readonly rating: InlineAgentSurveyRating;
	/** Finite pre-defined reason ID, when one was selected. */
	readonly reason?: string;
	/** What caused the survey to be shown (e.g. `first_response`, `mature_response`). */
	readonly trigger: string;
	/** Where the survey was shown (e.g. `agents_window`, `editor_chat`). */
	readonly surface: string;
	/** Completed user-turn count for the surveyed chat. */
	readonly turnCount: number;
	/** Chat session / conversation correlation ID, when available. */
	readonly conversationId?: string;
	/** Response / request correlation ID, when available. */
	readonly requestId?: string;
	/** Model identifier for the surveyed response, when available. */
	readonly model?: string;
}

/**
 * Emit the inline agent-quality survey submission as an OTel log record.
 *
 * Mirrors {@link emitUserFeedbackEvent} but models the three-outcome survey
 * (Yes/Partly/No) with an optional reason and trigger metadata.
 * Optional correlation fields are omitted rather than synthesized when absent.
 */
export function emitInlineAgentSurveyEvent(
	otel: IOTelService,
	survey: IInlineAgentSurveyEvent,
): void {
	const attributes: Record<string, unknown> = {
		'event.name': 'copilot_chat.inline_agent_survey',
		'rating': survey.rating,
		'trigger': survey.trigger,
		'surface': survey.surface,
		'turn_count': survey.turnCount,
	};
	if (survey.reason) {
		attributes['reason'] = survey.reason;
	}
	if (survey.conversationId) {
		attributes['conversation_id'] = survey.conversationId;
	}
	if (survey.requestId) {
		attributes['request_id'] = survey.requestId;
	}
	if (survey.model) {
		attributes[GenAiAttr.REQUEST_MODEL] = survey.model;
	}
	otel.emitLogRecord(`copilot_chat.inline_agent_survey: ${survey.rating}`, attributes);
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
