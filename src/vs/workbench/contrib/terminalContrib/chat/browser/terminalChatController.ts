/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IChatCodeBlockContextProviderService, showChatView } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatProgress, IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { ITerminalContribution, ITerminalInstance, ITerminalService, IXtermTerminal, isDetachedTerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalChatWidget } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatWidget';

import { MarkdownString } from 'vs/base/common/htmlContent';
import { ChatModel, IChatResponseModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { TerminalChatContextKeys } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChat';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { assertType } from 'vs/base/common/types';
import { CancelablePromise, createCancelablePromise, DeferredPromise } from 'vs/base/common/async';
import { ChatAgentLocation } from 'vs/workbench/contrib/chat/common/chatAgents';

const enum Message {
	NONE = 0,
	ACCEPT_SESSION = 1 << 0,
	CANCEL_SESSION = 1 << 1,
	PAUSE_SESSION = 1 << 2,
	CANCEL_REQUEST = 1 << 3,
	CANCEL_INPUT = 1 << 4,
	ACCEPT_INPUT = 1 << 5,
	RERUN_INPUT = 1 << 6,
}

export class TerminalChatController extends Disposable implements ITerminalContribution {
	static readonly ID = 'terminal.chat';

	static get(instance: ITerminalInstance): TerminalChatController | null {
		return instance.getContribution<TerminalChatController>(TerminalChatController.ID);
	}
	/**
	 * Currently focused chat widget. This is used to track action context since 'active terminals'
	 * are only tracked for non-detached terminal instanecs.
	 */
	static activeChatWidget?: TerminalChatController;

	private static _storageKey = 'terminal-inline-chat-history';
	private static _promptHistory: string[] = [];

	/**
	 * The chat widget for the controller, this is lazy as we don't want to instantiate it until
	 * both it's required and xterm is ready.
	 */
	private _chatWidget: Lazy<TerminalChatWidget> | undefined;

	/**
	 * The chat widget for the controller, this will be undefined if xterm is not ready yet (ie. the
	 * terminal is still initializing).
	 */
	get chatWidget(): TerminalChatWidget | undefined { return this._chatWidget?.value; }

	private readonly _requestActiveContextKey: IContextKey<boolean>;
	private readonly _responseContainsCodeBlockContextKey: IContextKey<boolean>;
	private readonly _responseContainsMulitpleCodeBlocksContextKey: IContextKey<boolean>;

	private _messages = this._store.add(new Emitter<Message>());

	private _lastResponseContent: string | undefined;
	get lastResponseContent(): string | undefined {
		return this._lastResponseContent;
	}

	readonly onDidAcceptInput = Event.filter(this._messages.event, m => m === Message.ACCEPT_INPUT, this._store);
	get onDidHide() { return this.chatWidget?.onDidHide ?? Event.None; }

	private _terminalAgentName = 'terminal';

	private readonly _model: MutableDisposable<ChatModel> = this._register(new MutableDisposable());

	get scopedContextKeyService(): IContextKeyService {
		return this._chatWidget?.value.inlineChatWidget.scopedContextKeyService ?? this._contextKeyService;
	}

	private _sessionCtor: CancelablePromise<void> | undefined;
	private _historyOffset: number = -1;
	private _historyCandidate: string = '';
	private _historyUpdate: (prompt: string) => void;

	private _currentRequestId: string | undefined;
	private _activeRequestCts?: CancellationTokenSource;

	constructor(
		private readonly _instance: ITerminalInstance,
		processManager: ITerminalProcessManager,
		widgetManager: TerminalWidgetManager,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IChatService private readonly _chatService: IChatService,
		@IChatCodeBlockContextProviderService private readonly _chatCodeBlockContextProviderService: IChatCodeBlockContextProviderService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		this._requestActiveContextKey = TerminalChatContextKeys.requestActive.bindTo(this._contextKeyService);
		this._responseContainsCodeBlockContextKey = TerminalChatContextKeys.responseContainsCodeBlock.bindTo(this._contextKeyService);
		this._responseContainsMulitpleCodeBlocksContextKey = TerminalChatContextKeys.responseContainsMultipleCodeBlocks.bindTo(this._contextKeyService);

		this._register(this._chatCodeBlockContextProviderService.registerProvider({
			getCodeBlockContext: (editor) => {
				if (!editor || !this._chatWidget?.hasValue || !this.hasFocus()) {
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
		this._chatWidget = new Lazy(() => {
			const chatWidget = this._register(this._instantiationService.createInstance(TerminalChatWidget, this._instance.domElement!, this._instance, xterm));
			this._register(chatWidget.focusTracker.onDidFocus(() => {
				TerminalChatController.activeChatWidget = this;
				if (!isDetachedTerminalInstance(this._instance)) {
					this._terminalService.setActiveInstance(this._instance);
				}
			}));
			this._register(chatWidget.focusTracker.onDidBlur(() => {
				TerminalChatController.activeChatWidget = undefined;
				this._instance.resetScrollbarVisibility();
			}));
			if (!this._instance.domElement) {
				throw new Error('FindWidget expected terminal DOM to be initialized');
			}
			return chatWidget;
		});
	}

	private async _createSession(): Promise<void> {
		this._sessionCtor = createCancelablePromise<void>(async token => {
			if (!this._model.value) {
				this._model.value = this._chatService.startSession(ChatAgentLocation.Terminal, token);

				if (!this._model.value) {
					throw new Error('Failed to start chat session');
				}
			}
		});
		this._register(toDisposable(() => this._sessionCtor?.cancel()));
	}

	private _forcedPlaceholder: string | undefined = undefined;

	private _updatePlaceholder(): void {
		const inlineChatWidget = this._chatWidget?.value.inlineChatWidget;
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
		this._chatWidget?.value.hide();
		this._chatWidget?.value.setValue(undefined);
	}

	async acceptInput(): Promise<IChatResponseModel | undefined> {
		assertType(this._chatWidget);
		if (!this._model.value) {
			await this.reveal();
		}
		assertType(this._model.value);
		const lastInput = this._chatWidget.value.inlineChatWidget.value;
		if (!lastInput) {
			return;
		}
		const model = this._model.value;
		this._chatWidget.value.inlineChatWidget.setChatModel(model);
		this._historyUpdate(lastInput);
		this._activeRequestCts?.cancel();
		this._activeRequestCts = new CancellationTokenSource();
		const store = new DisposableStore();
		this._requestActiveContextKey.set(true);
		let responseContent = '';
		const response = await this._chatWidget.value.inlineChatWidget.chatWidget.acceptInput(lastInput);
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
						const containsCode = responseContent.includes('```');
						this._chatWidget!.value.inlineChatWidget.updateChatMessage({ message: new MarkdownString(responseContent), requestId: response!.requestId }, false, containsCode);
						const firstCodeBlock = await this.chatWidget?.inlineChatWidget.getCodeBlockInfo(0);
						const secondCodeBlock = await this.chatWidget?.inlineChatWidget.getCodeBlockInfo(1);
						this._responseContainsCodeBlockContextKey.set(!!firstCodeBlock);
						this._responseContainsMulitpleCodeBlocksContextKey.set(!!secondCodeBlock);
						this._chatWidget?.value.inlineChatWidget.updateToolbar(true);
						responsePromise.complete(response);
					}
				}));
			}
			await responsePromise.p;
			return response;
		} catch {
			return;
		} finally {
			store.dispose();
		}
	}

	updateInput(text: string, selectAll = true): void {
		const widget = this._chatWidget?.value.inlineChatWidget;
		if (widget) {
			widget.value = text;
			if (selectAll) {
				widget.selectAll();
			}
		}
	}

	getInput(): string {
		return this._chatWidget?.value.input() ?? '';
	}

	focus(): void {
		this._chatWidget?.value.focus();
	}

	hasFocus(): boolean {
		return this._chatWidget?.rawValue?.hasFocus() ?? false;
	}

	populateHistory(up: boolean) {
		if (!this._chatWidget?.value) {
			return;
		}

		const len = TerminalChatController._promptHistory.length;
		if (len === 0) {
			return;
		}

		if (this._historyOffset === -1) {
			// remember the current value
			this._historyCandidate = this._chatWidget.value.inlineChatWidget.value;
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

		this._chatWidget.value.inlineChatWidget.value = entry;
		this._chatWidget.value.inlineChatWidget.selectAll();
	}

	cancel(): void {
		this._sessionCtor?.cancel();
		this._sessionCtor = undefined;
		this._activeRequestCts?.cancel();
		this._requestActiveContextKey.set(false);
		const model = this._chatWidget?.value.inlineChatWidget.getChatModel();
		if (!model?.sessionId) {
			return;
		}
		this._chatService.cancelCurrentRequestForSession(model?.sessionId);
	}

	async acceptCommand(shouldExecute: boolean): Promise<void> {
		const code = await this.chatWidget?.inlineChatWidget.getCodeBlockInfo(0);
		if (!code) {
			return;
		}
		this._chatWidget?.value.acceptCommand(code.textEditorModel.getValue(), shouldExecute);
	}

	async reveal(): Promise<void> {
		await this._createSession();
		this._chatWidget?.value.reveal();
		this._chatWidget?.value.focus();
	}

	async viewInChat(): Promise<void> {
		//TODO: is this necessary? better way?
		const widget = await showChatView(this._viewsService);
		const currentRequest = this.chatWidget?.inlineChatWidget.chatWidget.viewModel?.model.getRequests().find(r => r.id === this._currentRequestId);
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
		this._chatWidget?.rawValue?.hide();
	}
}
