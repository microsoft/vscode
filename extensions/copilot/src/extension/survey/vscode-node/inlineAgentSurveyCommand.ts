/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { emitInlineAgentSurveyEvent, type IInlineAgentSurveyEvent, type InlineAgentSurveyRating } from '../../../platform/otel/common/genAiEvents';
import { IOTelService } from '../../../platform/otel/common/otelService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';

/**
 * Private, internal command invoked by the workbench inline agent-quality survey
 * widget to forward a validated, structured submission to the Copilot OTel pipeline.
 *
 * The command is intentionally not contributed in `package.json`: it is an internal
 * bridge and must only ever receive a narrow, structured payload — never transcript,
 * code, or free-text content.
 */
export const INLINE_AGENT_SURVEY_SUBMIT_ID = 'github.copilot.chat.internal.inlineAgentSurvey.submit';

const VALID_RATINGS: ReadonlySet<InlineAgentSurveyRating> = new Set<InlineAgentSurveyRating>(['yes', 'partly', 'no']);

/** Finite allow-list of survey reason IDs. */
const VALID_REASONS: ReadonlySet<string> = new Set<string>(['wrong_result', 'too_slow', 'misunderstood', 'lost_context', 'incomplete']);

/** Finite allow-list of survey triggers. */
const VALID_TRIGGERS: ReadonlySet<string> = new Set<string>(['first_response', 'mature_response']);

/** Finite allow-list of survey surfaces. */
const VALID_SURFACES: ReadonlySet<string> = new Set<string>(['agents_window', 'editor_chat']);

/** Max length accepted for optional correlation identifiers, to bound accidental payload size. */
const MAX_ID_LENGTH = 256;

function coerceId(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	const trimmed = value.trim();
	if (trimmed.length === 0 || trimmed.length > MAX_ID_LENGTH) {
		return undefined;
	}
	return trimmed;
}

/**
 * Validate and normalize an untrusted survey payload received over the command bridge.
 *
 * Returns a structured event when the required fields (rating, trigger, surface) are
 * present and belong to their finite allow-lists; otherwise returns `undefined` and the
 * submission is dropped. Optional correlation fields are omitted rather than synthesized.
 */
export function validateInlineAgentSurveyPayload(raw: unknown): IInlineAgentSurveyEvent | undefined {
	if (!raw || typeof raw !== 'object') {
		return undefined;
	}
	const payload = raw as Record<string, unknown>;

	const rating = typeof payload.rating === 'string' ? payload.rating.toLowerCase() : undefined;
	if (!rating || !VALID_RATINGS.has(rating as InlineAgentSurveyRating)) {
		return undefined;
	}

	const trigger = typeof payload.trigger === 'string' ? payload.trigger : undefined;
	if (!trigger || !VALID_TRIGGERS.has(trigger)) {
		return undefined;
	}

	const surface = typeof payload.surface === 'string' ? payload.surface : undefined;
	if (!surface || !VALID_SURFACES.has(surface)) {
		return undefined;
	}

	const reason = typeof payload.reason === 'string' && VALID_REASONS.has(payload.reason)
		? payload.reason
		: undefined;

	const rawTurnCount = typeof payload.turnCount === 'number' ? payload.turnCount : Number.NaN;
	const turnCount = Number.isFinite(rawTurnCount) && rawTurnCount >= 0 ? Math.floor(rawTurnCount) : 0;

	return {
		rating: rating as InlineAgentSurveyRating,
		reason,
		trigger,
		surface,
		turnCount,
		conversationId: coerceId(payload.conversationId),
		requestId: coerceId(payload.requestId),
		model: coerceId(payload.model),
	};
}

export class InlineAgentSurveyCommandContribution extends Disposable {
	constructor(@IOTelService private readonly _otelService: IOTelService) {
		super();
		this._register(vscode.commands.registerCommand(INLINE_AGENT_SURVEY_SUBMIT_ID, (payload: unknown) => {
			const survey = validateInlineAgentSurveyPayload(payload);
			if (!survey) {
				return;
			}
			emitInlineAgentSurveyEvent(this._otelService, survey);
		}));
	}
}
