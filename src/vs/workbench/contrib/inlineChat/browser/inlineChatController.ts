/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as aria from 'vs/base/browser/ui/aria/aria';
import { Barrier, DeferredPromise, Queue } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Lazy } from 'vs/base/common/lazy';
import { DisposableStore, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { MovingAverage } from 'vs/base/common/numbers';
import { StopWatch } from 'vs/base/common/stopwatch';
import { assertType } from 'vs/base/common/types';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { ISelection, Selection } from 'vs/editor/common/core/selection';
import { IEditorContribution, IEditorDecorationsCollection } from 'vs/editor/common/editorCommon';
import { CompletionItemKind, CompletionList, TextEdit } from 'vs/editor/common/languages';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { InlineCompletionsController } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsController';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IChatWidgetService, showChatView } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IInlineChatSavingService } from './inlineChatSavingService';
import { EmptyResponse, ErrorResponse, ReplyResponse, Session, SessionPrompt } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { IInlineChatSessionService } from './inlineChatSessionService';
import { EditModeStrategy, IEditObserver, LiveStrategy, PreviewStrategy, ProgressingEditsOptions } from 'vs/workbench/contrib/inlineChat/browser/inlineChatStrategies';
import { InlineChatZoneWidget } from './inlineChatZoneWidget';
import { CTX_INLINE_CHAT_REQUEST_IN_PROGRESS, CTX_INLINE_CHAT_RESPONSE_TYPE, CTX_INLINE_CHAT_USER_DID_EDIT, CTX_INLINE_CHAT_VISIBLE, EditMode, INLINE_CHAT_ID, InlineChatConfigKeys, InlineChatResponseType } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { StashedSession } from './inlineChatSession';
import { IModelDeltaDecoration, ITextModel, IValidEditOperation } from 'vs/editor/common/model';
import { InlineChatContentWidget } from 'vs/workbench/contrib/inlineChat/browser/inlineChatContentWidget';
import { MessageController } from 'vs/editor/contrib/message/browser/messageController';
import { ChatModel, ChatRequestRemovalReason, IChatRequestModel, IChatTextEditGroup, IChatTextEditGroupState, IResponse } from 'vs/workbench/contrib/chat/common/chatModel';
import { InlineChatError } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSessionServiceImpl';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { ChatInputPart } from 'vs/workbench/contrib/chat/browser/chatInputPart';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { DefaultModelSHA1Computer } from 'vs/editor/common/services/modelService';
import { generateUuid } from 'vs/base/common/uuid';
import { isEqual } from 'vs/base/common/resources';
import { ChatAgentLocation } from 'vs/workbench/contrib/chat/common/chatAgents';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { escapeRegExpCharacters } from 'vs/base/common/strings';
import { IChatWidgetLocationOptions } from 'vs/workbench/contrib/chat/browser/chatWidget';

export const enum State {
	CREATE_SESSION = 'CREATE_SESSION',
	INIT_UI = 'INIT_UI',
	WAIT_FOR_INPUT = 'WAIT_FOR_INPUT',
	SHOW_REQUEST = 'SHOW_REQUEST',
	SHOW_RESPONSE = 'SHOW_RESPONSE',
	PAUSE = 'PAUSE',
	CANCEL = 'CANCEL',
	ACCEPT = 'DONE',
}

const enum Message {
	NONE = 0,
	ACCEPT_SESSION = 1 << 0,
	CANCEL_SESSION = 1 << 1,
	PAUSE_SESSION = 1 << 2,
	CANCEL_REQUEST = 1 << 3,
	CANCEL_INPUT = 1 << 4,
	ACCEPT_INPUT = 1 << 5,
}

export abstract class InlineChatRunOptions {
	initialSelection?: ISelection;
	initialRange?: IRange;
	message?: string;
	autoSend?: boolean;
	existingSession?: Session;
	isUnstashed?: boolean;
	position?: IPosition;
	withIntentDetection?: boolean;

	static isInlineChatRunOptions(options: any): options is InlineChatRunOptions {
		const { initialSelection, initialRange, message, autoSend, position, existingSession } = <InlineChatRunOptions>options;
		if (
			typeof message !== 'undefined' && typeof message !== 'string'
			|| typeof autoSend !== 'undefined' && typeof autoSend !== 'boolean'
			|| typeof initialRange !== 'undefined' && !Range.isIRange(initialRange)
			|| typeof initialSelection !== 'undefined' && !Selection.isISelection(initialSelection)
			|| typeof position !== 'undefined' && !Position.isIPosition(position)
			|| typeof existingSession !== 'undefined' && !(existingSession instanceof Session)
		) {
			return false;
		}
		return true;
	}
}

export class InlineChatController implements IEditorContribution {

	static get(editor: ICodeEditor) {
		return editor.getContribution<InlineChatController>(INLINE_CHAT_ID);
	}

	private _isDisposed: boolean = false;
	private readonly _store = new DisposableStore();

	private readonly _ui: Lazy<{ content: InlineChatContentWidget; zone: InlineChatZoneWidget }>;

	private readonly _ctxVisible: IContextKey<boolean>;
	private readonly _ctxResponseType: IContextKey<undefined | InlineChatResponseType>;
	private readonly _ctxUserDidEdit: IContextKey<boolean>;
	private readonly _ctxRequestInProgress: IContextKey<boolean>;

	private _messages = this._store.add(new Emitter<Message>());

	private readonly _onWillStartSession = this._store.add(new Emitter<void>());
	readonly onWillStartSession = this._onWillStartSession.event;

	get chatWidget() {
		if (this._ui.value.content.isVisible) {
			return this._ui.value.content.chatWidget;
		} else {
			return this._ui.value.zone.widget.chatWidget;
		}
	}

	private readonly _sessionStore = this._store.add(new DisposableStore());
	private readonly _stashedSession = this._store.add(new MutableDisposable<StashedSession>());
	private _session?: Session;
	private _strategy?: EditModeStrategy;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IInlineChatSessionService private readonly _inlineChatSessionService: IInlineChatSessionService,
		@IInlineChatSavingService private readonly _inlineChatSavingService: IInlineChatSavingService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatService private readonly _chatService: IChatService,
		@ILanguageFeaturesService private readonly _languageFeatureService: ILanguageFeaturesService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@INotebookEditorService notebookEditorService: INotebookEditorService,
	) {
		this._ctxVisible = CTX_INLINE_CHAT_VISIBLE.bindTo(contextKeyService);
		this._ctxUserDidEdit = CTX_INLINE_CHAT_USER_DID_EDIT.bindTo(contextKeyService);
		this._ctxResponseType = CTX_INLINE_CHAT_RESPONSE_TYPE.bindTo(contextKeyService);
		this._ctxRequestInProgress = CTX_INLINE_CHAT_REQUEST_IN_PROGRESS.bindTo(contextKeyService);

		this._ui = new Lazy(() => {

			const location: IChatWidgetLocationOptions = {
				location: ChatAgentLocation.Editor,
				resolveData: () => {
					assertType(this._editor.hasModel());
					assertType(this._session);
					return {
						type: ChatAgentLocation.Editor,
						selection: this._editor.getSelection(),
						document: this._session.textModelN.uri,
						wholeRange: this._session?.wholeRange.trackedInitialRange,
					};
				}
			};

			// inline chat in notebooks
			// check if this editor is part of a notebook editor
			// and iff so, use the notebook location but keep the resolveData
			// talk about editor data
			for (const notebookEditor of notebookEditorService.listNotebookEditors()) {
				for (const [, codeEditor] of notebookEditor.codeEditors) {
					if (codeEditor === this._editor) {
						location.location = ChatAgentLocation.Notebook;
						break;
					}
				}
			}

			const content = this._store.add(_instaService.createInstance(InlineChatContentWidget, location, this._editor));
			const zone = this._store.add(_instaService.createInstance(InlineChatZoneWidget, location, this._editor));
			return { content, zone };
		});

		this._store.add(this._editor.onDidChangeModel(async e => {
			if (this._session || !e.newModelUrl) {
				return;
			}

			const existingSession = this._inlineChatSessionService.getSession(this._editor, e.newModelUrl);
			if (!existingSession) {
				return;
			}

			this._log('session RESUMING after model change', e);
			await this.run({ existingSession });
		}));

		this._store.add(this._inlineChatSessionService.onDidEndSession(e => {
			if (e.session === this._session && e.endedByExternalCause) {
				this._log('session ENDED by external cause');
				this._session = undefined;
				this._strategy?.cancel();
				this._resetWidget();
				this.cancelSession();
			}
		}));

		this._store.add(this._inlineChatSessionService.onDidMoveSession(async e => {
			if (e.editor === this._editor) {
				this._log('session RESUMING after move', e);
				await this.run({ existingSession: e.session });
			}
		}));

		this._log('NEW controller');
	}

	dispose(): void {
		if (this._currentRun) {
			this._messages.fire(this._session?.chatModel.hasRequests
				? Message.PAUSE_SESSION
				: Message.CANCEL_SESSION);
		}
		this._store.dispose();
		this._isDisposed = true;
		this._log('DISPOSED controller');
	}

	private _log(message: string | Error, ...more: any[]): void {
		if (message instanceof Error) {
			this._logService.error(message, ...more);
		} else {
			this._logService.trace(`[IE] (editor:${this._editor.getId()})${message}`, ...more);
		}
	}

	getMessage(): string | undefined {
		return this._ui.value.zone.widget.responseContent;
	}

	getId(): string {
		return INLINE_CHAT_ID;
	}

	private _getMode(): EditMode {
		return this._configurationService.getValue<EditMode>(InlineChatConfigKeys.Mode);
	}

	getWidgetPosition(): Position | undefined {
		return this._ui.value.zone.position;
	}

	private _currentRun?: Promise<void>;

	async run(options: InlineChatRunOptions | undefined = {}): Promise<void> {
		try {
			this.finishExistingSession();
			if (this._currentRun) {
				await this._currentRun;
			}
			if (options.initialSelection) {
				this._editor.setSelection(options.initialSelection);
			}
			this._stashedSession.clear();
			this._onWillStartSession.fire();
			this._currentRun = this._nextState(State.CREATE_SESSION, options);
			await this._currentRun;

		} catch (error) {
			// this should not happen but when it does make sure to tear down the UI and everything
			onUnexpectedError(error);
			if (this._session) {
				this._inlineChatSessionService.releaseSession(this._session);
			}
			this[State.PAUSE]();

		} finally {
			this._currentRun = undefined;
		}
	}

	// ---- state machine

	protected async _nextState(state: State, options: InlineChatRunOptions): Promise<void> {
		let nextState: State | void = state;
		while (nextState && !this._isDisposed) {
			this._log('setState to ', nextState);
			nextState = await this[nextState](options);
		}
	}

	private async [State.CREATE_SESSION](options: InlineChatRunOptions): Promise<State.CANCEL | State.INIT_UI> {
		assertType(this._session === undefined);
		assertType(this._editor.hasModel());

		let session: Session | undefined = options.existingSession;


		let initPosition: Position | undefined;
		if (options.position) {
			initPosition = Position.lift(options.position).delta(-1);
			delete options.position;
		}

		const widgetPosition = this._showWidget(true, initPosition);

		// this._updatePlaceholder();
		let errorMessage = localize('create.fail', "Failed to start editor chat");

		if (!session) {
			const createSessionCts = new CancellationTokenSource();
			const msgListener = Event.once(this._messages.event)(m => {
				this._log('state=_createSession) message received', m);
				if (m === Message.ACCEPT_INPUT) {
					// user accepted the input before having a session
					options.autoSend = true;
					this._ui.value.zone.widget.updateInfo(localize('welcome.2', "Getting ready..."));
				} else {
					createSessionCts.cancel();
				}
			});

			try {
				session = await this._inlineChatSessionService.createSession(
					this._editor,
					{ editMode: this._getMode(), wholeRange: options.initialRange },
					createSessionCts.token
				);
			} catch (error) {
				// Inline chat errors are from the provider and have their error messages shown to the user
				if (error instanceof InlineChatError || error?.name === InlineChatError.code) {
					errorMessage = error.message;
				}
			}

			createSessionCts.dispose();
			msgListener.dispose();

			if (createSessionCts.token.isCancellationRequested) {
				if (session) {
					this._inlineChatSessionService.releaseSession(session);
				}
				return State.CANCEL;
			}
		}

		delete options.initialRange;
		delete options.existingSession;

		if (!session) {
			MessageController.get(this._editor)?.showMessage(errorMessage, widgetPosition);
			this._log('Failed to start editor chat');
			return State.CANCEL;
		}

		await session.chatModel.waitForInitialization();

		// create a new strategy
		switch (session.editMode) {
			case EditMode.Preview:
				this._strategy = this._instaService.createInstance(PreviewStrategy, session, this._editor, this._ui.value.zone);
				break;
			case EditMode.Live:
			default:
				this._strategy = this._instaService.createInstance(LiveStrategy, session, this._editor, this._ui.value.zone);
				break;
		}

		this._session = session;
		return State.INIT_UI;
	}

	private async [State.INIT_UI](options: InlineChatRunOptions): Promise<State.WAIT_FOR_INPUT | State.SHOW_RESPONSE> {
		assertType(this._session);
		assertType(this._strategy);

		// hide/cancel inline completions when invoking IE
		InlineCompletionsController.get(this._editor)?.hide();

		this._sessionStore.clear();

		const wholeRangeDecoration = this._editor.createDecorationsCollection();
		const updateWholeRangeDecoration = () => {
			const newDecorations = this._strategy?.getWholeRangeDecoration() ?? [];
			wholeRangeDecoration.set(newDecorations);
		};
		this._sessionStore.add(toDisposable(() => wholeRangeDecoration.clear()));
		this._sessionStore.add(this._session.wholeRange.onDidChange(updateWholeRangeDecoration));
		updateWholeRangeDecoration();

		this._sessionStore.add(this._ui.value.content.onDidBlur(() => this.cancelSession()));

		this._ui.value.content.setSession(this._session);
		// this._ui.value.zone.widget.updateSlashCommands(this._session.session.slashCommands ?? []);
		this._updatePlaceholder();

		this._showWidget(!this._session.chatModel.hasRequests);
		this._ui.value.zone.widget.updateToolbar(true);

		this._sessionStore.add(this._editor.onDidChangeModel((e) => {
			const msg = this._session?.chatModel.hasRequests
				? Message.PAUSE_SESSION // pause when switching models/tabs and when having a previous exchange
				: Message.CANCEL_SESSION;
			this._log('model changed, pause or cancel session', msg, e);
			this._messages.fire(msg);
		}));

		const altVersionNow = this._editor.getModel()?.getAlternativeVersionId();

		this._sessionStore.add(this._editor.onDidChangeModelContent(e => {

			if (!this._session?.hunkData.ignoreTextModelNChanges) {
				this._ctxUserDidEdit.set(altVersionNow !== this._editor.getModel()?.getAlternativeVersionId());
			}

			if (this._session?.hunkData.ignoreTextModelNChanges || this._strategy?.hasFocus()) {
				return;
			}

			const wholeRange = this._session!.wholeRange;
			let shouldFinishSession = false;
			if (this._configurationService.getValue<boolean>(InlineChatConfigKeys.FinishOnType)) {
				for (const { range } of e.changes) {
					shouldFinishSession = !Range.areIntersectingOrTouching(range, wholeRange.value);
				}
			}

			this._session!.recordExternalEditOccurred(shouldFinishSession);

			if (shouldFinishSession) {
				this._log('text changed outside of whole range, FINISH session');
				this.finishExistingSession();
			}
		}));

		this._sessionStore.add(this._session.chatModel.onDidChange(async e => {
			if (e.kind === 'removeRequest') {
				// TODO@jrieken there is still some work left for when a request "in the middle"
				// is removed. We will undo all changes till that point but not remove those
				// later request
				await this._session!.undoChangesUntil(e.requestId);
			}
		}));

		// #region DEBT
		// DEBT@jrieken https://github.com/microsoft/vscode/issues/218819
		// REMOVE when agents are adopted
		this._sessionStore.add(this._languageFeatureService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'inline chat commands',
			triggerCharacters: ['/'],
			provideCompletionItems: (model, position, context, token) => {
				if (position.lineNumber !== 1) {
					return undefined;
				}
				if (!this._session || !this._session.agent.slashCommands) {
					return undefined;
				}
				const widget = this._chatWidgetService.getWidgetByInputUri(model.uri);
				if (widget !== this._ui.value.zone.widget.chatWidget && widget !== this._ui.value.content.chatWidget) {
					return undefined;
				}

				const result: CompletionList = { suggestions: [], incomplete: false };
				for (const command of this._session.agent.slashCommands) {
					const withSlash = `/${command.name}`;
					result.suggestions.push({
						label: { label: withSlash, description: command.description ?? '' },
						kind: CompletionItemKind.Text,
						insertText: `${withSlash} `,
						range: Range.fromPositions(new Position(1, 1), position),
					});
				}

				return result;
			}
		}));

		const updateSlashDecorations = (collection: IEditorDecorationsCollection, model: ITextModel) => {

			const newDecorations: IModelDeltaDecoration[] = [];
			for (const command of (this._session?.agent.slashCommands ?? []).sort((a, b) => b.name.length - a.name.length)) {
				const withSlash = `/${command.name}`;
				const firstLine = model.getLineContent(1);
				if (firstLine.match(new RegExp(`^${escapeRegExpCharacters(withSlash)}(\\s|$)`))) {
					newDecorations.push({
						range: new Range(1, 1, 1, withSlash.length + 1),
						options: {
							description: 'inline-chat-slash-command',
							inlineClassName: 'inline-chat-slash-command',
						}
					});

					// inject detail when otherwise empty
					if (firstLine.trim() === `/${command.name}`) {
						newDecorations.push({
							range: new Range(1, withSlash.length, 1, withSlash.length),
							options: {
								description: 'inline-chat-slash-command-detail',
								after: {
									content: `${command.description}`,
									inlineClassName: 'inline-chat-slash-command-detail'
								}
							}
						});
					}
					break;
				}
			}
			collection.set(newDecorations);
		};
		const inputInputEditor = this._ui.value.content.chatWidget.inputEditor;
		const zoneInputEditor = this._ui.value.zone.widget.chatWidget.inputEditor;
		const inputDecorations = inputInputEditor.createDecorationsCollection();
		const zoneDecorations = zoneInputEditor.createDecorationsCollection();
		this._sessionStore.add(inputInputEditor.onDidChangeModelContent(() => updateSlashDecorations(inputDecorations, inputInputEditor.getModel()!)));
		this._sessionStore.add(zoneInputEditor.onDidChangeModelContent(() => updateSlashDecorations(zoneDecorations, zoneInputEditor.getModel()!)));
		this._sessionStore.add(toDisposable(() => {
			inputDecorations.clear();
			zoneDecorations.clear();
		}));

		//#endregion ------- DEBT

		if (!this._session.chatModel.hasRequests) {
			return State.WAIT_FOR_INPUT;
		} else if (options.isUnstashed) {
			delete options.isUnstashed;
			return State.SHOW_RESPONSE;
		} else {
			return State.SHOW_RESPONSE;
		}
	}

	private async [State.WAIT_FOR_INPUT](options: InlineChatRunOptions): Promise<State.ACCEPT | State.CANCEL | State.PAUSE | State.WAIT_FOR_INPUT | State.SHOW_REQUEST> {
		assertType(this._session);
		assertType(this._strategy);

		this._updatePlaceholder();

		if (options.message) {
			this.updateInput(options.message);
			aria.alert(options.message);
			delete options.message;
			this._showWidget(false);
		}

		let message = Message.NONE;
		let request: IChatRequestModel | undefined;

		const barrier = new Barrier();
		const store = new DisposableStore();
		store.add(this._session.chatModel.onDidChange(e => {
			if (e.kind === 'addRequest') {
				request = e.request;
				message = Message.ACCEPT_INPUT;
				barrier.open();
			}
		}));
		store.add(this._strategy.onDidAccept(() => this.acceptSession()));
		store.add(this._strategy.onDidDiscard(() => this.cancelSession()));
		store.add(Event.once(this._messages.event)(m => {
			this._log('state=_waitForInput) message received', m);
			message = m;
			barrier.open();
		}));

		if (options.autoSend) {
			delete options.autoSend;
			this._showWidget(false);
			this._ui.value.zone.widget.chatWidget.acceptInput();
		}

		await barrier.wait();
		store.dispose();


		if (message & (Message.CANCEL_INPUT | Message.CANCEL_SESSION)) {
			return State.CANCEL;
		}

		if (message & Message.PAUSE_SESSION) {
			return State.PAUSE;
		}

		if (message & Message.ACCEPT_SESSION) {
			this._ui.value.zone.widget.selectAll(false);
			return State.ACCEPT;
		}

		if (!request?.message.text) {
			return State.WAIT_FOR_INPUT;
		}

		this._session.addInput(new SessionPrompt(request, this._editor.getModel()!.getAlternativeVersionId()));

		return State.SHOW_REQUEST;
	}


	private async [State.SHOW_REQUEST](): Promise<State.SHOW_RESPONSE | State.CANCEL | State.PAUSE | State.ACCEPT | State.WAIT_FOR_INPUT> {
		assertType(this._session);
		assertType(this._session.chatModel.requestInProgress);

		this._ctxRequestInProgress.set(true);

		const { chatModel } = this._session;
		const request: IChatRequestModel | undefined = chatModel.getRequests().at(-1);

		assertType(request);
		assertType(request.response);

		this._showWidget(false);
		// this._ui.value.zone.widget.value = request.message.text;
		this._ui.value.zone.widget.selectAll(false);
		this._ui.value.zone.widget.updateInfo('');

		const { response } = request;
		const responsePromise = new DeferredPromise<void>();

		const store = new DisposableStore();

		const progressiveEditsCts = store.add(new CancellationTokenSource());
		const progressiveEditsAvgDuration = new MovingAverage();
		const progressiveEditsClock = StopWatch.create();
		const progressiveEditsQueue = new Queue();

		let next: State.SHOW_RESPONSE | State.SHOW_REQUEST | State.CANCEL | State.PAUSE | State.ACCEPT | State.WAIT_FOR_INPUT = State.SHOW_RESPONSE;
		store.add(Event.once(this._messages.event)(message => {
			this._log('state=_makeRequest) message received', message);
			this._chatService.cancelCurrentRequestForSession(chatModel.sessionId);
			if (message & Message.CANCEL_SESSION) {
				next = State.CANCEL;
			} else if (message & Message.PAUSE_SESSION) {
				next = State.PAUSE;
			} else if (message & Message.ACCEPT_SESSION) {
				next = State.ACCEPT;
			}
		}));

		store.add(chatModel.onDidChange(e => {
			if (e.kind === 'removeRequest' && e.requestId === request.id) {
				progressiveEditsCts.cancel();
				responsePromise.complete();
				if (e.reason === ChatRequestRemovalReason.Resend) {
					next = State.SHOW_REQUEST;
				} else {
					next = State.CANCEL;
				}
			}
		}));

		// cancel the request when the user types
		store.add(this._ui.value.zone.widget.chatWidget.inputEditor.onDidChangeModelContent(() => {
			this._chatService.cancelCurrentRequestForSession(chatModel.sessionId);
		}));

		let lastLength = 0;
		let isFirstChange = true;

		const sha1 = new DefaultModelSHA1Computer();
		const textModel0Sha1 = sha1.canComputeSHA1(this._session.textModel0)
			? sha1.computeSHA1(this._session.textModel0)
			: generateUuid();
		const editState: IChatTextEditGroupState = { sha1: textModel0Sha1, applied: 0 };
		let localEditGroup: IChatTextEditGroup | undefined;

		// apply edits
		const handleResponse = () => {

			this._updateCtxResponseType();

			if (!localEditGroup) {
				localEditGroup = <IChatTextEditGroup | undefined>response.response.value.find(part => part.kind === 'textEditGroup' && isEqual(part.uri, this._session?.textModelN.uri));
			}

			if (localEditGroup) {

				localEditGroup.state ??= editState;

				const edits = localEditGroup.edits;
				const newEdits = edits.slice(lastLength);
				if (newEdits.length > 0) {
					// NEW changes
					lastLength = edits.length;
					progressiveEditsAvgDuration.update(progressiveEditsClock.elapsed());
					progressiveEditsClock.reset();

					progressiveEditsQueue.queue(async () => {

						const startThen = this._session!.wholeRange.value.getStartPosition();

						// making changes goes into a queue because otherwise the async-progress time will
						// influence the time it takes to receive the changes and progressive typing will
						// become infinitely fast
						for (const edits of newEdits) {
							await this._makeChanges(edits, {
								duration: progressiveEditsAvgDuration.value,
								token: progressiveEditsCts.token
							}, isFirstChange);

							isFirstChange = false;
						}

						// reshow the widget if the start position changed or shows at the wrong position
						const startNow = this._session!.wholeRange.value.getStartPosition();
						if (!startNow.equals(startThen) || !this._ui.value.zone.position?.equals(startNow)) {
							this._showWidget(false, startNow.delta(-1));
						}
					});
				}
			}

			if (response.isCanceled) {
				progressiveEditsCts.cancel();
				responsePromise.complete();

			} else if (response.isComplete) {
				responsePromise.complete();
			}
		};
		store.add(response.onDidChange(handleResponse));
		handleResponse();

		// (1) we must wait for the request to finish
		// (2) we must wait for all edits that came in via progress to complete
		await responsePromise.p;
		await progressiveEditsQueue.whenIdle();


		if (response.isCanceled) {
			//
			await this._session.undoChangesUntil(response.requestId);
		}

		store.dispose();

		const diff = await this._editorWorkerService.computeDiff(this._session.textModel0.uri, this._session.textModelN.uri, { computeMoves: false, maxComputationTimeMs: Number.MAX_SAFE_INTEGER, ignoreTrimWhitespace: false }, 'advanced');
		this._session.wholeRange.fixup(diff?.changes ?? []);
		await this._session.hunkData.recompute(editState, diff);

		this._ctxRequestInProgress.set(false);

		return next;
	}

	private async[State.SHOW_RESPONSE](): Promise<State.WAIT_FOR_INPUT> {
		assertType(this._session);
		assertType(this._strategy);

		const { response } = this._session.lastExchange!;


		let newPosition: Position | undefined;

		if (response instanceof EmptyResponse) {
			// show status message
			const status = localize('empty', "No results, please refine your input and try again");
			this._ui.value.zone.widget.updateStatus(status, { classes: ['warn'] });
			return State.WAIT_FOR_INPUT;

		} else if (response instanceof ErrorResponse) {
			// show error
			if (!response.isCancellation) {
				this._ui.value.zone.widget.updateStatus(response.message, { classes: ['error'] });
				this._strategy?.cancel();
			}

		} else if (response instanceof ReplyResponse) {
			// real response -> complex...
			this._ui.value.zone.widget.updateStatus('');

			const position = await this._strategy.renderChanges();
			if (position) {
				// if the selection doesn't start far off we keep the widget at its current position
				// because it makes reading this nicer
				const selection = this._editor.getSelection();
				if (selection?.containsPosition(position)) {
					if (position.lineNumber - selection.startLineNumber > 8) {
						newPosition = position;
					}
				} else {
					newPosition = position;
				}
			}
		}
		this._showWidget(false, newPosition);

		return State.WAIT_FOR_INPUT;
	}

	private async[State.PAUSE]() {

		this._resetWidget();

		this._strategy?.dispose?.();
		this._session = undefined;
	}

	private async[State.ACCEPT]() {
		assertType(this._session);
		assertType(this._strategy);
		this._sessionStore.clear();

		try {
			await this._strategy.apply();
		} catch (err) {
			this._dialogService.error(localize('err.apply', "Failed to apply changes.", toErrorMessage(err)));
			this._log('FAILED to apply changes');
			this._log(err);
		}

		this._inlineChatSessionService.releaseSession(this._session);

		this._resetWidget();

		this._strategy?.dispose();
		this._strategy = undefined;
		this._session = undefined;
	}

	private async[State.CANCEL]() {
		if (this._session) {
			// assertType(this._session);
			assertType(this._strategy);
			this._sessionStore.clear();

			// only stash sessions that were not unstashed, not "empty", and not interacted with
			const shouldStash = !this._session.isUnstashed && this._session.chatModel.hasRequests && this._session.hunkData.size === this._session.hunkData.pending;
			let undoCancelEdits: IValidEditOperation[] = [];
			try {
				undoCancelEdits = this._strategy.cancel();
			} catch (err) {
				this._dialogService.error(localize('err.discard', "Failed to discard changes.", toErrorMessage(err)));
				this._log('FAILED to discard changes');
				this._log(err);
			}

			this._stashedSession.clear();
			if (shouldStash) {
				this._stashedSession.value = this._inlineChatSessionService.stashSession(this._session, this._editor, undoCancelEdits);
			} else {
				this._inlineChatSessionService.releaseSession(this._session);
			}
		}

		this._resetWidget();

		this._strategy?.dispose();
		this._strategy = undefined;
		this._session = undefined;
	}

	// ----

	private _showWidget(initialRender: boolean = false, position?: Position) {
		assertType(this._editor.hasModel());
		this._ctxVisible.set(true);

		let widgetPosition: Position;
		if (position) {
			// explicit position wins
			widgetPosition = position;
		} else if (this._ui.rawValue?.zone?.position) {
			// already showing - special case of line 1
			if (this._ui.rawValue?.zone.position.lineNumber === 1) {
				widgetPosition = this._ui.rawValue?.zone.position.delta(-1);
			} else {
				widgetPosition = this._ui.rawValue?.zone.position;
			}
		} else {
			// default to ABOVE the selection
			widgetPosition = this._editor.getSelection().getStartPosition().delta(-1);
		}

		if (this._session && !position && (this._session.hasChangedText || this._session.chatModel.hasRequests)) {
			widgetPosition = this._session.wholeRange.value.getStartPosition().delta(-1);
		}

		if (this._ui.rawValue?.zone?.position) {
			this._ui.value.zone.updatePositionAndHeight(widgetPosition);

		} else if (initialRender) {
			const selection = this._editor.getSelection();
			widgetPosition = selection.getStartPosition();
			this._ui.value.content.show(widgetPosition);

		} else {
			this._ui.value.content.hide();
			this._ui.value.zone.show(widgetPosition);
			if (this._session) {
				this._ui.value.zone.widget.setChatModel(this._session.chatModel);
			}
		}

		return widgetPosition;
	}

	private _resetWidget() {
		this._sessionStore.clear();
		this._ctxVisible.reset();
		this._ctxUserDidEdit.reset();

		this._ui.rawValue?.content.hide();
		this._ui.rawValue?.zone?.hide();

		// Return focus to the editor only if the current focus is within the editor widget
		if (this._editor.hasWidgetFocus()) {
			this._editor.focus();
		}
	}

	private _updateCtxResponseType(): void {

		if (!this._session) {
			this._ctxResponseType.set(InlineChatResponseType.None);
			return;
		}

		const hasLocalEdit = (response: IResponse): boolean => {
			return response.value.some(part => part.kind === 'textEditGroup' && isEqual(part.uri, this._session?.textModelN.uri));
		};

		let responseType = InlineChatResponseType.None;
		for (const request of this._session.chatModel.getRequests()) {
			if (!request.response) {
				continue;
			}
			responseType = InlineChatResponseType.Messages;
			if (hasLocalEdit(request.response.response)) {
				responseType = InlineChatResponseType.MessagesAndEdits;
				break; // no need to check further
			}
		}
		this._ctxResponseType.set(responseType);
	}

	private async _makeChanges(edits: TextEdit[], opts: ProgressingEditsOptions | undefined, undoStopBefore: boolean) {
		assertType(this._session);
		assertType(this._strategy);

		const moreMinimalEdits = await this._editorWorkerService.computeMoreMinimalEdits(this._session.textModelN.uri, edits);
		this._log('edits from PROVIDER and after making them MORE MINIMAL', this._session.agent.extensionId, edits, moreMinimalEdits);

		if (moreMinimalEdits?.length === 0) {
			// nothing left to do
			return;
		}

		const actualEdits = !opts && moreMinimalEdits ? moreMinimalEdits : edits;
		const editOperations = actualEdits.map(TextEdit.asEditOperation);

		const editsObserver: IEditObserver = {
			start: () => this._session!.hunkData.ignoreTextModelNChanges = true,
			stop: () => this._session!.hunkData.ignoreTextModelNChanges = false,
		};

		this._inlineChatSavingService.markChanged(this._session);
		if (opts) {
			await this._strategy.makeProgressiveChanges(editOperations, editsObserver, opts, undoStopBefore);
		} else {
			await this._strategy.makeChanges(editOperations, editsObserver, undoStopBefore);
		}
	}

	private _forcedPlaceholder: string | undefined = undefined;

	private _updatePlaceholder(): void {
		this._ui.value.zone.widget.placeholder = this._getPlaceholderText();
	}

	private _getPlaceholderText(): string {
		return this._forcedPlaceholder ?? this._session?.agent.description ?? '';
	}

	// ---- controller API

	showSaveHint(): void {
		const status = localize('savehint', "Accept or discard changes to continue saving");
		this._ui.value.zone.widget.updateStatus(status, { classes: ['warn'] });
	}

	acceptInput() {
		return this.chatWidget.acceptInput();
	}

	updateInput(text: string, selectAll = true): void {

		this._ui.value.content.chatWidget.setInput(text);
		this._ui.value.zone.widget.chatWidget.setInput(text);
		if (selectAll) {
			const newSelection = new Selection(1, 1, Number.MAX_SAFE_INTEGER, 1);
			this._ui.value.content.chatWidget.inputEditor.setSelection(newSelection);
			this._ui.value.zone.widget.chatWidget.inputEditor.setSelection(newSelection);
		}
	}

	cancelCurrentRequest(): void {
		this._messages.fire(Message.CANCEL_INPUT | Message.CANCEL_REQUEST);
	}

	arrowOut(up: boolean): void {
		if (this._ui.value.zone.position && this._editor.hasModel()) {
			const { column } = this._editor.getPosition();
			const { lineNumber } = this._ui.value.zone.position;
			const newLine = up ? lineNumber : lineNumber + 1;
			this._editor.setPosition({ lineNumber: newLine, column });
			this._editor.focus();
		}
	}

	focus(): void {
		this._ui.value.zone.widget.focus();
	}

	hasFocus(): boolean {
		return this._ui.value.zone.widget.hasFocus();
	}

	moveHunk(next: boolean) {
		this.focus();
		this._strategy?.move?.(next);
	}

	async viewInChat() {
		if (!this._strategy || !this._session) {
			return;
		}

		let someApplied = false;
		let lastEdit: IChatTextEditGroup | undefined;

		const uri = this._editor.getModel()?.uri;
		const requests = this._session.chatModel.getRequests();
		for (const request of requests) {
			if (!request.response) {
				continue;
			}
			for (const part of request.response.response.value) {
				if (part.kind === 'textEditGroup' && isEqual(part.uri, uri)) {
					// fully or partially applied edits
					someApplied = someApplied || Boolean(part.state?.applied);
					lastEdit = part;
				}
			}
		}

		const doEdits = this._strategy.cancel();

		if (someApplied) {
			assertType(lastEdit);
			lastEdit.edits = [doEdits];
		}

		await this._instaService.invokeFunction(moveToPanelChat, this._session?.chatModel);

		this.cancelSession();
	}

	toggleDiff() {
		this._strategy?.toggleDiff?.();
	}

	acceptSession(): void {
		const response = this._session?.chatModel.getRequests().at(-1)?.response;
		if (response) {
			this._chatService.notifyUserAction({
				sessionId: response.session.sessionId,
				requestId: response.requestId,
				agentId: response.agent?.id,
				result: response.result,
				action: {
					kind: 'inlineChat',
					action: 'accepted'
				}
			});
		}
		this._messages.fire(Message.ACCEPT_SESSION);
	}

	acceptHunk() {
		return this._strategy?.acceptHunk();
	}

	discardHunk() {
		return this._strategy?.discardHunk();
	}

	async cancelSession() {
		const response = this._session?.chatModel.getRequests().at(-1)?.response;
		if (response) {
			this._chatService.notifyUserAction({
				sessionId: response.session.sessionId,
				requestId: response.requestId,
				agentId: response.agent?.id,
				result: response.result,
				action: {
					kind: 'inlineChat',
					action: 'discarded'
				}
			});
		}

		this._messages.fire(Message.CANCEL_SESSION);
	}

	finishExistingSession(): void {
		if (this._session) {
			if (this._session.editMode === EditMode.Preview) {
				this._log('finishing existing session, using CANCEL', this._session.editMode);
				this.cancelSession();
			} else {
				this._log('finishing existing session, using APPLY', this._session.editMode);
				this.acceptSession();
			}
		}
	}

	unstashLastSession(): Session | undefined {
		const result = this._stashedSession.value?.unstash();
		if (result) {
			this._inlineChatSavingService.markChanged(result);
		}
		return result;
	}

	joinCurrentRun(): Promise<void> | undefined {
		return this._currentRun;
	}
}

async function moveToPanelChat(accessor: ServicesAccessor, model: ChatModel | undefined) {

	const viewsService = accessor.get(IViewsService);
	const chatService = accessor.get(IChatService);

	const widget = await showChatView(viewsService);

	if (widget && widget.viewModel && model) {
		for (const request of model.getRequests().slice()) {
			await chatService.adoptRequest(widget.viewModel.model.sessionId, request);
		}
		widget.focusLastMessage();
	}
}
