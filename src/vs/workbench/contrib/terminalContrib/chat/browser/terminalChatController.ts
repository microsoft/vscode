/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { GeneratingPhrase, IChatAccessibilityService, IChatCodeBlockContextProviderService, showChatView } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatAgentLocation, IChatAgentRequest, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IParsedChatRequest } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { ChatUserAction, IChatProgress, IChatService, ChatAgentVoteDirection } from 'vs/workbench/contrib/chat/common/chatService';
import { ITerminalContribution, ITerminalInstance, ITerminalService, IXtermTerminal, isDetachedTerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalChatWidget } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatWidget';

import { MarkdownString } from 'vs/base/common/htmlContent';
import { ChatModel, ChatRequestModel, IChatRequestVariableData, IChatResponseModel, getHistoryEntriesFromModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { TerminalChatContextKeys } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChat';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { DeferredPromise } from 'vs/base/common/async';

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
	private readonly _terminalAgentRegisteredContextKey: IContextKey<boolean>;
	private readonly _responseContainsCodeBlockContextKey: IContextKey<boolean>;
	private readonly _responseContainsMulitpleCodeBlocksContextKey: IContextKey<boolean>;
	private readonly _responseSupportsIssueReportingContextKey: IContextKey<boolean>;
	private readonly _sessionResponseVoteContextKey: IContextKey<string | undefined>;

	private _messages = this._store.add(new Emitter<Message>());

	private _currentRequest: ChatRequestModel | undefined;

	private _lastInput: string | undefined;
	private _lastResponseContent: string | undefined;
	get lastResponseContent(): string | undefined {
		return this._lastResponseContent;
	}

	readonly onDidAcceptInput = Event.filter(this._messages.event, m => m === Message.ACCEPT_INPUT, this._store);
	get onDidHide() { return this.chatWidget?.onDidHide ?? Event.None; }

	private _terminalAgentName = 'terminal';
	private _terminalAgentId: string | undefined;

	private readonly _model: MutableDisposable<ChatModel> = this._register(new MutableDisposable());

	get scopedContextKeyService(): IContextKeyService {
		return this._chatWidget?.value.inlineChatWidget.scopedContextKeyService ?? this._contextKeyService;
	}

	constructor(
		private readonly _instance: ITerminalInstance,
		processManager: ITerminalProcessManager,
		widgetManager: TerminalWidgetManager,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IChatAccessibilityService private readonly _chatAccessibilityService: IChatAccessibilityService,
		@IChatService private readonly _chatService: IChatService,
		@IChatCodeBlockContextProviderService private readonly _chatCodeBlockContextProviderService: IChatCodeBlockContextProviderService,
		@IViewsService private readonly _viewsService: IViewsService,
	) {
		super();

		this._requestActiveContextKey = TerminalChatContextKeys.requestActive.bindTo(this._contextKeyService);
		this._terminalAgentRegisteredContextKey = TerminalChatContextKeys.agentRegistered.bindTo(this._contextKeyService);
		this._responseContainsCodeBlockContextKey = TerminalChatContextKeys.responseContainsCodeBlock.bindTo(this._contextKeyService);
		this._responseContainsMulitpleCodeBlocksContextKey = TerminalChatContextKeys.responseContainsMultipleCodeBlocks.bindTo(this._contextKeyService);
		this._responseSupportsIssueReportingContextKey = TerminalChatContextKeys.responseSupportsIssueReporting.bindTo(this._contextKeyService);
		this._sessionResponseVoteContextKey = TerminalChatContextKeys.sessionResponseVote.bindTo(this._contextKeyService);

		if (!this.initTerminalAgent()) {
			this._register(this._chatAgentService.onDidChangeAgents(() => this.initTerminalAgent()));
		}
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

		// TODO
		// This is glue/debt that's needed while ChatModel isn't yet adopted. The chat model uses
		// a default chat model (unless configured) and feedback is reported against that one. This
		// code forwards the feedback to an actual registered provider
		this._register(this._chatService.onDidPerformUserAction(e => {
			// only forward feedback from the inline chat widget default model
			if (
				this._chatWidget?.rawValue?.inlineChatWidget.usesDefaultChatModel
				&& e.sessionId === this._chatWidget?.rawValue?.inlineChatWidget.getChatModel().sessionId
			) {
				if (e.action.kind === 'bug') {
					this.acceptFeedback(undefined);
				} else if (e.action.kind === 'vote') {
					this.acceptFeedback(e.action.direction === ChatAgentVoteDirection.Up);
				}
			}
		}));
	}

	private initTerminalAgent(): boolean {
		const terminalAgent = this._chatAgentService.getAgentsByName(this._terminalAgentName)[0];
		if (terminalAgent) {
			this._terminalAgentId = terminalAgent.id;
			this._terminalAgentRegisteredContextKey.set(true);
			return true;
		}

		return false;
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

	acceptFeedback(helpful?: boolean): void {
		const model = this._model.value;
		if (!this._currentRequest || !model) {
			return;
		}
		let action: ChatUserAction;
		if (helpful === undefined) {
			action = { kind: 'bug' };
		} else {
			this._sessionResponseVoteContextKey.set(helpful ? 'up' : 'down');
			action = { kind: 'vote', direction: helpful ? ChatAgentVoteDirection.Up : ChatAgentVoteDirection.Down };
		}
		// TODO:extract into helper method
		for (const request of model.getRequests()) {
			if (request.response?.response.value || request.response?.result) {
				this._chatService.notifyUserAction({
					sessionId: request.session.sessionId,
					requestId: request.id,
					agentId: request.response?.agent?.id,
					result: request.response?.result,
					action
				});
			}
		}
		this._chatWidget?.value.inlineChatWidget.updateStatus('Thank you for your feedback!', { resetAfter: 1250 });
	}

	cancel(): void {
		if (this._currentRequest) {
			this._model.value?.cancelRequest(this._currentRequest);
		}
		this._requestActiveContextKey.set(false);
		this._chatWidget?.value.inlineChatWidget.updateProgress(false);
		this._chatWidget?.value.inlineChatWidget.updateInfo('');
		this._chatWidget?.value.inlineChatWidget.updateToolbar(true);
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
		if (this._currentRequest) {
			this._model.value?.cancelRequest(this._currentRequest);
		}
		this._model.clear();
		this._chatWidget?.rawValue?.hide();
		this._chatWidget?.rawValue?.setValue(undefined);
		this._responseContainsCodeBlockContextKey.reset();
		this._sessionResponseVoteContextKey.reset();
		this._requestActiveContextKey.reset();
	}

	async acceptInput(): Promise<IChatResponseModel | undefined> {
		if (!this._model.value) {
			this._model.value = this._chatService.startSession(ChatAgentLocation.Terminal, CancellationToken.None);
			if (!this._model.value) {
				throw new Error('Could not start chat session');
			}
		}
		this._messages.fire(Message.ACCEPT_INPUT);
		const model = this._model.value;

		this._lastInput = this._chatWidget?.value?.input();
		if (!this._lastInput) {
			return;
		}

		const responseCreated = new DeferredPromise<IChatResponseModel>();
		let responseCreatedComplete = false;
		const completeResponseCreated = () => {
			if (!responseCreatedComplete && this._currentRequest?.response) {
				responseCreated.complete(this._currentRequest.response);
				responseCreatedComplete = true;
			}
		};

		const accessibilityRequestId = this._chatAccessibilityService.acceptRequest();
		this._requestActiveContextKey.set(true);
		const cancellationToken = new CancellationTokenSource().token;
		let responseContent = '';
		const progressCallback = (progress: IChatProgress) => {
			if (cancellationToken.isCancellationRequested) {
				return;
			}

			if (progress.kind === 'markdownContent') {
				responseContent += progress.content.value;
			}
			if (this._currentRequest) {
				model.acceptResponseProgress(this._currentRequest, progress);
				completeResponseCreated();
			}
		};

		await model.waitForInitialization();
		this._chatWidget?.value.addToHistory(this._lastInput);
		const request: IParsedChatRequest = {
			text: this._lastInput,
			parts: []
		};
		const requestVarData: IChatRequestVariableData = {
			variables: []
		};
		this._currentRequest = model.addRequest(request, requestVarData, 0);
		completeResponseCreated();
		const requestProps: IChatAgentRequest = {
			sessionId: model.sessionId,
			requestId: this._currentRequest!.id,
			agentId: this._terminalAgentId!,
			message: this._lastInput,
			variables: { variables: [] },
			location: ChatAgentLocation.Terminal
		};
		try {
			const task = this._chatAgentService.invokeAgent(this._terminalAgentId!, requestProps, progressCallback, getHistoryEntriesFromModel(model, this._terminalAgentId!), cancellationToken);
			this._chatWidget?.value.inlineChatWidget.updateChatMessage(undefined);
			this._chatWidget?.value.inlineChatWidget.updateFollowUps(undefined);
			this._chatWidget?.value.inlineChatWidget.updateProgress(true);
			this._chatWidget?.value.inlineChatWidget.updateInfo(GeneratingPhrase + '\u2026');
			await task;
		} catch (e) {

		} finally {
			this._requestActiveContextKey.set(false);
			this._chatWidget?.value.inlineChatWidget.updateProgress(false);
			this._chatWidget?.value.inlineChatWidget.updateInfo('');
			this._chatWidget?.value.inlineChatWidget.updateToolbar(true);
			if (this._currentRequest) {
				model.completeResponse(this._currentRequest);
				completeResponseCreated();
			}
			this._lastResponseContent = responseContent;
			if (this._currentRequest) {
				this._chatAccessibilityService.acceptResponse(responseContent, accessibilityRequestId);
				const containsCode = responseContent.includes('```');
				this._chatWidget?.value.inlineChatWidget.updateChatMessage({ message: new MarkdownString(responseContent), requestId: this._currentRequest.id }, false, containsCode);
				const firstCodeBlock = await this.chatWidget?.inlineChatWidget.getCodeBlockInfo(0);
				const secondCodeBlock = await this.chatWidget?.inlineChatWidget.getCodeBlockInfo(1);
				this._responseContainsCodeBlockContextKey.set(!!firstCodeBlock);
				this._responseContainsMulitpleCodeBlocksContextKey.set(!!secondCodeBlock);
				this._chatWidget?.value.inlineChatWidget.updateToolbar(true);
			}
			const supportIssueReporting = this._currentRequest?.response?.agent?.metadata?.supportIssueReporting;
			if (supportIssueReporting !== undefined) {
				this._responseSupportsIssueReportingContextKey.set(supportIssueReporting);
			}
		}
		return responseCreated.p;
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
		return !!this._chatWidget?.rawValue?.hasFocus() ?? false;
	}

	async acceptCommand(shouldExecute: boolean): Promise<void> {
		const code = await this.chatWidget?.inlineChatWidget.getCodeBlockInfo(0);
		if (!code) {
			return;
		}
		this._chatWidget?.value.acceptCommand(code.textEditorModel.getValue(), shouldExecute);
	}

	reveal(): void {
		this._chatWidget?.value.reveal();
	}

	async viewInChat(): Promise<void> {
		const widget = await showChatView(this._viewsService);
		const request = this._currentRequest;
		if (!widget || !request?.response) {
			return;
		}
		const message: IChatProgress[] = [];
		for (const item of request.response.response.value) {
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
			`@${this._terminalAgentName} ${request.message.text}`,
			request.variableData,
			request.attempt,
			{
				message,
				result: request.response!.result,
				followups: request.response!.followups
			});
		widget.focusLastMessage();
		this._chatWidget?.rawValue?.hide();
	}

	// TODO: Move to register calls, don't override
	override dispose() {
		if (this._currentRequest) {
			this._model.value?.cancelRequest(this._currentRequest);
		}
		super.dispose();
		this.clear();
	}
}
