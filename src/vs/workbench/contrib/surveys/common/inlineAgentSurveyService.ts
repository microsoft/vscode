/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IInlineAgentSurveyEligibilityContext } from './inlineAgentSurveyScheduler.js';

export const IInlineAgentSurveyService = createDecorator<IInlineAgentSurveyService>('inlineAgentSurveyService');

/**
 * The chat surface a survey may appear in. Ctrl+I inline chat is intentionally excluded.
 */
export const enum InlineAgentSurveySurface {
	AgentsWindow = 'agentsWindow',
	EditorChat = 'editorChat',
}

/**
 * What selected a survey for a response.
 */
export const enum InlineAgentSurveyTrigger {
	/** The first completed user turn of the session. */
	FirstResponse = 'firstResponse',
	/** A mature session that crossed the turn-count and elapsed-time thresholds. */
	Mature = 'mature',
}

/**
 * The three survey outcomes. `Yes` submits in one tap; `Partly` and `No` reveal optional reasons.
 */
export const enum InlineAgentSurveyRating {
	Yes = 'yes',
	Partly = 'partly',
	No = 'no',
}

/**
 * The finite, optional reason offered for `Partly`/`No` ratings. Numeric so it can be logged as a
 * finite reason ID without free text.
 */
export const enum InlineAgentSurveyReason {
	WrongResult = 0,
	TooSlow = 1,
	Misunderstood = 2,
	LostContext = 3,
	Incomplete = 4,
}

/**
 * Response-scoped context supplied by the chat renderer when a response is observed transitioning
 * to complete. Extends the pure eligibility facts with the identifiers needed for persistence and
 * telemetry correlation.
 */
export interface IInlineAgentSurveyResponseContext extends IInlineAgentSurveyEligibilityContext {
	/** Durable chat session resource, including peer-chat identity. Used as the chat key. */
	readonly chatResource: URI;
	/** Stable response identifier. */
	readonly responseId: string;
	/** Stable request identifier for the turn that produced the response. */
	readonly requestId: string;
	/** Provider/session-type identifier, e.g. the session scheme or `local`. */
	readonly sessionType: string;
	/** Language model identifier for the turn, if known. Escaped before telemetry. */
	readonly modelId?: string;
}

/**
 * A survey selected for a response and awaiting an impression. Persisted across reloads keyed by
 * chat resource plus response ID.
 */
export interface IInlineAgentSurveyPending {
	readonly responseId: string;
	readonly trigger: InlineAgentSurveyTrigger;
	readonly surface: InlineAgentSurveySurface;
	readonly dismissed: boolean;
}

/**
 * A completed survey submission reported by the renderer.
 */
export interface IInlineAgentSurveySubmission {
	readonly rating: InlineAgentSurveyRating;
	/** Optional finite reason for `Partly`/`No`. Ignored for `Yes`. */
	readonly reason?: InlineAgentSurveyReason;
}

/**
 * Shared workbench service that owns inline agent survey scheduling, eligibility, pacing,
 * persistence and telemetry. Rendering lives in the chat transcript and calls into this service.
 *
 * The service is provider-agnostic: the caller extracts the actual chat response/session facts and
 * passes them in, so this service has no dependency on chat models.
 */
export interface IInlineAgentSurveyService {
	readonly _serviceBrand: undefined;
	readonly isFeedbackEnabled: boolean;
	readonly onDidChangeFeedbackEnabled: Event<boolean>;

	/**
	 * Records all already-completed response IDs for a chat as historical and ineligible so they
	 * are never rolled. Call this once when a chat model is first tracked, before observing any
	 * live completion. Idempotent per chat.
	 */
	snapshotHistoricalResponses(chatResource: URI, responseIds: readonly string[]): void;

	/**
	 * Evaluates a response that was observed transitioning to complete while its chat is tracked.
	 * Rolls at most once per response ID: the ID is marked rolled synchronously before any async
	 * work, so re-renders, virtualization, or multiple visible sessions cannot inflate the odds.
	 * Historical (snapshotted) responses never roll. When a survey is selected it is persisted as
	 * pending and can be read back via {@link getPendingSurvey}.
	 */
	evaluateResponseCompletion(context: IInlineAgentSurveyResponseContext): Promise<void>;

	/**
	 * Returns the pending survey to render for a response, or `undefined` if the response was not
	 * selected or the survey was submitted.
	 */
	getPendingSurvey(chatResource: URI, responseId: string): IInlineAgentSurveyPending | undefined;

	/**
	 * Marks the one-per-chat impression before the survey is rendered. Sets the durable per-chat
	 * marker and the global pacing timestamp and emits impression telemetry. Idempotent per chat.
	 */
	recordImpression(context: IInlineAgentSurveyResponseContext): void;

	/**
	 * Records a dismiss. The pending survey and impression marker are retained so Undo can restore
	 * it while the response remains current.
	 */
	recordDismiss(context: IInlineAgentSurveyResponseContext): void;

	/**
	 * Records an Undo of a previous dismiss.
	 */
	recordUndo(context: IInlineAgentSurveyResponseContext): void;

	/**
	 * Records a rating selection (before submission).
	 */
	recordRating(context: IInlineAgentSurveyResponseContext, rating: InlineAgentSurveyRating): void;

	/**
	 * Records a completed submission. Clears the pending survey for the response.
	 */
	recordSubmission(context: IInlineAgentSurveyResponseContext, submission: IInlineAgentSurveySubmission): void;

}
