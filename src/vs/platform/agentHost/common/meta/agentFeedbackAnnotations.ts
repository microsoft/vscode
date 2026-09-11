/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Mutable } from '../../../../base/common/types.js';
import type { Annotation, AnnotationEntry } from '../state/protocol/state.js';

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
 * Name of the agent host server tool that reveals review comments the user has
 * not accepted yet. Shared here (in the layer-neutral `common` module) so the
 * node-side server tool implementation and the browser-side chat adapter that
 * renders its confirmation agree on the name without drifting. The agent sees
 * this name directly (Copilot) or prefixed as `mcp__host__<name>` (Claude).
 */
export const VIEW_UNREVIEWED_COMMENTS_TOOL_NAME = 'viewUnreviewedComments';

/**
 * Name of the agent host server tool that adds a comment (agent feedback) to a
 * file range. Shared here (in the layer-neutral `common` module) so the
 * node-side server tool implementation and the browser-side chat adapter that
 * renders its tool call agree on the name without drifting. The agent sees this
 * name directly (Copilot) or prefixed as `mcp__host__<name>` (Claude).
 */
export const ADD_COMMENT_TOOL_NAME = 'addComment';

/**
 * Whether {@link toolName} (a tool name as seen on a tool call) refers to the
 * {@link VIEW_UNREVIEWED_COMMENTS_TOOL_NAME} server tool. Accepts both the bare
 * name and the Claude `mcp__<server>__<name>` prefixed form.
 */
export function isViewUnreviewedCommentsTool(toolName: string): boolean {
	return toolName === VIEW_UNREVIEWED_COMMENTS_TOOL_NAME || toolName.endsWith(`__${VIEW_UNREVIEWED_COMMENTS_TOOL_NAME}`);
}

/**
 * Whether {@link toolName} (a tool name as seen on a tool call) refers to the
 * {@link ADD_COMMENT_TOOL_NAME} server tool. Accepts both the bare name and the
 * Claude `mcp__<server>__<name>` prefixed form.
 */
export function isAddCommentTool(toolName: string): boolean {
	return toolName === ADD_COMMENT_TOOL_NAME || toolName.endsWith(`__${ADD_COMMENT_TOOL_NAME}`);
}

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

/** Pull request that originated a PR-review feedback item. */
export interface IFeedbackPullRequest {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
}

/**
 * Feedback semantics carried in an annotation's {@link Annotation._meta}.
 *
 * The optional client-only fields ({@link suggestion}, {@link codeSelection},
 * {@link diffHunks}, {@link sourcePRReviewCommentId}, {@link sourcePullRequest}) are populated when a
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
	readonly sourcePullRequest?: IFeedbackPullRequest;
	/**
	 * Transient marker set by the client when the user reveals this comment to
	 * the agent via the `viewUnreviewedComments` tool. The marker persists until
	 * the server tool delivers the comment, so an interrupted execution does not
	 * lose the user's selection. The server tool clears it after delivery.
	 */
	readonly pendingAgentReveal?: boolean;
}

function isAgentFeedbackKindValue(value: unknown): value is AgentFeedbackKindValue {
	return value === 'user' || value === 'codeReview' || value === 'prReview';
}

function isAgentFeedbackStateValue(value: unknown): value is AgentFeedbackStateValue {
	return value === 'created' || value === 'accepted' || value === 'submitted' || value === 'resolved';
}

function isFeedbackPullRequest(value: unknown): value is IFeedbackPullRequest {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const candidate = value as Partial<IFeedbackPullRequest>;
	return typeof candidate.owner === 'string' && typeof candidate.repo === 'string' && typeof candidate.number === 'number';
}

/**
 * Who wrote a specific {@link AnnotationEntry} within a feedback comment.
 *
 * A comment's origin ({@link AgentFeedbackKindValue}) describes where the
 * thread came from; an author describes each individual message in it, so a
 * thread the user started can carry agent replies and vice versa. `unknown` is
 * used when provenance cannot be established rather than assuming the user.
 */
export type AgentFeedbackAuthorValue = 'user' | 'agent' | 'prReviewer' | 'unknown';

/** Author semantics carried in an {@link AnnotationEntry._meta}. */
export interface IFeedbackAnnotationEntryMeta {
	readonly author: AgentFeedbackAuthorValue;
}

function isAgentFeedbackAuthorValue(value: unknown): value is AgentFeedbackAuthorValue {
	return value === 'user' || value === 'agent' || value === 'prReviewer' || value === 'unknown';
}

/**
 * The author of a comment's opening entry, derived from the thread's origin:
 * code review comments are written by an agent and PR review comments by a
 * reviewer.
 */
export function authorForFeedbackKind(kind: AgentFeedbackKindValue | undefined): AgentFeedbackAuthorValue {
	switch (kind) {
		case 'user': return 'user';
		case 'codeReview': return 'agent';
		case 'prReview': return 'prReviewer';
		default: return 'unknown';
	}
}

/** Builds the `_meta` bag stamping {@link author} onto an annotation entry. */
export function feedbackAnnotationEntryMeta(author: AgentFeedbackAuthorValue): Record<string, unknown> {
	return { [FEEDBACK_ANNOTATION_META_KEY]: { author } satisfies IFeedbackAnnotationEntryMeta };
}

/**
 * Reads the author stamped onto an annotation entry, or `undefined` for
 * entries written before authors were recorded.
 */
export function readFeedbackAnnotationEntryAuthor(entry: AnnotationEntry): AgentFeedbackAuthorValue | undefined {
	const meta = entry._meta;
	const slot = meta?.[FEEDBACK_ANNOTATION_META_KEY];
	if (!slot || typeof slot !== 'object' || Array.isArray(slot)) {
		return undefined;
	}
	const author = (slot as Record<string, unknown>)['author'];
	return isAgentFeedbackAuthorValue(author) ? author : undefined;
}

/**
 * Resolves the author of the entry at {@link index} within a comment of
 * {@link kind}. Entries written before authors were recorded fall back to the
 * thread's origin for the opening entry and to the user for replies — at that
 * time replies could only be typed by the user.
 */
export function resolveFeedbackEntryAuthor(entry: AnnotationEntry, index: number, kind: AgentFeedbackKindValue | undefined): AgentFeedbackAuthorValue {
	return readFeedbackAnnotationEntryAuthor(entry) ?? (index === 0 ? authorForFeedbackKind(kind) : 'user');
}

/**
 * Reads the well-known {@link IFeedbackAnnotationMeta} from an annotation's
 * `_meta` bag (under {@link FEEDBACK_ANNOTATION_META_KEY}). The annotations
 * channel is shared, so this validates the required `kind` / `state` /
 * `sessionResource` fields and returns `undefined` for annotations that aren't
 * feedback items. Read through this rather than casting the namespaced slot.
 */
export function readFeedbackAnnotationMeta(annotation: Annotation): IFeedbackAnnotationMeta | undefined {
	const meta = annotation._meta;
	const slot = meta?.[FEEDBACK_ANNOTATION_META_KEY];
	if (!slot || typeof slot !== 'object' || Array.isArray(slot)) {
		return undefined;
	}
	const raw = slot as Record<string, unknown>;
	if (!isAgentFeedbackKindValue(raw['kind']) || !isAgentFeedbackStateValue(raw['state']) || typeof raw['sessionResource'] !== 'string') {
		return undefined;
	}
	const result: Mutable<IFeedbackAnnotationMeta> = { kind: raw['kind'], state: raw['state'], sessionResource: raw['sessionResource'] };
	if (raw['suggestion'] !== undefined) { result.suggestion = raw['suggestion']; }
	if (typeof raw['codeSelection'] === 'string') { result.codeSelection = raw['codeSelection']; }
	if (typeof raw['diffHunks'] === 'string') { result.diffHunks = raw['diffHunks']; }
	if (typeof raw['sourcePRReviewCommentId'] === 'string') { result.sourcePRReviewCommentId = raw['sourcePRReviewCommentId']; }
	if (isFeedbackPullRequest(raw['sourcePullRequest'])) { result.sourcePullRequest = raw['sourcePullRequest']; }
	if (typeof raw['pendingAgentReveal'] === 'boolean') { result.pendingAgentReveal = raw['pendingAgentReveal']; }
	return result;
}
