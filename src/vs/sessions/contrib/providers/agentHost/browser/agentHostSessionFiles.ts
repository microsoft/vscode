/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable, derivedOpts, IObservable, mapObservableArrayCached } from '../../../../../base/common/observable.js';
import { compare as strCompare } from '../../../../../base/common/strings.js';
import { getComparisonKey, isEqual, isEqualOrParent } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { normalizeFileEdit } from '../../../../../platform/agentHost/common/fileEditDiff.js';
import type { FileEdit } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import {
	buildDefaultChatUri,
	type ChatState,
	FileEditKind,
	ResponsePartKind,
	type SessionState,
	StateComponents,
	type Turn,
	type ToolCallState,
	ToolCallStatus,
	ToolResultContentType,
} from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ISessionFile, ISessionWorkspace, SessionFileOperation } from '../../../../services/sessions/common/session.js';
import { createActiveSessionSubscriptionObs } from './agentHostSessionChangesets.js';
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
}

/**
 * Builds the observable list of files that were created, edited or deleted
 * **outside** the session's workspace folders during the session.
 *
 * The data is parsed from the agent-host chat-state turns: each turn's
 * response parts are scanned for tool calls, and each tool call's file-edit
 * results (and pending edits) are collected. The resulting edits are reduced
 * per file so that a file first created and then edited is reported as
 * {@link SessionFileOperation.Created}, while a deleted file is removed from
 * the list entirely.
 *
 * Computation only happens for the active, non-archived session: archived
 * sessions never open a live chat-state subscription, so no parsing work is
 * done for them.
 */
export function createSessionFilesObs(
	sessionUri: URI,
	options: IAgentHostAdapterOptions,
	isActiveSessionObs: IObservable<boolean>,
	isArchivedObs: IObservable<boolean>,
	workspaceObs: IObservable<ISessionWorkspace | undefined>,
): IObservable<readonly ISessionFile[]> {
	const mapDiffUri = options.mapDiffUri;

	// Session files are only computed for the active, non-archived session. The
	// subscriptions and parsing below are all gated on this so an archived
	// session does no work.
	const enabledObs = derivedOpts<boolean>({ equalsFn: (a, b) => a === b }, reader =>
		isActiveSessionObs.read(reader) && !isArchivedObs.read(reader));

	// Subscribe to the session to discover its chats.
	const sessionStateObs = createActiveSessionSubscriptionObs<SessionState>(
		options,
		enabledObs,
		StateComponents.Session,
		constObservable(sessionUri),
	);

	// All chat URIs in the session (default chat + any peer chats). File edits
	// can be produced by any chat, so we union edits across all of them.
	const chatUrisObs = derivedOpts<readonly URI[]>({ equalsFn: (a, b) => a.length === b.length && a.every((u, i) => isEqual(u, b[i])) }, reader => {
		if (!enabledObs.read(reader)) {
			return [];
		}
		const sessionState = sessionStateObs.read(reader).read(reader);
		const defaultChatUri = URI.parse(buildDefaultChatUri(sessionUri));
		if (!sessionState || sessionState instanceof Error) {
			return [defaultChatUri];
		}

		const uris = new Map<string, URI>();
		uris.set(defaultChatUri.toString(), defaultChatUri);
		for (const chat of sessionState.chats) {
			const uri = URI.parse(chat.resource);
			uris.set(uri.toString(), uri);
		}
		return [...uris.values()];
	});

	// One observable of parsed edits per chat, subscribing to that chat's state.
	//
	// Completed turns (`chatState.turns`) are immutable once finalized, so each
	// is parsed exactly once and memoized by turn id in a closure-scoped cache
	// that lives for the chat's lifetime. Only the in-progress `activeTurn` is
	// re-parsed on every streamed delta, making delta updates O(active turn)
	// rather than O(all turns). The `equalsFn` ensures the downstream reducer
	// only re-runs when the parsed edits actually change (e.g. not for markdown
	// or reasoning deltas that carry no file edits).
	const editsPerChatObs = mapObservableArrayCached(undefined, chatUrisObs, (chatUri) => {
		const chatStateObs = createActiveSessionSubscriptionObs<ChatState>(
			options,
			enabledObs,
			StateComponents.Chat,
			constObservable(chatUri),
		);
		const parse = createIncrementalChatFileEditsParser(mapDiffUri);
		return derivedOpts<readonly IParsedFileEdit[]>({ equalsFn: parsedFileEditsEqual }, reader => {
			const chatState = chatStateObs.read(reader).read(reader);
			if (!chatState || chatState instanceof Error) {
				return [];
			}
			return parse(chatState);
		});
	}, chatUri => chatUri.toString());

	return derivedOpts<readonly ISessionFile[]>({ equalsFn: sessionFilesEqual }, reader => {
		const workspace = workspaceObs.read(reader);
		const folderRoots = (workspace?.folders ?? []).map(f => f.workingDirectory);

		const allEdits: IParsedFileEdit[] = [];
		for (const chatEditsObs of editsPerChatObs.read(reader)) {
			allEdits.push(...chatEditsObs.read(reader));
		}

		return reduceSessionFiles(allEdits, folderRoots);
	});
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

/**
 * Creates a stateful parser that turns a chat state into its ordered list of
 * file edits, **parsing each completed turn at most once**.
 *
 * Completed turns (`chatState.turns`) are immutable once finalized, so each is
 * parsed once and memoized by turn id in the returned closure. Only the
 * in-progress `activeTurn` is re-parsed on every call, making streamed-delta
 * updates O(active turn) rather than O(all turns).
 *
 * @param mapDiffUri Optional URI mapper applied while parsing.
 * @param parseTurn Per-turn parse function. Defaults to {@link parseResponseParts};
 *   injectable so tests can observe how often each turn is (re)parsed.
 */
export function createIncrementalChatFileEditsParser(
	mapDiffUri?: (uri: URI) => URI,
	parseTurn: ParseTurnFileEdits = responseParts => parseResponseParts(responseParts, mapDiffUri),
): (chatState: IFileEditChatState) => IParsedFileEdit[] {
	const completedTurnCache = new Map<string, readonly IParsedFileEdit[]>();

	return (chatState: IFileEditChatState): IParsedFileEdit[] => {
		const edits: IParsedFileEdit[] = [];
		const turns: readonly IFileEditTurn[] = chatState.turns ?? [];

		// Evict cache entries for turns that are no longer completed (e.g. a turn
		// that moved back to `activeTurn`, or a discarded turn) so the cache can't
		// grow unbounded or return stale data.
		const completedIds = new Set(turns.map(t => t.id));
		for (const id of completedTurnCache.keys()) {
			if (!completedIds.has(id)) {
				completedTurnCache.delete(id);
			}
		}

		for (const turn of turns) {
			let parsed = completedTurnCache.get(turn.id);
			if (!parsed) {
				parsed = parseTurn(turn.responseParts);
				completedTurnCache.set(turn.id, parsed);
			}
			if (parsed.length > 0) {
				edits.push(...parsed);
			}
		}

		if (chatState.activeTurn) {
			edits.push(...parseTurn(chatState.activeTurn.responseParts));
		}

		return edits;
	};
}

/** Parses the file edits contained in a turn's response parts (stateless). */
export function parseResponseParts(responseParts: Turn['responseParts'], mapDiffUri?: (uri: URI) => URI): IParsedFileEdit[] {
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
 * Extracts the {@link FileEdit | file edits} from a tool call regardless of its
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

function parseFileEdit(fileEdit: FileEdit, mapDiffUri?: (uri: URI) => URI): IParsedFileEdit | undefined {
	const normalized = normalizeFileEdit(fileEdit);
	if (!normalized) {
		return undefined;
	}
	const map = (uri: URI | undefined): URI | undefined => uri ? (mapDiffUri ? mapDiffUri(uri) : uri) : undefined;
	return {
		kind: normalized.kind,
		afterUri: map(normalized.afterUri),
		beforeUri: map(normalized.beforeUri),
		beforeContentUri: map(normalized.beforeContentUri),
	};
}

interface IMutableSessionFile {
	operation: SessionFileOperation;
	originalUri?: URI;
}

/**
 * Reduces an ordered list of parsed file edits into the final per-file state.
 *
 * Rules:
 * - A file created during the session stays {@link SessionFileOperation.Created}
 *   even if edited afterwards.
 * - A deleted file is removed from the list entirely: a file created or edited
 *   during the session and then deleted nets out, and a pre-existing file that
 *   is deleted is not surfaced.
 * - Renames are modeled as a delete of the source plus a create of the target.
 * - Only files outside every workspace folder root are kept.
 */
export function reduceSessionFiles(edits: readonly IParsedFileEdit[], folderRoots: readonly URI[]): ISessionFile[] {
	const byUri = new Map<string, { uri: URI; file: IMutableSessionFile }>();

	const isOutsideWorkspace = (uri: URI): boolean =>
		!folderRoots.some(root => isEqualOrParent(uri, root));

	const setCreated = (uri: URI): void => {
		if (!isOutsideWorkspace(uri)) {
			return;
		}
		byUri.set(getComparisonKey(uri), { uri, file: { operation: SessionFileOperation.Created } });
	};

	const setModified = (uri: URI, originalUri: URI | undefined): void => {
		if (!isOutsideWorkspace(uri)) {
			return;
		}
		const existing = byUri.get(getComparisonKey(uri));
		if (existing?.file.operation === SessionFileOperation.Created) {
			return; // created-then-edited stays created
		}
		if (existing?.file.operation === SessionFileOperation.Modified) {
			// Keep the earliest known original content for the diff.
			existing.file.originalUri = existing.file.originalUri ?? originalUri;
			return;
		}
		byUri.set(getComparisonKey(uri), { uri, file: { operation: SessionFileOperation.Modified, originalUri } });
	};

	// A delete removes the file from the list entirely rather than surfacing it
	// as a deleted entry: a create/edit followed by a delete nets out, and a
	// pre-existing deleted file simply never appears.
	const removeFile = (uri: URI): void => {
		byUri.delete(getComparisonKey(uri));
	};

	for (const edit of edits) {
		switch (edit.kind) {
			case FileEditKind.Create:
				if (edit.afterUri) {
					setCreated(edit.afterUri);
				}
				break;
			case FileEditKind.Edit:
				if (edit.afterUri) {
					setModified(edit.afterUri, edit.beforeContentUri);
				}
				break;
			case FileEditKind.Delete:
				if (edit.beforeUri) {
					removeFile(edit.beforeUri);
				}
				break;
			case FileEditKind.Rename:
				if (edit.beforeUri) {
					removeFile(edit.beforeUri);
				}
				if (edit.afterUri) {
					setCreated(edit.afterUri);
				}
				break;
		}
	}

	const files = [...byUri.values()].map(({ uri, file }): ISessionFile => ({
		uri,
		operation: file.operation,
		originalUri: file.originalUri,
	}));

	files.sort((a, b) => strCompare(getComparisonKey(a.uri), getComparisonKey(b.uri)));
	return files;
}

function sessionFilesEqual(a: readonly ISessionFile[], b: readonly ISessionFile[]): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i].operation !== b[i].operation
			|| !isEqual(a[i].uri, b[i].uri)
			|| !isEqual(a[i].originalUri, b[i].originalUri)) {
			return false;
		}
	}
	return true;
}

/**
 * Structural equality over parsed edits, used as the per-chat observable's
 * `equalsFn` so streamed deltas that carry no file-edit change (e.g. markdown
 * or reasoning content) don't re-run the downstream reducer.
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
			|| !isEqual(a[i].afterUri, b[i].afterUri)
			|| !isEqual(a[i].beforeUri, b[i].beforeUri)
			|| !isEqual(a[i].beforeContentUri, b[i].beforeContentUri)) {
			return false;
		}
	}
	return true;
}
