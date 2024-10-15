/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableSource, RunOnceScheduler, Sequencer, timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, IReference } from '../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../base/common/map.js';
import { autorun, derived, IObservable, ITransaction, observableValue, ValueWithChangeEventFromObservable } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { themeColorFromId, ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { IBulkEditService } from '../../../../editor/browser/services/bulkEditService.js';
import { EditOperation } from '../../../../editor/common/core/editOperation.js';
import { LineRange } from '../../../../editor/common/core/lineRange.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IDocumentDiff, nullDocumentDiff } from '../../../../editor/common/diff/documentDiffProvider.js';
import { TextEdit } from '../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IIdentifiedSingleEditOperation, IModelDeltaDecoration, ITextModel, OverviewRulerLane } from '../../../../editor/common/model.js';
import { createTextBufferFactoryFromSnapshot, ModelDecorationOptions } from '../../../../editor/common/model/textModel.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelContentProvider, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IModelContentChangedEvent } from '../../../../editor/common/textModelEvents.js';
import { localize, localize2 } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { EditorActivation } from '../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { editorSelectionBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEditorCloseEvent } from '../../../common/editor.js';
import { DiffEditorInput } from '../../../common/editor/diffEditorInput.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IDecorationData, IDecorationsProvider, IDecorationsService } from '../../../services/decorations/common/decorations.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { MultiDiffEditor } from '../../multiDiffEditor/browser/multiDiffEditor.js';
import { MultiDiffEditorInput } from '../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService, IResolvedMultiDiffSource, MultiDiffEditorItem } from '../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { ChatAgentLocation, IChatAgentResult, IChatAgentService } from '../common/chatAgents.js';
import { ICodeMapperResponse, ICodeMapperService } from '../common/chatCodeMapperService.js';
import { applyingChatEditsContextKey, CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME, chatEditingResourceContextKey, ChatEditingSessionState, decidedChatEditingResourceContextKey, IChatEditingService, IChatEditingSession, IChatEditingSessionStream, IModifiedFileEntry, inChatEditingSessionContextKey, WorkingSetEntryState } from '../common/chatEditingService.js';
import { IChatResponseModel, IChatTextEditGroup } from '../common/chatModel.js';
import { IChatService } from '../common/chatService.js';
import { IChatWidgetService } from './chat.js';

export class ChatEditingService extends Disposable implements IChatEditingService {

	_serviceBrand: undefined;

	private readonly _currentSessionObs = observableValue<ChatEditingSession | null>(this, null);
	private readonly _currentSessionDisposables = this._register(new DisposableStore());

	private readonly _currentAutoApplyOperationObs = observableValue<CancellationTokenSource | null>(this, null);
	get currentAutoApplyOperation(): CancellationTokenSource | null {
		return this._currentAutoApplyOperationObs.get();
	}

	get currentEditingSession(): IChatEditingSession | null {
		return this._currentSessionObs.get();
	}

	get currentEditingSessionObs(): IObservable<IChatEditingSession | null> {
		return this._currentSessionObs;
	}

	private readonly _onDidCreateEditingSession = this._register(new Emitter<IChatEditingSession>());
	get onDidCreateEditingSession() {
		return this._onDidCreateEditingSession.event;
	}

	private readonly _onDidChangeEditingSession = this._register(new Emitter<void>());
	public readonly onDidChangeEditingSession = this._onDidChangeEditingSession.event;

	constructor(
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IMultiDiffSourceResolverService multiDiffSourceResolverService: IMultiDiffSourceResolverService,
		@ITextModelService textModelService: ITextModelService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatService private readonly _chatService: IChatService,
		@IProgressService private readonly _progressService: IProgressService,
		@ICodeMapperService private readonly _codeMapperService: ICodeMapperService,
		@IEditorService private readonly _editorService: IEditorService,
		@IDecorationsService decorationsService: IDecorationsService,
	) {
		super();
		this._register(decorationsService.registerDecorationsProvider(new ChatDecorationsProvider(this._currentSessionObs)));
		this._register(multiDiffSourceResolverService.registerResolver(_instantiationService.createInstance(ChatEditingMultiDiffSourceResolver, this._currentSessionObs)));
		textModelService.registerTextModelContentProvider(ChatEditingTextModelContentProvider.scheme, _instantiationService.createInstance(ChatEditingTextModelContentProvider, this._currentSessionObs));
		textModelService.registerTextModelContentProvider(ChatEditingSnapshotTextModelContentProvider.scheme, _instantiationService.createInstance(ChatEditingSnapshotTextModelContentProvider, this._currentSessionObs));
		this._register(bindContextKey(decidedChatEditingResourceContextKey, contextKeyService, (reader) => {
			const currentSession = this._currentSessionObs.read(reader);
			if (!currentSession) {
				return;
			}
			const entries = currentSession.entries.read(reader);
			const decidedEntries = entries.filter(entry => entry.state.read(reader) !== WorkingSetEntryState.Modified);
			return decidedEntries.map(entry => entry.entryId);
		}));
		this._register(bindContextKey(inChatEditingSessionContextKey, contextKeyService, (reader) => {
			return this._currentSessionObs.read(reader) !== null;
		}));
		this._register(bindContextKey(applyingChatEditsContextKey, contextKeyService, (reader) => {
			return this._currentAutoApplyOperationObs.read(reader) !== null;
		}));
		this._register(this._chatService.onDidDisposeSession((e) => {
			if (e.reason === 'cleared' && this._currentSessionObs.get()?.chatSessionId === e.sessionId) {
				void this._currentSessionObs.get()?.stop();
			}
		}));
	}

	getSnapshotUri(id: string, uri: URI) {
		const session = this._currentSessionObs.get();
		if (!session) {
			return undefined;
		}
		return session.getSnapshot(id, uri)?.snapshotUri;
	}

	getEditingSession(resource: URI): IChatEditingSession | null {
		const session = this.currentEditingSession;
		if (!session) {
			return null;
		}
		const entries = session.entries.get();
		for (const entry of entries) {
			if (entry.modifiedURI.toString() === resource.toString()) {
				return session;
			}
		}
		return null;
	}

	async addFileToWorkingSet(resource: URI): Promise<void> {
		const session = this._currentSessionObs.get();
		if (session) {
			session.addFileToWorkingSet(resource);
		}
	}

	override dispose(): void {
		this._currentSessionObs.get()?.dispose();
		super.dispose();
	}

	async startOrContinueEditingSession(chatSessionId: string, options?: { silent: boolean }): Promise<IChatEditingSession> {
		const session = this._currentSessionObs.get();
		if (session) {
			if (session.chatSessionId !== chatSessionId) {
				throw new BugIndicatingError('Cannot start new session while another session is active');
			}
		}
		return this._createEditingSession(chatSessionId, options);
	}

	private async _createEditingSession(chatSessionId: string, options?: { silent: boolean }): Promise<IChatEditingSession> {
		if (this._currentSessionObs.get()) {
			throw new BugIndicatingError('Cannot have more than one active editing session');
		}

		this._currentSessionDisposables.clear();

		// listen for completed responses, run the code mapper and apply the edits to this edit session
		this._currentSessionDisposables.add(this.installAutoApplyObserver(chatSessionId));

		const input = MultiDiffEditorInput.fromResourceMultiDiffEditorInput({
			multiDiffSource: ChatEditingMultiDiffSourceResolver.getMultiDiffSourceUri(),
			label: localize('multiDiffEditorInput.name', "Suggested Edits")
		}, this._instantiationService);

		const editorPane = options?.silent ? undefined : await this._editorGroupsService.activeGroup.openEditor(input, { pinned: true, activation: EditorActivation.ACTIVATE }) as MultiDiffEditor | undefined;

		const session = this._instantiationService.createInstance(ChatEditingSession, chatSessionId, editorPane);
		this._currentSessionDisposables.add(session.onDidDispose(() => {
			this._currentSessionDisposables.clear();
			this._currentSessionObs.set(null, undefined);
			this._onDidChangeEditingSession.fire();
		}));
		this._currentSessionDisposables.add(session.onDidChange(() => {
			this._onDidChangeEditingSession.fire();
		}));

		this._currentSessionObs.set(session, undefined);
		this._onDidCreateEditingSession.fire(session);
		this._onDidChangeEditingSession.fire();
		return session;
	}

	public triggerEditComputation(responseModel: IChatResponseModel): Promise<void> {
		return this._continueEditingSession(async (builder, token) => {
			const codeMapperResponse: ICodeMapperResponse = {
				textEdit: (resource, edits) => builder.textEdits(resource, edits, responseModel),
			};
			await this._codeMapperService.mapCodeFromResponse(responseModel, codeMapperResponse, token);
		}, { silent: true });
	}

	public createSnapshot(requestId: string): void {
		this._currentSessionObs.get()?.createSnapshot(requestId);
	}

	public async restoreSnapshot(requestId: string | undefined): Promise<void> {
		await this._currentSessionObs.get()?.restoreSnapshot(requestId);
	}

	private installAutoApplyObserver(sessionId: string): IDisposable {

		const chatModel = this._chatService.getSession(sessionId);
		if (!chatModel) {
			throw new Error(`Edit session was created for a non-existing chat session: ${sessionId}`);
		}

		const observerDisposables = new DisposableStore();

		let editsSource: AsyncIterableSource<IChatTextEditGroup> | undefined;
		const editsSeen = new ResourceMap<{ seen: number }>();

		const onResponseComplete = (responseModel: IChatResponseModel) => {
			if (responseModel.result?.metadata?.autoApplyEdits) {
				this.triggerEditComputation(responseModel);
			}

			editsSource?.resolve();
			editsSource = undefined;
			editsSeen.clear();
		};


		const handleResponseParts = (responseModel: IChatResponseModel) => {
			for (const part of responseModel.response.value) {
				if (part.kind === 'codeblockUri' || part.kind === 'textEditGroup') {
					// ensure editor is open asap
					this._editorService.openEditor({ resource: part.uri, options: { inactive: true, preserveFocus: true, pinned: true } });

					// get new edits and start editing session
					const first = editsSeen.size === 0;
					let entry = editsSeen.get(part.uri);
					if (!entry) {
						entry = { seen: 0 };
						editsSeen.set(part.uri, entry);
					}

					const allEdits: TextEdit[][] = part.kind === 'textEditGroup' ? part.edits : [[]];
					const newEdits = allEdits.slice(entry.seen);
					entry.seen += newEdits.length;

					editsSource ??= new AsyncIterableSource();
					editsSource.emitOne({ uri: part.uri, edits: newEdits, kind: 'textEditGroup' });

					if (first) {
						this._continueEditingSession(async (builder, token) => {
							for await (const item of editsSource!.asyncIterable) {
								if (token.isCancellationRequested) {
									break;
								}
								for (const group of item.edits) {
									builder.textEdits(item.uri, group, responseModel);
								}
							}
						}, { silent: true });
					}
				}
			}
		};

		observerDisposables.add(chatModel.onDidChange(e => {
			if (e.kind === 'addRequest') {
				const responseModel = e.request.response;
				if (responseModel) {
					if (responseModel.isComplete) {
						handleResponseParts(responseModel);
						onResponseComplete(responseModel);
					} else {
						const disposable = responseModel.onDidChange(() => {
							handleResponseParts(responseModel);
							if (responseModel.isComplete) {
								onResponseComplete(responseModel);
								disposable.dispose();
							} else if (responseModel.isCanceled || responseModel.isStale) {
								disposable.dispose();
							}
						});
					}
				}
			}
		}));
		observerDisposables.add(chatModel.onDidDispose(() => observerDisposables.dispose()));
		return observerDisposables;
	}

	private async _continueEditingSession(builder: (stream: IChatEditingSessionStream, token: CancellationToken) => Promise<void>, options?: { silent?: boolean }): Promise<void> {
		const session = this._currentSessionObs.get();
		if (!session) {
			throw new BugIndicatingError('Cannot continue missing session');
		}

		if (session.state.get() === ChatEditingSessionState.StreamingEdits) {
			throw new BugIndicatingError('Cannot continue session that is still streaming');
		}

		let editorPane: MultiDiffEditor | undefined;
		if (!options?.silent && session.isVisible) {
			const groupedEditors = this._findGroupedEditors();
			if (groupedEditors.length !== 1) {
				throw new Error(`Unexpected number of editors: ${groupedEditors.length}`);
			}
			const [group, editor] = groupedEditors[0];

			editorPane = await group.openEditor(editor, { pinned: true, activation: EditorActivation.ACTIVATE }) as MultiDiffEditor | undefined;
		}

		const stream: IChatEditingSessionStream = {
			textEdits: (resource: URI, textEdits: TextEdit[], responseModel: IChatResponseModel) => {
				session.acceptTextEdits(resource, textEdits, responseModel);
			}
		};
		session.acceptStreamingEditsStart();
		const cancellationTokenSource = new CancellationTokenSource();
		this._currentAutoApplyOperationObs.set(cancellationTokenSource, undefined);
		try {
			if (editorPane) {
				await editorPane?.showWhile(builder(stream, cancellationTokenSource.token));
			} else {
				await this._progressService.withProgress({
					location: ProgressLocation.Window,
					title: localize2('chatEditing.startingSession', 'Generating edits...').value,
				}, async () => {
					await builder(stream, cancellationTokenSource.token);
				},
					() => cancellationTokenSource.cancel()
				);
			}
		} finally {
			cancellationTokenSource.dispose();
			this._currentAutoApplyOperationObs.set(null, undefined);
			session.resolve();
		}
	}

	private _findGroupedEditors() {
		const editors: [IEditorGroup, EditorInput][] = [];
		for (const group of this._editorGroupsService.groups) {
			for (const editor of group.editors) {
				if (editor.resource?.scheme === ChatEditingMultiDiffSourceResolver.scheme) {
					editors.push([group, editor]);
				}
			}
		}
		return editors;
	}
}

class ChatDecorationsProvider extends Disposable implements IDecorationsProvider {

	readonly label: string = localize('chat', "Chat Editing");

	private readonly _onDidChange = new Emitter<readonly URI[]>();
	readonly onDidChange: Event<readonly URI[]> = this._onDidChange.event;

	constructor(
		private readonly _session: IObservable<IChatEditingSession | null>
	) {
		super();

		this._store.add(autorun(r => {
			const session = _session.read(r);
			if (!session) {
				return;
			}
			const state = session.state.read(r);
			if (state === ChatEditingSessionState.Disposed) {
				return;
			}
			const entries = session.entries.read(r);
			const uris: URI[] = [];
			for (const entry of entries) {
				entry.state.read(r);
				uris.push(entry.modifiedURI);
			}
			this._onDidChange.fire(uris);
		}));
	}

	provideDecorations(uri: URI, _token: CancellationToken): IDecorationData | undefined {
		const session = this._session.get();
		if (!session) {
			return undefined;
		}
		if (session.state.get() !== ChatEditingSessionState.StreamingEdits) {
			return undefined;
		}
		const entry = session.entries.get().find(entry => isEqual(uri, entry.modifiedURI));
		if (!entry) {
			return undefined;
		}
		const state = entry.state.get();
		if (state !== WorkingSetEntryState.Modified) {
			return undefined;
		}
		return {
			weight: 1000,
			letter: ThemeIcon.modify(Codicon.loading, 'spin'),
			bubble: false
		};
	}
}

class ChatEditingMultiDiffSourceResolver implements IMultiDiffSourceResolver {
	public static readonly scheme = CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME;

	public static getMultiDiffSourceUri(): URI {
		return URI.from({
			scheme: ChatEditingMultiDiffSourceResolver.scheme,
			path: '',
		});
	}

	constructor(
		private readonly _currentSession: IObservable<ChatEditingSession | null>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	canHandleUri(uri: URI): boolean {
		return uri.scheme === ChatEditingMultiDiffSourceResolver.scheme;
	}

	async resolveDiffSource(uri: URI): Promise<IResolvedMultiDiffSource> {
		return this._instantiationService.createInstance(ChatEditingMultiDiffSource, this._currentSession);
	}
}

class ChatEditingMultiDiffSource implements IResolvedMultiDiffSource {
	private readonly _resources = derived<readonly MultiDiffEditorItem[]>(this, (reader) => {
		const currentSession = this._currentSession.read(reader);
		if (!currentSession) {
			return [];
		}
		const entries = currentSession.entries.read(reader);
		return entries.map((entry) => {
			return new MultiDiffEditorItem(
				entry.originalURI,
				entry.modifiedURI,
				undefined,
				{
					[chatEditingResourceContextKey.key]: entry.entryId,
					// [inChatEditingSessionContextKey.key]: true
				},
			);
		});
	});
	readonly resources = new ValueWithChangeEventFromObservable(this._resources);

	readonly contextKeys = {
		[inChatEditingSessionContextKey.key]: true
	};

	constructor(
		private readonly _currentSession: IObservable<ChatEditingSession | null>
	) { }
}

type ChatEditingTextModelContentQueryData = { kind: 'empty' } | { kind: 'doc'; documentId: string };

class ChatEditingTextModelContentProvider implements ITextModelContentProvider {
	public static readonly scheme = 'chat-editing-text-model';

	public static getEmptyFileURI(): URI {
		return URI.from({
			scheme: ChatEditingTextModelContentProvider.scheme,
			query: JSON.stringify({ kind: 'empty' }),
		});
	}

	public static getFileURI(documentId: string, path: string): URI {
		return URI.from({
			scheme: ChatEditingTextModelContentProvider.scheme,
			path,
			query: JSON.stringify({ kind: 'doc', documentId }),
		});
	}

	constructor(
		private readonly _currentSessionObs: IObservable<ChatEditingSession | null>,
		@IModelService private readonly _modelService: IModelService,
	) { }

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}

		const data: ChatEditingTextModelContentQueryData = JSON.parse(resource.query);
		if (data.kind === 'empty') {
			return this._modelService.createModel('', null, resource, false);
		}

		const session = this._currentSessionObs.get();
		if (!session) {
			return null;
		}

		return session.getVirtualModel(data.documentId);
	}
}

type ChatEditingSnapshotTextModelContentQueryData = { requestId: string | undefined };

class ChatEditingSnapshotTextModelContentProvider implements ITextModelContentProvider {
	public static readonly scheme = 'chat-editing-snapshot-text-model';

	public static getSnapshotFileURI(requestId: string | undefined, path: string): URI {
		return URI.from({
			scheme: ChatEditingSnapshotTextModelContentProvider.scheme,
			path,
			query: JSON.stringify({ requestId: requestId ?? '' }),
		});
	}

	constructor(
		private readonly _currentSessionObs: IObservable<ChatEditingSession | null>,
		@IModelService private readonly _modelService: IModelService,
	) { }

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}

		const data: ChatEditingSnapshotTextModelContentQueryData = JSON.parse(resource.query);

		const session = this._currentSessionObs.get();
		if (!session || !data.requestId) {
			return null;
		}

		return session.getSnapshotModel(data.requestId, resource);
	}
}

class ChatEditingSession extends Disposable implements IChatEditingSession {
	private readonly _state = observableValue<ChatEditingSessionState>(this, ChatEditingSessionState.Initial);

	/**
	 * Contains the contents of a file when the AI first began doing edits to it.
	 */
	private readonly _initialFileContents = new ResourceMap<string>();
	private readonly _snapshots = new Map<string, IChatEditingSessionSnapshot>();

	private readonly _filesToSkipCreating = new ResourceSet();

	private readonly _entriesObs = observableValue<readonly ModifiedFileEntry[]>(this, []);
	public get entries(): IObservable<readonly ModifiedFileEntry[]> {
		this._assertNotDisposed();
		return this._entriesObs;
	}
	private readonly _sequencer = new Sequencer();

	private _entries: ModifiedFileEntry[] = [];

	private _workingSet = new ResourceMap<WorkingSetEntryState>();
	get workingSet() {
		this._assertNotDisposed();
		return this._workingSet;
	}

	get state(): IObservable<ChatEditingSessionState> {
		return this._state;
	}

	private readonly _onDidChange = new Emitter<void>();
	get onDidChange() {
		this._assertNotDisposed();
		return this._onDidChange.event;
	}

	private readonly _onDidDispose = new Emitter<void>();
	get onDidDispose() {
		this._assertNotDisposed();
		return this._onDidDispose.event;
	}

	get isVisible(): boolean {
		this._assertNotDisposed();
		return Boolean(this.editorPane && this.editorPane.isVisible());
	}

	constructor(
		public readonly chatSessionId: string,
		private editorPane: MultiDiffEditor | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IBulkEditService public readonly _bulkEditService: IBulkEditService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
		@IFileDialogService private readonly _dialogService: IFileDialogService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
	) {
		super();

		const widget = chatWidgetService.getWidgetBySessionId(chatSessionId);
		if (!widget) {
			return; // Shouldn't happen
		}

		// Add the currently active editors to the working set
		this._trackCurrentEditorsInWorkingSet();
		this._register(this._editorService.onDidActiveEditorChange(() => {
			this._trackCurrentEditorsInWorkingSet();
		}));
		this._register(this._editorService.onDidCloseEditor((e) => {
			this._trackCurrentEditorsInWorkingSet(e);
		}));
	}

	private _trackCurrentEditorsInWorkingSet(e?: IEditorCloseEvent) {
		const closedEditor = e?.editor.resource?.toString();

		const existingTransientEntries = new ResourceSet();
		for (const file of this._workingSet.keys()) {
			if (this._workingSet.get(file) === WorkingSetEntryState.Transient) {
				existingTransientEntries.add(file);
			}
		}
		if (existingTransientEntries.size === 0 && this._workingSet.size > 0) {
			// The user manually added or removed attachments, don't inherit the visible editors
			return;
		}

		const activeEditors = new ResourceSet();
		this._editorGroupsService.groups.forEach((group) => {
			if (!group.activeEditorPane) {
				return;
			}
			let activeEditorControl = group.activeEditorPane.getControl();
			if (isDiffEditor(activeEditorControl)) {
				activeEditorControl = activeEditorControl.getOriginalEditor().hasTextFocus() ? activeEditorControl.getOriginalEditor() : activeEditorControl.getModifiedEditor();
			}
			if (isCodeEditor(activeEditorControl) && activeEditorControl.hasModel()) {
				const uri = activeEditorControl.getModel().uri;
				if (closedEditor === uri.toString()) {
					// The editor group service sees recently closed editors?
					// Continue, since we want this to be deleted from the working set
				} else if (existingTransientEntries.has(uri)) {
					existingTransientEntries.delete(uri);
				} else {
					activeEditors.add(uri);
				}
			}
		});

		let didChange = false;
		for (const entry of existingTransientEntries) {
			didChange ||= this._workingSet.delete(entry);
		}

		for (const entry of activeEditors) {
			this._workingSet.set(entry, WorkingSetEntryState.Transient);
			didChange = true;
		}

		if (didChange) {
			this._onDidChange.fire();
		}
	}

	public createSnapshot(requestId: string | undefined): void {
		const snapshot = this._createSnapshot(requestId);
		if (requestId) {
			this._snapshots.set(requestId, snapshot);
			for (const workingSetItem of this._workingSet.keys()) {
				this._workingSet.set(workingSetItem, WorkingSetEntryState.Sent);
			}
		} else {
			this._pendingSnapshot = snapshot;
		}
	}

	private _createSnapshot(requestId: string | undefined): IChatEditingSessionSnapshot {
		const workingSet = new ResourceMap<WorkingSetEntryState>();
		for (const [file, state] of this._workingSet) {
			workingSet.set(file, state);
		}
		const entries = new ResourceMap<ISnapshotEntry>();
		for (const entry of this._entriesObs.get()) {
			entries.set(entry.modifiedURI, entry.createSnapshot(requestId));
		}
		return {
			workingSet,
			entries
		};
	}

	public async getSnapshotModel(requestId: string, snapshotUri: URI): Promise<ITextModel | null> {
		const entries = this._snapshots.get(requestId)?.entries;
		if (!entries) {
			return null;
		}

		const snapshotEntry = [...entries.values()].find((e) => e.snapshotUri.toString() === snapshotUri.toString());
		if (!snapshotEntry) {
			return null;
		}

		return this._modelService.createModel(snapshotEntry.current, this._languageService.createById(snapshotEntry.languageId), snapshotUri, false);
	}

	public getSnapshot(requestId: string, uri: URI) {
		const snapshot = this._snapshots.get(requestId);
		const snapshotEntries = snapshot?.entries;
		return snapshotEntries?.get(uri);
	}

	public async restoreSnapshot(requestId: string | undefined): Promise<void> {
		if (requestId !== undefined) {
			const snapshot = this._snapshots.get(requestId);
			if (snapshot) {
				await this._restoreSnapshot(snapshot);
			}
		} else {
			await this._restoreSnapshot(undefined);
		}
	}

	/**
	 * A snapshot representing the state of the working set before a new request has been sent
	 */
	private _pendingSnapshot: IChatEditingSessionSnapshot | undefined;
	private async _restoreSnapshot(snapshot: IChatEditingSessionSnapshot | undefined): Promise<void> {
		if (!snapshot) {
			if (!this._pendingSnapshot) {
				return; // We don't have a pending snapshot that we can restore
			}
			// Restore pending snapshot
			snapshot = this._pendingSnapshot;
			this._pendingSnapshot = undefined;
		} else {
			// Create and save a pending snapshot
			this.createSnapshot(undefined);
		}

		this._workingSet = new ResourceMap();
		snapshot.workingSet.forEach((state, uri) => this._workingSet.set(uri, state));

		// Reset all the files which are modified in this session state
		// but which are not found in the snapshot
		for (const entry of this._entries) {
			const snapshotEntry = snapshot.entries.get(entry.modifiedURI);
			if (!snapshotEntry) {
				const initialContents = this._initialFileContents.get(entry.modifiedURI);
				if (typeof initialContents === 'string') {
					entry.resetToInitialValue(initialContents);
				}
				entry.dispose();
			}
		}

		const entriesArr: ModifiedFileEntry[] = [];
		// Restore all entries from the snapshot
		for (const snapshotEntry of snapshot.entries.values()) {
			const entry = await this._getOrCreateModifiedFileEntry(snapshotEntry.resource, snapshotEntry.telemetryInfo);
			entry.restoreFromSnapshot(snapshotEntry);
			entriesArr.push(entry);
		}

		this._entries = entriesArr;
		this._entriesObs.set(this._entries, undefined);
	}

	remove(...uris: URI[]): void {
		this._assertNotDisposed();

		let didRemoveUris = false;
		for (const uri of uris) {
			didRemoveUris ||= this._workingSet.delete(uri);
		}

		if (!didRemoveUris) {
			return; // noop
		}

		this._onDidChange.fire();
	}

	private _assertNotDisposed(): void {
		if (this._state.get() === ChatEditingSessionState.Disposed) {
			throw new BugIndicatingError(`Cannot access a disposed editing session`);
		}
	}

	async accept(...uris: URI[]): Promise<void> {
		this._assertNotDisposed();

		if (uris.length === 0) {
			await Promise.all(this._entries.map(entry => entry.accept(undefined)));
		}

		for (const uri of uris) {
			const entry = this._entries.find(e => e.modifiedURI.toString() === uri.toString());
			if (entry) {
				await entry.accept(undefined);
			}
		}

		this._onDidChange.fire();
	}

	async reject(...uris: URI[]): Promise<void> {
		this._assertNotDisposed();

		if (uris.length === 0) {
			await Promise.all(this._entries.map(entry => entry.reject(undefined)));
		}

		for (const uri of uris) {
			const entry = this._entries.find(e => e.modifiedURI.toString() === uri.toString());
			if (entry) {
				await entry.reject(undefined);
			}
		}

		this._onDidChange.fire();
	}

	async show(): Promise<void> {
		this._assertNotDisposed();

		if (this.editorPane?.isVisible()) {
			return;
		} else if (this.editorPane?.input) {
			await this._editorGroupsService.activeGroup.openEditor(this.editorPane.input, { pinned: true, activation: EditorActivation.ACTIVATE });
			return;
		}

		const input = MultiDiffEditorInput.fromResourceMultiDiffEditorInput({
			multiDiffSource: ChatEditingMultiDiffSourceResolver.getMultiDiffSourceUri(),
			label: localize('multiDiffEditorInput.name', "Suggested Edits")
		}, this._instantiationService);

		const editorPane = await this._editorGroupsService.activeGroup.openEditor(input, { pinned: true, activation: EditorActivation.ACTIVATE }) as MultiDiffEditor | undefined;
		this.editorPane = editorPane;
	}

	async stop(): Promise<void> {
		this._assertNotDisposed();

		// Close out all open files
		await Promise.allSettled(this._editorGroupsService.groups.map(async (g) => {
			return Promise.allSettled(g.editors.map(async (e) => {
				if (e instanceof MultiDiffEditorInput || e instanceof DiffEditorInput && (e.original.resource?.scheme === ModifiedFileEntry.scheme || e.original.resource?.scheme === ChatEditingTextModelContentProvider.scheme)) {
					await g.closeEditor(e);
				}
			}));
		}));

		if (this._state.get() !== ChatEditingSessionState.Disposed) {
			// session got disposed while we were closing editors
			this.dispose();
		}

	}

	override dispose() {
		this._assertNotDisposed();

		super.dispose();
		this._state.set(ChatEditingSessionState.Disposed, undefined);
		this._onDidDispose.fire();
	}

	getVirtualModel(documentId: string): ITextModel | null {
		this._assertNotDisposed();

		const entry = this._entries.find(e => e.entryId === documentId);
		return entry?.docSnapshot ?? null;
	}

	acceptStreamingEditsStart(): void {
		if (this._state.get() === ChatEditingSessionState.Disposed) {
			// we don't throw in this case because there could be a builder still connected to a disposed session
			return;
		}

		// ensure that the edits are processed sequentially
		this._sequencer.queue(() => this._acceptStreamingEditsStart());
	}

	acceptTextEdits(resource: URI, textEdits: TextEdit[], responseModel: IChatResponseModel): void {
		if (this._state.get() === ChatEditingSessionState.Disposed) {
			// we don't throw in this case because there could be a builder still connected to a disposed session
			return;
		}

		// ensure that the edits are processed sequentially
		this._sequencer.queue(() => this._acceptTextEdits(resource, textEdits, responseModel));
	}

	resolve(): void {
		if (this._state.get() === ChatEditingSessionState.Disposed) {
			// we don't throw in this case because there could be a builder still connected to a disposed session
			return;
		}

		// ensure that the edits are processed sequentially
		this._sequencer.queue(() => this._resolve());
	}

	addFileToWorkingSet(resource: URI) {
		if (!this._workingSet.has(resource)) {
			this._workingSet.set(resource, WorkingSetEntryState.Attached);

			// Convert all transient entries to attachments
			for (const file of this._workingSet.keys()) {
				if (this._workingSet.get(file) === WorkingSetEntryState.Transient) {
					this._workingSet.set(file, WorkingSetEntryState.Attached);
				}
			}

			this._onDidChange.fire();
		}
	}

	private async _acceptStreamingEditsStart(): Promise<void> {
		this._state.set(ChatEditingSessionState.StreamingEdits, undefined);
		this._onDidChange.fire();
	}

	private async _acceptTextEdits(resource: URI, textEdits: TextEdit[], responseModel: IChatResponseModel): Promise<void> {
		if (this._filesToSkipCreating.has(resource)) {
			return;
		}

		if (!this._workspaceContextService.getWorkspaceFolder(resource) && !this._fileService.exists(resource)) {
			// if the file doesn't exist yet and is outside the workspace, prompt the user for a location to save it to
			const saveLocation = await this._dialogService.showSaveDialog({ title: localize('chatEditing.fileSave', '{0} wants to create a file. Choose where it should be saved.', this._chatAgentService.getDefaultAgent(ChatAgentLocation.EditingSession)?.fullName ?? 'Chat') });
			if (!saveLocation) {
				// don't ask the user to create the file again when the next text edit for this same resource streams in
				this._filesToSkipCreating.add(resource);
				return;
			}
			resource = saveLocation;
		}

		// Make these getters because the response result is not available when the file first starts to be edited
		const telemetryInfo = new class {
			get agentId() { return responseModel.agent?.id; }
			get command() { return responseModel.slashCommand?.name; }
			get sessionId() { return responseModel.session.sessionId; }
			get requestId() { return responseModel.requestId; }
			get result() { return responseModel.result; }
		};
		const entry = await this._getOrCreateModifiedFileEntry(resource, telemetryInfo);
		entry.applyEdits(textEdits);
		// await this._editorService.openEditor({ resource: entry.modifiedURI, options: { inactive: true } });
	}

	private async _resolve(): Promise<void> {
		this._state.set(ChatEditingSessionState.Idle, undefined);
		this._onDidChange.fire();
	}

	private async _getOrCreateModifiedFileEntry(resource: URI, responseModel: IModifiedEntryTelemetryInfo): Promise<ModifiedFileEntry> {
		const existingEntry = this._entries.find(e => e.resource.toString() === resource.toString());
		if (existingEntry) {
			return existingEntry;
		}

		const entry = await this._createModifiedFileEntry(resource, responseModel);
		this._register(entry);
		this._initialFileContents.set(resource, entry.modifiedModel.getValue());
		this._entries = [...this._entries, entry];
		this._entriesObs.set(this._entries, undefined);
		this._onDidChange.fire();

		return entry;
	}

	private async _createModifiedFileEntry(resource: URI, responseModel: IModifiedEntryTelemetryInfo, mustExist = false): Promise<ModifiedFileEntry> {
		try {
			const ref = await this._textModelService.createModelReference(resource);
			return this._instantiationService.createInstance(ModifiedFileEntry, resource, ref, { collapse: (transaction: ITransaction | undefined) => this._collapse(resource, transaction) }, responseModel);
		} catch (err) {
			if (mustExist) {
				throw err;
			}
			// this file does not exist yet, create it and try again
			await this._bulkEditService.apply({ edits: [{ newResource: resource }] });
			return this._createModifiedFileEntry(resource, responseModel, true);
		}
	}

	private _collapse(resource: URI, transaction: ITransaction | undefined) {
		const multiDiffItem = this.editorPane?.findDocumentDiffItem(resource);
		if (multiDiffItem) {
			this.editorPane?.viewModel?.items.get().find((documentDiffItem) => String(documentDiffItem.originalUri) === String(multiDiffItem.originalUri) && String(documentDiffItem.modifiedUri) === String(multiDiffItem.modifiedUri))?.collapsed.set(true, transaction);
		}
	}
}

class ModifiedFileEntry extends Disposable implements IModifiedFileEntry {

	public static readonly scheme = 'modified-file-entry';
	static lastEntryId = 0;
	public readonly entryId = `${ModifiedFileEntry.scheme}::${++ModifiedFileEntry.lastEntryId}`;

	public readonly docSnapshot: ITextModel;
	private readonly doc: ITextModel;

	get originalURI(): URI {
		return this.docSnapshot.uri;
	}

	get originalModel(): ITextModel {
		return this.docSnapshot;
	}

	get modifiedURI(): URI {
		return this.doc.uri;
	}

	get modifiedModel(): ITextModel {
		return this.doc;
	}

	private readonly _stateObs = observableValue<WorkingSetEntryState>(this, WorkingSetEntryState.Modified);
	public get state(): IObservable<WorkingSetEntryState> {
		return this._stateObs;
	}

	private _isApplyingEdits: boolean = false;

	private _diffOperation: Promise<any> | undefined;
	private _diffOperationIds: number = 0;

	private readonly _diffInfo = observableValue<IDocumentDiff>(this, nullDocumentDiff);
	get diffInfo(): IObservable<IDocumentDiff> {
		return this._diffInfo;
	}

	private readonly _editDecorationClear = this._register(new RunOnceScheduler(() => { this._editDecorations = this.doc.deltaDecorations(this._editDecorations, []); }, 500));
	private _editDecorations: string[] = [];

	private static readonly _editDecorationOptions = ModelDecorationOptions.register({
		isWholeLine: true,
		description: 'chat-editing',
		className: 'rangeHighlight',
		marginClassName: 'rangeHighlight',
		overviewRuler: {
			position: OverviewRulerLane.Full,
			color: themeColorFromId(editorSelectionBackground)
		},
	});

	constructor(
		public readonly resource: URI,
		resourceRef: IReference<IResolvedTextEditorModel>,
		private readonly _multiDiffEntryDelegate: { collapse: (transaction: ITransaction | undefined) => void },
		private readonly _telemetryInfo: IModifiedEntryTelemetryInfo,
		@IModelService modelService: IModelService,
		@ITextModelService textModelService: ITextModelService,
		@ILanguageService languageService: ILanguageService,
		@IBulkEditService public readonly bulkEditService: IBulkEditService,
		@IChatService private readonly _chatService: IChatService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
	) {
		super();
		this.doc = resourceRef.object.textEditorModel;
		const docSnapshot = this.docSnapshot = this._register(
			modelService.createModel(
				createTextBufferFactoryFromSnapshot(this.doc.createSnapshot()),
				languageService.createById(this.doc.getLanguageId()),
				ChatEditingTextModelContentProvider.getFileURI(this.entryId, resource.path),
				false
			)
		);

		// Create a reference to this model to avoid it being disposed from under our nose
		(async () => {
			const reference = await textModelService.createModelReference(docSnapshot.uri);
			if (this._store.isDisposed) {
				reference.dispose();
				return;
			}
			this._register(reference);
		})();

		this._register(resourceRef);

		this._register(this.doc.onDidChangeContent(e => this._mirrorEdits(e)));
	}

	createSnapshot(requestId: string | undefined): ISnapshotEntry {
		return {
			resource: this.modifiedURI,
			languageId: this.modifiedModel.getLanguageId(),
			snapshotUri: ChatEditingSnapshotTextModelContentProvider.getSnapshotFileURI(requestId, this.modifiedURI.path),
			original: this.originalModel.getValue(),
			current: this.modifiedModel.getValue(),
			state: this.state.get(),
			telemetryInfo: this._telemetryInfo
		};
	}

	restoreFromSnapshot(snapshot: ISnapshotEntry) {
		this.docSnapshot.setValue(snapshot.original);
		this._setDocValue(snapshot.current);
		this._stateObs.set(snapshot.state, undefined);
	}

	resetToInitialValue(value: string) {
		this._setDocValue(value);
	}

	private _mirrorEdits(event: IModelContentChangedEvent) {

		if (this._isApplyingEdits) {
			// ignore edits that we are making
			return;
		}

		// mirror edits that "others" are doing into the document snapshot. this is done
		// so that subsequent diffing will not identify these edits are changes. the logic
		// is simple: use the diff info to transpose each edit from `doc` into `docSnapshot`
		// but ignore edits are inside AI-changes

		const diff = this._diffInfo.get();
		const edits: IIdentifiedSingleEditOperation[] = [];

		for (const edit of event.changes) {

			let isOverlapping = false;
			let changeDelta = 0;

			for (const change of diff.changes) {
				const modifiedRange = lineRangeAsRange(change.modified, this.doc);

				if (modifiedRange.getEndPosition().isBefore(Range.getStartPosition(edit.range))) {
					const originalRange = lineRangeAsRange(change.original, this.docSnapshot);
					changeDelta -= this.docSnapshot.getValueLengthInRange(originalRange);
					changeDelta += this.doc.getValueLengthInRange(modifiedRange);

				} else if (Range.areIntersectingOrTouching(modifiedRange, edit.range)) {
					// overlapping
					isOverlapping = true;
					break;

				} else {
					// changes past the edit aren't relevant
					break;
				}
			}

			if (isOverlapping) {
				// change overlapping with AI change aren't mirrored
				continue;
			}

			const offset = edit.rangeOffset - changeDelta;
			const start = this.docSnapshot.getPositionAt(offset);
			const end = this.docSnapshot.getPositionAt(offset + edit.rangeLength);
			edits.push(EditOperation.replace(Range.fromPositions(start, end), edit.text));
		}

		this.docSnapshot.applyEdits(edits);
	}


	applyEdits(textEdits: TextEdit[]): void {

		// highlight edits
		this._editDecorations = this.doc.deltaDecorations(this._editDecorations, textEdits.map(edit => {
			return {
				options: ModifiedFileEntry._editDecorationOptions,
				range: edit.range
			} satisfies IModelDeltaDecoration;
		}));
		this._editDecorationClear.schedule();

		// make the actual edit
		this._isApplyingEdits = true;
		try {
			this.doc.applyEdits(textEdits);
		} finally {
			this._isApplyingEdits = false;
		}

		this._stateObs.set(WorkingSetEntryState.Modified, undefined);

		// trigger diff computation but only at first, when done, or when last
		const myDiffOperationId = ++this._diffOperationIds;
		Promise.resolve(this._diffOperation).then(() => {
			if (this._diffOperationIds === myDiffOperationId) {
				this._diffOperation = this._updateDiffInfo();
			}
		});
	}

	private async _updateDiffInfo(): Promise<void> {

		const [diff] = await Promise.all([
			this._editorWorkerService.computeDiff(
				this.docSnapshot.uri,
				this.doc.uri,
				{ computeMoves: true, ignoreTrimWhitespace: false, maxComputationTimeMs: 3000 },
				'advanced'
			),
			timeout(800) // DON't diff too fast
		]);

		this._diffInfo.set(diff ?? nullDocumentDiff, undefined);
	}

	async accept(transaction: ITransaction | undefined): Promise<void> {
		if (this._stateObs.get() !== WorkingSetEntryState.Modified) {
			// already accepted or rejected
			return;
		}

		this.docSnapshot.setValue(this.doc.createSnapshot());
		this._stateObs.set(WorkingSetEntryState.Accepted, transaction);
		await this.collapse(transaction);
		this._notifyAction('accepted');
	}

	async reject(transaction: ITransaction | undefined): Promise<void> {
		if (this._stateObs.get() !== WorkingSetEntryState.Modified) {
			// already accepted or rejected
			return;
		}

		this._setDocValue(this.docSnapshot.getValue());

		this._stateObs.set(WorkingSetEntryState.Rejected, transaction);
		await this.collapse(transaction);
		this._notifyAction('rejected');
	}

	private _setDocValue(value: string): void {
		this.doc.pushStackElement();
		const edit = EditOperation.replace(this.doc.getFullModelRange(), value);
		this.doc.pushEditOperations(null, [edit], () => null);
		this.doc.pushStackElement();
	}

	async collapse(transaction: ITransaction | undefined): Promise<void> {
		this._multiDiffEntryDelegate.collapse(transaction);
	}

	private _notifyAction(outcome: 'accepted' | 'rejected') {
		this._chatService.notifyUserAction({
			action: { kind: 'chatEditingSessionAction', uri: this.resource, hasRemainingEdits: false, outcome },
			agentId: this._telemetryInfo.agentId,
			command: this._telemetryInfo.command,
			sessionId: this._telemetryInfo.sessionId,
			requestId: this._telemetryInfo.requestId,
			result: this._telemetryInfo.result
		});
	}
}

export interface IModifiedEntryTelemetryInfo {
	agentId: string | undefined;
	command: string | undefined;
	sessionId: string;
	requestId: string;
	result: IChatAgentResult | undefined;
}

export interface IChatEditingSessionSnapshot {
	workingSet: ResourceMap<WorkingSetEntryState>;
	entries: ResourceMap<ISnapshotEntry>;
}

export interface ISnapshotEntry {
	readonly resource: URI;
	readonly languageId: string;
	readonly snapshotUri: URI;
	readonly original: string;
	readonly current: string;
	readonly state: WorkingSetEntryState;
	telemetryInfo: IModifiedEntryTelemetryInfo;
}

const lineRangeAsRange = (lineRange: LineRange, model: ITextModel) => {
	return model.validateRange(lineRange.isEmpty
		? new Range(lineRange.startLineNumber, 1, lineRange.startLineNumber, Number.MAX_SAFE_INTEGER)
		: new Range(lineRange.startLineNumber, 1, lineRange.endLineNumberExclusive - 1, Number.MAX_SAFE_INTEGER)
	);
};
