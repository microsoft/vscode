/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { Dimension, getActiveWindow, IFocusTracker, trackFocus } from '../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { MicrotaskDelay } from '../../../../../base/common/symbols.js';
import './media/terminalChatWidget.css';
import { localize } from '../../../../../nls.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatAgentLocation } from '../../../chat/common/chatAgents.js';
import { InlineChatWidget } from '../../../inlineChat/browser/inlineChatWidget.js';
import { ITerminalInstance, type IXtermTerminal } from '../../../terminal/browser/terminal.js';
import { MENU_TERMINAL_CHAT_WIDGET_INPUT_SIDE_TOOLBAR, MENU_TERMINAL_CHAT_WIDGET_STATUS, TerminalChatCommandId, TerminalChatContextKeys } from './terminalChat.js';
import { TerminalStickyScrollContribution } from '../../stickyScroll/browser/terminalStickyScrollContribution.js';
import { MENU_INLINE_CHAT_WIDGET_SECONDARY } from '../../../inlineChat/common/inlineChat.js';
import { CancelablePromise, createCancelablePromise, DeferredPromise } from '../../../../../base/common/async.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IChatAcceptInputOptions, showChatView } from '../../../chat/browser/chat.js';
import { ChatModel, IChatResponseModel } from '../../../chat/common/chatModel.js';
import { IChatService, IChatProgress } from '../../../chat/common/chatService.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import type { IChatViewState } from '../../../chat/browser/chatWidget.js';
import { autorun, observableValue, type IObservable } from '../../../../../base/common/observable.js';

const enum Constants {
	HorizontalMargin = 10,
	VerticalMargin = 30,
	/** The right padding of the widget, this should align exactly with that in the editor. */
	RightPadding = 12,
	/** The max allowed height of the widget. */
	MaxHeight = 480,
	/** The max allowed height of the widget as a percentage of the terminal viewport. */
	MaxHeightPercentageOfViewport = 0.75,
}

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

export class TerminalChatWidget extends Disposable {

	private readonly _container: HTMLElement;

	private readonly _onDidHide = this._register(new Emitter<void>());
	readonly onDidHide = this._onDidHide.event;

	private readonly _inlineChatWidget: InlineChatWidget;
	public get inlineChatWidget(): InlineChatWidget { return this._inlineChatWidget; }

	private readonly _focusTracker: IFocusTracker;

	private readonly _focusedContextKey: IContextKey<boolean>;
	private readonly _visibleContextKey: IContextKey<boolean>;

	private readonly _requestActiveContextKey: IContextKey<boolean>;
	private readonly _responseContainsCodeBlockContextKey: IContextKey<boolean>;
	private readonly _responseContainsMulitpleCodeBlocksContextKey: IContextKey<boolean>;

	private _messages = this._store.add(new Emitter<Message>());

	private _viewStateStorageKey = 'terminal-inline-chat-view-state';

	private _lastResponseContent: string | undefined;
	get lastResponseContent(): string | undefined {
		return this._lastResponseContent;
	}

	private _terminalAgentName = 'terminal';

	private readonly _model: MutableDisposable<ChatModel> = this._register(new MutableDisposable());

	private _sessionCtor: CancelablePromise<void> | undefined;

	private _currentRequestId: string | undefined;
	private _activeRequestCts?: CancellationTokenSource;

	private readonly _requestInProgress = observableValue(this, false);
	readonly requestInProgress: IObservable<boolean> = this._requestInProgress;

	constructor(
		private readonly _terminalElement: HTMLElement,
		private readonly _instance: ITerminalInstance,
		private readonly _xterm: IXtermTerminal & { raw: RawXtermTerminal },
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatService private readonly _chatService: IChatService,
		@IStorageService private readonly _storageService: IStorageService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._focusedContextKey = TerminalChatContextKeys.focused.bindTo(contextKeyService);
		this._visibleContextKey = TerminalChatContextKeys.visible.bindTo(contextKeyService);
		this._requestActiveContextKey = TerminalChatContextKeys.requestActive.bindTo(contextKeyService);
		this._responseContainsCodeBlockContextKey = TerminalChatContextKeys.responseContainsCodeBlock.bindTo(contextKeyService);
		this._responseContainsMulitpleCodeBlocksContextKey = TerminalChatContextKeys.responseContainsMultipleCodeBlocks.bindTo(contextKeyService);

		this._container = document.createElement('div');
		this._container.classList.add('terminal-inline-chat');
		this._terminalElement.appendChild(this._container);

		this._inlineChatWidget = instantiationService.createInstance(
			InlineChatWidget,
			{
				location: ChatAgentLocation.Terminal,
				resolveData: () => {
					// TODO@meganrogge return something that identifies this terminal
					return undefined;
				}
			},
			{
				statusMenuId: {
					menu: MENU_TERMINAL_CHAT_WIDGET_STATUS,
					options: {
						buttonConfigProvider: action => ({
							isSecondary: action.id !== TerminalChatCommandId.RunCommand && action.id !== TerminalChatCommandId.RunFirstCommand
						})
					}
				},
				secondaryMenuId: MENU_INLINE_CHAT_WIDGET_SECONDARY,
				chatWidgetViewOptions: {
					menus: {
						telemetrySource: 'terminal-inline-chat',
						executeToolbar: MenuId.ChatExecute,
						inputSideToolbar: MENU_TERMINAL_CHAT_WIDGET_INPUT_SIDE_TOOLBAR,
					}
				}
			},
		);
		this._register(this._inlineChatWidget.chatWidget.onDidChangeViewModel(() => this._saveViewState()));
		this._register(Event.any(
			this._inlineChatWidget.onDidChangeHeight,
			this._instance.onDimensionsChanged,
			this._inlineChatWidget.chatWidget.onDidChangeContentHeight,
			Event.debounce(this._xterm.raw.onCursorMove, () => void 0, MicrotaskDelay),
		)(() => this._relayout()));

		const observer = new ResizeObserver(() => this._relayout());
		observer.observe(this._terminalElement);
		this._register(toDisposable(() => observer.disconnect()));

		this._resetPlaceholder();
		this._container.appendChild(this._inlineChatWidget.domNode);

		this._focusTracker = this._register(trackFocus(this._container));
		this._register(this._focusTracker.onDidFocus(() => this._focusedContextKey.set(true)));
		this._register(this._focusTracker.onDidBlur(() => this._focusedContextKey.set(false)));

		this._register(autorun(r => {
			const isBusy = this._inlineChatWidget.requestInProgress.read(r);
			this._container.classList.toggle('busy', isBusy);

			this._inlineChatWidget.toggleStatus(!!this._inlineChatWidget.responseContent);

			if (isBusy || !this._inlineChatWidget.responseContent) {
				this._responseContainsCodeBlockContextKey.set(false);
				this._responseContainsMulitpleCodeBlocksContextKey.set(false);
			} else {
				Promise.all([
					this._inlineChatWidget.getCodeBlockInfo(0),
					this._inlineChatWidget.getCodeBlockInfo(1)
				]).then(([firstCodeBlock, secondCodeBlock]) => {
					this._responseContainsCodeBlockContextKey.set(!!firstCodeBlock);
					this._responseContainsMulitpleCodeBlocksContextKey.set(!!secondCodeBlock);
					this._inlineChatWidget.updateToolbar(true);
				});
			}
		}));

		this.hide();
	}

	private _dimension?: Dimension;

	private _relayout() {
		if (this._dimension) {
			this._doLayout();
		}
	}

	private _doLayout() {
		const xtermElement = this._xterm.raw!.element;
		if (!xtermElement) {
			return;
		}

		const style = getActiveWindow().getComputedStyle(xtermElement);

		// Calculate width
		const xtermLeftPadding = parseInt(style.paddingLeft);
		const width = xtermElement.clientWidth - xtermLeftPadding - Constants.RightPadding;
		if (width === 0) {
			return;
		}

		// Calculate height
		const terminalViewportHeight = this._getTerminalViewportHeight();
		const widgetAllowedPercentBasedHeight = (terminalViewportHeight ?? 0) * Constants.MaxHeightPercentageOfViewport;
		const height = Math.max(Math.min(Constants.MaxHeight, this._inlineChatWidget.contentHeight, widgetAllowedPercentBasedHeight), this._inlineChatWidget.minHeight);
		if (height === 0) {
			return;
		}

		// Layout
		this._dimension = new Dimension(width, height);
		this._inlineChatWidget.layout(this._dimension);
		this._inlineChatWidget.domNode.style.paddingLeft = `${xtermLeftPadding}px`;
		this._updateXtermViewportPosition();
	}

	private _resetPlaceholder() {
		this.inlineChatWidget.placeholder = this._model.value?.welcomeMessage?.title ?? localize('askAI', 'Ask AI');
	}

	async reveal(viewState?: IChatViewState): Promise<void> {
		await this._createSession(viewState);
		this._doLayout();
		this._container.classList.remove('hide');
		this._visibleContextKey.set(true);
		this._resetPlaceholder();
		this._inlineChatWidget.focus();
		this._instance.scrollToBottom();
	}

	private _getTerminalCursorTop(): number | undefined {
		const font = this._instance.xterm?.getFont();
		if (!font?.charHeight) {
			return;
		}
		const terminalWrapperHeight = this._getTerminalViewportHeight() ?? 0;
		const cellHeight = font.charHeight * font.lineHeight;
		const topPadding = terminalWrapperHeight - (this._instance.rows * cellHeight);
		const cursorY = (this._instance.xterm?.raw.buffer.active.cursorY ?? 0) + 1;
		return topPadding + cursorY * cellHeight;
	}

	private _updateXtermViewportPosition(): void {
		const top = this._getTerminalCursorTop();
		if (!top) {
			return;
		}
		this._container.style.top = `${top}px`;
		const terminalViewportHeight = this._getTerminalViewportHeight();
		if (!terminalViewportHeight) {
			return;
		}

		const widgetAllowedPercentBasedHeight = terminalViewportHeight * Constants.MaxHeightPercentageOfViewport;
		const height = Math.max(Math.min(Constants.MaxHeight, this._inlineChatWidget.contentHeight, widgetAllowedPercentBasedHeight), this._inlineChatWidget.minHeight);
		if (top > terminalViewportHeight - height && terminalViewportHeight - height > 0) {
			this._setTerminalViewportOffset(top - (terminalViewportHeight - height));
		} else {
			this._setTerminalViewportOffset(undefined);
		}
	}

	private _getTerminalViewportHeight(): number | undefined {
		return this._terminalElement.clientHeight;
	}

	hide(): void {
		this._container.classList.add('hide');
		this._inlineChatWidget.reset();
		this._resetPlaceholder();
		this._inlineChatWidget.updateToolbar(false);
		this._visibleContextKey.set(false);
		this._inlineChatWidget.value = '';
		this._instance.focus();
		this._setTerminalViewportOffset(undefined);
		this._onDidHide.fire();
	}
	private _setTerminalViewportOffset(offset: number | undefined) {
		if (offset === undefined || this._container.classList.contains('hide')) {
			this._terminalElement.style.position = '';
			this._terminalElement.style.bottom = '';
			TerminalStickyScrollContribution.get(this._instance)?.hideUnlock();
		} else {
			this._terminalElement.style.position = 'relative';
			this._terminalElement.style.bottom = `${offset}px`;
			TerminalStickyScrollContribution.get(this._instance)?.hideLock();
		}
	}
	focus(): void {
		this.inlineChatWidget.focus();
	}
	hasFocus(): boolean {
		return this._inlineChatWidget.hasFocus();
	}

	setValue(value?: string) {
		this._inlineChatWidget.value = value ?? '';
	}

	async acceptCommand(shouldExecute: boolean): Promise<void> {
		const code = await this.inlineChatWidget.getCodeBlockInfo(0);
		if (!code) {
			return;
		}
		const value = code.getValue();
		this._instance.runCommand(value, shouldExecute);
		this.clear();
	}

	public get focusTracker(): IFocusTracker {
		return this._focusTracker;
	}

	private async _createSession(viewState?: IChatViewState): Promise<void> {
		this._sessionCtor = createCancelablePromise<void>(async token => {
			if (!this._model.value) {
				this._model.value = this._chatService.startSession(ChatAgentLocation.Terminal, token);
				const model = this._model.value;
				if (model) {
					this._inlineChatWidget.setChatModel(model, this._loadViewState());
				}
				if (!this._model.value) {
					throw new Error('Failed to start chat session');
				}
			}
		});
		this._register(toDisposable(() => this._sessionCtor?.cancel()));
	}

	private _loadViewState() {
		const rawViewState = this._storageService.get(this._viewStateStorageKey, StorageScope.PROFILE, undefined);
		let viewState: IChatViewState | undefined;
		if (rawViewState) {
			try {
				viewState = JSON.parse(rawViewState);
			} catch {
				viewState = undefined;
			}
		}
		return viewState;
	}

	private _saveViewState() {
		this._storageService.store(this._viewStateStorageKey, JSON.stringify(this._inlineChatWidget.chatWidget.getViewState()), StorageScope.PROFILE, StorageTarget.USER);
	}

	clear(): void {
		this.cancel();
		this._model.clear();
		this._responseContainsCodeBlockContextKey.reset();
		this._requestActiveContextKey.reset();
		this.hide();
		this.setValue(undefined);
	}

	async acceptInput(query?: string, options?: IChatAcceptInputOptions): Promise<IChatResponseModel | undefined> {
		if (!this._model.value) {
			await this.reveal();
		}
		this._messages.fire(Message.AcceptInput);
		const lastInput = this._inlineChatWidget.value;
		if (!lastInput) {
			return;
		}
		this._activeRequestCts?.cancel();
		this._activeRequestCts = new CancellationTokenSource();
		const store = new DisposableStore();
		this._requestActiveContextKey.set(true);
		let responseContent = '';
		const response = await this._inlineChatWidget.chatWidget.acceptInput(lastInput, { isVoiceInput: options?.isVoiceInput });
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
						const firstCodeBlock = await this._inlineChatWidget.getCodeBlockInfo(0);
						const secondCodeBlock = await this._inlineChatWidget.getCodeBlockInfo(1);
						this._responseContainsCodeBlockContextKey.set(!!firstCodeBlock);
						this._responseContainsMulitpleCodeBlocksContextKey.set(!!secondCodeBlock);
						this._inlineChatWidget.updateToolbar(true);
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

	cancel(): void {
		this._sessionCtor?.cancel();
		this._sessionCtor = undefined;
		this._activeRequestCts?.cancel();
		this._requestActiveContextKey.set(false);
		const model = this._inlineChatWidget.getChatModel();
		if (!model?.sessionId) {
			return;
		}
		this._chatService.cancelCurrentRequestForSession(model?.sessionId);
	}

	async viewInChat(): Promise<void> {
		const widget = await showChatView(this._viewsService);
		const currentRequest = this._inlineChatWidget.chatWidget.viewModel?.model.getRequests().find(r => r.id === this._currentRequestId);
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
			`@${this._terminalAgentName} ${currentRequest.message.text}`,
			currentRequest.variableData,
			currentRequest.attempt,
			{
				message,
				result: currentRequest.response!.result,
				followups: currentRequest.response!.followups
			});
		widget.focusLastMessage();
		this.hide();
	}
}
