/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, IFocusTracker, trackFocus } from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import 'vs/css!./media/terminalChatWidget';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { localize } from 'vs/nls';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { InlineChatWidget } from 'vs/workbench/contrib/inlineChat/browser/inlineChatWidget';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { MENU_TERMINAL_CHAT_INPUT, MENU_TERMINAL_CHAT_WIDGET, MENU_TERMINAL_CHAT_WIDGET_FEEDBACK, MENU_TERMINAL_CHAT_WIDGET_STATUS } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChat';

export class TerminalChatWidget extends Disposable {
	private _scopedInstantiationService: IInstantiationService;
	private _widgetContainer: HTMLElement;
	private _chatWidgetFocused: IContextKey<boolean>;
	private _chatWidgetVisible: IContextKey<boolean>;

	private readonly _inlineChatWidget: InlineChatWidget;

	private readonly _focusTracker: IFocusTracker;


	constructor(
		private readonly _container: HTMLElement,
		private readonly _instance: ITerminalInstance,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		super();
		const scopedContextKeyService = this._register(this._contextKeyService.createScoped(this._container));
		this._scopedInstantiationService = instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService]));
		this._chatWidgetFocused = TerminalContextKeys.chatFocused.bindTo(this._contextKeyService);
		this._chatWidgetVisible = TerminalContextKeys.chatVisible.bindTo(this._contextKeyService);
		this._widgetContainer = document.createElement('div');
		this._widgetContainer.classList.add('terminal-inline-chat');
		this._container.appendChild(this._widgetContainer);

		// The inline chat widget requires a parent editor that it bases the diff view on, since the
		// terminal doesn't use that feature we can just pass in an unattached editor instance.
		const fakeParentEditorElement = document.createElement('div');
		const fakeParentEditor = this._scopedInstantiationService.createInstance(
			CodeEditorWidget,
			fakeParentEditorElement,
			{
				extraEditorClassName: 'ignore-panel-bg'
			},
			{ isSimpleWidget: true }
		);

		this._inlineChatWidget = this._scopedInstantiationService.createInstance(
			InlineChatWidget,
			fakeParentEditor,
			{
				menuId: MENU_TERMINAL_CHAT_INPUT,
				widgetMenuId: MENU_TERMINAL_CHAT_WIDGET,
				statusMenuId: MENU_TERMINAL_CHAT_WIDGET_STATUS,
				feedbackMenuId: MENU_TERMINAL_CHAT_WIDGET_FEEDBACK
			}
		);
		this._inlineChatWidget.placeholder = localize('default.placeholder', "Ask how to do something in the terminal");
		this._inlineChatWidget.updateInfo(localize('welcome.1', "AI-generated code may be incorrect"));
		this._widgetContainer.appendChild(this._inlineChatWidget.domNode);

		this._focusTracker = this._register(trackFocus(this._widgetContainer));
	}
	reveal(): void {
		this._inlineChatWidget.layout(new Dimension(400, 150));

		this._widgetContainer.classList.remove('hide');
		this._chatWidgetFocused.set(true);
		this._chatWidgetVisible.set(true);
		this._inlineChatWidget.focus();
	}
	hide(): void {
		this._widgetContainer.classList.add('hide');
		this._chatWidgetFocused.set(false);
		this._chatWidgetVisible.set(false);
		this._instance.focus();
	}
	cancel(): void {
		// TODO: Impl
	}
	input(): string {
		return this._inlineChatWidget.value;
	}
	setValue(value?: string) {
		this._inlineChatWidget.value = value ?? '';
	}
	// async acceptInput(): Promise<void> {
	// 	// this._widget?.acceptInput();
	// 	// this._chatModel ??= this._chatService.startSession('terminal', CancellationToken.None);

	// 	// if (!this._model) {
	// 	// throw new Error('Could not start chat session');
	// 	// }
	// 	// this._chatService?.sendRequest(this._chatModel?.sessionId!, this._inlineChatWidget.value);
	// 	// this._activeSession = new Session(EditMode.Live, , this._instance);
	// 	// const initVariableData: IChatRequestVariableData = { message: getPromptText(parsedRequest.parts), variables: {} };
	// 	// request = model.addRequest(parsedRequest, initVariableData, agent, agentSlashCommandPart?.command);
	// 	// const variableData = await this.chatVariablesService.resolveVariables(parsedRequest, model, token);
	// 	this._inlineChatWidget.value = '';
	// }
	layout(width: number): void {
		// this._widget?.layout(100, width < 300 ? 300 : width);
	}
	public get focusTracker(): IFocusTracker {
		return this._focusTracker;
	}
}
