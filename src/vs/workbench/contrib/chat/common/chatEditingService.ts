/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IObservable, IReader, ITransaction } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IOffsetEdit, OffsetEdit } from '../../../../editor/common/core/offsetEdit.js';
import { IDocumentDiff } from '../../../../editor/common/diff/documentDiffProvider.js';
import { TextEdit } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ICellEditOperation } from '../../notebook/common/notebookCommon.js';
import { IChatAgentResult } from './chatAgents.js';
import { IChatResponseModel } from './chatModel.js';

export const STORAGE_CONTENTS_FOLDER = 'contents';
export const STORAGE_STATE_FILE = 'state.json';


export const IChatEditingService = createDecorator<IChatEditingService>('chatEditingService');

export interface IChatEditingService {

	_serviceBrand: undefined;

	readonly onDidCreateEditingSession: Event<IChatEditingSession>;
	/**
	 * emitted when a session is created, changed or disposed
	 */
	readonly onDidChangeEditingSession: Event<void>;

	readonly currentEditingSessionObs: IObservable<IChatEditingSession | null>;

	readonly currentEditingSession: IChatEditingSession | null;
	readonly currentAutoApplyOperation: CancellationTokenSource | null;

	readonly editingSessionFileLimit: number;

	startOrContinueEditingSession(chatSessionId: string): Promise<IChatEditingSession>;
	getOrRestoreEditingSession(): Promise<IChatEditingSession | null>;
	createSnapshot(requestId: string): Promise<void>;
	getSnapshotUri(requestId: string, uri: URI): URI | undefined;
	restoreSnapshot(requestId: string | undefined): Promise<void>;

	hasRelatedFilesProviders(): boolean;
	registerRelatedFilesProvider(handle: number, provider: IChatRelatedFilesProvider): IDisposable;
	getRelatedFiles(chatSessionId: string, prompt: string, token: CancellationToken): Promise<{ group: string; files: IChatRelatedFile[] }[] | undefined>;
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

export interface WorkingSetDisplayMetadata { state: WorkingSetEntryState; description?: string }

export interface IChatEditingSession {
	readonly chatSessionId: string;
	readonly onDidChange: Event<ChatEditingSessionChangeType>;
	readonly onDidDispose: Event<void>;
	readonly state: IObservable<ChatEditingSessionState>;
	readonly entries: IObservable<readonly IModifiedFileEntry[]>;
	readonly workingSet: ResourceMap<WorkingSetDisplayMetadata>;
	readonly isVisible: boolean;
	addFileToWorkingSet(uri: URI, description?: string, kind?: WorkingSetEntryState.Transient | WorkingSetEntryState.Suggested): void;
	show(): Promise<void>;
	remove(reason: WorkingSetEntryRemovalReason, ...uris: URI[]): void;
	accept(...uris: URI[]): Promise<void>;
	reject(...uris: URI[]): Promise<void>;
	getEntry(uri: URI): IModifiedFileEntry | undefined;
	readEntry(uri: URI, reader?: IReader): IModifiedFileEntry | undefined;
	/**
	 * Will lead to this object getting disposed
	 */
	stop(clearState?: boolean): Promise<void>;

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


export interface IBaseSnapshotEntry {
	readonly resource: URI;
	readonly snapshotUri: URI;
	readonly state: WorkingSetEntryState;
	telemetryInfo: IModifiedEntryTelemetryInfo;
}

export interface ITextSnapshotEntry extends IBaseSnapshotEntry {
	kind: 'text';
	readonly original: string;
	readonly current: string;
	readonly languageId: string;
	readonly originalToCurrentEdit: OffsetEdit;
	serialize(): Promise<ITextSnapshotEntryDTO>;
}

export interface INotebookSnapshotEntry extends IBaseSnapshotEntry {
	kind: 'notebook';
	readonly original: VSBuffer;
	readonly current: VSBuffer;
	/** Cell index along with edit offsets */
	readonly originalToCurrentEdits: Map<number, OffsetEdit>;
	serialize(): Promise<INotebookSnapshotEntryDTO>;
}
export type ISnapshotEntry = ITextSnapshotEntry | INotebookSnapshotEntry;

export interface IBaseSnapshotEntryDTO {
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
}
export type ISnapshotEntryDTO = ITextSnapshotEntryDTO | INotebookSnapshotEntryDTO;

interface IModifiedEntryTelemetryInfoDTO {
	readonly requestId: string;
	readonly agentId?: string;
	readonly command?: string;
}


export interface IModifiedEntryTelemetryInfo {
	readonly agentId: string | undefined;
	readonly command: string | undefined;
	readonly sessionId: string;
	readonly requestId: string;
	readonly result: IChatAgentResult | undefined;
}

interface IModifiedAnyFileEntry extends IDisposable {
	readonly entryId: string;
	readonly originalURI: URI;
	readonly modifiedURI: URI;
	readonly onDidDelete: Event<void>;
	readonly state: IObservable<WorkingSetEntryState>;
	readonly isCurrentlyBeingModified: IObservable<boolean>;
	readonly rewriteRatio: IObservable<number>;
	readonly lastModifyingRequestId: string;
	readonly telemetryInfo: IModifiedEntryTelemetryInfo;
	accept(transaction: ITransaction | undefined): Promise<void>;
	reject(transaction: ITransaction | undefined): Promise<void>;
	acceptStreamingEditsStart(tx: ITransaction): void;
	acceptStreamingEditsEnd(tx: ITransaction): void;
	updateTelemetryInfo(telemetryInfo: IModifiedEntryTelemetryInfo): void;
	resetToInitialValue(): Promise<void>;
}

export interface IModifiedTextFileEntry extends IModifiedAnyFileEntry {
	readonly kind: 'text';
	readonly originalModel: ITextModel;
	readonly modifiedModel: ITextModel;
	readonly initialContent: string;
	readonly diffInfo: IObservable<IDocumentDiff>;
	acceptAgentEdits(textEdits: TextEdit[], isLastEdits: boolean): void;
	createSnapshot(requestId: string | undefined): Promise<ITextSnapshotEntry>;
	restoreFromSnapshot(snapshot: ITextSnapshotEntry): Promise<void>;
}

export interface IModifiedNotebookFileEntry extends IModifiedAnyFileEntry {
	readonly kind: 'notebook';
	readonly viewType: string;
	readonly originalModel: ITextModel;
	acceptAgentCellEdits(cellUri: URI, textEdits: TextEdit[], isLastEdits: boolean): void;
	acceptAgentNotebookEdits(edits: ICellEditOperation[], isLastEdits: boolean): Promise<void>;
	createSnapshot(requestId: string | undefined): Promise<INotebookSnapshotEntry>;
	restoreFromSnapshot(snapshot: INotebookSnapshotEntry): Promise<void>;
}

export type IModifiedFileEntry = IModifiedTextFileEntry | IModifiedNotebookFileEntry;

export function isTextFileEntry(entry?: IModifiedFileEntry): entry is IModifiedTextFileEntry {
	return entry?.kind === 'text';
}

export interface IChatEditingSessionStream {
	textEdits(resource: URI, textEdits: TextEdit[], isLastEdits: boolean, responseModel: IChatResponseModel): void;
}

export const enum ChatEditingSessionState {
	Initial = 0,
	StreamingEdits = 1,
	Idle = 2,
	Disposed = 3
}

export const CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME = 'chat-editing-multi-diff-source';

export const chatEditingWidgetFileStateContextKey = new RawContextKey<WorkingSetEntryState>('chatEditingWidgetFileState', undefined, localize('chatEditingWidgetFileState', "The current state of the file in the chat editing widget"));
export const decidedChatEditingResourceContextKey = new RawContextKey<string[]>('decidedChatEditingResource', []);
export const chatEditingResourceContextKey = new RawContextKey<string | undefined>('chatEditingResource', undefined);
export const inChatEditingSessionContextKey = new RawContextKey<boolean | undefined>('inChatEditingSession', undefined);
export const applyingChatEditsContextKey = new RawContextKey<boolean | undefined>('isApplyingChatEdits', undefined);
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
