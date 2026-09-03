/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable, derived, derivedOpts, IObservable } from '../../../../../base/common/observable.js';
import { getComparisonKey, isEqual, isEqualOrParent } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { normalizeFileEdit } from '../../../../../platform/agentHost/common/fileEditDiff.js';
import type { AgentHostUriMapper } from '../../../../../platform/agentHost/common/agentHostUri.js';
import type { FileEdit } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import {
	buildDefaultChatUri,
	type ChatState,
	type Customization,
	FileEditKind,
	ResponsePartKind,
	type SessionState,
	StateComponents,
	type Turn,
	type ToolCallState,
	ToolCallStatus,
	ToolResultContentType,
} from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IChatSessionFileChange2 } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionChatCustomization, ISessionTurnFileChange, ISessionWorkspace, sessionTurnFileChangesEqual } from '../../../../services/sessions/common/session.js';
import { createActiveSessionSubscriptionObs } from './agentHostSessionChangesets.js';
import { createIncrementalChatCustomizationRefsParser, customizationRefsEqual, CustomizationIndex, resolveChatCustomizations, sessionChatCustomizationsEqual, type ICustomizationRef } from './agentHostSessionCustomizations.js';
import { IAgentHostAdapterOptions } from './baseAgentHostSessionsProvider.js';

/**
 * A single file edit emitted by a tool call, decoded from the protocol so the
 * reducer can classify it. Ordered so creations seen before edits keep the
 * "created" classification.
 */
export interface IParsedFileEdit {
	readonly kind: FileEditKind;
	/** After-state URI (create/edit/rename target). */
	readonly afterUri?: URI;
	/** Before-state URI (delete source / rename origin). */
	readonly beforeUri?: URI;
	/** Before-content URI, used to render a diff for modified files. */
	readonly beforeContentUri?: URI;
	/** Lines added by this edit, from the protocol diff metadata (0 when absent). */
	readonly insertions: number;
	/** Lines removed by this edit, from the protocol diff metadata (0 when absent). */
	readonly deletions: number;
}

/**
 * The observable outputs derived from an agent-host session's live output
 * stream (its chat-state turns), exposed per chat and computed on demand so a
 * chat nobody asks about is never subscribed to.
 */
export interface ISessionOutputObs {
	/**
	 * Returns the file changes produced by a specific chat's **last turn** only,
	 * keyed by that chat's AHP chat URI (the default chat's
	 * {@link buildDefaultChatUri}, or a peer chat's protocol resource). Reduces
	 * that chat's last-turn edits into per-file {@link ISessionTurnFileChange |
	 * changes} (with diff stats and owning-workspace classification).
	 * Used by the chat input status pills to reflect just what the chat's most
	 * recent request produced.
	 */
	getLastTurnChanges(chatUri: URI): IObservable<readonly ISessionTurnFileChange[]>;
	/**
	 * Returns the customizations a specific chat used or read, keyed by that
	 * chat's AHP chat URI. Ordered by first reference and de-duplicated.
	 */
	getChatCustomizations(chatUri: URI): IObservable<readonly ISessionChatCustomization[]>;
	/**
	 * Drops the cached observables and parser state held for a chat that no
	 * longer exists (e.g. a peer chat removed from the session's catalog).
	 * Without this the per-chat caches would retain one object graph per
	 * deleted chat for the adapter's lifetime.
	 */
	releaseChat(chatUri: URI): void;
}

/**
 * Builds the observable outputs derived from a session's live output stream.
 *
 * The data is parsed from the agent-host chat-state turns: the turn's response
 * parts are scanned for tool calls, and each tool call's file-edit results (and
 * pending edits) are collected.
 *
 * Everything is scoped to a single chat and produced on demand: asking for a
 * chat's {@link ISessionOutputObs.getLastTurnChanges | last-turn changes} or
 * {@link ISessionOutputObs.getChatCustomizations | customizations} is what
 * opens that chat's state subscription, so peer chats nobody reads cost
 * nothing. Only the chat's last turn is ever parsed for file edits — completed
 * earlier turns are never walked.
 *
 * Computation only happens for the active, non-archived session: archived
 * sessions never open a live chat-state subscription, so no parsing work is
 * done for them.
 */
export function createSessionOutputObs(
	sessionUri: URI,
	options: IAgentHostAdapterOptions,
	isActiveSessionObs: IObservable<boolean>,
	isArchivedObs: IObservable<boolean>,
	workspaceObs: IObservable<ISessionWorkspace | undefined>,
	cache: Map<string, unknown>,
): ISessionOutputObs {
	const mapDiffUri = options.mapDiffUri;

	// Session output is only computed for the active, non-archived session. The
	// subscriptions and parsing below are all gated on this so an archived
	// session does no work.
	const enabledObs = derivedOpts<boolean>({ equalsFn: (a, b) => a === b }, reader =>
		isActiveSessionObs.read(reader) && !isArchivedObs.read(reader));

	// One entry per chat the UI has asked about, created on first request. The
	// entries are inert until read: the chat-state subscription is only opened
	// while one of the derived values below is observed.
	interface IChatOutput {
		readonly lastTurnEdits: IObservable<readonly IParsedFileEdit[]>;
		readonly customizationRefs: IObservable<readonly ICustomizationRef[]>;
	}
	const outputByChat = new Map<string, IChatOutput>();
	const getChatOutput = (chatUri: URI): IChatOutput => {
		const key = chatUri.toString();
		let output = outputByChat.get(key);
		if (!output) {
			const chatStateObs = createActiveSessionSubscriptionObs<ChatState>(
				options,
				enabledObs,
				StateComponents.Chat,
				constObservable(chatUri),
			);
			const parseFileEdits = createIncrementalChatFileEditsParser(mapDiffUri);
			const parseCustomizationRefs = createIncrementalChatCustomizationRefsParser();
			output = {
				lastTurnEdits: derivedOpts<readonly IParsedFileEdit[]>({ equalsFn: parsedFileEditsEqual }, reader => {
					const chatState = chatStateObs.read(reader).read(reader);
					if (!chatState || chatState instanceof Error) {
						return [];
					}
					return parseFileEdits(chatState);
				}),
				// Kept separate from `lastTurnEdits` so a delta that only carries
				// file edits does not invalidate the customization references,
				// and vice versa.
				customizationRefs: derivedOpts<readonly ICustomizationRef[]>({ equalsFn: customizationRefsEqual }, reader => {
					const chatState = chatStateObs.read(reader).read(reader);
					if (!chatState || chatState instanceof Error) {
						return [];
					}
					return parseCustomizationRefs(chatState);
				}),
			};
			outputByChat.set(key, output);
		}
		return output;
	};

	// The active-turn changeset requests this reactively, so reuse one observable per chat.
	const lastTurnChangesByChat = new Map<string, IObservable<readonly ISessionTurnFileChange[]>>();
	const getLastTurnChanges = (chatUri: URI): IObservable<readonly ISessionTurnFileChange[]> => {
		const key = chatUri.toString();
		let changes = lastTurnChangesByChat.get(key);
		if (!changes) {
			changes = derivedOpts<readonly ISessionTurnFileChange[]>({ equalsFn: sessionTurnFileChangesEqual }, reader => {
				const folderRoots = getWorkspaceAndWorktreeRoots(workspaceObs.read(reader));
				return reduceTurnChanges(getChatOutput(chatUri).lastTurnEdits.read(reader), folderRoots, cache);
			});
			lastTurnChangesByChat.set(key, changes);
		}
		return changes;
	};

	// The customization tree changes far less often than the output stream, so
	// it is indexed on its own and the cheap ref lookup re-runs on either change.
	const sessionStateObs = createActiveSessionSubscriptionObs<SessionState>(
		options,
		enabledObs,
		StateComponents.Session,
		constObservable(sessionUri),
	);
	const customizationsObs = derivedOpts<readonly Customization[] | undefined>({ equalsFn: (a, b) => a === b }, reader => {
		const sessionState = sessionStateObs.read(reader).read(reader);
		return !sessionState || sessionState instanceof Error ? undefined : sessionState.customizations;
	});
	const customizationIndexObs = derived(reader =>
		new CustomizationIndex(customizationsObs.read(reader), getWorkspaceAndWorktreeRoots(workspaceObs.read(reader))));

	const customizationsByChat = new Map<string, IObservable<readonly ISessionChatCustomization[]>>();
	const getChatCustomizations = (chatUri: URI): IObservable<readonly ISessionChatCustomization[]> => {
		const key = chatUri.toString();
		let customizations = customizationsByChat.get(key);
		if (!customizations) {
			customizations = derivedOpts<readonly ISessionChatCustomization[]>({ equalsFn: sessionChatCustomizationsEqual }, reader =>
				resolveChatCustomizations(getChatOutput(chatUri).customizationRefs.read(reader), customizationIndexObs.read(reader)));
			customizationsByChat.set(key, customizations);
		}
		return customizations;
	};

	const releaseChat = (chatUri: URI): void => {
		const key = chatUri.toString();
		outputByChat.delete(key);
		lastTurnChangesByChat.delete(key);
		customizationsByChat.delete(key);
	};

	return { getLastTurnChanges, getChatCustomizations, releaseChat };
}

/**
 * Minimal shape of a turn needed to parse its file edits. {@link Turn} is
 * structurally assignable to this, so production passes a real `ChatState`
 * while tests can build lightweight fixtures.
 */
export interface IFileEditTurn {
	readonly id: string;
	readonly responseParts: Turn['responseParts'];
}

/** A chat state reduced to just the fields needed to parse its file edits. */
export interface IFileEditChatState {
	readonly turns?: readonly IFileEditTurn[];
	readonly activeTurn?: { readonly responseParts: Turn['responseParts'] };
}

/** Parses the file edits contained in a single turn's response parts. */
export type ParseTurnFileEdits = (responseParts: Turn['responseParts']) => readonly IParsedFileEdit[];

function pushUniqueRoot(roots: URI[], root: URI | undefined): void {
	if (root && !roots.some(existing => isEqual(existing, root))) {
		roots.push(root);
	}
}

function getWorkspaceAndWorktreeRoots(workspace: ISessionWorkspace | undefined): readonly URI[] {
	const roots: URI[] = [];
	for (const folder of workspace?.folders ?? []) {
		pushUniqueRoot(roots, folder.root);
		pushUniqueRoot(roots, folder.workingDirectory);
		pushUniqueRoot(roots, folder.gitRepository?.workTreeUri);
	}
	return roots;
}

/**
 * Creates a stateful parser that extracts a chat's **last turn** file edits.
 *
 * The last turn is the in-progress `activeTurn` when streaming, otherwise the
 * most recently completed turn. Completed turns are immutable once finalized,
 * so the completed last turn is parsed once and memoized by its id; only the
 * in-progress turn is re-parsed on every streamed delta. Earlier turns are
 * never walked, so the cost of a delta is O(last turn) regardless of how long
 * the chat has been running.
 *
 * @param mapDiffUri Optional URI mapper applied while parsing.
 * @param parseTurn Per-turn parse function. Defaults to {@link parseResponseParts};
 *   injectable so tests can observe how often each turn is (re)parsed.
 */
export function createIncrementalChatFileEditsParser(
	mapDiffUri?: AgentHostUriMapper,
	parseTurn: ParseTurnFileEdits = responseParts => parseResponseParts(responseParts, mapDiffUri),
): (chatState: IFileEditChatState) => readonly IParsedFileEdit[] {
	let completedLastTurn: { readonly id: string; readonly edits: readonly IParsedFileEdit[] } | undefined;

	return (chatState: IFileEditChatState): readonly IParsedFileEdit[] => {
		if (chatState.activeTurn) {
			return parseTurn(chatState.activeTurn.responseParts);
		}

		const turns: readonly IFileEditTurn[] = chatState.turns ?? [];
		const lastTurn = turns.length > 0 ? turns[turns.length - 1] : undefined;
		if (!lastTurn) {
			completedLastTurn = undefined;
			return [];
		}
		if (completedLastTurn?.id !== lastTurn.id) {
			completedLastTurn = { id: lastTurn.id, edits: parseTurn(lastTurn.responseParts) };
		}
		return completedLastTurn.edits;
	};
}

/** Parses the file edits contained in a turn's response parts (stateless). */
export function parseResponseParts(responseParts: Turn['responseParts'], mapDiffUri?: AgentHostUriMapper): IParsedFileEdit[] {
	const out: IParsedFileEdit[] = [];
	for (const part of responseParts) {
		if (part.kind !== ResponsePartKind.ToolCall) {
			continue;
		}
		for (const fileEdit of getToolCallFileEdits(part.toolCall)) {
			const parsed = parseFileEdit(fileEdit, mapDiffUri);
			if (parsed) {
				out.push(parsed);
			}
		}
	}
	return out;
}

/**
 * lifecycle state: completed/running results carry them in `content`, while a
 * tool call awaiting confirmation carries the planned edits in `edits.items`.
 */
function getToolCallFileEdits(toolCall: ToolCallState): FileEdit[] {
	const edits: FileEdit[] = [];

	// Completed/running results carry file edits in `content`...
	if (toolCall.status === ToolCallStatus.Running
		|| toolCall.status === ToolCallStatus.Completed
		|| toolCall.status === ToolCallStatus.PendingResultConfirmation) {
		for (const c of toolCall.content ?? []) {
			if (c.type === ToolResultContentType.FileEdit) {
				edits.push(c);
			}
		}
	} else if (toolCall.status === ToolCallStatus.PendingConfirmation) {
		// ...while a tool call awaiting confirmation carries the planned edits.
		edits.push(...(toolCall.edits?.items ?? []));
	}

	return edits;
}

function parseFileEdit(fileEdit: FileEdit, mapDiffUri?: AgentHostUriMapper): IParsedFileEdit | undefined {
	const normalized = normalizeFileEdit(fileEdit);
	if (!normalized) {
		return undefined;
	}
	const map = (uri: URI | undefined): URI | undefined => uri ? (mapDiffUri ? mapDiffUri(uri) : uri) : undefined;
	const mapContent = (uri: URI | undefined): URI | undefined =>
		uri ? (mapDiffUri ? mapDiffUri(uri, { contentRef: true }) : uri) : undefined;
	return {
		kind: normalized.kind,
		afterUri: map(normalized.afterUri),
		beforeUri: map(normalized.beforeUri),
		beforeContentUri: mapContent(normalized.beforeContentUri),
		insertions: fileEdit.diff?.added ?? 0,
		deletions: fileEdit.diff?.removed ?? 0,
	};
}

interface IMutableTurnChange {
	uri: URI;
	modifiedUri: URI | undefined;
	originalUri: URI | undefined;
	isOutsideWorkspace: boolean;
	/** Whether the file was created during the turn (kept across later edits). */
	created: boolean;
	insertions: number;
	deletions: number;
}

/**
 * Reduces a single turn's parsed file edits into one {@link ISessionTurnFileChange}
 * per file, aggregating diff stats. Mirrors the "Last Turn Changes" changeset
 * so consumers (e.g. the chat input status pills) can reflect the last turn
 * straight from the output stream.
 *
 * Rules:
 * - Repeated edits to the same file collapse into a single change whose
 *   insertions/deletions are the sum of the individual edits.
 * - A file created during the turn stays a creation (no original side) even if
 *   edited afterwards.
 * - A create/edit followed by a delete in the same turn nets out; a pre-existing
 *   file deleted during the turn is surfaced as a deletion (no modified side to
 *   preview) but still counted in the stats.
 * - Renames drop the source and surface the target as an edit of its
 *   before-content, matching the changeset's classification.
 * - Every change records whether its resource is outside all workspace roots.
 */
export function reduceTurnChanges(
	edits: readonly IParsedFileEdit[],
	folderRoots: readonly URI[] = [],
	cache?: Map<string, unknown>,
): (IChatSessionFileChange2 & ISessionTurnFileChange)[] {
	const byUri = new Map<string, IMutableTurnChange>();

	const isOutsideWorkspace = (resource: URI): boolean => {
		const cacheKey = `isOutsideWorkspace:${resource.toString()}`;
		const cached = cache?.get(cacheKey);
		if (typeof cached === 'boolean') {
			return cached;
		}
		const result = !folderRoots.some(root => isEqualOrParent(resource, root));
		cache?.set(cacheKey, result);
		return result;
	};

	const setCreated = (uri: URI, insertions: number, deletions: number): void => {
		const key = getComparisonKey(uri);
		const existing = byUri.get(key);
		if (existing) {
			existing.created = true;
			existing.modifiedUri = uri;
			existing.originalUri = undefined;
			existing.insertions += insertions;
			existing.deletions += deletions;
			return;
		}
		byUri.set(key, { uri, modifiedUri: uri, originalUri: undefined, isOutsideWorkspace: isOutsideWorkspace(uri), created: true, insertions, deletions });
	};

	const setModified = (uri: URI, originalUri: URI | undefined, insertions: number, deletions: number): void => {
		const key = getComparisonKey(uri);
		const existing = byUri.get(key);
		if (existing) {
			existing.insertions += insertions;
			existing.deletions += deletions;
			if (!existing.created) {
				// Keep the earliest known original content for the diff.
				existing.originalUri = existing.originalUri ?? originalUri;
			}
			return;
		}
		byUri.set(key, { uri, modifiedUri: uri, originalUri, isOutsideWorkspace: isOutsideWorkspace(uri), created: false, insertions, deletions });
	};

	const setDeleted = (uri: URI, originalUri: URI | undefined, insertions: number, deletions: number): void => {
		const key = getComparisonKey(uri);
		if (byUri.has(key)) {
			// Created/edited earlier in the same turn and now deleted: nets out.
			byUri.delete(key);
			return;
		}
		// Pre-existing file deleted during the turn: no modified side to preview.
		byUri.set(key, { uri, modifiedUri: undefined, originalUri, isOutsideWorkspace: isOutsideWorkspace(uri), created: false, insertions, deletions });
	};

	for (const edit of edits) {
		switch (edit.kind) {
			case FileEditKind.Create:
				if (edit.afterUri) {
					setCreated(edit.afterUri, edit.insertions, edit.deletions);
				}
				break;
			case FileEditKind.Edit:
				if (edit.afterUri) {
					setModified(edit.afterUri, edit.beforeContentUri, edit.insertions, edit.deletions);
				}
				break;
			case FileEditKind.Delete:
				if (edit.beforeUri) {
					setDeleted(edit.beforeUri, edit.beforeContentUri, edit.insertions, edit.deletions);
				}
				break;
			case FileEditKind.Rename:
				if (edit.beforeUri) {
					byUri.delete(getComparisonKey(edit.beforeUri));
				}
				if (edit.afterUri) {
					setModified(edit.afterUri, edit.beforeContentUri, edit.insertions, edit.deletions);
				}
				break;
		}
	}

	return [...byUri.values()].map(c => ({
		uri: c.uri,
		modifiedUri: c.modifiedUri,
		originalUri: c.originalUri,
		isOutsideWorkspace: c.isOutsideWorkspace,
		insertions: c.insertions,
		deletions: c.deletions,
	} satisfies ISessionTurnFileChange));
}

/**
 * Structural equality over parsed edits, used as the per-chat observable's
 * `equalsFn` so streamed deltas that carry no file-edit change (e.g. markdown
 * or reasoning content) don't re-run the downstream reducers.
 */
function parsedFileEditsEqual(a: readonly IParsedFileEdit[], b: readonly IParsedFileEdit[]): boolean {
	if (a === b) {
		return true;
	}
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i].kind !== b[i].kind
			|| a[i].insertions !== b[i].insertions
			|| a[i].deletions !== b[i].deletions
			|| !isEqual(a[i].afterUri, b[i].afterUri)
			|| !isEqual(a[i].beforeUri, b[i].beforeUri)
			|| !isEqual(a[i].beforeContentUri, b[i].beforeContentUri)) {
			return false;
		}
	}
	return true;
}
