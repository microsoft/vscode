/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from '../../../../base/common/uri.js';
import type { IRange } from '../../../../editor/common/core/range.js';
import type { ICodeReviewSuggestion } from '../../codeReview/browser/codeReviewService.js';

/**
 * Core agent-feedback model types.
 *
 * These live in their own leaf module (depending only on a handful of shared
 * types) so that both the feedback service and the storage backends can
 * consume them without forming a dependency cycle between
 * `agentFeedbackService.ts` and `agentFeedbackItemsBackend.ts`. The service
 * re-exports them for consumers that import the model from the service.
 */

/**
 * The origin of an agent feedback item. Used to classify how the feedback
 * entered the session so that telemetry can distinguish user-authored
 * feedback from feedback converted out of an existing review comment.
 *
 * The string values are kept stable as they are surfaced to the agent (via
 * the `listComments` tool) and in telemetry.
 */
export const enum AgentFeedbackKind {
	/** Authored by the user. */
	UserReview = 'user',
	/** Converted from an in-product (agent) code review comment. */
	AgentReview = 'codeReview',
	/** Converted from a pull request review comment. */
	PRReview = 'prReview',
}

/**
 * Lifecycle state of an agent feedback item. An item is in exactly one state
 * at a time and progresses Created -> Accepted -> Submitted, and may move to
 * Resolved once the agent has acted on it. Providers without an agent loop
 * (i.e. non-agent-host) resolve items directly on submit, skipping the
 * visible Submitted state.
 */
export const enum AgentFeedbackState {
	/**
	 * Added by a system (e.g. the `addComment` tool) but not yet accepted by
	 * the user. Created items are hidden from the `listComments` tool and are
	 * not attached to the chat input until they are accepted.
	 */
	Created = 'created',
	/**
	 * Authored or accepted by the user and waiting to be submitted to the
	 * agent. Only accepted items can be submitted.
	 */
	Accepted = 'accepted',
	/** Submitted to the agent for action. */
	Submitted = 'submitted',
	/**
	 * Resolved — by the agent for agent-host sessions, or directly on submit
	 * for other providers that have no agent loop to resolve comments. Resolved
	 * items are hidden from the UI.
	 */
	Resolved = 'resolved',
}

export interface IAgentFeedback {
	readonly id: string;
	readonly text: string;
	readonly resourceUri: URI;
	readonly range: IRange;
	readonly sessionResource: URI;
	readonly suggestion?: ICodeReviewSuggestion;
	readonly codeSelection?: string;
	readonly diffHunks?: string;
	/** Origin of this feedback item (user-authored, converted from code/PR review). */
	readonly kind: AgentFeedbackKind;
	/** When this feedback was converted from a PR review comment, the original thread ID. */
	readonly sourcePRReviewCommentId?: string;
	/**
	 * Additional comment messages that belong to the same thread as this feedback,
	 * talking about the same code region. The first {@link text} is the initial
	 * comment; replies are subsequent messages added to it.
	 */
	readonly replies?: readonly string[];
	/** Lifecycle state of this feedback item. */
	readonly state: AgentFeedbackState;

	/**
	 * Transient marker set when the user reveals this comment to the agent via
	 * the `viewUnreviewedComments` tool. The agent-host server tool returns the
	 * comments carrying this flag and then clears it. Only meaningful for
	 * reviewable (PR / code review) comments.
	 */
	readonly pendingAgentReveal?: boolean;
}
