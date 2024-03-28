/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as aria from 'vs/base/browser/ui/aria/aria';
import { Barrier, DeferredPromise, Queue, raceCancellation } from 'vs/base/common/async';
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
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
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
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatAgentLocation, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { chatAgentLeader, ChatRequestAgentSubcommandPart, ChatRequestSlashCommandPart } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IInlineChatSavingService } from './inlineChatSavingService';
import { EmptyResponse, ErrorResponse, ReplyResponse, Session, SessionPrompt } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { IInlineChatSessionService } from './inlineChatSessionService';
import { EditModeStrategy, IEditObserver, LiveStrategy, PreviewStrategy, ProgressingEditsOptions } from 'vs/workbench/contrib/inlineChat/browser/inlineChatStrategies';
import { InlineChatZoneWidget } from './inlineChatZoneWidget';
import { CTX_INLINE_CHAT_DID_EDIT, CTX_INLINE_CHAT_LAST_FEEDBACK, CTX_INLINE_CHAT_RESPONSE_TYPES, CTX_INLINE_CHAT_SUPPORT_ISSUE_REPORTING, CTX_INLINE_CHAT_USER_DID_EDIT, CTX_INLINE_CHAT_VISIBLE, EditMode, INLINE_CHAT_ID, InlineChatConfigKeys, InlineChatResponseFeedbackKind, InlineChatResponseTypes } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { StashedSession } from './inlineChatSession';
import { IModelDeltaDecoration, ITextModel, IValidEditOperation } from 'vs/editor/common/model';
import { InlineChatContentWidget } from 'vs/workbench/contrib/inlineChat/browser/inlineChatContentWidget';
import { MessageController } from 'vs/editor/contrib/message/browser/messageController';
import { tail } from 'vs/base/common/arrays';
import { IChatRequestModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { InlineChatError } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSessionServiceImpl';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { ChatInputPart } from 'vs/workbench/contrib/chat/browser/chatInputPart';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';

export const enum State {
	CREATE_SESSION = 'CREATE_SESSION',
	INIT_UI = 'INIT_UI',
	WAIT_FOR_INPUT = 'WAIT_FOR_INPUT',
	SHOW_REQUEST = 'SHOW_REQUEST',
	APPLY_RESPONSE = 'APPLY_RESPONSE',
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

	static isInteractiveEditorOptions(options: any): options is InlineChatRunOptions {
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
	private readonly _input: Lazy<InlineChatContentWidget>;
	private readonly _zone: Lazy<InlineChatZoneWidget>;

	private readonly _ctxVisible: IContextKey<boolean>;
	private readonly _ctxResponseTypes: IContextKey<undefined | InlineChatResponseTypes>;
	private readonly _ctxDidEdit: IContextKey<boolean>;
	private readonly _ctxUserDidEdit: IContextKey<boolean>;
	private readonly _ctxLastFeedbackKind: IContextKey<'helpful' | 'unhelpful' | ''>;
	private readonly _ctxSupportIssueReporting: IContextKey<boolean>;

	private _messages = this._store.add(new Emitter<Message>());

	private readonly _onWillStartSession = this._store.add(new Emitter<void>());
	readonly onWillStartSession = this._onWillStartSession.event;

	readonly onDidAcceptInput = Event.filter(this._messages.event, m => m === Message.ACCEPT_INPUT, this._store);
	readonly onDidCancelInput = Event.filter(this._messages.event, m => m === Message.CANCEL_INPUT || m === Message.CANCEL_SESSION, this._store);

	private readonly _sessionStore = this._store.add(new DisposableStore());
	private readonly _stashedSession = this._store.add(new MutableDisposable<StashedSession>());
	private _session?: Session;
	private _strategy?: EditModeStrategy;

	private _nextAttempt: number = 0;
	private _nextWithIntentDetection: boolean = true;

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
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IChatService private readonly _chatService: IChatService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@ICommandService private readonly _commandService: ICommandService,
		@ILanguageFeaturesService private readonly _languageFeatureService: ILanguageFeaturesService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
	) {
		this._ctxVisible = CTX_INLINE_CHAT_VISIBLE.bindTo(contextKeyService);
		this._ctxDidEdit = CTX_INLINE_CHAT_DID_EDIT.bindTo(contextKeyService);
		this._ctxUserDidEdit = CTX_INLINE_CHAT_USER_DID_EDIT.bindTo(contextKeyService);
		this._ctxResponseTypes = CTX_INLINE_CHAT_RESPONSE_TYPES.bindTo(contextKeyService);
		this._ctxLastFeedbackKind = CTX_INLINE_CHAT_LAST_FEEDBACK.bindTo(contextKeyService);
		this._ctxSupportIssueReporting = CTX_INLINE_CHAT_SUPPORT_ISSUE_REPORTING.bindTo(contextKeyService);

		this._input = new Lazy(() => this._store.add(_instaService.createInstance(InlineChatContentWidget, this._editor)));
		this._zone = new Lazy(() => this._store.add(_instaService.createInstance(InlineChatZoneWidget, this._editor)));

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
			this._messages.fire((this._session?.lastExchange
				? Message.PAUSE_SESSION
				: Message.CANCEL_SESSION)
			);
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
		return this._zone.value.widget.responseContent;
	}

	getId(): string {
		return INLINE_CHAT_ID;
	}

	private _getMode(): EditMode {
		return this._configurationService.getValue<EditMode>(InlineChatConfigKeys.Mode);
	}

	getWidgetPosition(): Position | undefined {
		return this._zone.value.position;
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
					this._zone.value.widget.updateProgress(true);
					this._zone.value.widget.updateInfo(localize('welcome.2', "Getting ready..."));
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

		// create a new strategy
		switch (session.editMode) {
			case EditMode.Preview:
				this._strategy = this._instaService.createInstance(PreviewStrategy, session, this._editor, this._zone.value);
				break;
			case EditMode.Live:
			default:
				this._strategy = this._instaService.createInstance(LiveStrategy, session, this._editor, this._zone.value);
				break;
		}

		if (session.session.input) {
			options.message = session.session.input;
		}
		this._session = session;
		return State.INIT_UI;
	}

	private async [State.INIT_UI](options: InlineChatRunOptions): Promise<State.WAIT_FOR_INPUT | State.SHOW_RESPONSE | State.APPLY_RESPONSE> {
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

		this._sessionStore.add(this._input.value.onDidBlur(() => this.cancelSession()));

		this._input.value.setSession(this._session);
		// this._zone.value.widget.updateSlashCommands(this._session.session.slashCommands ?? []);
		this._updatePlaceholder();
		const message = this._session.session.message ?? localize('welcome.1', "AI-generated code may be incorrect");


		this._zone.value.widget.updateInfo(message);

		this._showWidget(!this._session.lastExchange);

		this._sessionStore.add(this._editor.onDidChangeModel((e) => {
			const msg = this._session?.lastExchange
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

		this._sessionStore.add(this._session.chatModel.onDidChange(e => {
			if (e.kind === 'addRequest' && e.request.response) {
				this._zone.value.widget.updateProgress(true);

				const listener = e.request.response.onDidChange(() => {

					if (e.request.response?.isCanceled || e.request.response?.isComplete) {
						this._zone.value.widget.updateProgress(false);
						listener.dispose();
					}
				});
			}
		}));

		// Update context key
		this._ctxSupportIssueReporting.set(this._session.provider.supportIssueReporting ?? false);

		// #region DEBT
		// DEBT@jrieken
		// REMOVE when agents are adopted
		this._sessionStore.add(this._languageFeatureService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'inline chat commands',
			triggerCharacters: ['/'],
			provideCompletionItems: (model, position, context, token) => {
				if (position.lineNumber !== 1) {
					return undefined;
				}
				if (!this._session || !this._session.session.slashCommands) {
					return undefined;
				}
				const widget = this._chatWidgetService.getWidgetByInputUri(model.uri);
				if (widget !== this._zone.value.widget.chatWidget && widget !== this._input.value.chatWidget) {
					return undefined;
				}

				const result: CompletionList = { suggestions: [], incomplete: false };
				for (const command of this._session.session.slashCommands) {
					const withSlash = `/${command.command}`;
					result.suggestions.push({
						label: { label: withSlash, description: command.detail ?? '' },
						kind: CompletionItemKind.Text,
						insertText: withSlash,
						range: Range.fromPositions(new Position(1, 1), position),
						command: command.executeImmediately ? { id: 'workbench.action.chat.acceptInput', title: withSlash } : undefined
					});
				}

				return result;
			}
		}));

		const updateSlashDecorations = (collection: IEditorDecorationsCollection, model: ITextModel) => {

			const newDecorations: IModelDeltaDecoration[] = [];
			for (const command of (this._session?.session.slashCommands ?? []).sort((a, b) => b.command.length - a.command.length)) {
				const withSlash = `/${command.command}`;
				const firstLine = model.getLineContent(1);
				if (firstLine.startsWith(withSlash)) {
					newDecorations.push({
						range: new Range(1, 1, 1, withSlash.length + 1),
						options: {
							description: 'inline-chat-slash-command',
							inlineClassName: 'inline-chat-slash-command',
							after: {
								// Force some space between slash command and placeholder
								content: ' '
							}
						}
					});

					// inject detail when otherwise empty
					if (firstLine.trim() === `/${command.command}`) {
						newDecorations.push({
							range: new Range(1, withSlash.length, 1, withSlash.length),
							options: {
								description: 'inline-chat-slash-command-detail',
								after: {
									content: `${command.detail}`,
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
		const inputInputEditor = this._input.value.chatWidget.inputEditor;
		const zoneInputEditor = this._zone.value.widget.chatWidget.inputEditor;
		const inputDecorations = inputInputEditor.createDecorationsCollection();
		const zoneDecorations = zoneInputEditor.createDecorationsCollection();
		this._sessionStore.add(inputInputEditor.onDidChangeModelContent(() => updateSlashDecorations(inputDecorations, inputInputEditor.getModel()!)));
		this._sessionStore.add(zoneInputEditor.onDidChangeModelContent(() => updateSlashDecorations(zoneDecorations, zoneInputEditor.getModel()!)));
		this._sessionStore.add(toDisposable(() => {
			inputDecorations.clear();
			zoneDecorations.clear();
		}));

		//#endregion ------- DEBT

		if (!this._session.lastExchange) {
			return State.WAIT_FOR_INPUT;
		} else if (options.isUnstashed) {
			delete options.isUnstashed;
			return State.APPLY_RESPONSE;
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
			this._zone.value.widget.chatWidget.acceptInput();
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
			this._zone.value.widget.selectAll(false);
			return State.ACCEPT;
		}

		if (!request?.message.text) {
			return State.WAIT_FOR_INPUT;
		}

		const input = request.message.text;
		this._zone.value.widget.value = input;

		// slash command referring
		let slashCommandLike = request.message.parts.find(part => part instanceof ChatRequestAgentSubcommandPart || part instanceof ChatRequestSlashCommandPart);
		const refer = this._session.session.slashCommands?.some(value => {
			if (value.refer) {
				if (slashCommandLike?.text === `/${value.command}`) {
					return true;
				}
				if (request?.message.text.startsWith(`/${value.command}`)) {
					slashCommandLike = new ChatRequestSlashCommandPart(new OffsetRange(0, 1), new Range(1, 1, 1, 1), { command: value.command, detail: value.detail ?? '' });
					return true;
				}
			}
			return false;
		});
		if (refer && slashCommandLike && !this._session.lastExchange) {
			this._log('[IE] seeing refer command, continuing outside editor', this._session.provider.extensionId);

			// cancel this request
			this._chatService.cancelCurrentRequestForSession(request.session.sessionId);

			this._editor.setSelection(this._session.wholeRange.value);
			let massagedInput = input;
			const withoutSubCommandLeader = slashCommandLike.text.slice(1);
			for (const agent of this._chatAgentService.getActivatedAgents()) {
				if (agent.locations.includes(ChatAgentLocation.Panel)) {
					const commands = agent.slashCommands;
					if (commands.find((command) => withoutSubCommandLeader.startsWith(command.name))) {
						massagedInput = `${chatAgentLeader}${agent.name} ${slashCommandLike.text}`;
						break;
					}
				}
			}
			// if agent has a refer command, massage the input to include the agent name
			await this._instaService.invokeFunction(sendRequest, massagedInput);

			return State.ACCEPT;
		}

		this._session.addInput(new SessionPrompt(input, this._nextAttempt, this._nextWithIntentDetection));

		// we globally store the next attempt and intent detection flag
		// to be able to use it in the next request. This is because they
		// aren't part of the chat widget state and we need to remembered here
		this._nextAttempt = 0;
		this._nextWithIntentDetection = true;


		return State.SHOW_REQUEST;
	}


	private async [State.SHOW_REQUEST](options: InlineChatRunOptions): Promise<State.APPLY_RESPONSE | State.CANCEL | State.PAUSE | State.ACCEPT> {
		assertType(this._session);
		assertType(this._session.lastInput);

		const request: IChatRequestModel | undefined = tail(this._session.chatModel.getRequests());

		assertType(request);
		assertType(request.response);

		this._showWidget(false);
		this._zone.value.widget.value = request.message.text;
		this._zone.value.widget.selectAll(false);
		this._zone.value.widget.updateInfo('');

		const { response } = request;
		const responsePromise = new DeferredPromise<void>();

		const store = new DisposableStore();

		const progressiveEditsCts = store.add(new CancellationTokenSource());
		const progressiveEditsAvgDuration = new MovingAverage();
		const progressiveEditsClock = StopWatch.create();
		const progressiveEditsQueue = new Queue();

		let lastLength = 0;


		let message = Message.NONE;
		store.add(Event.once(this._messages.event)(m => {
			this._log('state=_makeRequest) message received', m);
			this._chatService.cancelCurrentRequestForSession(request.session.sessionId);
			message = m;
		}));

		// cancel the request when the user types
		store.add(this._zone.value.widget.chatWidget.inputEditor.onDidChangeModelContent(() => {
			this._chatService.cancelCurrentRequestForSession(request.session.sessionId);
		}));


		// apply edits
		store.add(response.onDidChange(() => {

			if (response.isCanceled) {
				progressiveEditsCts.cancel();
				responsePromise.complete();
				return;
			}

			if (response.isComplete) {
				responsePromise.complete();
				return;
			}

			// TODO@jrieken
			const editsShouldBeInstant = false;

			const edits = response.edits.get(this._session!.textModelN.uri) ?? [];
			const newEdits = edits.slice(lastLength);
			// console.log('NEW edits', newEdits, edits);
			if (newEdits.length === 0) {
				return; // NO change
			}
			lastLength = edits.length;
			progressiveEditsAvgDuration.update(progressiveEditsClock.elapsed());
			progressiveEditsClock.reset();

			progressiveEditsQueue.queue(async () => {

				const startThen = this._session!.wholeRange.value.getStartPosition();

				// making changes goes into a queue because otherwise the async-progress time will
				// influence the time it takes to receive the changes and progressive typing will
				// become infinitely fast
				await this._makeChanges(newEdits, editsShouldBeInstant
					? undefined
					: { duration: progressiveEditsAvgDuration.value, token: progressiveEditsCts.token }
				);

				// reshow the widget if the start position changed or shows at the wrong position
				const startNow = this._session!.wholeRange.value.getStartPosition();
				if (!startNow.equals(startThen) || !this._zone.value.position?.equals(startNow)) {
					this._showWidget(false, startNow.delta(-1));
				}
			});
		}));

		// (1) we must wait for the request to finish
		// (2) we must wait for all edits that came in via progress to complete
		await responsePromise.p;
		await progressiveEditsQueue.whenIdle();

		store.dispose();

		// todo@jrieken we can likely remove 'trackEdit'
		const diff = await this._editorWorkerService.computeDiff(this._session.textModel0.uri, this._session.textModelN.uri, { computeMoves: false, maxComputationTimeMs: Number.MAX_SAFE_INTEGER, ignoreTrimWhitespace: false }, 'advanced');
		this._session.wholeRange.fixup(diff?.changes ?? []);

		await this._session.hunkData.recompute();

		this._zone.value.widget.updateToolbar(true);

		if (message & Message.CANCEL_SESSION) {
			return State.CANCEL;
		} else if (message & Message.PAUSE_SESSION) {
			return State.PAUSE;
		} else if (message & Message.ACCEPT_SESSION) {
			return State.ACCEPT;
		} else {
			return State.APPLY_RESPONSE;
		}
	}

	private async[State.APPLY_RESPONSE](): Promise<State.SHOW_RESPONSE | State.CANCEL> {
		assertType(this._session);
		assertType(this._strategy);

		const { response } = this._session.lastExchange!;
		if (response instanceof ReplyResponse && response.workspaceEdit) {
			// this reply cannot be applied in the normal inline chat UI and needs to be handled off to workspace edit
			this._bulkEditService.apply(response.workspaceEdit, { showPreview: true });
			return State.CANCEL;
		}
		return State.SHOW_RESPONSE;
	}

	private async[State.SHOW_RESPONSE](): Promise<State.WAIT_FOR_INPUT> {
		assertType(this._session);
		assertType(this._strategy);

		const { response } = this._session.lastExchange!;

		let responseTypes: InlineChatResponseTypes | undefined;
		for (const { response } of this._session.exchanges) {

			const thisType = response instanceof ReplyResponse
				? response.responseType
				: undefined;

			if (responseTypes === undefined) {
				responseTypes = thisType;
			} else if (responseTypes !== thisType) {
				responseTypes = InlineChatResponseTypes.Mixed;
				break;
			}
		}
		this._ctxResponseTypes.set(responseTypes);
		this._ctxDidEdit.set(this._session.hasChangedText);

		let newPosition: Position | undefined;

		if (response instanceof EmptyResponse) {
			// show status message
			const status = localize('empty', "No results, please refine your input and try again");
			this._zone.value.widget.updateStatus(status, { classes: ['warn'] });
			return State.WAIT_FOR_INPUT;

		} else if (response instanceof ErrorResponse) {
			// show error
			if (!response.isCancellation) {
				this._zone.value.widget.updateStatus(response.message, { classes: ['error'] });
			}

		} else if (response instanceof ReplyResponse) {
			// real response -> complex...
			this._zone.value.widget.updateStatus('');
			this._zone.value.widget.updateToolbar(true);

			newPosition = await this._strategy.renderChanges(response);

			if (this._session.provider.provideFollowups) {
				const followupCts = new CancellationTokenSource();
				const msgListener = Event.once(this._messages.event)(() => {
					followupCts.cancel();
				});
				const followupTask = this._session.provider.provideFollowups(this._session.session, response.raw, followupCts.token);
				this._log('followup request started', this._session.provider.extensionId, this._session.session, response.raw);
				raceCancellation(Promise.resolve(followupTask), followupCts.token).then(followupReply => {
					if (followupReply && this._session) {
						this._log('followup request received', this._session.provider.extensionId, this._session.session, followupReply);
						this._zone.value.widget.updateFollowUps(followupReply, followup => {
							if (followup.kind === 'reply') {
								this.updateInput(followup.message);
								this.acceptInput();
							} else {
								this._commandService.executeCommand(followup.commandId, ...(followup.args ?? []));
							}
						});
					}
				}).finally(() => {
					msgListener.dispose();
					followupCts.dispose();
				});
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
			const shouldStash = !this._session.isUnstashed && !!this._session.lastExchange && this._session.hunkData.size === this._session.hunkData.pending;
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

		let widgetPosition: Position;
		if (position) {
			// explicit position wins
			widgetPosition = position;
		} else if (this._zone.rawValue?.position) {
			// already showing - special case of line 1
			if (this._zone.rawValue.position.lineNumber === 1) {
				widgetPosition = this._zone.rawValue.position.delta(-1);
			} else {
				widgetPosition = this._zone.rawValue.position;
			}
		} else {
			// default to ABOVE the selection
			widgetPosition = this._editor.getSelection().getStartPosition().delta(-1);
		}

		if (this._session && !position && (this._session.hasChangedText || this._session.lastExchange)) {
			widgetPosition = this._session.wholeRange.value.getStartPosition().delta(-1);
		}

		if (this._zone.rawValue?.position) {
			this._zone.value.updatePositionAndHeight(widgetPosition);

		} else if (initialRender) {
			const selection = this._editor.getSelection();
			widgetPosition = selection.getStartPosition();
			// TODO@jrieken we are not ready for this
			// widgetPosition = selection.getEndPosition();
			// if (Range.spansMultipleLines(selection) && widgetPosition.column === 1) {
			// 	// selection ends on "nothing" -> move up to match the
			// 	// rendered/visible part of the selection
			// 	widgetPosition = this._editor.getModel().validatePosition(widgetPosition.delta(-1, Number.MAX_SAFE_INTEGER));
			// }
			this._input.value.show(widgetPosition);

		} else {
			this._input.value.hide();
			this._zone.value.show(widgetPosition);
			if (this._session && this._zone.value.widget.chatWidget.viewModel?.model !== this._session.chatModel) {
				this._zone.value.widget.setChatModel(this._session.chatModel);
			}
		}

		if (this._session && this._zone.rawValue) {
			this._zone.rawValue.updateBackgroundColor(widgetPosition, this._session.wholeRange.value);
		}

		this._ctxVisible.set(true);
		return widgetPosition;
	}

	private _resetWidget() {
		this._sessionStore.clear();
		this._ctxVisible.reset();
		this._ctxDidEdit.reset();
		this._ctxUserDidEdit.reset();
		this._ctxLastFeedbackKind.reset();
		this._ctxSupportIssueReporting.reset();

		this._input.rawValue?.hide();
		this._zone.rawValue?.hide();

		// Return focus to the editor only if the current focus is within the editor widget
		if (this._editor.hasWidgetFocus()) {
			this._editor.focus();
		}
	}

	private async _makeChanges(edits: TextEdit[], opts: ProgressingEditsOptions | undefined) {
		assertType(this._session);
		assertType(this._strategy);

		const moreMinimalEdits = await this._editorWorkerService.computeMoreMinimalEdits(this._session.textModelN.uri, edits);
		this._log('edits from PROVIDER and after making them MORE MINIMAL', this._session.provider.extensionId, edits, moreMinimalEdits);

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
		this._session.wholeRange.trackEdits(editOperations);
		if (opts) {
			await this._strategy.makeProgressiveChanges(editOperations, editsObserver, opts);
		} else {
			await this._strategy.makeChanges(editOperations, editsObserver);
		}
		this._ctxDidEdit.set(this._session.hasChangedText);

	}

	private _forcedPlaceholder: string | undefined = undefined;

	private _updatePlaceholder(): void {
		this._zone.value.widget.placeholder = this._getPlaceholderText();
	}

	private _getPlaceholderText(): string {
		return this._forcedPlaceholder ?? this._session?.session.placeholder ?? '';
	}

	// ---- controller API

	showSaveHint(): void {
		const status = localize('savehint', "Accept or discard changes to continue saving");
		this._zone.value.widget.updateStatus(status, { classes: ['warn'] });
	}

	setPlaceholder(text: string): void {
		this._forcedPlaceholder = text;
		this._updatePlaceholder();
	}

	resetPlaceholder(): void {
		this._forcedPlaceholder = undefined;
		this._updatePlaceholder();
	}

	acceptInput(): void {
		if (this._input.value.isVisible) {
			this._input.value.chatWidget.acceptInput();
		} else {
			this._zone.value.widget.chatWidget.acceptInput();
		}
	}

	updateInput(text: string, selectAll = true): void {

		this._input.value.chatWidget.setInput(text);
		this._zone.value.widget.chatWidget.setInput(text);
		if (selectAll) {
			const newSelection = new Selection(1, 1, Number.MAX_SAFE_INTEGER, 1);
			this._input.value.chatWidget.inputEditor.setSelection(newSelection);
			this._zone.value.widget.chatWidget.inputEditor.setSelection(newSelection);
		}
	}

	getInput(): string {
		return this._input.value.isVisible
			? this._input.value.value
			: this._zone.value.widget.value;
	}

	async rerun(opts: { retry?: boolean; withoutIntentDetection?: boolean }) {
		if (this._session?.lastExchange && this._strategy) {
			const { lastExchange } = this._session;

			const request = tail(this._session.chatModel.getRequests());
			if (!request || !request.response?.isComplete) {
				return;
			}

			this._session.chatModel.removeRequest(request.id);

			if (lastExchange.response instanceof ReplyResponse) {
				try {
					this._session.hunkData.ignoreTextModelNChanges = true;
					await this._strategy.undoChanges(lastExchange.response.modelAltVersionId);
				} finally {
					this._session.hunkData.ignoreTextModelNChanges = false;
				}
			}

			if (opts.retry) {
				this._nextAttempt = lastExchange.prompt.attempt + 1;
			}
			if (opts.withoutIntentDetection) {
				this._nextWithIntentDetection = false;
			}

			this._zone.value.widget.chatWidget.acceptInput(request.message.text);
		}
	}

	cancelCurrentRequest(): void {
		this._messages.fire(Message.CANCEL_INPUT | Message.CANCEL_REQUEST);
	}

	arrowOut(up: boolean): void {
		if (this._zone.value.position && this._editor.hasModel()) {
			const { column } = this._editor.getPosition();
			const { lineNumber } = this._zone.value.position;
			const newLine = up ? lineNumber : lineNumber + 1;
			this._editor.setPosition({ lineNumber: newLine, column });
			this._editor.focus();
		}
	}

	focus(): void {
		this._zone.value.widget.focus();
	}

	hasFocus(): boolean {
		return this._zone.value.widget.hasFocus();
	}

	moveHunk(next: boolean) {
		this.focus();
		this._strategy?.move?.(next);
	}


	viewInChat() {
		if (this._session?.lastExchange?.response instanceof ReplyResponse) {
			this._instaService.invokeFunction(showMessageResponse, this._session.lastExchange.prompt.value, this._session.lastExchange.response.mdContent.value);
		}
	}

	toggleDiff() {
		this._strategy?.toggleDiff?.();
	}

	feedbackLast(kind: InlineChatResponseFeedbackKind) {
		if (this._session?.lastExchange && this._session.lastExchange.response instanceof ReplyResponse) {
			this._session.provider.handleInlineChatResponseFeedback?.(this._session.session, this._session.lastExchange.response.raw, kind);
			switch (kind) {
				case InlineChatResponseFeedbackKind.Helpful:
					this._ctxLastFeedbackKind.set('helpful');
					break;
				case InlineChatResponseFeedbackKind.Unhelpful:
					this._ctxLastFeedbackKind.set('unhelpful');
					break;
				default:
					break;
			}
			this._zone.value.widget.updateStatus('Thank you for your feedback!', { resetAfter: 1250 });
		}
	}

	createSnapshot(): void {
		if (this._session && !this._session.textModel0.equalsTextBuffer(this._session.textModelN.getTextBuffer())) {
			this._session.createSnapshot();
		}
	}

	acceptSession(): void {
		if (this._session?.lastExchange && this._session.lastExchange.response instanceof ReplyResponse) {
			this._session.provider.handleInlineChatResponseFeedback?.(this._session.session, this._session.lastExchange.response.raw, InlineChatResponseFeedbackKind.Accepted);
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

		let result: string | undefined;
		if (this._session) {

			const diff = await this._editorWorkerService.computeDiff(this._session.textModel0.uri, this._session.textModelN.uri, { ignoreTrimWhitespace: false, maxComputationTimeMs: 5000, computeMoves: false }, 'advanced');
			result = this._session.asChangedText(diff?.changes ?? []);

			if (this._session.lastExchange && this._session.lastExchange.response instanceof ReplyResponse) {
				this._session.provider.handleInlineChatResponseFeedback?.(this._session.session, this._session.lastExchange.response.raw, InlineChatResponseFeedbackKind.Undone);
			}
		}

		this._messages.fire(Message.CANCEL_SESSION);
		return result;
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

async function showMessageResponse(accessor: ServicesAccessor, query: string, response: string) {
	const chatService = accessor.get(IChatService);
	const chatAgentService = accessor.get(IChatAgentService);
	const agent = chatAgentService.getActivatedAgents().find(agent => agent.locations.includes(ChatAgentLocation.Panel) && agent.isDefault);
	if (!agent) {
		return;
	}

	const chatWidgetService = accessor.get(IChatWidgetService);
	const widget = await chatWidgetService.revealViewForProvider(agent.name);
	if (widget && widget.viewModel) {
		chatService.addCompleteRequest(widget.viewModel.sessionId, query, undefined, { message: response });
		widget.focusLastMessage();
	}
}

async function sendRequest(accessor: ServicesAccessor, query: string) {
	const widgetService = accessor.get(IChatWidgetService);
	const chatAgentService = accessor.get(IChatAgentService);
	const agent = chatAgentService.getActivatedAgents().find(agent => agent.locations.includes(ChatAgentLocation.Panel) && agent.isDefault);
	if (!agent) {
		return;
	}
	const widget = await widgetService.revealViewForProvider(agent.name);
	if (!widget) {
		return;
	}
	widget.focusInput();
	widget.acceptInput(query);
}
