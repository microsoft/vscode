/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable } from 'vs/base/common/lifecycle';
import { marked } from 'vs/base/common/marked/marked';
import { generateUuid } from 'vs/base/common/uuid';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { IChatAccessibilityService, IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatAgentService, IChatAgentRequest } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IParsedChatRequest } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatService, IChatProgress } from 'vs/workbench/contrib/chat/common/chatService';
import { InlineChatResponseTypes, CTX_INLINE_CHAT_RESPONSE_TYPES } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { ITerminalContribution, ITerminalInstance, ITerminalService, IXtermTerminal, isDetachedTerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { TerminalChatWidget } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatWidget';


import { ChatModel, ChatRequestModel, IChatRequestVariableData } from 'vs/workbench/contrib/chat/common/chatModel';

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
	private _requestId: number = 0;

	private _messages = this._store.add(new Emitter<Message>());

	private _currentRequest: ChatRequestModel | undefined;

	private _lastInput: string | undefined;
	private _lastResponseContent: string | undefined;
	get lastResponseContent(): string | undefined {
		// TODO: use model
		return this._lastResponseContent;
	}

	readonly onDidAcceptInput = Event.filter(this._messages.event, m => m === Message.ACCEPT_INPUT, this._store);
	readonly onDidCancelInput = Event.filter(this._messages.event, m => m === Message.CANCEL_INPUT || m === Message.CANCEL_SESSION, this._store);

	private _terminalAgentId = 'terminal';

	private _model: ChatModel | undefined;

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
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IChatService private readonly _chatService: IChatService,
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
	}

	xtermReady(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		if (!this._configurationService.getValue(TerminalSettingId.ExperimentalInlineChat)) {
			return;
		}
		this._chatWidget = new Lazy(() => {

			const chatWidget = this._register(this._instantiationService.createInstance(TerminalChatWidget, this._instance.domElement!, this._instance));
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

	cancel(): void {
		if (this._currentRequest) {
			this._model?.cancelRequest(this._currentRequest);
		}
		this._requestActiveContextKey.set(false);
		this._chatWidget?.rawValue?.inlineChatWidget.updateProgress(false);
		this._chatWidget?.rawValue?.inlineChatWidget.updateInfo('');
		this._chatWidget?.rawValue?.inlineChatWidget.updateToolbar(true);
	}

	private _forcedPlaceholder: string | undefined = undefined;

	private _updatePlaceholder(): void {
		const inlineChatWidget = this._chatWidget?.rawValue?.inlineChatWidget;
		if (inlineChatWidget) {
			inlineChatWidget.placeholder = this._getPlaceholderText();
		}
	}

	private _getPlaceholderText(): string {
		return this._forcedPlaceholder ?? this._model?.inputPlaceholder ?? '';
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
		if (this._currentRequest) {
			this._model?.cancelRequest(this._currentRequest);
		}
		this._model?.dispose();
		this._model = undefined;
		this._chatWidget?.rawValue?.hide();
		this._chatWidget?.rawValue?.setValue(undefined);
	}

	private updateModel(): void {
		const providerInfo = this._chatService.getProviderInfos()?.[0];
		if (!providerInfo) {
			return;
		}
		this._model ??= this._chatService.startSession(providerInfo.id, CancellationToken.None);
	}

	async acceptInput(): Promise<void> {
		this.updateModel();
		this._lastInput = this._chatWidget?.rawValue?.input();
		if (!this._lastInput) {
			return;
		}
		this._chatAccessibilityService.acceptRequest();
		this._requestActiveContextKey.set(true);
		const cancellationToken = new CancellationTokenSource().token;
		let responseContent = '';
		const progressCallback = (progress: IChatProgress) => {
			if (cancellationToken.isCancellationRequested) {
				return;
			}

			if (progress.kind === 'content' || progress.kind === 'markdownContent') {
				responseContent += progress.content;
			}
			if (this._currentRequest) {
				this._model?.acceptResponseProgress(this._currentRequest, progress);
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
		// TODO: fix requester usrname, responder username
		this._model?.initialize({ id: this._requestId, requesterUsername: 'userGesture', responderUsername: 'terminal' }, undefined);
		const request: IParsedChatRequest = {
			text: this._lastInput,
			parts: []
		};
		const requestVarData: IChatRequestVariableData = {
			variables: []
		};
		this._currentRequest = this._model?.addRequest(request, requestVarData);
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
			if (this._currentRequest) {
				this._model?.completeResponse(this._currentRequest);
			}
		}
		this._lastResponseContent = responseContent;
		const firstCodeBlockContent = marked.lexer(responseContent).filter(token => token.type === 'code')?.[0]?.raw;
		const regex = /```(?<language>\w+)\n(?<content>[\s\S]*?)```/g;
		const match = regex.exec(firstCodeBlockContent);
		const codeBlock = match?.groups?.content.trim();
		const shellType = match?.groups?.language;
		this._requestId++;
		if (cancellationToken.isCancellationRequested) {
			return;
		}
		if (codeBlock) {
			this._chatWidget?.rawValue?.renderTerminalCommand(codeBlock, this._requestId, shellType);
			this._lastResponseTypeContextKey.set(InlineChatResponseTypes.Empty);
		} else {
			this._chatWidget?.rawValue?.renderMessage(responseContent, this._requestId, requestId);
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

	acceptCommand(shouldExecute: boolean): void {
		this._chatWidget?.rawValue?.acceptCommand(shouldExecute);
	}

	reveal(): void {
		this._chatWidget?.rawValue?.reveal();
	}

	async viewInChat(): Promise<void> {
		const providerInfo = this._chatService.getProviderInfos()?.[0];
		if (!providerInfo) {
			return;
		}
		const widget = await this._chatWidgetService.revealViewForProvider(providerInfo.id);
		if (widget && widget.viewModel && this._model) {
			for (const request of this._model.getRequests()) {
				if (request.response?.response.value || request.response?.result) {
					this._chatService.addCompleteRequest(widget.viewModel.sessionId,
						request.message as IParsedChatRequest,
						request.variableData,
						{
							message: request.response.response.value,
							result: request.response.result,
							followups: request.response.followups
						});
				}
			}
			widget.focusLastMessage();
		}
	}

	override dispose() {
		if (this._currentRequest) {
			this._model?.cancelRequest(this._currentRequest);
		}
		super.dispose();
		this.clear();
		this._chatWidget?.rawValue?.dispose();
	}
}

