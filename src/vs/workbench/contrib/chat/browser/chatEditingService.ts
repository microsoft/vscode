/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { remove } from '../../../../base/common/arrays.js';
import { Sequencer } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, IReference } from '../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { derived, IObservable, ITransaction, observableValue, ValueWithChangeEventFromObservable } from '../../../../base/common/observable.js';
import { themeColorFromId } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { IBulkEditService } from '../../../../editor/browser/services/bulkEditService.js';
import { EditOperation } from '../../../../editor/common/core/editOperation.js';
import { editorRangeHighlight } from '../../../../editor/common/core/editorColorRegistry.js';
import { TextEdit } from '../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IModelDeltaDecoration, ITextModel, OverviewRulerLane } from '../../../../editor/common/model.js';
import { createTextBufferFactoryFromSnapshot } from '../../../../editor/common/model/textModel.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelContentProvider, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize, localize2 } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorActivation } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { DiffEditorInput } from '../../../common/editor/diffEditorInput.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { MultiDiffEditor } from '../../multiDiffEditor/browser/multiDiffEditor.js';
import { MultiDiffEditorInput } from '../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService, IResolvedMultiDiffSource, MultiDiffEditorItem } from '../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { ICodeMapperResponse, ICodeMapperService } from '../common/chatCodeMapperService.js';
import { applyingChatEditsContextKey, CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME, chatEditingResourceContextKey, ChatEditingSessionState, decidedChatEditingResourceContextKey, IChatEditingService, IChatEditingSession, IChatEditingSessionStream, IModifiedFileEntry, inChatEditingSessionContextKey, WorkingSetEntryState } from '../common/chatEditingService.js';
import { IChatResponseModel } from '../common/chatModel.js';
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
	) {
		super();
		this._register(multiDiffSourceResolverService.registerResolver(_instantiationService.createInstance(ChatEditingMultiDiffSourceResolver, this._currentSessionObs)));
		textModelService.registerTextModelContentProvider(ChatEditingTextModelContentProvider.scheme, _instantiationService.createInstance(ChatEditingTextModelContentProvider, this._currentSessionObs));
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

	private installAutoApplyObserver(sessionId: string): IDisposable {

		const chatModel = this._chatService.getSession(sessionId);
		if (!chatModel) {
			throw new Error(`Edit session was created for a non-existing chat session: ${sessionId}`);
		}

		const observerDisposables = new DisposableStore();

		const onResponseComplete = (responseModel: IChatResponseModel) => {
			if (responseModel.result?.metadata?.autoApplyEdits) {
				this.triggerEditComputation(responseModel);
			}
		};

		const openCodeBlockUris = (responseModel: IChatResponseModel) => {
			for (const part of responseModel.response.value) {
				if (part.kind === 'codeblockUri') {
					this._editorService.openEditor({ resource: part.uri, options: { inactive: true, preserveFocus: true, pinned: true } });
				}
			}
		};

		observerDisposables.add(chatModel.onDidChange(e => {
			if (e.kind === 'addRequest') {
				const responseModel = e.request.response;
				if (responseModel) {
					if (responseModel.isComplete) {
						openCodeBlockUris(responseModel);
						onResponseComplete(responseModel);
					} else {
						const disposable = responseModel.onDidChange(() => {
							openCodeBlockUris(responseModel);
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

class ChatEditingSession extends Disposable implements IChatEditingSession {
	private readonly _state = observableValue<ChatEditingSessionState>(this, ChatEditingSessionState.Initial);
	private readonly _entriesObs = observableValue<readonly ModifiedFileEntry[]>(this, []);
	public get entries(): IObservable<readonly ModifiedFileEntry[]> {
		this._assertNotDisposed();
		return this._entriesObs;
	}
	private readonly _sequencer = new Sequencer();

	private _entries: ModifiedFileEntry[] = [];

	private _workingSetObs = observableValue<readonly URI[]>(this, []);
	private _workingSet = new ResourceSet();
	get workingSet() {
		this._assertNotDisposed();
		return this._workingSetObs;
	}

	get state(): IObservable<ChatEditingSessionState> {
		this._assertNotDisposed();
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
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IBulkEditService public readonly _bulkEditService: IBulkEditService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
	) {
		super();

		// Add the currently active editor to the working set
		const widget = chatWidgetService.getWidgetBySessionId(chatSessionId);

		let activeEditorControl = this._editorService.activeTextEditorControl;
		if (activeEditorControl) {
			if (isDiffEditor(activeEditorControl)) {
				activeEditorControl = activeEditorControl.getOriginalEditor().hasTextFocus() ? activeEditorControl.getOriginalEditor() : activeEditorControl.getModifiedEditor();
			}
			if (isCodeEditor(activeEditorControl) && activeEditorControl.hasModel()) {
				const uri = activeEditorControl.getModel().uri;
				this._workingSet.add(uri);
				widget?.attachmentModel.addFile(uri);
				this._workingSetObs.set([...this._workingSet.values()], undefined);
			}
		}
	}

	remove(...uris: URI[]): void {
		this._assertNotDisposed();

		let didRemoveUris = false;
		for (const uri of uris) {
			didRemoveUris = didRemoveUris || this._workingSet.delete(uri);
		}

		if (!didRemoveUris) {
			return; // noop
		}

		this._workingSetObs.set([...this._workingSet.values()], undefined);
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
			this._workingSet.add(resource);
			this._workingSetObs.set([...this._workingSet.values()], undefined);
			this._onDidChange.fire();
		}
	}

	private async _acceptStreamingEditsStart(): Promise<void> {
		this._state.set(ChatEditingSessionState.StreamingEdits, undefined);
		this._onDidChange.fire();
	}

	private async _acceptTextEdits(resource: URI, textEdits: TextEdit[], responseModel: IChatResponseModel): Promise<void> {
		const entry = await this._getOrCreateModifiedFileEntry(resource, responseModel);
		entry.applyEdits(textEdits);
		await this._editorService.openEditor({ resource: entry.modifiedURI, options: { inactive: true } });
	}

	private async _resolve(): Promise<void> {
		this._state.set(ChatEditingSessionState.Idle, undefined);
		this._onDidChange.fire();
	}

	private async _getOrCreateModifiedFileEntry(resource: URI, responseModel: IChatResponseModel): Promise<ModifiedFileEntry> {
		const existingEntry = this._entries.find(e => e.resource.toString() === resource.toString());
		if (existingEntry) {
			return existingEntry;
		}

		const entry = await this._createModifiedFileEntry(resource, responseModel);
		this._register(entry);
		this._entries = [...this._entries, entry];
		this._entriesObs.set(this._entries, undefined);
		this._onDidChange.fire();

		return entry;
	}

	private async _createModifiedFileEntry(resource: URI, responseModel: IChatResponseModel, mustExist = false): Promise<ModifiedFileEntry> {
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

	constructor(
		public readonly resource: URI,
		resourceRef: IReference<IResolvedTextEditorModel>,
		private readonly _multiDiffEntryDelegate: { collapse: (transaction: ITransaction | undefined) => void },
		private readonly _responseModel: IChatResponseModel,
		@IModelService modelService: IModelService,
		@ITextModelService textModelService: ITextModelService,
		@ILanguageService languageService: ILanguageService,
		@IBulkEditService public readonly bulkEditService: IBulkEditService,
		@IChatService private readonly _chatService: IChatService,
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
	}

	private readonly _allEditDecorations: string[][] = [];

	applyEdits(textEdits: TextEdit[]): void {

		// highlight edits
		let existingIds: string[] = [];
		if (this._allEditDecorations.length > 3) {
			existingIds = this._allEditDecorations.shift() ?? [];
		}

		const newIds = this.doc.deltaDecorations(existingIds, textEdits.map(edit => {
			return {
				range: edit.range,
				options: {
					isWholeLine: true,
					description: 'chat-editing',
					className: 'rangeHighlight',
					overviewRuler: {
						position: OverviewRulerLane.Full,
						color: themeColorFromId(editorRangeHighlight)
					}
				}
			} satisfies IModelDeltaDecoration;
		}));

		this._allEditDecorations.push(newIds);
		// TODO clear this timeout?
		setTimeout(() => {
			this.doc.deltaDecorations(newIds, []);
			remove(this._allEditDecorations, newIds);
		}, 500);

		// make the actual edit
		this.doc.applyEdits(textEdits);
		this._stateObs.set(WorkingSetEntryState.Modified, undefined);
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

		this.doc.pushStackElement();
		const edit = EditOperation.replace(this.doc.getFullModelRange(), this.docSnapshot.getValue());
		this.doc.pushEditOperations(null, [edit], () => null);
		this.doc.pushStackElement();

		this._stateObs.set(WorkingSetEntryState.Rejected, transaction);
		await this.collapse(transaction);
		this._notifyAction('rejected');
	}

	async collapse(transaction: ITransaction | undefined): Promise<void> {
		this._multiDiffEntryDelegate.collapse(transaction);
	}

	private _notifyAction(outcome: 'accepted' | 'rejected') {
		this._chatService.notifyUserAction({
			action: { kind: 'chatEditingSessionAction', uri: this.resource, hasRemainingEdits: false, outcome },
			agentId: this._responseModel.agent?.id,
			command: this._responseModel.slashCommand?.name,
			sessionId: this._responseModel.session.sessionId,
			requestId: this._responseModel.requestId,
			result: this._responseModel.result
		});
	}
}
