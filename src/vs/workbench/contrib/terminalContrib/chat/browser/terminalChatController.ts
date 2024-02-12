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
import { Session } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';

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

	get chatWidget(): TerminalChatWidget | undefined { return this._chatWidget?.value; }

	// private _sessionCtor: CancelablePromise<void> | undefined;
	private _activeSession?: Session;
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
		@IChatAgentService private readonly _chatAgentService: IChatAgentService
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

			// this._instance.domElement?.appendChild(chatWidget.getDomNode());
			if (this._lastLayoutDimensions) {
				chatWidget.layout(this._lastLayoutDimensions.width);
			}

			return chatWidget;
		});
	}

	async acceptInput(): Promise<void> {
		// TODO: create session, deal with response
		// this._activeSession = new Session(EditMode.Live, , this._instance);
		// const initVariableData: IChatRequestVariableData = { message: getPromptText(parsedRequest.parts), variables: {} };
		// request = model.addRequest(parsedRequest, initVariableData, agent, agentSlashCommandPart?.command);
		// const variableData = await this.chatVariablesService.resolveVariables(parsedRequest, model, token);
		// const requestProps: IChatAgentRequest = {
		// 	sessionId: 'sessionId',
		// 	requestId: 'fake',
		// 	agentId: 'terminal',
		// 	message: this._chatWidget?.rawValue?.getValue() || '',
		// 	// variables: variableData.variables,
		// 	// command: agentSlashCommandPart?.command.name,
		// 	// variables2: asVariablesData2(parsedRequest, variableData)
		// };
		// const agentResult = await this._chatAgentService.invokeAgent('terminal', requestProps, progressCallback, undefined, token);
		// const rawResult = agentResult;
		// const agentOrCommandFollowups = this._chatAgentService.getFollowups('terminal', agentResult, followupsCancelToken);
		this._chatWidget?.rawValue?.acceptInput();
	}

	reveal(): void {
		this._chatWidget?.rawValue?.reveal();
	}

	override dispose() {
		super.dispose();
		this._chatWidget?.rawValue?.dispose();
	}
}

