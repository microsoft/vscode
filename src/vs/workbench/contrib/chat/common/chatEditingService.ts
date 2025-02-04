/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IObservable, IReader, ITransaction } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IDocumentDiff } from '../../../../editor/common/diff/documentDiffProvider.js';
import { DetailedLineRangeMapping } from '../../../../editor/common/diff/rangeMapping.js';
import { TextEdit } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatResponseModel } from './chatModel.js';

export const IChatEditingService = createDecorator<IChatEditingService>('chatEditingService');

export interface IChatEditingService {

	_serviceBrand: undefined;

	readonly globalEditingSessionObs: IObservable<IChatEditingSession | null>;

	readonly globalEditingSession: IChatEditingSession | null;

	startOrContinueGlobalEditingSession(chatSessionId: string): Promise<IChatEditingSession>;

	getEditingSession(chatSessionId: string): IChatEditingSession | undefined;

	/**
	 * All editing sessions, sorted by recency, e.g the last created session comes first.
	 */
	readonly editingSessionsObs: IObservable<readonly IChatEditingSession[]>;

	/**
	 * Creates a new short lived editing session
	 */
	createEditingSession(chatSessionId: string): Promise<IChatEditingSession & IDisposable>;

	readonly editingSessionFileLimit: number;

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

export interface IChatEditingSession {
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

export interface IModifiedFileEntry {
	readonly entryId: string;
	readonly originalURI: URI;
	readonly originalModel: ITextModel;
	readonly modifiedURI: URI;
	readonly state: IObservable<WorkingSetEntryState>;
	readonly isCurrentlyBeingModified: IObservable<boolean>;
	readonly rewriteRatio: IObservable<number>;
	readonly maxLineNumber: IObservable<number>;
	readonly diffInfo: IObservable<IDocumentDiff>;
	acceptHunk(change: DetailedLineRangeMapping): Promise<boolean>;
	rejectHunk(change: DetailedLineRangeMapping): Promise<boolean>;
	readonly lastModifyingRequestId: string;
	accept(transaction: ITransaction | undefined): Promise<void>;
	reject(transaction: ITransaction | undefined): Promise<void>;

	reviewMode: IObservable<boolean>;
	autoAcceptController: IObservable<{ total: number; remaining: number; cancel(): void } | undefined>;
	enableReviewModeUntilSettled(): void;
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

export function getMultiDiffSourceUri(): URI {
	return URI.from({
		scheme: CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME,
		path: '',
	});
}
