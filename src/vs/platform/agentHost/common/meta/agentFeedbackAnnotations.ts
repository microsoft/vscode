/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Mutable } from '../../../../base/common/types.js';
import type { Annotation } from '../state/protocol/state.js';

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
 * Whether {@link toolName} (a tool name as seen on a tool call) refers to the
 * {@link VIEW_UNREVIEWED_COMMENTS_TOOL_NAME} server tool. Accepts both the bare
 * name and the Claude `mcp__<server>__<name>` prefixed form.
 */
export function isViewUnreviewedCommentsTool(toolName: string): boolean {
	return toolName === VIEW_UNREVIEWED_COMMENTS_TOOL_NAME || toolName.endsWith(`__${VIEW_UNREVIEWED_COMMENTS_TOOL_NAME}`);
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
	/**
	 * Transient marker set by the client when the user reveals this comment to
	 * the agent via the `viewUnreviewedComments` tool. The server tool returns
	 * exactly the comments carrying this flag (so the result is scoped to the
	 * comments selected for that invocation rather than every accepted review
	 * comment) and clears it once they have been delivered, so a later
	 * invocation does not re-return them.
	 */
	readonly pendingAgentReveal?: boolean;
}

function isAgentFeedbackKindValue(value: unknown): value is AgentFeedbackKindValue {
	return value === 'user' || value === 'codeReview' || value === 'prReview';
}

function isAgentFeedbackStateValue(value: unknown): value is AgentFeedbackStateValue {
	return value === 'created' || value === 'accepted' || value === 'submitted' || value === 'resolved';
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
	if (typeof raw['pendingAgentReveal'] === 'boolean') { result.pendingAgentReveal = raw['pendingAgentReveal']; }
	return result;
}
