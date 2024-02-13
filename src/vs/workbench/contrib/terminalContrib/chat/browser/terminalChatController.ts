/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { TerminalChatWidget } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatWidget';
import { ITerminalContribution, ITerminalInstance, ITerminalService, IXtermTerminal, isDetachedTerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IDimension } from 'vs/base/browser/dom';
import { Lazy } from 'vs/base/common/lazy';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';
import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IChatAgentRequest, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatProgress } from 'vs/workbench/contrib/chat/common/chatService';
import { generateUuid } from 'vs/base/common/uuid';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IChatRequestVariableValue } from 'vs/workbench/contrib/chat/common/chatVariables';
import { marked } from 'vs/base/common/marked/marked';

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
	private _lastLayoutDimensions: IDimension | undefined;
	private _requestId: number = 0;
	get chatWidget(): TerminalChatWidget | undefined { return this._chatWidget?.value; }

	// private _sessionCtor: CancelablePromise<void> | undefined;
	// private _activeSession?: Session;
	// private readonly _ctxHasActiveRequest: IContextKey<boolean>;
	// private _isVisible: boolean = false;
	// private _strategy: EditStrategy | undefined;

	// private _inlineChatListener: IDisposable | undefined;
	// private _toolbar: MenuWorkbenchToolBar | undefined;
	// private readonly _ctxLastResponseType: IContextKey<undefined | InlineChatResponseType>;
	// private _widgetDisposableStore: DisposableStore = this._register(new DisposableStore());

	constructor(
		private readonly _instance: ITerminalInstance,
		processManager: ITerminalProcessManager,
		widgetManager: TerminalWidgetManager,
		@IConfigurationService private _configurationService: IConfigurationService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		// @IContextKeyService private readonly _contextKeyService: IContextKeyService,
		// @IInstantiationService private readonly _instantiationService: IInstantiationService,
		// @ICommandService private readonly _commandService: ICommandService,
		// @IInlineChatSavingService private readonly _inlineChatSavingService: IInlineChatSavingService
	) {
		super();
		if (!this._configurationService.getValue(TerminalSettingId.ExperimentalInlineChat)) {
			return;
		}
		// this._ctxHasActiveRequest = TerminalContextKeys.chatRequestActive.bindTo(this._contextKeyService);
		// this._ctxLastResponseType = CTX_INLINE_CHAT_LAST_RESPONSE_TYPE.bindTo(this._contextKeyService);
	}

	layout(_xterm: IXtermTerminal & { raw: RawXtermTerminal }, dimension: IDimension): void {
		if (!this._configurationService.getValue(TerminalSettingId.ExperimentalInlineChat)) {
			return;
		}
		this._lastLayoutDimensions = dimension;
		this._chatWidget?.rawValue?.layout(dimension.width);
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

			if (this._lastLayoutDimensions) {
				chatWidget.layout(this._lastLayoutDimensions.width);
			}

			return chatWidget;
		});
	}

	async acceptInput(): Promise<void> {
		let message = '';
		const progressCallback = (progress: IChatProgress) => {
			// if (token.isCancellationRequested) {
			// 	return;
			// }


			// gotProgress = true;

			if (progress.kind === 'content' || progress.kind === 'markdownContent') {
				// this.trace('sendRequest', `Provider returned progress for session ${model.sessionId}, ${typeof progress.content === 'string' ? progress.content.length : progress.content.value.length} chars`);
				message += progress.content;
			} else {
				// this.trace('sendRequest', `Provider returned progress: ${JSON.stringify(progress)}`);
			}

			// model.acceptResponseProgress(request, progress);
		};
		const resolvedVariables: Record<string, IChatRequestVariableValue[]> = {};

		const requestProps: IChatAgentRequest = {
			sessionId: generateUuid(),
			requestId: generateUuid(),
			agentId: 'terminal',
			message: this._chatWidget?.rawValue?.input() || '',
			variables: resolvedVariables,
			variables2: { message: this._chatWidget?.rawValue?.input() || '', variables: [] }
		};
		this._chatWidget?.rawValue?.setValue();

		// TODO: use token
		await this._chatAgentService.invokeAgent('terminal', requestProps, progressCallback, [], CancellationToken.None);
		const codeBlock = marked.lexer(message).filter(token => token.type === 'code')?.[0]?.raw.replaceAll('```', '');
		this._requestId++;
		if (codeBlock) {
			// TODO: check the SR experience
			this._chatWidget?.rawValue?.renderTerminalCommand(codeBlock, this._requestId);
		} else {
			this._chatWidget?.rawValue?.renderMessage(message, this._requestId);
		}
	}

	reveal(): void {
		this._chatWidget?.rawValue?.reveal();
	}

	override dispose() {
		super.dispose();
		this._chatWidget?.rawValue?.dispose();
	}
}

