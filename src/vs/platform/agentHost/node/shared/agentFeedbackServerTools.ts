/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { FEEDBACK_ANNOTATION_META_KEY, type IFeedbackAnnotationMeta } from '../../common/agentFeedbackAnnotations.js';
import { buildAnnotationsUri } from '../../common/annotationsUri.js';
import type { AnnotationsAction } from '../../common/state/sessionActions.js';
import { ActionType } from '../../common/state/protocol/common/actions.js';
import type { Annotation, AnnotationsState, StringOrMarkdown, TextRange, ToolDefinition } from '../../common/state/sessionState.js';
import type { IServerToolGroup } from './agentServerToolHost.js';

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
	return annotation._meta?.[FEEDBACK_ANNOTATION_META_KEY] as IFeedbackAnnotationMeta | undefined;
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

function serializeComments(annotations: readonly Annotation[]): string {
	return JSON.stringify({ comments: annotations.map(serializeComment) }, undefined, 2);
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
			return { actions: [], result: serializeComments(listableAnnotations(state)) };
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
 * The feedback ("comments") server-tool group, contributed to the
 * {@link AgentServerToolHost} at startup (see `node/agentService.ts`). Wraps
 * the pure {@link applyFeedbackTool} executor with the annotations-channel I/O:
 * it reads the session's current {@link AnnotationsState}, applies the tool,
 * and dispatches the resulting annotation actions through the state manager
 * (the single writer).
 */
export const feedbackServerToolGroup: IServerToolGroup = {
	definitions: feedbackServerToolDefinitions,
	execute(stateManager, sessionUri, toolName, rawArgs): string {
		const annotationsUri = buildAnnotationsUri(sessionUri);
		const snapshot = stateManager.getSnapshot(annotationsUri);
		const state: AnnotationsState = (snapshot?.state as AnnotationsState | undefined) ?? { annotations: [] };
		const outcome = applyFeedbackTool(state, sessionUri, toolName, rawArgs);
		for (const action of outcome.actions) {
			stateManager.dispatchServerAction(annotationsUri, action);
		}
		return outcome.result;
	},
};
