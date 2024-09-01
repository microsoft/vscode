/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IActiveCodeEditor, ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IValidEditOperation } from '../../../../editor/common/model.js';
import { createTextBufferFactoryFromSnapshot } from '../../../../editor/common/model/textModel.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../common/editor.js';
import { ChatAgentLocation, IChatAgentService } from '../../chat/common/chatAgents.js';
import { IChatService } from '../../chat/common/chatService.js';
import { CTX_INLINE_CHAT_HAS_AGENT, EditMode } from '../common/inlineChat.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { UntitledTextEditorInput } from '../../../services/untitled/common/untitledTextEditorInput.js';
import { HunkData, Session, SessionWholeRange, StashedSession, TelemetryData, TelemetryDataClassification } from './inlineChatSession.js';
import { IInlineChatSessionEndEvent, IInlineChatSessionEvent, IInlineChatSessionService, ISessionKeyComputer } from './inlineChatSessionService.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';


type SessionData = {
	editor: ICodeEditor;
	session: Session;
	store: IDisposable;
};

export class InlineChatError extends Error {
	static readonly code = 'InlineChatError';
	constructor(message: string) {
		super(message);
		this.name = InlineChatError.code;
	}
}


export class InlineChatSessionServiceImpl implements IInlineChatSessionService {

	declare _serviceBrand: undefined;

	private readonly _store = new DisposableStore();

	private readonly _onWillStartSession = this._store.add(new Emitter<IActiveCodeEditor>());
	readonly onWillStartSession: Event<IActiveCodeEditor> = this._onWillStartSession.event;

	private readonly _onDidMoveSession = this._store.add(new Emitter<IInlineChatSessionEvent>());
	readonly onDidMoveSession: Event<IInlineChatSessionEvent> = this._onDidMoveSession.event;

	private readonly _onDidEndSession = this._store.add(new Emitter<IInlineChatSessionEndEvent>());
	readonly onDidEndSession: Event<IInlineChatSessionEndEvent> = this._onDidEndSession.event;

	private readonly _onDidStashSession = this._store.add(new Emitter<IInlineChatSessionEvent>());
	readonly onDidStashSession: Event<IInlineChatSessionEvent> = this._onDidStashSession.event;

	private readonly _sessions = new Map<string, SessionData>();
	private readonly _keyComputers = new Map<string, ISessionKeyComputer>();

	constructor(
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IChatService private readonly _chatService: IChatService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService
	) { }

	dispose() {
		this._store.dispose();
		this._sessions.forEach(x => x.store.dispose());
		this._sessions.clear();
	}

	async createSession(editor: IActiveCodeEditor, options: { editMode: EditMode; headless?: boolean; wholeRange?: Range; session?: Session }, token: CancellationToken): Promise<Session | undefined> {

		const agent = this._chatAgentService.getDefaultAgent(ChatAgentLocation.Editor);

		if (!agent) {
			this._logService.trace('[IE] NO agent found');
			return undefined;
		}

		this._onWillStartSession.fire(editor);

		const textModel = editor.getModel();
		const selection = editor.getSelection();

		const store = new DisposableStore();
		this._logService.trace(`[IE] creating NEW session for ${editor.getId()}, ${agent.extensionId}`);

		const chatModel = options.session?.chatModel ?? this._chatService.startSession(ChatAgentLocation.Editor, token);
		if (!chatModel) {
			this._logService.trace('[IE] NO chatModel found');
			return undefined;
		}

		store.add(toDisposable(() => {
			const doesOtherSessionUseChatModel = [...this._sessions.values()].some(data => data.session !== session && data.session.chatModel === chatModel);

			if (!doesOtherSessionUseChatModel) {
				this._chatService.clearSession(chatModel.sessionId);
				chatModel.dispose();
			}
		}));

		const lastResponseListener = store.add(new MutableDisposable());
		store.add(chatModel.onDidChange(e => {
			if (e.kind !== 'addRequest' || !e.request.response) {
				return;
			}

			const { response } = e.request;

			session.markModelVersion(e.request);
			lastResponseListener.value = response.onDidChange(() => {

				if (!response.isComplete) {
					return;
				}

				lastResponseListener.clear(); // ONCE

				// special handling for untitled files
				for (const part of response.response.value) {
					if (part.kind !== 'textEditGroup' || part.uri.scheme !== Schemas.untitled || isEqual(part.uri, session.textModelN.uri)) {
						continue;
					}
					const langSelection = this._languageService.createByFilepathOrFirstLine(part.uri, undefined);
					const untitledTextModel = this._textFileService.untitled.create({
						associatedResource: part.uri,
						languageId: langSelection.languageId
					});
					untitledTextModel.resolve();
					this._textModelService.createModelReference(part.uri).then(ref => {
						store.add(ref);
					});
				}

			});
		}));

		store.add(this._chatAgentService.onDidChangeAgents(e => {
			if (e === undefined && !this._chatAgentService.getAgent(agent.id)) {
				this._logService.trace(`[IE] provider GONE for ${editor.getId()}, ${agent.extensionId}`);
				this._releaseSession(session, true);
			}
		}));

		const id = generateUuid();
		const targetUri = textModel.uri;

		// AI edits happen in the actual model, keep a reference but make no copy
		store.add((await this._textModelService.createModelReference(textModel.uri)));
		const textModelN = textModel;

		// create: keep a snapshot of the "actual" model
		const textModel0 = store.add(this._modelService.createModel(
			createTextBufferFactoryFromSnapshot(textModel.createSnapshot()),
			{ languageId: textModel.getLanguageId(), onDidChange: Event.None },
			targetUri.with({ scheme: Schemas.vscode, authority: 'inline-chat', path: '', query: new URLSearchParams({ id, 'textModel0': '' }).toString() }), true
		));

		// untitled documents are special and we are releasing their session when their last editor closes
		if (targetUri.scheme === Schemas.untitled) {
			store.add(this._editorService.onDidCloseEditor(() => {
				if (!this._editorService.isOpened({ resource: targetUri, typeId: UntitledTextEditorInput.ID, editorId: DEFAULT_EDITOR_ASSOCIATION.id })) {
					this._releaseSession(session, true);
				}
			}));
		}

		let wholeRange = options.wholeRange;
		if (!wholeRange) {
			wholeRange = new Range(selection.selectionStartLineNumber, selection.selectionStartColumn, selection.positionLineNumber, selection.positionColumn);
		}

		if (token.isCancellationRequested) {
			store.dispose();
			return undefined;
		}

		const session = new Session(
			options.editMode,
			options.headless ?? false,
			targetUri,
			textModel0,
			textModelN,
			agent,
			store.add(new SessionWholeRange(textModelN, wholeRange)),
			store.add(new HunkData(this._editorWorkerService, textModel0, textModelN)),
			chatModel,
			options.session?.versionsByRequest,
		);

		// store: key -> session
		const key = this._key(editor, session.targetUri);
		if (this._sessions.has(key)) {
			store.dispose();
			throw new Error(`Session already stored for ${key}`);
		}
		this._sessions.set(key, { session, editor, store });
		return session;
	}

	moveSession(session: Session, target: ICodeEditor): void {
		const newKey = this._key(target, session.targetUri);
		const existing = this._sessions.get(newKey);
		if (existing) {
			if (existing.session !== session) {
				throw new Error(`Cannot move session because the target editor already/still has one`);
			} else {
				// noop
				return;
			}
		}

		let found = false;
		for (const [oldKey, data] of this._sessions) {
			if (data.session === session) {
				found = true;
				this._sessions.delete(oldKey);
				this._sessions.set(newKey, { ...data, editor: target });
				this._logService.trace(`[IE] did MOVE session for ${data.editor.getId()} to NEW EDITOR ${target.getId()}, ${session.agent.extensionId}`);
				this._onDidMoveSession.fire({ session, editor: target });
				break;
			}
		}
		if (!found) {
			throw new Error(`Cannot move session because it is not stored`);
		}
	}

	releaseSession(session: Session): void {
		this._releaseSession(session, false);
	}

	private _releaseSession(session: Session, byServer: boolean): void {

		let tuple: [string, SessionData] | undefined;

		// cleanup
		for (const candidate of this._sessions) {
			if (candidate[1].session === session) {
				// if (value.session === session) {
				tuple = candidate;
				break;
			}
		}

		if (!tuple) {
			// double remove
			return;
		}

		this._telemetryService.publicLog2<TelemetryData, TelemetryDataClassification>('interactiveEditor/session', session.asTelemetryData());

		const [key, value] = tuple;
		this._sessions.delete(key);
		this._logService.trace(`[IE] did RELEASED session for ${value.editor.getId()}, ${session.agent.extensionId}`);

		this._onDidEndSession.fire({ editor: value.editor, session, endedByExternalCause: byServer });
		value.store.dispose();
	}

	stashSession(session: Session, editor: ICodeEditor, undoCancelEdits: IValidEditOperation[]): StashedSession {
		const result = this._instaService.createInstance(StashedSession, editor, session, undoCancelEdits);
		this._onDidStashSession.fire({ editor, session });
		this._logService.trace(`[IE] did STASH session for ${editor.getId()}, ${session.agent.extensionId}`);
		return result;
	}

	getCodeEditor(session: Session): ICodeEditor {
		for (const [, data] of this._sessions) {
			if (data.session === session) {
				return data.editor;
			}
		}
		throw new Error('session not found');
	}

	getSession(editor: ICodeEditor, uri: URI): Session | undefined {
		const key = this._key(editor, uri);
		return this._sessions.get(key)?.session;
	}

	private _key(editor: ICodeEditor, uri: URI): string {
		const item = this._keyComputers.get(uri.scheme);
		return item
			? item.getComparisonKey(editor, uri)
			: `${editor.getId()}@${uri.toString()}`;

	}

	registerSessionKeyComputer(scheme: string, value: ISessionKeyComputer): IDisposable {
		this._keyComputers.set(scheme, value);
		return toDisposable(() => this._keyComputers.delete(scheme));
	}
}

export class InlineChatEnabler {

	static Id = 'inlineChat.enabler';

	private readonly _ctxHasProvider: IContextKey<boolean>;

	private readonly _store = new DisposableStore();

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatAgentService chatAgentService: IChatAgentService
	) {
		this._ctxHasProvider = CTX_INLINE_CHAT_HAS_AGENT.bindTo(contextKeyService);
		this._store.add(chatAgentService.onDidChangeAgents(() => {
			const hasEditorAgent = Boolean(chatAgentService.getDefaultAgent(ChatAgentLocation.Editor));
			this._ctxHasProvider.set(hasEditorAgent);
		}));
	}

	dispose() {
		this._ctxHasProvider.reset();
		this._store.dispose();
	}
}
