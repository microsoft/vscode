/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IObservable, IReader, ITransaction } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IOffsetEdit, OffsetEdit } from '../../../../editor/common/core/offsetEdit.js';
import { IDocumentDiff } from '../../../../editor/common/diff/documentDiffProvider.js';
import { DetailedLineRangeMapping } from '../../../../editor/common/diff/rangeMapping.js';
import { TextEdit } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ICellEditOperation, INotebookTextModel } from '../../notebook/common/notebookCommon.js';
import { IChatAgentResult } from './chatAgents.js';
import { IChatResponseModel } from './chatModel.js';
import { ICellEditReplaceOperation } from './chatService.js';

export const STORAGE_CONTENTS_FOLDER = 'contents';
export const STORAGE_STATE_FILE = 'state.json';

export const IChatEditingService = createDecorator<IChatEditingService>('chatEditingService');

export interface IChatEditingService {

	_serviceBrand: undefined;


	startOrContinueGlobalEditingSession(chatSessionId: string): Promise<IChatEditingSession>;

	getEditingSession(chatSessionId: string): IChatEditingSession | undefined;

	/**
	 * All editing sessions, sorted by recency, e.g the last created session comes first.
	 */
	readonly editingSessionsObs: IObservable<readonly IChatEditingSession[]>;

	/**
	 * Creates a new short lived editing session
	 */
	createEditingSession(chatSessionId: string): Promise<IChatEditingSession>;

	//#region related files

	hasRelatedFilesProviders(): boolean;
	registerRelatedFilesProvider(handle: number, provider: IChatRelatedFilesProvider): IDisposable;
	getRelatedFiles(chatSessionId: string, prompt: string, token: CancellationToken): Promise<{ group: string; files: IChatRelatedFile[] }[] | undefined>;

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
	state: WorkingSetEntryState;
	description?: string;
	isMarkedReadonly?: boolean;
}

export interface IChatEditingSession extends IDisposable {
	readonly isGlobalEditingSession: boolean;
	readonly chatSessionId: string;
	readonly onDidChange: Event<ChatEditingSessionChangeType>;
	readonly onDidDispose: Event<void>;
	readonly state: IObservable<ChatEditingSessionState>;
	readonly entries: IObservable<readonly IModifiedFileEntry[]>;
	readonly workingSet: ResourceMap<WorkingSetDisplayMetadata>;
	readonly isToolsAgentSession: boolean;
	addFileToWorkingSet(uri: URI, description?: string, kind?: WorkingSetEntryState.Transient | WorkingSetEntryState.Suggested): void;
	show(): Promise<void>;
	remove(reason: WorkingSetEntryRemovalReason, ...uris: URI[]): void;
	markIsReadonly(uri: URI, isReadonly?: boolean): void;
	accept(...uris: URI[]): Promise<void>;
	reject(...uris: URI[]): Promise<void>;
	getEntry(uri: URI): IModifiedFileEntry | undefined;
	readEntry(uri: URI, reader?: IReader): IModifiedFileEntry | undefined;

	restoreSnapshot(requestId: string): Promise<void>;
	getSnapshotUri(requestId: string, uri: URI): URI | undefined;

	/**
	 * Will lead to this object getting disposed
	 */
	stop(clearState?: boolean): Promise<void>;

	readonly canUndo: IObservable<boolean>;
	readonly canRedo: IObservable<boolean>;
	undoInteraction(): Promise<void>;
	redoInteraction(): Promise<void>;
}

export const enum WorkingSetEntryRemovalReason {
	User,
	Programmatic
}

export const enum WorkingSetEntryState {
	Modified,
	Accepted,
	Rejected,
	Transient,
	Attached,
	Sent, // TODO@joyceerhl remove this
	Suggested,
}

export const enum ChatEditingSessionChangeType {
	WorkingSet,
	Other,
}

export interface IModifiedEntryTelemetryInfo {
	readonly agentId: string | undefined;
	readonly command: string | undefined;
	readonly sessionId: string;
	readonly requestId: string;
	readonly result: IChatAgentResult | undefined;
}

export interface IBaseSnapshotEntry {
	readonly resource: URI;
	readonly original: VSBuffer;
	readonly current: VSBuffer;
	readonly snapshotUri: URI;
	readonly state: WorkingSetEntryState;
	telemetryInfo: IModifiedEntryTelemetryInfo;
	serialize(): Promise<ISnapshotEntryDTO>;
}

export interface ITextSnapshotEntry extends IBaseSnapshotEntry {
	readonly kind: 'text';
	readonly languageId: string;
	readonly originalToCurrentEdit: OffsetEdit;
}

export interface INotebookSnapshotEntry extends IBaseSnapshotEntry {
	kind: 'notebook';
	/** Cell index along with edit offsets */
	readonly originalToCurrentEdits: Map<number, OffsetEdit>;
	readonly diffInfo: ICellDiffInfo[];
}

export type ISnapshotEntry = ITextSnapshotEntry | INotebookSnapshotEntry;

interface IBaseSnapshotEntryDTO {
	readonly resource: string;
	readonly originalHash: string;
	readonly currentHash: string;
	readonly state: WorkingSetEntryState;
	readonly snapshotUri: string;
	readonly telemetryInfo: IModifiedEntryTelemetryInfoDTO;
}

export interface ITextSnapshotEntryDTO extends IBaseSnapshotEntryDTO {
	readonly kind: 'text';
	readonly languageId: string;
	readonly originalToCurrentEdit: IOffsetEdit;
}
export interface INotebookSnapshotEntryDTO extends IBaseSnapshotEntryDTO {
	readonly kind: 'notebook';
	readonly viewType: string;
	readonly originalToCurrentEdits: Record<number, IOffsetEdit>;
	readonly diffInfo: ICellDiffInfo[];
}
export type ISnapshotEntryDTO = ITextSnapshotEntryDTO | INotebookSnapshotEntryDTO;

export interface IModifiedEntryTelemetryInfoDTO {
	readonly requestId: string;
	readonly agentId?: string;
	readonly command?: string;
}


export interface IModifiedBaseFileEntry extends IDisposable {
	readonly entryId: string;
	readonly originalURI: URI;
	readonly modifiedURI: URI;

	readonly state: IObservable<WorkingSetEntryState>;
	readonly telemetryInfo: IModifiedEntryTelemetryInfo;
	readonly diffInfo: IObservable<IDocumentDiff>;
	readonly isCurrentlyBeingModifiedBy: IObservable<IChatResponseModel | undefined>;
	readonly rewriteRatio: IObservable<number>;
	readonly maxLineNumber: IObservable<number>;
	readonly lastModifyingRequestId: string;
	reviewMode: IObservable<boolean>;
	autoAcceptController: IObservable<{ total: number; remaining: number; cancel(): void } | undefined>;
	readonly onDidDelete: Event<void>;
	/**
	 * Acquire a ref count on this object.
	 */
	acquire(): this;
	acceptAgentEdits(resource: URI, textEdits: TextEdit[], isLastEdits: boolean, responseModel: IChatResponseModel): Promise<void>;

	accept(transaction: ITransaction | undefined): Promise<void>;
	reject(transaction: ITransaction | undefined): Promise<void>;
	acceptStreamingEditsStart(tx: ITransaction): void;
	acceptStreamingEditsEnd(tx: ITransaction): void;
	updateTelemetryInfo(telemetryInfo: IModifiedEntryTelemetryInfo): void;
	enableReviewModeUntilSettled(): void;
	resetToInitialValue(): Promise<void>;
	restoreFromSnapshot(snapshot: ISnapshotEntry): Promise<void>;
}

export interface IModifiedTextFileEntry extends IModifiedBaseFileEntry {
	readonly kind: 'text';
	readonly originalModel: ITextModel;
	readonly modifiedModel: ITextModel;
	readonly initialContent: string;
	readonly originalToCurrentEdit: OffsetEdit;
	readonly allEditsAreFromUs: boolean;
	acceptHunk(change: DetailedLineRangeMapping): Promise<boolean>;
	rejectHunk(change: DetailedLineRangeMapping): Promise<boolean>;
	createSnapshot(requestId: string | undefined): Promise<ITextSnapshotEntry>;
}


/**
 * All entries will contain a IDocumentDiff
 * Even when there are no changes, diff will contain the number of lines in the document.
 * This way we can always calculate the total number of lines in the document.
 */
export type ICellDiffInfo = {
	originalCellIndex: number;
	modifiedCellIndex: number;
	type: 'unchanged';
	diff: IDocumentDiff; // Null diff Change (property to be consistent with others, also we have a list of all line numbers)
} | {
	originalCellIndex: number;
	modifiedCellIndex: number;
	type: 'modified';
	diff: IDocumentDiff; // List of the changes.
	maxLineNumber: number;
} |
{
	originalCellIndex: number;
	type: 'delete';
	diff: IDocumentDiff; // List of all the lines deleted.
} |
{
	modifiedCellIndex: number;
	type: 'insert';
	diff: IDocumentDiff; // List of all the new lines.
};


export interface IModifiedNotebookFileEntry extends IModifiedBaseFileEntry {
	readonly kind: 'notebook';
	readonly entries: IObservable<(IModifiedTextFileEntry & { cellIndex: number })[]>;
	readonly originalModel: INotebookTextModel;
	readonly cellDiffInfo: IObservable<ICellDiffInfo[]>;
	createSnapshot(requestId: string | undefined): Promise<INotebookSnapshotEntry>;
	acceptAgentNotebookEdits(edits: ICellEditOperation[], isLastEdits: boolean, responseModel: IChatResponseModel): Promise<void>;
}

export type IModifiedFileEntry = IModifiedTextFileEntry | IModifiedNotebookFileEntry;

export function isTextFileEntry(entry: IModifiedFileEntry): entry is IModifiedTextFileEntry {
	return entry?.kind === 'text';
}

export interface IChatEditingSessionStream {
	textEdits(resource: URI, textEdits: TextEdit[], isLastEdits: boolean, responseModel: IChatResponseModel): void;
	notebookEdits(resource: URI, edits: ICellEditReplaceOperation[], isLastEdits: boolean, responseModel: IChatResponseModel): void;
}

export const enum ChatEditingSessionState {
	Initial = 0,
	StreamingEdits = 1,
	Idle = 2,
	Disposed = 3
}

export const CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME = 'chat-editing-multi-diff-source';

export const chatEditingWidgetFileStateContextKey = new RawContextKey<WorkingSetEntryState>('chatEditingWidgetFileState', undefined, localize('chatEditingWidgetFileState', "The current state of the file in the chat editing widget"));
export const chatEditingWidgetFileReadonlyContextKey = new RawContextKey<boolean>('chatEditingWidgetFileReadonly', undefined, localize('chatEditingWidgetFileReadonly', "Whether the file has been marked as read-only in the chat editing widget"));
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

export function getMultiDiffSourceUri(session: IChatEditingSession): URI {
	return URI.from({
		scheme: CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME,
		authority: session.chatSessionId,
	});
}
