/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { Disposable, IReference } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, ITransaction, observableValue, ValueWithChangeEventFromObservable } from '../../../../base/common/observable.js';
import { Constants } from '../../../../base/common/uint.js';
import { URI } from '../../../../base/common/uri.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../editor/browser/services/bulkEditService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { TextEdit } from '../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelContentProvider, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorActivation } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { MultiDiffEditorInput } from '../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService, IResolvedMultiDiffSource, MultiDiffEditorItem } from '../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { ChatEditingSessionState, IChatEditingService, IChatEditingSession, IChatEditingSessionStream, IModifiedFileEntry } from '../common/chatEditingService.js';

const acceptedChatEditingResourceContextKey = new RawContextKey<string[]>('acceptedChatEditingResource', []);
const chatEditingResourceContextKey = new RawContextKey<string | undefined>('chatEditingResource', undefined);
const inChatEditingSessionContextKey = new RawContextKey<boolean | undefined>('inChatEditingSession', undefined);

export class ChatEditingService extends Disposable implements IChatEditingService {

	_serviceBrand: undefined;

	private readonly _currentSessionObs = observableValue<ChatEditingSession | null>(this, null);

	get currentEditingSession(): IChatEditingSession | null {
		return this._currentSessionObs.get();
	}

	constructor(
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IMultiDiffSourceResolverService multiDiffSourceResolverService: IMultiDiffSourceResolverService,
		@ITextModelService textModelService: ITextModelService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super();
		this._register(multiDiffSourceResolverService.registerResolver(_instantiationService.createInstance(ChatEditingMultiDiffSourceResolver, this._currentSessionObs)));
		textModelService.registerTextModelContentProvider(ChatEditingTextModelContentProvider.scheme, _instantiationService.createInstance(ChatEditingTextModelContentProvider, this._currentSessionObs));
		this._register(bindContextKey(acceptedChatEditingResourceContextKey, contextKeyService, (reader) => {
			const currentSession = this._currentSessionObs.read(reader);
			if (!currentSession) {
				return;
			}
			const entries = currentSession.entries.read(reader);
			const acceptedEntries = entries.filter(entry => entry.accepted.read(reader));
			return acceptedEntries.map(entry => entry.modifiedDocumentId);
		}));
	}

	async createEditingSession(builder: (stream: IChatEditingSessionStream) => Promise<void>): Promise<void> {
		if (this._currentSessionObs.get()) {
			throw new BugIndicatingError('Cannot have more than one active editing session');
		}

		const input = MultiDiffEditorInput.fromResourceMultiDiffEditorInput({
			multiDiffSource: ChatEditingMultiDiffSourceResolver.getMultiDiffSourceUri(),
			label: localize('multiDiffEditorInput.name', "Suggested Edits")
		}, this._instantiationService);

		await this._editorGroupsService.activeGroup.openEditor(input, { pinned: true, activation: EditorActivation.ACTIVATE });

		const session = this._instantiationService.createInstance(ChatEditingSession, { killCurrentEditingSession: () => this.killCurrentEditingSession() });
		this._currentSessionObs.set(session, undefined);

		const stream: IChatEditingSessionStream = {
			textEdits: (resource: URI, textEdits: TextEdit[]) => {
				session.acceptTextEdits(resource, textEdits);
			}
		};

		try {
			await builder(stream);
		} finally {
			session.resolve();
		}
	}

	killCurrentEditingSession() {
		// close all editors
		for (const group of this._editorGroupsService.groups) {
			for (const editor of group.editors) {
				if (editor.resource?.scheme === ChatEditingMultiDiffSourceResolver.scheme) {
					group.closeEditor(editor);
				}
			}
		}
		const currentSession = this._currentSessionObs.get();
		if (currentSession) {
			currentSession.dispose();
			this._currentSessionObs.set(null, undefined);
		}
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
					[chatEditingResourceContextKey.key]: entry.modifiedDocumentId,
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
			title: localize2('accept.file', 'Accept File'),
			// icon: Codicon.goToFile,
			menu: {
				when: ContextKeyExpr.notIn(chatEditingResourceContextKey.key, acceptedChatEditingResourceContextKey.key),
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

registerAction2(class AcceptAllAction extends Action2 {
	constructor() {
		super({
			id: 'chatEditing.acceptAllFiles',
			title: localize2('accept.allFiles', 'Accept All'),
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
});

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

		return session.getModel(data.documentId);
	}
}

class ChatEditingSession extends Disposable implements IChatEditingSession {
	private readonly _state = observableValue<ChatEditingSessionState>(this, ChatEditingSessionState.StreamingEdits);
	private readonly _entriesObs = observableValue<readonly ModifiedFileEntry[]>(this, []);
	public get entries(): IObservable<readonly ModifiedFileEntry[]> {
		return this._entriesObs;
	}
	private readonly _sequencer = new Sequencer();

	private _entries: readonly ModifiedFileEntry[] = [];

	get state(): IObservable<ChatEditingSessionState> {
		return this._state;
	}

	constructor(
		parent: { killCurrentEditingSession(): void },
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITextModelService private readonly _textModelService: ITextModelService,
	) {
		super();

		// auto-dispose
		autorun((reader) => {
			if (this.state.read(reader) === ChatEditingSessionState.StreamingEdits) {
				return;
			}
			const entries = this.entries.read(reader);
			const pendingEntries = entries.filter(entry => !entry.accepted.read(reader));
			if (pendingEntries.length > 0) {
				return;
			}

			// all entries were accepted
			parent.killCurrentEditingSession();
		});
	}

	getModel(documentId: string): ITextModel | null {
		const entry = this._entries.find(e => e.modifiedDocumentId === documentId);
		return entry?.modifiedDocument ?? null;
	}

	acceptTextEdits(resource: URI, textEdits: TextEdit[]): void {
		// ensure that the edits are processed sequentially
		this._sequencer.queue(() => this._acceptTextEdits(resource, textEdits));
	}

	resolve(): void {
		// ensure that the edits are processed sequentially
		this._sequencer.queue(() => this._resolve());
	}

	private async _acceptTextEdits(resource: URI, textEdits: TextEdit[]): Promise<void> {
		const entry = await this._getOrCreateModifiedFileEntry(resource);
		entry.modifiedDocument.applyEdits(textEdits);
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

		return entry;
	}

	private async _createModifiedFileEntry(resource: URI): Promise<ModifiedFileEntry> {
		let ref: IReference<IResolvedTextEditorModel>;
		try {
			ref = await this._textModelService.createModelReference(resource);
		} catch (err) {
			// this file does not exist yet
			return this._instantiationService.createInstance(ModifiedFileEntry, resource, null);
		}

		return this._instantiationService.createInstance(ModifiedFileEntry, resource, ref);
	}
}

class ModifiedFileEntry extends Disposable implements IModifiedFileEntry {
	static lastModifiedFileId = 0;

	public readonly originalURI: URI;
	public readonly originalDocument: ITextModel | null;
	public readonly modifiedDocumentId = `modified-file::${++ModifiedFileEntry.lastModifiedFileId}`;
	public readonly modifiedDocument: ITextModel;

	public get modifiedURI(): URI {
		return this.modifiedDocument.uri;
	}
	private readonly _acceptedObs = observableValue<boolean>(this, false);
	public get accepted(): IObservable<boolean> {
		return this._acceptedObs;
	}

	constructor(
		public readonly resource: URI,
		resourceRef: IReference<IResolvedTextEditorModel> | null,
		@IModelService modelService: IModelService,
		@ILanguageService languageService: ILanguageService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
	) {
		super();
		this.originalDocument = resourceRef ? resourceRef.object.textEditorModel : null;
		const initialModifiedContent = this.originalDocument ? this.originalDocument.getValue() : '';
		const languageSelection = this.originalDocument ? languageService.createById(this.originalDocument.getLanguageId()) : languageService.createByFilepathOrFirstLine(resource);

		this.modifiedDocument = this._register(modelService.createModel(initialModifiedContent, languageSelection, ChatEditingTextModelContentProvider.getFileURI(this.modifiedDocumentId, resource.path), false));
		this.originalURI = this.originalDocument ? this.originalDocument.uri : ChatEditingTextModelContentProvider.getEmptyFileURI();
		if (resourceRef) {
			this._register(resourceRef);
		}
	}

	async accept(transaction: ITransaction | undefined): Promise<void> {
		if (this._acceptedObs.get()) {
			// already applied
			return;
		}

		const textEdit: TextEdit = {
			range: new Range(1, 1, Constants.MAX_SAFE_SMALL_INTEGER, Constants.MAX_SAFE_SMALL_INTEGER),
			text: this.modifiedDocument.getValue()
		};
		this._acceptedObs.set(true, transaction);
		await this._bulkEditService.apply([new ResourceTextEdit(this.originalURI, textEdit, undefined)]);
	}
}
