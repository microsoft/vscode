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
import { MENU_TERMINAL_CHAT_WIDGET, MENU_TERMINAL_CHAT_WIDGET_STATUS, TerminalChatCommandId, TerminalChatContextKeys } from './terminalChat.js';
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

const enum Constants {
	HorizontalMargin = 10,
	VerticalMargin = 30
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

const terminalChatPlaceholder = localize('default.placeholder', "Ask how to do something in the terminal");
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

	private _storageKey = 'terminal-inline-chat-history';
	private _promptHistory: string[] = [];

	private _lastResponseContent: string | undefined;
	get lastResponseContent(): string | undefined {
		return this._lastResponseContent;
	}

	private _terminalAgentName = 'terminal';

	private readonly _model: MutableDisposable<ChatModel> = this._register(new MutableDisposable());

	private _sessionCtor: CancelablePromise<void> | undefined;
	private _historyOffset: number = -1;
	private _historyCandidate: string = '';
	private _historyUpdate: (prompt: string) => void;

	private _currentRequestId: string | undefined;
	private _activeRequestCts?: CancellationTokenSource;

	constructor(
		private readonly _terminalElement: HTMLElement,
		private readonly _instance: ITerminalInstance,
		private readonly _xterm: IXtermTerminal & { raw: RawXtermTerminal },
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IChatService private readonly _chatService: IChatService,
		@IStorageService private readonly _storageService: IStorageService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._focusedContextKey = TerminalChatContextKeys.focused.bindTo(_contextKeyService);
		this._visibleContextKey = TerminalChatContextKeys.visible.bindTo(_contextKeyService);

		this._container = document.createElement('div');
		this._container.classList.add('terminal-inline-chat');
		_terminalElement.appendChild(this._container);

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
						buttonConfigProvider: action => {
							if (action.id === TerminalChatCommandId.ViewInChat || action.id === TerminalChatCommandId.RunCommand || action.id === TerminalChatCommandId.RunFirstCommand) {
								return { isSecondary: false };
							} else {
								return { isSecondary: true };
							}
						}
					}
				},
				secondaryMenuId: MENU_INLINE_CHAT_WIDGET_SECONDARY,
				chatWidgetViewOptions: {
					rendererOptions: { editableCodeBlock: true },
					menus: {
						telemetrySource: 'terminal-inline-chat',
						executeToolbar: MenuId.ChatExecute,
						inputSideToolbar: MENU_TERMINAL_CHAT_WIDGET,
					}
				}
			},
		);
		this._register(Event.any(
			this._inlineChatWidget.onDidChangeHeight,
			this._instance.onDimensionsChanged,
			this._inlineChatWidget.chatWidget.onDidChangeContentHeight,
			Event.debounce(this._xterm.raw.onCursorMove, () => void 0, MicrotaskDelay),
		)(() => this._relayout()));

		const observer = new ResizeObserver(() => this._relayout());
		observer.observe(this._terminalElement);
		this._register(toDisposable(() => observer.disconnect()));

		this._reset();
		this._container.appendChild(this._inlineChatWidget.domNode);

		this._focusTracker = this._register(trackFocus(this._container));
		this._register(this._focusTracker.onDidFocus(() => this._focusedContextKey.set(true)));
		this._register(this._focusTracker.onDidBlur(() => this._focusedContextKey.set(false)));

		this.hide();

		this._requestActiveContextKey = TerminalChatContextKeys.requestActive.bindTo(this._contextKeyService);
		this._responseContainsCodeBlockContextKey = TerminalChatContextKeys.responseContainsCodeBlock.bindTo(this._contextKeyService);
		this._responseContainsMulitpleCodeBlocksContextKey = TerminalChatContextKeys.responseContainsMultipleCodeBlocks.bindTo(this._contextKeyService);

		this._promptHistory = JSON.parse(this._storageService.get(this._storageKey, StorageScope.PROFILE, '[]'));
		this._historyUpdate = (prompt: string) => {
			const idx = this._promptHistory.indexOf(prompt);
			if (idx >= 0) {
				this._promptHistory.splice(idx, 1);
			}
			this._promptHistory.unshift(prompt);
			this._historyOffset = -1;
			this._historyCandidate = '';
			this._storageService.store(this._storageKey, JSON.stringify(this._promptHistory), StorageScope.PROFILE, StorageTarget.USER);
		};
	}

	private _dimension?: Dimension;

	private _relayout() {
		if (this._dimension) {
			this._doLayout(this._inlineChatWidget.contentHeight);
		}
	}

	private _doLayout(heightInPixel: number) {
		const xtermElement = this._xterm.raw!.element;
		if (!xtermElement) {
			return;
		}
		const style = getActiveWindow().getComputedStyle(xtermElement);
		const xtermPadding = parseInt(style.paddingLeft) + parseInt(style.paddingRight);
		const width = Math.min(640, xtermElement.clientWidth - 12/* padding */ - 2/* border */ - Constants.HorizontalMargin - xtermPadding);
		const terminalWrapperHeight = this._getTerminalWrapperHeight() ?? Number.MAX_SAFE_INTEGER;
		let height = Math.min(480, heightInPixel, terminalWrapperHeight);
		const top = this._getTop() ?? 0;
		if (width === 0 || height === 0) {
			return;
		}

		let adjustedHeight = undefined;
		if (height < this._inlineChatWidget.contentHeight) {
			if (height - top > 0) {
				height = height - top - Constants.VerticalMargin;
			} else {
				height = height - Constants.VerticalMargin;
				adjustedHeight = height;
			}
		}
		this._container.style.paddingLeft = style.paddingLeft;
		this._dimension = new Dimension(width, height);
		this._inlineChatWidget.layout(this._dimension);
		this._updateVerticalPosition(adjustedHeight);
	}

	private _reset() {
		this.inlineChatWidget.placeholder = terminalChatPlaceholder;
		this._inlineChatWidget.updateInfo(localize('welcome.1', "AI-generated commands may be incorrect"));
	}

	async reveal(): Promise<void> {
		await this._createSession();
		this._doLayout(this._inlineChatWidget.contentHeight);
		this._container.classList.remove('hide');
		this._visibleContextKey.set(true);
		this.inlineChatWidget.placeholder = terminalChatPlaceholder;
		this._inlineChatWidget.focus();
		this._instance.scrollToBottom();
	}

	private _getTop(): number | undefined {
		const font = this._instance.xterm?.getFont();
		if (!font?.charHeight) {
			return;
		}
		const terminalWrapperHeight = this._getTerminalWrapperHeight() ?? 0;
		const cellHeight = font.charHeight * font.lineHeight;
		const topPadding = terminalWrapperHeight - (this._instance.rows * cellHeight);
		const cursorY = (this._instance.xterm?.raw.buffer.active.cursorY ?? 0) + 1;
		return topPadding + cursorY * cellHeight;
	}

	private _updateVerticalPosition(adjustedHeight?: number): void {
		const top = this._getTop();
		if (!top) {
			return;
		}
		this._container.style.top = `${top}px`;
		const widgetHeight = this._inlineChatWidget.contentHeight;
		const terminalWrapperHeight = this._getTerminalWrapperHeight();
		if (!terminalWrapperHeight) {
			return;
		}
		if (top > terminalWrapperHeight - widgetHeight && terminalWrapperHeight - widgetHeight > 0) {
			this._setTerminalOffset(top - (terminalWrapperHeight - widgetHeight));
		} else if (adjustedHeight) {
			this._setTerminalOffset(adjustedHeight);
		} else {
			this._setTerminalOffset(undefined);
		}
	}

	private _getTerminalWrapperHeight(): number | undefined {
		return this._terminalElement.clientHeight;
	}

	hide(): void {
		this._container.classList.add('hide');
		this._inlineChatWidget.reset();
		this._reset();
		this._inlineChatWidget.updateToolbar(false);
		this._visibleContextKey.set(false);
		this._inlineChatWidget.value = '';
		this._instance.focus();
		this._setTerminalOffset(undefined);
		this._onDidHide.fire();
	}
	private _setTerminalOffset(offset: number | undefined) {
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
		const value = code.textEditorModel.getValue();
		this._instance.runCommand(value, shouldExecute);
		this.hide();
	}

	public get focusTracker(): IFocusTracker {
		return this._focusTracker;
	}

	private async _createSession(): Promise<void> {
		this._sessionCtor = createCancelablePromise<void>(async token => {
			if (!this._model.value) {
				this._model.value = this._chatService.startSession(ChatAgentLocation.Terminal, token);
				const model = this._model.value;
				if (model) {
					this._inlineChatWidget.setChatModel(model);
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
		const inlineChatWidget = this._inlineChatWidget;
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
		this._historyUpdate(lastInput);
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

	populateHistory(up: boolean) {
		if (!this._inlineChatWidget) {
			return;
		}

		const len = this._promptHistory.length;
		if (len === 0) {
			return;
		}

		if (this._historyOffset === -1) {
			// remember the current value
			this._historyCandidate = this._inlineChatWidget.value;
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
			entry = this._promptHistory[newIdx];
			this._historyOffset = newIdx;
		}

		this._inlineChatWidget.value = entry;
		this._inlineChatWidget.selectAll();
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
