/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, IReader, ITransaction } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { TextEdit } from '../../../../editor/common/languages.js';
import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorPane } from '../../../common/editor.js';
import { ICellEditOperation } from '../../notebook/common/notebookCommon.js';
import { ChatModel, IChatResponseModel } from './chatModel.js';

export const IChatEditingService = createDecorator<IChatEditingService>('chatEditingService');

export interface IChatEditingService {

	_serviceBrand: undefined;

	startOrContinueGlobalEditingSession(chatModel: ChatModel): Promise<IChatEditingSession>;

	getEditingSession(chatSessionId: string): IChatEditingSession | undefined;

	/**
	 * All editing sessions, sorted by recency, e.g the last created session comes first.
	 */
	readonly editingSessionsObs: IObservable<readonly IChatEditingSession[]>;

	/**
	 * Creates a new short lived editing session
	 */
	createEditingSession(chatModel: ChatModel): Promise<IChatEditingSession>;

	//#region related files

	hasRelatedFilesProviders(): boolean;
	registerRelatedFilesProvider(handle: number, provider: IChatRelatedFilesProvider): IDisposable;
	getRelatedFiles(chatSessionId: string, prompt: string, files: URI[], token: CancellationToken): Promise<{ group: string; files: IChatRelatedFile[] }[] | undefined>;

	//#endregion
}

export interface IChatRequestDraft {
	readonly prompt: string;
	readonly files: readonly URI[];
}

export interface IChatRelatedFileProviderMetadata {
	readonly description: string;
}

export interface IChatRelatedFile {
	readonly uri: URI;
	readonly description: string;
}

export interface IChatRelatedFilesProvider {
	readonly description: string;
	provideRelatedFiles(chatRequest: IChatRequestDraft, token: CancellationToken): Promise<IChatRelatedFile[] | undefined>;
}

export interface WorkingSetDisplayMetadata {
	state: ModifiedFileEntryState;
	description?: string;
}

export interface IStreamingEdits {
	pushText(edits: TextEdit[]): void;
	pushNotebookCellText(cell: URI, edits: TextEdit[]): void;
	pushNotebook(edits: ICellEditOperation[]): void;
	/** Marks edits as done, idempotent */
	complete(): void;
}

export const chatEditingSnapshotScheme = 'chat-editing-snapshot-text-model';

export interface IChatEditingSession extends IDisposable {
	readonly isGlobalEditingSession: boolean;
	readonly chatSessionId: string;
	readonly onDidDispose: Event<void>;
	readonly state: IObservable<ChatEditingSessionState>;
	readonly entries: IObservable<readonly IModifiedFileEntry[]>;
	show(previousChanges?: boolean): Promise<void>;
	remove(...uris: URI[]): void;
	accept(...uris: URI[]): Promise<void>;
	reject(...uris: URI[]): Promise<void>;
	getEntry(uri: URI): IModifiedFileEntry | undefined;
	readEntry(uri: URI, reader?: IReader): IModifiedFileEntry | undefined;

	restoreSnapshot(requestId: string, stopId: string | undefined): Promise<void>;

	/**
	 * Gets the snapshot URI of a file at the request and _after_ changes made in the undo stop.
	 * @param uri File in the workspace
	 */
	getSnapshotUri(requestId: string, uri: URI, stopId: string | undefined): URI | undefined;

	/**
	 * Will lead to this object getting disposed
	 */
	stop(clearState?: boolean): Promise<void>;

	/**
	 * Starts making edits to the resource.
	 * @param resource URI that's being edited
	 * @param responseModel The response model making the edits
	 * @param inUndoStop The undo stop the edits will be grouped in
	 */
	startStreamingEdits(resource: URI, responseModel: IChatResponseModel, inUndoStop: string | undefined): IStreamingEdits;

	/**
	 * Gets the document diff of a change made to a URI between one undo stop and
	 * the next one.
	 * @returns The observable or undefined if there is no diff between the stops.
	 */
	getEntryDiffBetweenStops(uri: URI, requestId: string | undefined, stopId: string | undefined): IObservable<IEditSessionEntryDiff | undefined> | undefined;

	readonly canUndo: IObservable<boolean>;
	readonly canRedo: IObservable<boolean>;
	undoInteraction(): Promise<void>;
	redoInteraction(): Promise<void>;
}

export interface IEditSessionEntryDiff {
	/** LHS and RHS of a diff editor, if opened: */
	originalURI: URI;
	modifiedURI: URI;

	/** Diff state information: */
	quitEarly: boolean;
	identical: boolean;

	/** Added data (e.g. line numbers) to show in the UI */
	added: number;
	/** Removed data (e.g. line numbers) to show in the UI */
	removed: number;
}

export const enum ModifiedFileEntryState {
	Modified,
	Accepted,
	Rejected,
}

/**
 * Represents a part of a change
 */
export interface IModifiedFileEntryChangeHunk {
	accept(): Promise<boolean>;
	reject(): Promise<boolean>;
}

export interface IModifiedFileEntryEditorIntegration extends IDisposable {

	/**
	 * The index of a change
	 */
	currentIndex: IObservable<number>;

	/**
	 * Reveal the first (`true`) or last (`false`) change
	 */
	reveal(firstOrLast: boolean, preserveFocus?: boolean): void;

	/**
	 * Go to next change and increate `currentIndex`
	 * @param wrap When at the last, start over again or not
	 * @returns If it went next
	 */
	next(wrap: boolean): boolean;

	/**
	 * @see `next`
	 */
	previous(wrap: boolean): boolean;

	/**
	 * Enable the accessible diff viewer for this editor
	 */
	enableAccessibleDiffView(): void;

	/**
	 * Accept the change given or the nearest
	 * @param change An opaque change object
	 */
	acceptNearestChange(change?: IModifiedFileEntryChangeHunk): Promise<void>;

	/**
	 * @see `acceptNearestChange`
	 */
	rejectNearestChange(change?: IModifiedFileEntryChangeHunk): Promise<void>;

	/**
	 * Toggle between diff-editor and normal editor
	 */
	toggleDiff(change: IModifiedFileEntryChangeHunk | undefined): Promise<void>;
}

export interface IModifiedFileEntry {
	readonly entryId: string;
	readonly originalURI: URI;
	readonly modifiedURI: URI;

	readonly lastModifyingRequestId: string;

	readonly state: IObservable<ModifiedFileEntryState>;
	readonly isCurrentlyBeingModifiedBy: IObservable<IChatResponseModel | undefined>;
	readonly rewriteRatio: IObservable<number>;

	accept(transaction: ITransaction | undefined): Promise<void>;
	reject(transaction: ITransaction | undefined): Promise<void>;

	reviewMode: IObservable<boolean>;
	autoAcceptController: IObservable<{ total: number; remaining: number; cancel(): void } | undefined>;
	enableReviewModeUntilSettled(): void;

	/**
	 * Number of changes for this file
	 */
	readonly changesCount: IObservable<number>;

	getEditorIntegration(editor: IEditorPane): IModifiedFileEntryEditorIntegration;
}

export interface IChatEditingSessionStream {
	textEdits(resource: URI, textEdits: TextEdit[], isLastEdits: boolean, responseModel: IChatResponseModel): void;
	notebookEdits(resource: URI, edits: ICellEditOperation[], isLastEdits: boolean, responseModel: IChatResponseModel): void;
}

export const enum ChatEditingSessionState {
	Initial = 0,
	StreamingEdits = 1,
	Idle = 2,
	Disposed = 3
}

export const CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME = 'chat-editing-multi-diff-source';

export const chatEditingWidgetFileStateContextKey = new RawContextKey<ModifiedFileEntryState>('chatEditingWidgetFileState', undefined, localize('chatEditingWidgetFileState', "The current state of the file in the chat editing widget"));
export const chatEditingAgentSupportsReadonlyReferencesContextKey = new RawContextKey<boolean>('chatEditingAgentSupportsReadonlyReferences', undefined, localize('chatEditingAgentSupportsReadonlyReferences', "Whether the chat editing agent supports readonly references (temporary)"));
export const decidedChatEditingResourceContextKey = new RawContextKey<string[]>('decidedChatEditingResource', []);
export const chatEditingResourceContextKey = new RawContextKey<string | undefined>('chatEditingResource', undefined);
export const inChatEditingSessionContextKey = new RawContextKey<boolean | undefined>('inChatEditingSession', undefined);
export const hasUndecidedChatEditingResourceContextKey = new RawContextKey<boolean | undefined>('hasUndecidedChatEditingResource', false);
export const hasAppliedChatEditsContextKey = new RawContextKey<boolean | undefined>('hasAppliedChatEdits', false);
export const applyingChatEditsFailedContextKey = new RawContextKey<boolean | undefined>('applyingChatEditsFailed', false);

export const chatEditingMaxFileAssignmentName = 'chatEditingSessionFileLimit';
export const defaultChatEditingMaxFileLimit = 10;

export const enum ChatEditKind {
	Created,
	Modified,
}

export interface IChatEditingActionContext {
	// The chat session ID that this editing session is associated with
	sessionId: string;
}

export function isChatEditingActionContext(thing: unknown): thing is IChatEditingActionContext {
	return typeof thing === 'object' && !!thing && 'sessionId' in thing;
}

export function getMultiDiffSourceUri(session: IChatEditingSession, showPreviousChanges?: boolean): URI {
	return URI.from({
		scheme: CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME,
		authority: session.chatSessionId,
		query: showPreviousChanges ? 'previous' : undefined,
	});
}

export function parseChatMultiDiffUri(uri: URI): { chatSessionId: string; showPreviousChanges: boolean } {
	const chatSessionId = uri.authority;
	const showPreviousChanges = uri.query === 'previous';

	return { chatSessionId, showPreviousChanges };
}
