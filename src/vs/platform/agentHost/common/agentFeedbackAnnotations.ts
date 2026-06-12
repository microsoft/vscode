/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared convention for carrying agent-feedback semantics inside an
 * {@link Annotation._meta} on the agent host annotations channel.
 *
 * Feedback items round-trip as annotations on `<session>/annotations`; the
 * annotation's own fields cover id / resource / range / resolved, and
 * everything else (lifecycle state, origin kind, code context, PR linkage)
 * lives under {@link FEEDBACK_ANNOTATION_META_KEY}. This module is the single
 * place both the server (agent host, which writes feedback annotations from
 * its server tools) and the client (agents window, which reads them back)
 * agree on the key and shape, so the two sides cannot drift.
 */

/** Namespaced key under {@link Annotation._meta} carrying feedback semantics. */
export const FEEDBACK_ANNOTATION_META_KEY = 'vscode.agentFeedback';

/**
 * Origin of a feedback item. String values match the client-side
 * `AgentFeedbackKind` enum so a value written by either side decodes on the
 * other without translation.
 */
export type AgentFeedbackKindValue = 'user' | 'codeReview' | 'prReview';

/**
 * Lifecycle state of a feedback item. String values match the client-side
 * `AgentFeedbackState` enum.
 */
export type AgentFeedbackStateValue = 'created' | 'accepted' | 'submitted' | 'resolved';

/**
 * Feedback semantics carried in an annotation's {@link Annotation._meta}.
 *
 * The optional client-only fields ({@link suggestion}, {@link codeSelection},
 * {@link diffHunks}, {@link sourcePRReviewCommentId}) are populated when a
 * feedback item is converted from a code- or PR-review comment on the client;
 * server tools only ever write {@link kind} / {@link state} /
 * {@link sessionResource}. {@link suggestion} is typed loosely here because
 * its concrete shape lives in the client (sessions) layer.
 */
export interface IFeedbackAnnotationMeta {
	readonly kind: AgentFeedbackKindValue;
	readonly state: AgentFeedbackStateValue;
	readonly sessionResource: string;
	readonly suggestion?: unknown;
	readonly codeSelection?: string;
	readonly diffHunks?: string;
	readonly sourcePRReviewCommentId?: string;
}

/**
 * Server-side host for the agent feedback ("comments") tools. The agent host
 * implements this to advertise the feedback tools as server tools for a
 * session and to execute them against that session's annotations channel.
 *
 * `sessionUri` is the session's protocol URI (string).
 */
export interface IAgentFeedbackToolHost {
	/** Advertises the feedback tools on the session's `serverTools`. */
	advertise(sessionUri: string): void;
	/**
	 * Executes a feedback server tool against the session's annotation state,
	 * dispatching any resulting annotation actions, and returns the textual
	 * tool result for the agent.
	 */
	executeTool(sessionUri: string, toolName: string, rawArgs: unknown): string;
}
