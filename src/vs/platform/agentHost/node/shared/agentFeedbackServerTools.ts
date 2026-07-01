/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { FEEDBACK_ANNOTATION_META_KEY, readFeedbackAnnotationMeta, VIEW_UNREVIEWED_COMMENTS_TOOL_NAME, type IFeedbackAnnotationMeta } from '../../common/meta/agentFeedbackAnnotations.js';
import { buildAnnotationsUri } from '../../common/annotationsUri.js';
import type { AnnotationsAction } from '../../common/state/sessionActions.js';
import { ActionType } from '../../common/state/protocol/common/actions.js';
import { parseChatUri, type Annotation, type AnnotationsState, type StringOrMarkdown, type TextRange, type ToolDefinition } from '../../common/state/sessionState.js';
import type { IServerToolDisplay, IServerToolDisplayResult, IServerToolGroup } from './agentServerToolHost.js';

/**
 * Server-side implementation of the agent feedback ("comments") tools.
 *
 * These tools used to be registered on the client (agents window) and keyed
 * off an in-memory store. For agent-host sessions they now execute on the
 * server against the session's annotations channel: each comment is an
 * {@link Annotation} on `<session>/annotations`, with feedback semantics
 * carried in {@link Annotation._meta} under {@link FEEDBACK_ANNOTATION_META_KEY}
 * (see `agentFeedbackAnnotations.ts`). The functions here are pure — they read
 * the current {@link AnnotationsState} and return the annotation actions to
 * dispatch plus a textual tool result — so they can be unit tested without a
 * running state manager. The host wiring (reading the snapshot, dispatching
 * the actions) lives in the caller.
 */

export const addCommentToolName = 'addComment';
export const listCommentsToolName = 'listComments';
export const deleteCommentsToolName = 'deleteComments';
export const resolveCommentsToolName = 'resolveComments';
export const viewUnreviewedCommentsToolName = VIEW_UNREVIEWED_COMMENTS_TOOL_NAME;

/**
 * Feedback kinds that originate from a review the user is expected to triage
 * (a pull request review or an in-product code review) rather than being
 * authored by the user directly. Comments of these kinds that are still in the
 * `created` state are surfaced to the agent via the {@link listCommentsToolName}
 * note and revealed through {@link viewUnreviewedCommentsToolName}.
 */
const REVIEWABLE_FEEDBACK_KINDS: ReadonlySet<string> = new Set(['prReview', 'codeReview']);

/**
 * Server tools that must not be auto-approved: invoking them surfaces a
 * confirmation to the user (rendered by a custom client content part) before
 * the tool body runs. Providers consult {@link feedbackToolRequiresConfirmation}
 * (via the host) to exclude these from their server-tool auto-approve lists.
 */
const feedbackConfirmationToolNames: ReadonlySet<string> = new Set([viewUnreviewedCommentsToolName]);

/** Whether the given feedback server tool requires user confirmation before it runs. */
export function feedbackToolRequiresConfirmation(toolName: string): boolean {
	return feedbackConfirmationToolNames.has(toolName);
}

const addCommentInputSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {
		resourceUri: { type: 'string', description: 'URI of the file to add a comment to.' },
		range: {
			type: 'object',
			description: 'One-based text range to comment on.',
			properties: {
				startLineNumber: { type: 'number', description: 'One-based start line number.' },
				startColumn: { type: 'number', description: 'One-based start column.' },
				endLineNumber: { type: 'number', description: 'One-based end line number.' },
				endColumn: { type: 'number', description: 'One-based end column.' },
			},
			required: ['startLineNumber', 'startColumn', 'endLineNumber', 'endColumn'],
		},
		text: { type: 'string', description: 'Comment text to add.' },
	},
	required: ['resourceUri', 'range', 'text'],
};

const listCommentsInputSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {},
};

const viewUnreviewedCommentsInputSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {},
};

const deleteCommentsInputSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {
		commentIds: { type: 'array', items: { type: 'string' }, description: 'Comment IDs to delete.' },
	},
	required: ['commentIds'],
};

const resolveCommentsInputSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {
		commentIds: { type: 'array', items: { type: 'string' }, description: 'Comment IDs to update.' },
		resolved: { type: 'boolean', description: 'Whether the comments should be marked as resolved. Defaults to true.' },
	},
	required: ['commentIds'],
};

/**
 * Protocol {@link ToolDefinition}s for the feedback server tools, advertised on
 * {@link SessionState.serverTools} so clients know these tools are owned and
 * executed by the agent host.
 */
export const feedbackServerToolDefinitions: ToolDefinition[] = [
	{
		name: addCommentToolName,
		title: 'Add Comment (Agent Feedback)',
		description: 'Add a comment to a file range.',
		inputSchema: addCommentInputSchema,
		annotations: { readOnlyHint: false },
	},
	{
		name: listCommentsToolName,
		title: 'List Comments (Agent Feedback)',
		description: 'List comments for this session.',
		inputSchema: listCommentsInputSchema,
		annotations: { readOnlyHint: true },
	},
	{
		name: deleteCommentsToolName,
		title: 'Delete Comments (Agent Feedback)',
		description: 'Delete comments for this session.',
		inputSchema: deleteCommentsInputSchema,
		annotations: { readOnlyHint: false, destructiveHint: true },
	},
	{
		name: resolveCommentsToolName,
		title: 'Resolve Comments (Agent Feedback)',
		description: 'Mark comments for this session as resolved or unresolved.',
		inputSchema: resolveCommentsInputSchema,
		annotations: { readOnlyHint: false },
	},
	{
		name: viewUnreviewedCommentsToolName,
		title: 'View Unreviewed Comments (Agent Feedback)',
		description: 'View pull request or code review comments that the user has not reviewed yet. Calling this asks the user to choose which of those comments to reveal; only the comments the user reveals are returned.',
		inputSchema: viewUnreviewedCommentsInputSchema,
		annotations: { readOnlyHint: true },
	},
];

// --- Argument validation ------------------------------------------------------

interface IOneBasedRange {
	readonly startLineNumber: number;
	readonly startColumn: number;
	readonly endLineNumber: number;
	readonly endColumn: number;
}

interface IAddCommentArgs {
	readonly resourceUri?: unknown;
	readonly range?: unknown;
	readonly text?: unknown;
}

interface IDeleteCommentsArgs {
	readonly commentIds?: unknown;
}

interface IResolveCommentsArgs {
	readonly commentIds?: unknown;
	readonly resolved?: unknown;
}

function getRequiredString(value: unknown, field: string, toolName: string): string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`Invalid ${toolName} input: ${field} must be a non-empty string.`);
	}
	return value;
}

function getRequiredPositiveInteger(value: unknown, field: string, toolName: string): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
		throw new Error(`Invalid ${toolName} input: ${field} must be a positive integer.`);
	}
	return value;
}

function getAddCommentArgs(rawArgs: unknown): { resourceUri: string; range: IOneBasedRange; text: string } {
	const args = (rawArgs ?? {}) as IAddCommentArgs;
	const resourceUri = getRequiredString(args.resourceUri, 'resourceUri', addCommentToolName);
	const text = getRequiredString(args.text, 'text', addCommentToolName);
	if (!args.range || typeof args.range !== 'object' || Array.isArray(args.range)) {
		throw new Error(`Invalid ${addCommentToolName} input: range must be an object.`);
	}
	const range = args.range as Partial<IOneBasedRange>;
	return {
		resourceUri,
		text,
		range: {
			startLineNumber: getRequiredPositiveInteger(range.startLineNumber, 'range.startLineNumber', addCommentToolName),
			startColumn: getRequiredPositiveInteger(range.startColumn, 'range.startColumn', addCommentToolName),
			endLineNumber: getRequiredPositiveInteger(range.endLineNumber, 'range.endLineNumber', addCommentToolName),
			endColumn: getRequiredPositiveInteger(range.endColumn, 'range.endColumn', addCommentToolName),
		},
	};
}

function getUniqueCommentIds(value: unknown, toolName: string): readonly string[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw new Error(`Invalid ${toolName} input: commentIds must be a non-empty string array.`);
	}
	const ids: string[] = [];
	for (const item of value) {
		ids.push(getRequiredString(item, 'commentIds[]', toolName));
	}
	return [...new Set(ids)];
}

function getResolvedFlag(value: unknown): boolean {
	if (value === undefined) {
		return true;
	}
	if (typeof value !== 'boolean') {
		throw new Error(`Invalid ${resolveCommentsToolName} input: resolved must be a boolean.`);
	}
	return value;
}

// --- Annotation <-> feedback conversion ---------------------------------------

function toTextRange(range: IOneBasedRange): TextRange {
	return {
		start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
		end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
	};
}

function fromTextRange(range: TextRange | undefined): IOneBasedRange {
	if (!range) {
		return { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };
	}
	return {
		startLineNumber: range.start.line + 1,
		startColumn: range.start.character + 1,
		endLineNumber: range.end.line + 1,
		endColumn: range.end.character + 1,
	};
}

function entryText(text: StringOrMarkdown): string {
	return typeof text === 'string' ? text : text.markdown;
}

function readMeta(annotation: Annotation): IFeedbackAnnotationMeta | undefined {
	return readFeedbackAnnotationMeta(annotation);
}

interface ISerializedComment {
	readonly id: string;
	readonly resourceUri: string;
	readonly range: IOneBasedRange;
	readonly text: string;
	readonly kind: string;
	readonly resolved: boolean;
	readonly replies?: readonly string[];
}

function serializeComment(annotation: Annotation): ISerializedComment {
	const entries = annotation.entries ?? [];
	const meta = readMeta(annotation);
	const replies = entries.slice(1).map(e => entryText(e.text));
	return {
		id: annotation.id,
		resourceUri: annotation.resource,
		range: fromTextRange(annotation.range),
		text: entries.length ? entryText(entries[0].text) : '',
		kind: meta?.kind ?? 'user',
		resolved: annotation.resolved,
		...(replies.length ? { replies } : {}),
	};
}

/**
 * Comments visible to the agent: everything except items still in the
 * `created` state (the agent added them but the user has not accepted them
 * yet). Mirrors the client `getListableFeedback` behavior.
 */
function listableAnnotations(state: AnnotationsState): Annotation[] {
	return state.annotations.filter(annotation => {
		const meta = readMeta(annotation);
		// The annotations channel is generic and may carry annotations produced
		// by other features. Only annotations that carry feedback metadata are
		// feedback comments; the feedback tools must never list, delete, or
		// resolve unrelated annotations.
		if (!meta || !annotation.entries?.length) {
			return false;
		}
		const effectiveState = annotation.resolved ? 'resolved' : (meta.state ?? 'accepted');
		return effectiveState !== 'created';
	});
}

/**
 * Feedback annotations of a {@link REVIEWABLE_FEEDBACK_KINDS reviewable kind}
 * the user has flagged for reveal to the agent (via the confirmation of the
 * {@link viewUnreviewedCommentsToolName} tool). These are exactly the comments
 * the user chose to reveal for the current invocation; everything else
 * (including review comments that happen to be accepted from a previous reveal
 * or a manual accept) is excluded.
 */
function pendingRevealAnnotations(state: AnnotationsState): Annotation[] {
	return state.annotations.filter(annotation => {
		const meta = readMeta(annotation);
		if (!meta || !annotation.entries?.length) {
			return false;
		}
		return REVIEWABLE_FEEDBACK_KINDS.has(meta.kind) && meta.pendingAgentReveal === true;
	});
}

/** Returns a copy of {@link annotation} with the {@link IFeedbackAnnotationMeta.pendingAgentReveal} flag cleared. */
function clearPendingReveal(annotation: Annotation): Annotation {
	const meta = readMeta(annotation);
	if (!meta) {
		return annotation;
	}
	const nextMeta: IFeedbackAnnotationMeta = { ...meta, pendingAgentReveal: undefined };
	return { ...annotation, _meta: { ...annotation._meta, [FEEDBACK_ANNOTATION_META_KEY]: nextMeta } };
}

/**
 * Reviewable (PR / code review) feedback annotations the user has not reviewed
 * yet, i.e. still in the `created` state. Used to build the
 * {@link listCommentsToolName} note.
 */
function createdReviewableAnnotations(state: AnnotationsState): Annotation[] {
	return state.annotations.filter(annotation => {
		const meta = readMeta(annotation);
		if (!meta || !annotation.entries?.length) {
			return false;
		}
		return REVIEWABLE_FEEDBACK_KINDS.has(meta.kind) && !annotation.resolved && (meta.state ?? 'accepted') === 'created';
	});
}

/**
 * A short note appended to the {@link listCommentsToolName} result when there
 * are reviewable comments the user has not accepted yet, pointing the agent at
 * {@link viewUnreviewedCommentsToolName}. Returns `undefined` (no note) when
 * there are no such comments.
 */
function buildUnreviewedCommentsNote(state: AnnotationsState): string | undefined {
	const created = createdReviewableAnnotations(state);
	if (!created.length) {
		return undefined;
	}
	let prCount = 0;
	let codeReviewCount = 0;
	for (const annotation of created) {
		const kind = readMeta(annotation)?.kind;
		if (kind === 'prReview') {
			prCount++;
		} else if (kind === 'codeReview') {
			codeReviewCount++;
		}
	}
	const clauses: string[] = [];
	if (prCount > 0) {
		clauses.push(`${prCount} pull request comment${prCount === 1 ? '' : 's'}`);
	}
	if (codeReviewCount > 0) {
		clauses.push(`${codeReviewCount} code review comment${codeReviewCount === 1 ? '' : 's'}`);
	}
	const subject = clauses.join(' and ');
	const verb = created.length === 1 ? 'is' : 'are';
	return `There ${verb} ${subject} which the user has not reviewed yet. If the user wants you to tackle them, call the \`${viewUnreviewedCommentsToolName}\` tool to view them.`;
}

// --- Tool execution -----------------------------------------------------------

export interface IFeedbackToolOutcome {
	/** Annotation actions to dispatch on the session's annotations channel. */
	readonly actions: readonly AnnotationsAction[];
	/** Textual tool result returned to the agent. */
	readonly result: string;
}

/**
 * Executes a feedback server tool against the current annotation state.
 *
 * Pure: it does not mutate {@link state}, instead returning the annotation
 * actions the caller should dispatch (so the authoritative state manager
 * remains the single writer) along with the textual tool result.
 *
 * @throws if {@link toolName} is unknown or the arguments are invalid.
 */
export function applyFeedbackTool(state: AnnotationsState, sessionResource: string, toolName: string, rawArgs: unknown): IFeedbackToolOutcome {
	switch (toolName) {
		case addCommentToolName: {
			const { resourceUri, range, text } = getAddCommentArgs(rawArgs);
			const id = generateUuid();
			// The agent adds comments in the `created` state; the user accepts
			// them before they are acted upon.
			const meta: IFeedbackAnnotationMeta = { kind: 'codeReview', state: 'created', sessionResource };
			const annotation: Annotation = {
				id,
				turnId: '',
				resource: resourceUri,
				range: toTextRange(range),
				resolved: false,
				entries: [{ id: `${id}:0`, text }],
				_meta: { [FEEDBACK_ANNOTATION_META_KEY]: meta },
			};
			return {
				actions: [{ type: ActionType.AnnotationsSet, annotation }],
				result: 'Comment added.',
			};
		}
		case listCommentsToolName: {
			const payload: { comments: ISerializedComment[]; note?: string } = {
				comments: listableAnnotations(state).map(serializeComment),
			};
			const note = buildUnreviewedCommentsNote(state);
			if (note) {
				payload.note = note;
			}
			return { actions: [], result: JSON.stringify(payload, undefined, 2) };
		}
		case viewUnreviewedCommentsToolName: {
			// The confirmation gate runs before this body. When the user accepts
			// the confirmation, the client flags exactly the comments they chose
			// to reveal with `pendingAgentReveal` on the shared annotations
			// channel. Return those comments and clear the flag so a later
			// invocation does not re-return them; comments the user left
			// unchecked (and review comments accepted by other means) are not
			// flagged and so are excluded.
			const pending = pendingRevealAnnotations(state);
			const comments = pending.map(serializeComment);
			const actions: AnnotationsAction[] = pending.map(annotation => ({
				type: ActionType.AnnotationsSet,
				annotation: clearPendingReveal(annotation),
			}));
			return { actions, result: JSON.stringify({ comments }, undefined, 2) };
		}
		case deleteCommentsToolName: {
			const ids = getUniqueCommentIds((rawArgs as IDeleteCommentsArgs)?.commentIds, deleteCommentsToolName);
			const listable = listableAnnotations(state);
			const existing = new Map(listable.map(a => [a.id, a]));
			const actions: AnnotationsAction[] = [];
			const deleted: string[] = [];
			const notFound: string[] = [];
			for (const id of ids) {
				if (existing.has(id)) {
					actions.push({ type: ActionType.AnnotationsRemoved, annotationId: id });
					deleted.push(id);
				} else {
					notFound.push(id);
				}
			}
			const remaining = listable.filter(a => !deleted.includes(a.id)).map(serializeComment);
			return {
				actions,
				result: JSON.stringify({ deletedCommentIds: deleted, notFoundCommentIds: notFound, remainingComments: remaining }, undefined, 2),
			};
		}
		case resolveCommentsToolName: {
			const args = (rawArgs ?? {}) as IResolveCommentsArgs;
			const ids = getUniqueCommentIds(args.commentIds, resolveCommentsToolName);
			const resolved = getResolvedFlag(args.resolved);
			const listable = listableAnnotations(state);
			const existing = new Map(listable.map(a => [a.id, a]));
			const actions: AnnotationsAction[] = [];
			const updated: string[] = [];
			const notFound: string[] = [];
			for (const id of ids) {
				const annotation = existing.get(id);
				if (!annotation) {
					notFound.push(id);
					continue;
				}
				const meta = readMeta(annotation);
				const nextMeta: IFeedbackAnnotationMeta = {
					...meta,
					kind: meta?.kind ?? 'user',
					state: resolved ? 'resolved' : 'submitted',
					sessionResource: meta?.sessionResource ?? sessionResource,
				};
				const nextAnnotation: Annotation = {
					...annotation,
					resolved,
					_meta: { ...annotation._meta, [FEEDBACK_ANNOTATION_META_KEY]: nextMeta },
				};
				actions.push({ type: ActionType.AnnotationsSet, annotation: nextAnnotation });
				updated.push(id);
			}
			const comments = listable.map(a => updated.includes(a.id) ? serializeComment({ ...a, resolved }) : serializeComment(a));
			return {
				actions,
				result: JSON.stringify({ resolved, updatedCommentIds: updated, notFoundCommentIds: notFound, comments }, undefined, 2),
			};
		}
		default:
			throw new Error(`Unknown feedback server tool: ${toolName}`);
	}
}

/**
 * Parses the number of comments returned by the {@link listCommentsToolName}
 * tool from its JSON result (`{ comments: [...] }`). Returns `undefined` when
 * the result is missing or not in the expected shape, so the caller can fall
 * back to a count-less message.
 */
function parseListedCommentCount(resultText: string | undefined): number | undefined {
	if (!resultText) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(resultText) as { comments?: unknown };
		return Array.isArray(parsed.comments) ? parsed.comments.length : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Display strings for the feedback ("comments") tools, authored here so every
 * provider (Copilot, Claude, Codex, …) renders them identically instead of
 * each provider's display layer re-deriving the strings from the tool name.
 * Returns `undefined` for tools this group does not own, so the caller falls
 * back to its generic display.
 *
 * {@link toolName} is the bare tool name (any transport prefix such as Claude's
 * `mcp__<server>__` has already been stripped by the dispatcher).
 */
function getFeedbackToolDisplay(toolName: string, _args: unknown, result?: IServerToolDisplayResult): IServerToolDisplay | undefined {
	switch (toolName) {
		case addCommentToolName:
			return {
				displayName: localize('toolName.addComment', "Add Comment"),
				invocationMessage: localize('toolInvoke.addComment', "Adding comment"),
				pastTenseMessage: localize('toolComplete.addComment', "Added comment"),
			};
		case listCommentsToolName: {
			let pastTenseMessage: StringOrMarkdown;
			const count = result ? parseListedCommentCount(result.text) : undefined;
			if (count === undefined) {
				pastTenseMessage = localize('toolComplete.listComments', "Checked comments");
			} else if (count === 1) {
				pastTenseMessage = localize('toolComplete.listComments.one', "Checked 1 comment");
			} else {
				pastTenseMessage = localize('toolComplete.listComments.many', "Checked {0} comments", count);
			}
			return {
				displayName: localize('toolName.listComments', "List Comments"),
				invocationMessage: localize('toolInvoke.listComments', "Checking comments"),
				pastTenseMessage,
			};
		}
		case deleteCommentsToolName:
			return {
				displayName: localize('toolName.deleteComments', "Delete Comments"),
				invocationMessage: localize('toolInvoke.deleteComments', "Deleting comments"),
				pastTenseMessage: localize('toolComplete.deleteComments', "Deleted comments"),
			};
		case resolveCommentsToolName:
			return {
				displayName: localize('toolName.resolveComments', "Resolve Comments"),
				invocationMessage: localize('toolInvoke.resolveComments', "Resolving comments"),
				pastTenseMessage: localize('toolComplete.resolveComments', "Resolved comments"),
			};
		case viewUnreviewedCommentsToolName:
			return {
				displayName: localize('toolName.viewUnreviewedComments', "View Comments"),
				invocationMessage: localize('toolInvoke.viewUnreviewedComments', "Viewing comments"),
				pastTenseMessage: localize('toolComplete.viewUnreviewedComments', "Viewed comments"),
			};
		default:
			return undefined;
	}
}

/**
 * The feedback ("comments") server-tool group, contributed to the
 * {@link AgentServerToolHost} at startup (see `node/agentService.ts`). Wraps
 * the pure {@link applyFeedbackTool} executor with the annotations-channel I/O:
 * it reads the session's current {@link AnnotationsState}, applies the tool,
 * and dispatches the resulting annotation actions through the state manager
 * (the single writer).
 */
export const feedbackServerToolGroup: IServerToolGroup = {
	definitions: feedbackServerToolDefinitions,
	requiresConfirmation(toolName): boolean {
		return feedbackToolRequiresConfirmation(toolName);
	},
	getDisplay(toolName, args, result): IServerToolDisplay | undefined {
		return getFeedbackToolDisplay(toolName, args, result);
	},
	execute(stateManager, chatUri, toolName, rawArgs): string {
		// A session can contain multiple chats, each addressed by its own
		// `ahp-chat` URI but sharing the same context/workspace. Comments belong
		// to the session as a whole, so always resolve a chat URI back to its
		// owning session and operate on the main session's annotations channel.
		const mainSessionUri = parseChatUri(chatUri)?.session ?? chatUri;
		const annotationsUri = buildAnnotationsUri(mainSessionUri);
		const snapshot = stateManager.getSnapshot(annotationsUri);
		const state: AnnotationsState = (snapshot?.state as AnnotationsState | undefined) ?? { annotations: [] };
		const outcome = applyFeedbackTool(state, mainSessionUri, toolName, rawArgs);
		for (const action of outcome.actions) {
			stateManager.dispatchServerAction(annotationsUri, action);
		}
		return outcome.result;
	},
};
