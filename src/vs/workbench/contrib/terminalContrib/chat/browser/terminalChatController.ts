/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatCodeBlockContextProviderService, IChatWidget, showChatView } from '../../../chat/browser/chat.js';
import { IChatProgress, IChatService } from '../../../chat/common/chatService.js';
import { isDetachedTerminalInstance, ITerminalContribution, ITerminalInstance, ITerminalService, IXtermTerminal } from '../../../terminal/browser/terminal.js';
import { TerminalChatWidget } from './terminalChatWidget.js';

import { CancelablePromise, createCancelablePromise, DeferredPromise } from '../../../../../base/common/async.js';
import { assertType } from '../../../../../base/common/types.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ChatAgentLocation } from '../../../chat/common/chatAgents.js';
import { ChatModel, IChatResponseModel } from '../../../chat/common/chatModel.js';
import type { ITerminalContributionContext } from '../../../terminal/browser/terminalExtensions.js';
import { TerminalChatContextKeys } from './terminalChat.js';

const enum Message {
	None = 0,
	AcceptSession = 1 << 0,
	CancelSession = 1 << 1,
	PauseSession = 1 << 2,
	CancelRequest = 1 << 3,
	CancelInput = 1 << 4,
	AcceptInput = 1 << 5,
	ReturnInput = 1 << 6,
}

export class TerminalChatController extends Disposable implements ITerminalContribution {
	static readonly ID = 'terminal.chat';

	static get(instance: ITerminalInstance): TerminalChatController | null {
		return instance.getContribution<TerminalChatController>(TerminalChatController.ID);
	}
	/**
	 * The controller for the currently focused chat widget. This is used to track action context since 'active terminals'
	 * are only tracked for non-detached terminal instanecs.
	 */
	static activeChatController?: TerminalChatController;

	private static _storageKey = 'terminal-inline-chat-history';
	private static _promptHistory: string[] = [];

	/**
	 * The chat widget for the controller, this is lazy as we don't want to instantiate it until
	 * both it's required and xterm is ready.
	 */
	private _terminalChatWidget: Lazy<TerminalChatWidget> | undefined;

	/**
	 * The terminal chat widget for the controller, this will be undefined if xterm is not ready yet (ie. the
	 * terminal is still initializing). This wraps the inline chat widget.
	 */
	get terminalChatWidget(): TerminalChatWidget | undefined { return this._terminalChatWidget?.value; }

	/**
	 * The base chat widget for the controller, this will be undefined if xterm is not ready yet (ie. the
	 * terminal is still initializing).
	 */
	get chatWidget(): IChatWidget | undefined { return this._terminalChatWidget?.value.inlineChatWidget?.chatWidget; }

	private readonly _requestActiveContextKey: IContextKey<boolean>;
	private readonly _responseContainsCodeBlockContextKey: IContextKey<boolean>;
	private readonly _responseContainsMulitpleCodeBlocksContextKey: IContextKey<boolean>;

	private _messages = this._store.add(new Emitter<Message>());

	private _lastResponseContent: string | undefined;
	get lastResponseContent(): string | undefined {
		return this._lastResponseContent;
	}

	readonly onDidAcceptInput = Event.filter(this._messages.event, m => m === Message.AcceptInput, this._store);
	get onDidHide() { return this.terminalChatWidget?.onDidHide ?? Event.None; }

	private _terminalAgentName = 'terminal';

	private readonly _model: MutableDisposable<ChatModel> = this._register(new MutableDisposable());

	get scopedContextKeyService(): IContextKeyService {
		return this._terminalChatWidget?.value.inlineChatWidget.scopedContextKeyService ?? this._contextKeyService;
	}

	private _sessionCtor: CancelablePromise<void> | undefined;
	private _historyOffset: number = -1;
	private _historyCandidate: string = '';
	private _historyUpdate: (prompt: string) => void;

	private _currentRequestId: string | undefined;
	private _activeRequestCts?: CancellationTokenSource;

	constructor(
		private readonly _ctx: ITerminalContributionContext,
		@IChatCodeBlockContextProviderService chatCodeBlockContextProviderService: IChatCodeBlockContextProviderService,
		@IChatService private readonly _chatService: IChatService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IStorageService private readonly _storageService: IStorageService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IViewsService private readonly _viewsService: IViewsService,
	) {
		super();

		this._requestActiveContextKey = TerminalChatContextKeys.requestActive.bindTo(this._contextKeyService);
		this._responseContainsCodeBlockContextKey = TerminalChatContextKeys.responseContainsCodeBlock.bindTo(this._contextKeyService);
		this._responseContainsMulitpleCodeBlocksContextKey = TerminalChatContextKeys.responseContainsMultipleCodeBlocks.bindTo(this._contextKeyService);

		this._register(chatCodeBlockContextProviderService.registerProvider({
			getCodeBlockContext: (editor) => {
				if (!editor || !this._terminalChatWidget?.hasValue || !this.hasFocus()) {
					return;
				}
				return {
					element: editor,
					code: editor.getValue(),
					codeBlockIndex: 0,
					languageId: editor.getModel()!.getLanguageId()
				};
			}
		}, 'terminal'));

		TerminalChatController._promptHistory = JSON.parse(this._storageService.get(TerminalChatController._storageKey, StorageScope.PROFILE, '[]'));
		this._historyUpdate = (prompt: string) => {
			const idx = TerminalChatController._promptHistory.indexOf(prompt);
			if (idx >= 0) {
				TerminalChatController._promptHistory.splice(idx, 1);
			}
			TerminalChatController._promptHistory.unshift(prompt);
			this._historyOffset = -1;
			this._historyCandidate = '';
			this._storageService.store(TerminalChatController._storageKey, JSON.stringify(TerminalChatController._promptHistory), StorageScope.PROFILE, StorageTarget.USER);
		};
	}

	xtermReady(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		this._terminalChatWidget = new Lazy(() => {
			const chatWidget = this._register(this._instantiationService.createInstance(TerminalChatWidget, this._ctx.instance.domElement!, this._ctx.instance, xterm));
			this._register(chatWidget.focusTracker.onDidFocus(() => {
				TerminalChatController.activeChatController = this;
				if (!isDetachedTerminalInstance(this._ctx.instance)) {
					this._terminalService.setActiveInstance(this._ctx.instance);
				}
			}));
			this._register(chatWidget.focusTracker.onDidBlur(() => {
				TerminalChatController.activeChatController = undefined;
				this._ctx.instance.resetScrollbarVisibility();
			}));
			if (!this._ctx.instance.domElement) {
				throw new Error('FindWidget expected terminal DOM to be initialized');
			}
			return chatWidget;
		});
	}

	private async _createSession(): Promise<void> {
		this._sessionCtor = createCancelablePromise<void>(async token => {
			if (!this._model.value) {
				this._model.value = this._chatService.startSession(ChatAgentLocation.Terminal, token);
				const model = this._model.value;
				if (model) {
					this._terminalChatWidget?.value.inlineChatWidget.setChatModel(model);
				}
				if (!this._model.value) {
					throw new Error('Failed to start chat session');
				}
			}
		});
		this._register(toDisposable(() => this._sessionCtor?.cancel()));
	}

	private _forcedPlaceholder: string | undefined = undefined;

	private _updatePlaceholder(): void {
		const inlineChatWidget = this._terminalChatWidget?.value.inlineChatWidget;
		if (inlineChatWidget) {
			inlineChatWidget.placeholder = this._getPlaceholderText();
		}
	}

	private _getPlaceholderText(): string {
		return this._forcedPlaceholder ?? '';
	}

	setPlaceholder(text: string): void {
		this._forcedPlaceholder = text;
		this._updatePlaceholder();
	}

	resetPlaceholder(): void {
		this._forcedPlaceholder = undefined;
		this._updatePlaceholder();
	}

	clear(): void {
		this.cancel();
		this._model.clear();
		this._responseContainsCodeBlockContextKey.reset();
		this._requestActiveContextKey.reset();
		this._terminalChatWidget?.value.hide();
		this._terminalChatWidget?.value.setValue(undefined);
	}

	async acceptInput(isVoiceInput?: boolean): Promise<IChatResponseModel | undefined> {
		assertType(this._terminalChatWidget);
		if (!this._model.value) {
			await this.reveal();
		}
		assertType(this._model.value);
		this._messages.fire(Message.AcceptInput);
		const lastInput = this._terminalChatWidget.value.inlineChatWidget.value;
		if (!lastInput) {
			return;
		}
		this._historyUpdate(lastInput);
		this._activeRequestCts?.cancel();
		this._activeRequestCts = new CancellationTokenSource();
		const store = new DisposableStore();
		this._requestActiveContextKey.set(true);
		let responseContent = '';
		const response = await this._terminalChatWidget.value.inlineChatWidget.chatWidget.acceptInput(lastInput, { isVoiceInput });
		this._currentRequestId = response?.requestId;
		const responsePromise = new DeferredPromise<IChatResponseModel | undefined>();
		try {
			this._requestActiveContextKey.set(true);
			if (response) {
				store.add(response.onDidChange(async () => {
					responseContent += response.response.value;
					if (response.isCanceled) {
						this._requestActiveContextKey.set(false);
						responsePromise.complete(undefined);
						return;
					}
					if (response.isComplete) {
						this._requestActiveContextKey.set(false);
						this._requestActiveContextKey.set(false);
						const firstCodeBlock = await this.terminalChatWidget?.inlineChatWidget.getCodeBlockInfo(0);
						const secondCodeBlock = await this.terminalChatWidget?.inlineChatWidget.getCodeBlockInfo(1);
						this._responseContainsCodeBlockContextKey.set(!!firstCodeBlock);
						this._responseContainsMulitpleCodeBlocksContextKey.set(!!secondCodeBlock);
						this._terminalChatWidget?.value.inlineChatWidget.updateToolbar(true);
						responsePromise.complete(response);
					}
				}));
			}
			await responsePromise.p;
			this._lastResponseContent = response?.response.getMarkdown();
			return response;
		} catch {
			this._lastResponseContent = undefined;
			return;
		} finally {
			store.dispose();
		}
	}

	updateInput(text: string, selectAll = true): void {
		const widget = this._terminalChatWidget?.value.inlineChatWidget;
		if (widget) {
			widget.value = text;
			if (selectAll) {
				widget.selectAll();
			}
		}
	}

	getInput(): string {
		return this._terminalChatWidget?.value.input() ?? '';
	}

	focus(): void {
		this._terminalChatWidget?.value.focus();
	}

	hasFocus(): boolean {
		return this._terminalChatWidget?.rawValue?.hasFocus() ?? false;
	}

	populateHistory(up: boolean) {
		if (!this._terminalChatWidget?.value) {
			return;
		}

		const len = TerminalChatController._promptHistory.length;
		if (len === 0) {
			return;
		}

		if (this._historyOffset === -1) {
			// remember the current value
			this._historyCandidate = this._terminalChatWidget.value.inlineChatWidget.value;
		}

		const newIdx = this._historyOffset + (up ? 1 : -1);
		if (newIdx >= len) {
			// reached the end
			return;
		}

		let entry: string;
		if (newIdx < 0) {
			entry = this._historyCandidate;
			this._historyOffset = -1;
		} else {
			entry = TerminalChatController._promptHistory[newIdx];
			this._historyOffset = newIdx;
		}

		this._terminalChatWidget.value.inlineChatWidget.value = entry;
		this._terminalChatWidget.value.inlineChatWidget.selectAll();
	}

	cancel(): void {
		this._sessionCtor?.cancel();
		this._sessionCtor = undefined;
		this._activeRequestCts?.cancel();
		this._requestActiveContextKey.set(false);
		const model = this._terminalChatWidget?.value.inlineChatWidget.getChatModel();
		if (!model?.sessionId) {
			return;
		}
		this._chatService.cancelCurrentRequestForSession(model?.sessionId);
	}

	async acceptCommand(shouldExecute: boolean): Promise<void> {
		const code = await this.terminalChatWidget?.inlineChatWidget.getCodeBlockInfo(0);
		if (!code) {
			return;
		}
		this._terminalChatWidget?.value.acceptCommand(code.textEditorModel.getValue(), shouldExecute);
	}

	async reveal(): Promise<void> {
		await this._createSession();
		this._terminalChatWidget?.value.reveal();
		this._terminalChatWidget?.value.focus();
	}

	async viewInChat(): Promise<void> {
		//TODO: is this necessary? better way?
		const widget = await showChatView(this._viewsService);
		const currentRequest = this.terminalChatWidget?.inlineChatWidget.chatWidget.viewModel?.model.getRequests().find(r => r.id === this._currentRequestId);
		if (!widget || !currentRequest?.response) {
			return;
		}

		const message: IChatProgress[] = [];
		for (const item of currentRequest.response.response.value) {
			if (item.kind === 'textEditGroup') {
				for (const group of item.edits) {
					message.push({
						kind: 'textEdit',
						edits: group,
						uri: item.uri
					});
				}
			} else {
				message.push(item);
			}
		}

		this._chatService.addCompleteRequest(widget!.viewModel!.sessionId,
			// DEBT: Add hardcoded agent name until its removed
			`@${this._terminalAgentName} ${currentRequest.message.text}`,
			currentRequest.variableData,
			currentRequest.attempt,
			{
				message,
				result: currentRequest.response!.result,
				followups: currentRequest.response!.followups
			});
		widget.focusLastMessage();
		this._terminalChatWidget?.rawValue?.hide();
	}
}
