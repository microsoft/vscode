/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IObservable, ITransaction } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IDocumentDiff } from '../../../../editor/common/diff/documentDiffProvider.js';
import { TextEdit } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatResponseModel } from './chatModel.js';

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

	startOrContinueEditingSession(chatSessionId: string, options?: { silent: boolean }): Promise<IChatEditingSession>;
	triggerEditComputation(responseModel: IChatResponseModel): Promise<void>;
	getEditingSession(resource: URI): IChatEditingSession | null;
	createSnapshot(requestId: string): void;
	getSnapshotUri(requestId: string, uri: URI): URI | undefined;
	restoreSnapshot(requestId: string | undefined): Promise<void>;
}

export interface IChatEditingSession {
	readonly chatSessionId: string;
	readonly onDidChange: Event<void>;
	readonly onDidDispose: Event<void>;
	readonly state: IObservable<ChatEditingSessionState>;
	readonly entries: IObservable<readonly IModifiedFileEntry[]>;
	readonly hiddenRequestIds: IObservable<readonly string[]>;
	readonly workingSet: ResourceMap<WorkingSetEntryState>;
	readonly isVisible: boolean;
	addFileToWorkingSet(uri: URI): void;
	show(): Promise<void>;
	remove(...uris: URI[]): void;
	accept(...uris: URI[]): Promise<void>;
	reject(...uris: URI[]): Promise<void>;
	/**
	 * Will lead to this object getting disposed
	 */
	stop(): Promise<void>;

	undoInteraction(): Promise<void>;
	redoInteraction(): Promise<void>;
}

export const enum WorkingSetEntryState {
	Modified,
	Accepted,
	Rejected,
	Transient,
	Attached,
	Sent,
}

export interface IModifiedFileEntry {
	readonly originalURI: URI;
	readonly originalModel: ITextModel;
	readonly modifiedURI: URI;
	readonly state: IObservable<WorkingSetEntryState>;
	readonly isCurrentlyBeingModified: IObservable<boolean>;
	readonly diffInfo: IObservable<IDocumentDiff>;
	readonly lastModifyingRequestId: string;
	accept(transaction: ITransaction | undefined): Promise<void>;
	reject(transaction: ITransaction | undefined): Promise<void>;
}

export interface IChatEditingSessionStream {
	textEdits(resource: URI, textEdits: TextEdit[], responseModel: IChatResponseModel): void;
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
export const isChatRequestCheckpointed = new RawContextKey<boolean | undefined>('isChatRequestCheckpointed', false);
export const hasUndecidedChatEditingResourceContextKey = new RawContextKey<boolean | undefined>('hasUndecidedChatEditingResource', false);
export const hasAppliedChatEditsContextKey = new RawContextKey<boolean | undefined>('hasAppliedChatEdits', false);
