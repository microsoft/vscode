/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, IReference } from '../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { autorun, derived, IObservable, ITransaction, observableValue, ValueWithChangeEventFromObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IBulkEditService } from '../../../../editor/browser/services/bulkEditService.js';
import { TextEdit } from '../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { createTextBufferFactoryFromSnapshot } from '../../../../editor/common/model/textModel.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelContentProvider, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorActivation } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { MultiDiffEditor } from '../../multiDiffEditor/browser/multiDiffEditor.js';
import { MultiDiffEditorInput } from '../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService, IResolvedMultiDiffSource, MultiDiffEditorItem } from '../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { ChatEditingSessionState, IChatEditingService, IChatEditingSession, IChatEditingSessionStream, IModifiedFileEntry } from '../common/chatEditingService.js';

const decidedChatEditingResourceContextKey = new RawContextKey<string[]>('decidedChatEditingResource', []);
const chatEditingResourceContextKey = new RawContextKey<string | undefined>('chatEditingResource', undefined);
const inChatEditingSessionContextKey = new RawContextKey<boolean | undefined>('inChatEditingSession', undefined);

export class ChatEditingService extends Disposable implements IChatEditingService {

	_serviceBrand: undefined;

	private readonly _currentSessionObs = observableValue<ChatEditingSession | null>(this, null);

	get currentEditingSession(): IChatEditingSession | null {
		return this._currentSessionObs.get();
	}

	private readonly _onDidCreateEditingSession = new Emitter<IChatEditingSession>();
	get onDidCreateEditingSession() {
		return this._onDidCreateEditingSession.event;
	}

	private readonly _onDidDisposeEditingSession = new Emitter<IChatEditingSession>();
	get onDidDisposeEditingSession() {
		return this._onDidDisposeEditingSession.event;
	}

	constructor(
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IMultiDiffSourceResolverService multiDiffSourceResolverService: IMultiDiffSourceResolverService,
		@ITextModelService textModelService: ITextModelService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IEditorService private editorService: IEditorService,
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
			const decidedEntries = entries.filter(entry => entry.state.read(reader) !== ModifiedFileEntryState.Undecided);
			return decidedEntries.map(entry => entry.entryId);
		}));
		this._register(this.editorService.onDidCloseEditor((e) => {
			if (e.editor.resource?.scheme === ChatEditingMultiDiffSourceResolver.scheme) {
				this.killCurrentEditingSession();
			}
		}));
		this._findGroupedEditors().forEach(([group, editor]) => group.closeEditor(editor));
	}

	async startOrContinueEditingSession(chatSessionId: string, builder: (stream: IChatEditingSessionStream) => Promise<void>): Promise<void> {
		const session = this._currentSessionObs.get();
		if (session) {
			if (session.chatSessionId !== chatSessionId) {
				throw new BugIndicatingError('Cannot start new session while another session is active');
			}
			return this.continueEditingSession(builder);
		}
		return this.createEditingSession(chatSessionId, builder);
	}

	async createEditingSession(chatSessionId: string, builder: (stream: IChatEditingSessionStream) => Promise<void>): Promise<void> {
		if (this._currentSessionObs.get()) {
			throw new BugIndicatingError('Cannot have more than one active editing session');
		}

		const input = MultiDiffEditorInput.fromResourceMultiDiffEditorInput({
			multiDiffSource: ChatEditingMultiDiffSourceResolver.getMultiDiffSourceUri(),
			label: localize('multiDiffEditorInput.name', "Suggested Edits")
		}, this._instantiationService);

		const editorPane = await this._editorGroupsService.activeGroup.openEditor(input, { pinned: true, activation: EditorActivation.ACTIVATE }) as MultiDiffEditor | undefined;

		const session = this._instantiationService.createInstance(ChatEditingSession, chatSessionId, { killCurrentEditingSession: () => this.killCurrentEditingSession() }, editorPane);
		this._currentSessionObs.set(session, undefined);
		this._onDidCreateEditingSession.fire(session);

		return this.continueEditingSession(builder);
	}

	async continueEditingSession(builder: (stream: IChatEditingSessionStream) => Promise<void>): Promise<void> {
		const session = this._currentSessionObs.get();
		if (!session) {
			throw new BugIndicatingError('Cannot continue missing session');
		}

		if (session.state.get() === ChatEditingSessionState.StreamingEdits) {
			throw new BugIndicatingError('Cannot continue session that is still streaming');
		}

		const groupedEditors = this._findGroupedEditors();
		if (groupedEditors.length !== 1) {
			throw new Error(`Unexpected number of editors: ${groupedEditors.length}`);
		}
		const [group, editor] = groupedEditors[0];

		const editorPane = await group.openEditor(editor, { pinned: true, activation: EditorActivation.ACTIVATE }) as MultiDiffEditor | undefined;

		const stream: IChatEditingSessionStream = {
			textEdits: (resource: URI, textEdits: TextEdit[]) => {
				session.acceptTextEdits(resource, textEdits);
			}
		};
		session.acceptStreamingEditsStart();
		try {
			await editorPane?.showWhile(builder(stream));
		} finally {
			session.resolve();
		}
	}

	killCurrentEditingSession() {
		// close all editors
		this._findGroupedEditors().forEach(([group, editor]) => group.closeEditor(editor));
		const currentSession = this._currentSessionObs.get();
		if (currentSession) {
			this._onDidDisposeEditingSession.fire(currentSession);
			currentSession.dispose();
			this._currentSessionObs.set(null, undefined);
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
	public static readonly scheme = 'chat-editing-multi-diff-source';

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

registerAction2(class AcceptAction extends Action2 {
	constructor() {
		super({
			id: 'chatEditing.acceptFile',
			title: localize2('accept.file', 'Accept'),
			// icon: Codicon.goToFile,
			menu: {
				when: ContextKeyExpr.and(ContextKeyExpr.equals('resourceScheme', ChatEditingMultiDiffSourceResolver.scheme), ContextKeyExpr.notIn(chatEditingResourceContextKey.key, decidedChatEditingResourceContextKey.key)),
				id: MenuId.MultiDiffEditorFileToolbar,
				order: 0,
				group: 'navigation',
			},
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const chatEditingService = accessor.get(IChatEditingService);
		const currentEditingSession = chatEditingService.currentEditingSession;
		if (!currentEditingSession) {
			return;
		}
		const uri = args[0] as URI;
		const entries = currentEditingSession.entries.get();
		await entries.find(e => String(e.modifiedURI) === String(uri))?.accept(undefined);
	}
});

registerAction2(class DiscardAction extends Action2 {
	constructor() {
		super({
			id: 'chatEditing.discardFile',
			title: localize2('discard.file', 'Discard'),
			// icon: Codicon.goToFile,
			menu: {
				when: ContextKeyExpr.and(ContextKeyExpr.equals('resourceScheme', ChatEditingMultiDiffSourceResolver.scheme), ContextKeyExpr.notIn(chatEditingResourceContextKey.key, decidedChatEditingResourceContextKey.key)),
				id: MenuId.MultiDiffEditorFileToolbar,
				order: 0,
				group: 'navigation',
			},
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const chatEditingService = accessor.get(IChatEditingService);
		const currentEditingSession = chatEditingService.currentEditingSession;
		if (!currentEditingSession) {
			return;
		}
		const uri = args[0] as URI;
		const entries = currentEditingSession.entries.get();
		await entries.find(e => String(e.modifiedURI) === String(uri))?.reject(undefined);
	}
});

export class ChatEditingAcceptAllAction extends Action2 {
	static readonly ID = 'chatEditing.acceptAllFiles';
	static readonly LABEL = localize('accept.allFiles', 'Accept All');

	constructor() {
		super({
			id: ChatEditingAcceptAllAction.ID,
			title: ChatEditingAcceptAllAction.LABEL,
			// icon: Codicon.goToFile,
			menu: {
				when: ContextKeyExpr.equals('resourceScheme', ChatEditingMultiDiffSourceResolver.scheme),
				id: MenuId.EditorTitle,
				order: 0,
				group: 'navigation',
			},
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const chatEditingService = accessor.get(IChatEditingService);
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const currentEditingSession = chatEditingService.currentEditingSession;
		if (!currentEditingSession) {
			return;
		}
		const entries = currentEditingSession.entries.get();
		await Promise.all(
			// TODO: figure out how to run this in a transaction
			entries.map(entry => entry.accept(undefined))
		);

		const uri = args[0];

		for (const group of editorGroupsService.groups) {
			for (const editor of group.editors) {
				if (String(editor.resource) === String(uri)) {
					group.closeEditor(editor);
				}
			}
		}
	}
}
registerAction2(ChatEditingAcceptAllAction);

export class ChatEditingDiscardAllAction extends Action2 {
	static readonly ID = 'chatEditing.discardAllFiles';
	static readonly LABEL = localize('discard.allFiles', 'Discard All');

	constructor() {
		super({
			id: ChatEditingDiscardAllAction.ID,
			title: ChatEditingDiscardAllAction.LABEL,
			// icon: Codicon.goToFile,
			menu: {
				when: ContextKeyExpr.equals('resourceScheme', ChatEditingMultiDiffSourceResolver.scheme),
				id: MenuId.EditorTitle,
				order: 0,
				group: 'navigation',
			},
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const chatEditingService = accessor.get(IChatEditingService);
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const currentEditingSession = chatEditingService.currentEditingSession;
		if (!currentEditingSession) {
			return;
		}
		const entries = currentEditingSession.entries.get();
		await Promise.all(
			// TODO: figure out how to run this in a transaction
			entries.map(entry => entry.reject(undefined))
		);

		const uri = args[0];

		for (const group of editorGroupsService.groups) {
			for (const editor of group.editors) {
				if (String(editor.resource) === String(uri)) {
					group.closeEditor(editor);
				}
			}
		}
	}
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
		return this._entriesObs;
	}
	private readonly _sequencer = new Sequencer();

	private _entries: readonly ModifiedFileEntry[] = [];

	get state(): IObservable<ChatEditingSessionState> {
		return this._state;
	}

	private readonly _editedResources = new ResourceSet();
	private readonly _onDidEditNewResource = new Emitter<URI>();
	get onDidEditNewResource() {
		return this._onDidEditNewResource.event;
	}

	constructor(
		public readonly chatSessionId: string,
		parent: { killCurrentEditingSession(): void },
		private readonly editorPane: MultiDiffEditor | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IBulkEditService public readonly _bulkEditService: IBulkEditService,
	) {
		super();

		// auto-dispose
		autorun((reader) => {
			if (this.state.read(reader) !== ChatEditingSessionState.Idle) {
				return;
			}
			const entries = this.entries.read(reader);
			const pendingEntries = entries.filter(entry => entry.state.read(reader) === ModifiedFileEntryState.Undecided);
			if (pendingEntries.length > 0) {
				return;
			}

			// all entries were accepted
			parent.killCurrentEditingSession();
		});
	}

	getVirtualModel(documentId: string): ITextModel | null {
		const entry = this._entries.find(e => e.entryId === documentId);
		return entry?.docSnapshot ?? null;
	}

	acceptStreamingEditsStart(): void {
		// ensure that the edits are processed sequentially
		this._sequencer.queue(() => this._acceptStreamingEditsStart());
	}

	acceptTextEdits(resource: URI, textEdits: TextEdit[]): void {
		// ensure that the edits are processed sequentially
		this._sequencer.queue(() => this._acceptTextEdits(resource, textEdits));
	}

	resolve(): void {
		// ensure that the edits are processed sequentially
		this._sequencer.queue(() => this._resolve());
	}

	private async _acceptStreamingEditsStart(): Promise<void> {
		this._state.set(ChatEditingSessionState.StreamingEdits, undefined);
	}

	private async _acceptTextEdits(resource: URI, textEdits: TextEdit[]): Promise<void> {
		const entry = await this._getOrCreateModifiedFileEntry(resource);
		entry.doc.applyEdits(textEdits);
	}

	private async _resolve(): Promise<void> {
		this._state.set(ChatEditingSessionState.Idle, undefined);
	}

	private async _getOrCreateModifiedFileEntry(resource: URI): Promise<ModifiedFileEntry> {
		const existingEntry = this._entries.find(e => e.resource.toString() === resource.toString());
		if (existingEntry) {
			return existingEntry;
		}

		const entry = await this._createModifiedFileEntry(resource);
		this._register(entry);
		this._entries = [...this._entries, entry];
		this._entriesObs.set(this._entries, undefined);
		this._editedResources.add(resource);
		this._onDidEditNewResource.fire(resource);

		return entry;
	}

	private async _createModifiedFileEntry(resource: URI, mustExist = false): Promise<ModifiedFileEntry> {
		try {
			const ref = await this._textModelService.createModelReference(resource);
			return this._instantiationService.createInstance(ModifiedFileEntry, resource, ref, { collapse: (transaction: ITransaction | undefined) => this._collapse(resource, transaction) });
		} catch (err) {
			if (mustExist) {
				throw err;
			}
			// this file does not exist yet, create it and try again
			await this._bulkEditService.apply({ edits: [{ newResource: resource }] });
			return this._createModifiedFileEntry(resource, true);
		}
	}

	private _collapse(resource: URI, transaction: ITransaction | undefined) {
		const multiDiffItem = this.editorPane?.findDocumentDiffItem(resource);
		if (multiDiffItem) {
			this.editorPane?.viewModel?.items.get().find((documentDiffItem) => String(documentDiffItem.originalUri) === String(multiDiffItem.originalUri) && String(documentDiffItem.modifiedUri) === String(multiDiffItem.modifiedUri))?.collapsed.set(true, transaction);
		}
	}
}

const enum ModifiedFileEntryState {
	Undecided,
	Accepted,
	Rejected
}

class ModifiedFileEntry extends Disposable implements IModifiedFileEntry {

	static lastEntryId = 0;
	public readonly entryId = `modified-file-entry::${++ModifiedFileEntry.lastEntryId}`;

	public readonly docSnapshot: ITextModel;
	public readonly doc: ITextModel;

	get originalURI(): URI {
		return this.docSnapshot.uri;
	}

	get modifiedURI(): URI {
		return this.doc.uri;
	}

	private readonly _stateObs = observableValue<ModifiedFileEntryState>(this, ModifiedFileEntryState.Undecided);
	public get state(): IObservable<ModifiedFileEntryState> {
		return this._stateObs;
	}

	constructor(
		public readonly resource: URI,
		resourceRef: IReference<IResolvedTextEditorModel>,
		private readonly _multiDiffEntryDelegate: { collapse: (transaction: ITransaction | undefined) => void },
		@IModelService modelService: IModelService,
		@ILanguageService languageService: ILanguageService,
		@IBulkEditService public readonly _bulkEditService: IBulkEditService,
	) {
		super();
		this.doc = resourceRef.object.textEditorModel;
		this.docSnapshot = this._register(
			modelService.createModel(
				createTextBufferFactoryFromSnapshot(this.doc.createSnapshot()),
				languageService.createById(this.doc.getLanguageId()),
				ChatEditingTextModelContentProvider.getFileURI(this.entryId, resource.path),
				false
			)
		);
		this._register(resourceRef);
	}

	async accept(transaction: ITransaction | undefined): Promise<void> {
		if (this._stateObs.get() !== ModifiedFileEntryState.Undecided) {
			// already accepted or rejected
			return;
		}
		this.docSnapshot.setValue(this.doc.createSnapshot());
		this._stateObs.set(ModifiedFileEntryState.Accepted, transaction);
		await this.collapse(transaction);
	}

	async reject(transaction: ITransaction | undefined): Promise<void> {
		if (this._stateObs.get() !== ModifiedFileEntryState.Undecided) {
			// already accepted or rejected
			return;
		}
		this.doc.setValue(this.docSnapshot.createSnapshot());
		this._stateObs.set(ModifiedFileEntryState.Rejected, transaction);
		await this.collapse(transaction);
	}

	async collapse(transaction: ITransaction | undefined): Promise<void> {
		this._multiDiffEntryDelegate.collapse(transaction);
	}
}
