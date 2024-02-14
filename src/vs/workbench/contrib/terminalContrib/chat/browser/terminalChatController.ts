/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { TerminalChatWidget } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatWidget';
import { ITerminalContribution, ITerminalInstance, ITerminalService, IXtermTerminal, isDetachedTerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { Lazy } from 'vs/base/common/lazy';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';
import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IChatAgentRequest, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatProgress, IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { generateUuid } from 'vs/base/common/uuid';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { marked } from 'vs/base/common/marked/marked';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IChatAccessibilityService, IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { Emitter, Event } from 'vs/base/common/event';
import { localize } from 'vs/nls';
import { CTX_INLINE_CHAT_RESPONSE_TYPES, InlineChatResponseTypes } from 'vs/workbench/contrib/inlineChat/common/inlineChat';

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
	static readonly ID = 'terminal.Chat';

	static get(instance: ITerminalInstance): TerminalChatController | null {
		return instance.getContribution<TerminalChatController>(TerminalChatController.ID);
	}
	/**
	 * Currently focused chat widget. This is used to track action context since
	 * 'active terminals' are only tracked for non-detached terminal instanecs.
	 */
	static activeChatWidget?: TerminalChatController;
	private _chatWidget: Lazy<TerminalChatWidget> | undefined;
	get chatWidget(): TerminalChatWidget | undefined { return this._chatWidget?.value; }

	private readonly _requestActiveContextKey!: IContextKey<boolean>;
	private readonly _terminalAgentRegisteredContextKey!: IContextKey<boolean>;
	private readonly _lastResponseTypeContextKey!: IContextKey<undefined | InlineChatResponseTypes>;

	private _cancellationTokenSource!: CancellationTokenSource;

	private _accessibilityRequestId: number = 0;

	private _messages = this._store.add(new Emitter<Message>());

	private _lastInput: string | undefined;
	private _lastResponseContent: string | undefined;

	readonly onDidAcceptInput = Event.filter(this._messages.event, m => m === Message.ACCEPT_INPUT, this._store);
	readonly onDidCancelInput = Event.filter(this._messages.event, m => m === Message.CANCEL_INPUT || m === Message.CANCEL_SESSION, this._store);

	private _terminalAgentId = 'terminal';

	constructor(
		private readonly _instance: ITerminalInstance,
		processManager: ITerminalProcessManager,
		widgetManager: TerminalWidgetManager,
		@IConfigurationService private _configurationService: IConfigurationService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IChatAccessibilityService private readonly _chatAccessibilityService: IChatAccessibilityService,
		@IChatService private readonly _chatService: IChatService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService
	) {
		super();
		if (!this._configurationService.getValue(TerminalSettingId.ExperimentalInlineChat)) {
			return;
		}
		this._requestActiveContextKey = TerminalContextKeys.chatRequestActive.bindTo(this._contextKeyService);
		this._terminalAgentRegisteredContextKey = TerminalContextKeys.chatAgentRegistered.bindTo(this._contextKeyService);
		this._lastResponseTypeContextKey = CTX_INLINE_CHAT_RESPONSE_TYPES.bindTo(this._contextKeyService);

		if (!this._chatAgentService.hasAgent(this._terminalAgentId)) {
			this._register(this._chatAgentService.onDidChangeAgents(() => {
				if (this._chatAgentService.getAgent(this._terminalAgentId)) {
					this._terminalAgentRegisteredContextKey.set(true);
				}
			}));
		} else {
			this._terminalAgentRegisteredContextKey.set(true);
		}
		this._cancellationTokenSource = new CancellationTokenSource();
	}

	xtermReady(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		if (!this._configurationService.getValue(TerminalSettingId.ExperimentalInlineChat)) {
			return;
		}
		this._chatWidget = new Lazy(() => {
			const chatWidget = this._instantiationService.createInstance(TerminalChatWidget, this._instance.domElement!, this._instance);
			chatWidget.focusTracker.onDidFocus(() => {
				TerminalChatController.activeChatWidget = this;
				if (!isDetachedTerminalInstance(this._instance)) {
					this._terminalService.setActiveInstance(this._instance);
				}
			});
			chatWidget.focusTracker.onDidBlur(() => {
				TerminalChatController.activeChatWidget = undefined;
				this._instance.resetScrollbarVisibility();
			});
			if (!this._instance.domElement) {
				throw new Error('FindWidget expected terminal DOM to be initialized');
			}

			return chatWidget;
		});
	}

	cancel(): void {
		this._cancellationTokenSource.cancel();
	}

	private _forcedPlaceholder: string | undefined = undefined;

	private _updatePlaceholder(): void {
		const inlineChatWidget = this._chatWidget?.rawValue?.inlineChatWidget;
		if (inlineChatWidget) {
			inlineChatWidget.placeholder = this._getPlaceholderText();
		}
	}

	private _getPlaceholderText(): string {
		return this._forcedPlaceholder ?? '';
		// TODO: Pass through session placeholder
		// return this._forcedPlaceholder ?? this._session?.session.placeholder ?? '';
	}

	setPlaceholder(text: string): void {
		this._forcedPlaceholder = text;
		this._updatePlaceholder();
	}

	resetPlaceholder(): void {
		this._forcedPlaceholder = undefined;
		this._updatePlaceholder();
	}

	async acceptInput(): Promise<void> {
		this._lastInput = this._chatWidget?.rawValue?.input();
		if (!this._lastInput) {
			return;
		}
		this._chatAccessibilityService.acceptRequest();
		this._requestActiveContextKey.set(true);
		const cancellationToken = this._cancellationTokenSource.token;
		let responseContent = '';
		const progressCallback = (progress: IChatProgress) => {
			if (cancellationToken.isCancellationRequested) {
				return;
			}

			if (progress.kind === 'content' || progress.kind === 'markdownContent') {
				responseContent += progress.content;
			}
		};
		const requestId = generateUuid();
		const requestProps: IChatAgentRequest = {
			sessionId: generateUuid(),
			requestId,
			agentId: this._terminalAgentId,
			message: this._lastInput,
			// TODO: ?
			variables: { variables: [] },
		};
		try {
			const task = this._chatAgentService.invokeAgent(this._terminalAgentId, requestProps, progressCallback, [], cancellationToken);
			this._chatWidget?.rawValue?.inlineChatWidget.updateChatMessage(undefined);
			this._chatWidget?.rawValue?.inlineChatWidget.updateFollowUps(undefined);
			this._chatWidget?.rawValue?.inlineChatWidget.updateProgress(true);
			this._chatWidget?.rawValue?.inlineChatWidget.updateInfo(localize('thinking', "Thinking\u2026"));
			// TODO: this._zone.value.widget.updateInfo(!this._session.lastExchange ? localize('thinking', "Thinking\u2026") : '');
			await task;
		} catch (e) {

		} finally {
			this._requestActiveContextKey.set(false);
			this._chatWidget?.rawValue?.inlineChatWidget.updateProgress(false);
			this._chatWidget?.rawValue?.inlineChatWidget.updateInfo('');
			this._chatWidget?.rawValue?.inlineChatWidget.updateToolbar(true);
		}
		this._lastResponseContent = responseContent;
		const firstCodeBlockContent = marked.lexer(responseContent).filter(token => token.type === 'code')?.[0]?.raw;
		const regex = /```(?<language>\w+)\n(?<content>[\s\S]*?)```/g;
		const match = regex.exec(firstCodeBlockContent);
		const codeBlock = match?.groups?.content;
		const shellType = match?.groups?.language;
		this._accessibilityRequestId++;
		if (cancellationToken.isCancellationRequested) {
			return;
		}
		if (codeBlock) {
			this._chatWidget?.rawValue?.renderTerminalCommand(codeBlock, this._accessibilityRequestId, shellType);
			this._lastResponseTypeContextKey.set(InlineChatResponseTypes.Empty);
		} else {
			this._chatWidget?.rawValue?.renderMessage(responseContent, this._accessibilityRequestId, requestId);
			this._lastResponseTypeContextKey.set(InlineChatResponseTypes.OnlyMessages);
		}
		this._chatWidget?.rawValue?.inlineChatWidget.updateToolbar(true);
		this._messages.fire(Message.ACCEPT_INPUT);
	}

	updateInput(text: string, selectAll = true): void {
		const widget = this._chatWidget?.rawValue?.inlineChatWidget;
		if (widget) {
			widget.value = text;
			if (selectAll) {
				widget.selectAll();
			}
		}
	}

	getInput(): string {
		return this._chatWidget?.rawValue?.input() ?? '';
	}

	focus(): void {
		this._chatWidget?.rawValue?.focus();
	}

	hasFocus(): boolean {
		return !!this._chatWidget?.rawValue?.hasFocus();
	}

	acceptCommand(): void {
		this._chatWidget?.rawValue?.acceptCommand();
	}

	reveal(): void {
		this._chatWidget?.rawValue?.reveal();
	}

	async viewInChat(): Promise<void> {
		if (!this._lastInput || !this._lastResponseContent) {
			return;
		}
		const widget = await this._chatWidgetService.revealViewForProvider('copilot');
		if (widget && widget.viewModel) {
			this._chatService.addCompleteRequest(widget.viewModel.sessionId, this._lastInput, undefined, { message: this._lastResponseContent });
			widget.focusLastMessage();
		}
	}

	override dispose() {
		super.dispose();
		this._chatWidget?.rawValue?.dispose();
	}
}

