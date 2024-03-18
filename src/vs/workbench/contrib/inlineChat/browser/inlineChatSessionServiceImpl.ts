/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from 'vs/base/common/uri';
import { Emitter, Event } from 'vs/base/common/event';
import { EditMode, IInlineChatSession, IInlineChatService, IInlineChatSessionProvider, InlineChatResponseFeedbackKind, IInlineChatProgressItem } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { Range } from 'vs/editor/common/core/range';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { DisposableMap, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { ILogService } from 'vs/platform/log/common/log';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Iterable } from 'vs/base/common/iterator';
import { raceCancellation } from 'vs/base/common/async';
import { Recording, IInlineChatSessionService, ISessionKeyComputer, IInlineChatSessionEvent, IInlineChatSessionEndEvent } from './inlineChatSessionService';
import { HunkData, Session, SessionWholeRange, StashedSession, TelemetryData, TelemetryDataClassification } from './inlineChatSession';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { ITextModel, IValidEditOperation } from 'vs/editor/common/model';
import { Schemas } from 'vs/base/common/network';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { generateUuid } from 'vs/base/common/uuid';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { UntitledTextEditorInput } from 'vs/workbench/services/untitled/common/untitledTextEditorInput';
import { DEFAULT_EDITOR_ASSOCIATION } from 'vs/workbench/common/editor';
import { IChatService, InteractiveSessionVoteDirection } from 'vs/workbench/contrib/chat/common/chatService';
import { ChatAgentLocation, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { Progress } from 'vs/platform/progress/common/progress';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { isNonEmptyArray } from 'vs/base/common/arrays';

type SessionData = {
	editor: ICodeEditor;
	session: Session;
	store: IDisposable;
};

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
	private _recordings: Recording[] = [];

	constructor(
		@IInlineChatService private readonly _inlineChatService: IInlineChatService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
		@IChatService private readonly _chatService: IChatService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
	) {

		const mapping = this._store.add(new DisposableMap<IInlineChatSessionProvider>());

		const registerFakeChatProvider = (provider: IInlineChatSessionProvider) => {
			const d = this._chatService.registerProvider({
				id: this._asChatProviderBrigdeName(provider),
				prepareSession() {
					return {
						id: Math.random()
					};
				}
			});
			mapping.set(provider, d);
		};

		this._store.add(_inlineChatService.onDidChangeProviders(e => {
			if (e.added) {
				registerFakeChatProvider(e.added);
			}
			if (e.removed) {
				mapping.deleteAndDispose(e.removed);
			}
		}));

		for (const provider of _inlineChatService.getAllProvider()) {
			registerFakeChatProvider(provider);
		}

	}

	dispose() {
		this._store.dispose();
		this._sessions.forEach(x => x.store.dispose());
		this._sessions.clear();
	}

	private _asChatProviderBrigdeName(provider: IInlineChatSessionProvider) {
		return `editor-inline-chat:${ExtensionIdentifier.toKey(provider.extensionId)}`;
	}

	async createSession(editor: IActiveCodeEditor, options: { editMode: EditMode; wholeRange?: Range }, token: CancellationToken): Promise<Session | undefined> {

		const provider = Iterable.first(this._inlineChatService.getAllProvider());
		if (!provider) {
			this._logService.trace('[IE] NO provider found');
			return undefined;
		}

		const chatModel = this._chatService.startSession(this._asChatProviderBrigdeName(provider), token);
		if (!chatModel) {
			this._logService.trace('[IE] NO chatModel found');
			return undefined;
		}

		const store = new DisposableStore();

		store.add(toDisposable(() => {
			this._chatService.clearSession(chatModel.sessionId);
			chatModel.dispose();
		}));

		this._onWillStartSession.fire(editor);

		const textModel = editor.getModel();
		const selection = editor.getSelection();
		let rawSession: IInlineChatSession | undefined | null;
		try {
			rawSession = await raceCancellation(
				Promise.resolve(provider.prepareInlineChatSession(textModel, selection, token)),
				token
			);
		} catch (error) {
			this._logService.error('[IE] FAILED to prepare session', provider.extensionId);
			this._logService.error(error);
			return undefined;
		}
		if (!rawSession) {
			this._logService.trace('[IE] NO session', provider.extensionId);
			return undefined;
		}

		this._logService.trace(`[IE] creating NEW session for ${editor.getId()}, ${provider.extensionId}`);


		store.add(this._chatService.onDidPerformUserAction(e => {
			if (e.sessionId !== chatModel.sessionId) {
				return;
			}
			if (e.action.kind !== 'vote') {
				return;
			}

			// TODO@jrieken VALIDATE candidate is proper, e.g check with `session.exchanges`
			const request = chatModel.getRequests().find(request => request.id === e.requestId);
			const candidate = request?.response?.result?.metadata?.inlineChatResponse;
			if (candidate) {
				provider.handleInlineChatResponseFeedback?.(
					rawSession,
					candidate,
					e.action.direction === InteractiveSessionVoteDirection.Down ? InlineChatResponseFeedbackKind.Unhelpful : InlineChatResponseFeedbackKind.Helpful
				);
			}
		}));

		store.add(this._chatAgentService.registerDynamicAgent({
			id: `${ExtensionIdentifier.toKey(provider.extensionId)}/${rawSession.id}`,
			extensionId: provider.extensionId,
			isDefault: true,
			locations: [ChatAgentLocation.Editor],
			slashCommands: rawSession.slashCommands?.map(c => ({ name: c.command, description: c.detail ?? '' })) ?? [],
			defaultImplicitVariables: [],
			metadata: { isSticky: false },
		}, {
			async invoke(request, progress, history, token) {

				const inlineRequest = {
					requestId: request.requestId,
					prompt: request.message,
					attempt: session.lastInput?.attempt ?? 1, // TODO@jrieken
					withIntentDetection: true, // TODO@jrieken
					live: session.editMode !== EditMode.Preview,
					previewDocument: session.textModelN.uri,
					selection: editor.getSelection(),
					wholeRange: session.wholeRange.trackedInitialRange,
				};

				const inlineProgress = new Progress<IInlineChatProgressItem>(data => {
					if (data.slashCommand) {
						progress({ kind: 'usedSlashCommand', slashCommand: data.slashCommand });
						// progress({ kind: 'markdownContent', content: new MarkdownString(data.slashCommand) });
					}
					if (data.markdownFragment) {
						progress({ kind: 'content', content: data.markdownFragment });
					}
					if (isNonEmptyArray(data.edits)) {
						progress({ kind: 'textEdit', uri: session.textModelN.uri, edits: data.edits });
					}
				});

				const result = await provider.provideResponse(rawSession, inlineRequest, inlineProgress, token);

				if (result?.message) {
					inlineProgress.report({ markdownFragment: result.message.value });
				}
				if (Array.isArray(result?.edits)) {
					inlineProgress.report({ edits: result.edits });
				}


				// TODO@jrieken
				// result?.placeholder
				// result?.wholeRange

				return { metadata: { inlineChatResponse: result } };
			},
		}));

		store.add(this._inlineChatService.onDidChangeProviders(e => {
			if (e.removed === provider) {
				this._logService.trace(`[IE] provider GONE for ${editor.getId()}, ${provider.extensionId}`);
				this._releaseSession(session, true);
			}
		}));

		const id = generateUuid();
		const targetUri = textModel.uri;

		let textModelN: ITextModel;
		if (options.editMode === EditMode.Preview) {
			// AI edits happen in a copy
			textModelN = store.add(this._modelService.createModel(
				createTextBufferFactoryFromSnapshot(textModel.createSnapshot()),
				{ languageId: textModel.getLanguageId(), onDidChange: Event.None },
				targetUri.with({ scheme: Schemas.vscode, authority: 'inline-chat', path: '', query: new URLSearchParams({ id, 'textModelN': '' }).toString() })
			));
		} else {
			// AI edits happen in the actual model, keep a reference but make no copy
			store.add((await this._textModelService.createModelReference(textModel.uri)));
			textModelN = textModel;
		}

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
			wholeRange = rawSession.wholeRange ? Range.lift(rawSession.wholeRange) : editor.getSelection();
		}

		if (token.isCancellationRequested) {
			store.dispose();
			return undefined;
		}

		const session = new Session(
			options.editMode,
			targetUri,
			textModel0,
			textModelN,
			provider, rawSession,
			store.add(new SessionWholeRange(textModelN, wholeRange)),
			store.add(new HunkData(this._editorWorkerService, textModel0, textModelN)),
			chatModel
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
				this._logService.trace(`[IE] did MOVE session for ${data.editor.getId()} to NEW EDITOR ${target.getId()}, ${session.provider.extensionId}`);
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

		this._keepRecording(session);
		this._telemetryService.publicLog2<TelemetryData, TelemetryDataClassification>('interactiveEditor/session', session.asTelemetryData());

		const [key, value] = tuple;
		this._sessions.delete(key);
		this._logService.trace(`[IE] did RELEASED session for ${value.editor.getId()}, ${session.provider.extensionId}`);

		this._onDidEndSession.fire({ editor: value.editor, session, endedByExternalCause: byServer });
		value.store.dispose();
	}

	stashSession(session: Session, editor: ICodeEditor, undoCancelEdits: IValidEditOperation[]): StashedSession {
		this._keepRecording(session);
		const result = this._instaService.createInstance(StashedSession, editor, session, undoCancelEdits);
		this._onDidStashSession.fire({ editor, session });
		this._logService.trace(`[IE] did STASH session for ${editor.getId()}, ${session.provider.extensionId}`);
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

	// --- debug

	private _keepRecording(session: Session) {
		const newLen = this._recordings.unshift(session.asRecording());
		if (newLen > 5) {
			this._recordings.pop();
		}
	}

	recordings(): readonly Recording[] {
		return this._recordings;
	}

}
