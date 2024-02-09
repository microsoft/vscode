/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/terminalChatWidget';
import { Dimension, IFocusTracker, trackFocus } from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { InlineChatWidget } from 'vs/workbench/contrib/inlineChat/browser/inlineChatWidget';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { localize } from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { MENU_CELL_CHAT_WIDGET, MENU_CELL_CHAT_WIDGET_STATUS, MENU_CELL_CHAT_WIDGET_FEEDBACK } from 'vs/workbench/contrib/notebook/browser/view/cellParts/chat/cellChatController';

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
		@IContextKeyService private readonly _contextKeyService: IContextKeyService) {
		super();
		const scopedContextKeyService = this._register(this._contextKeyService.createScoped(this._container));
		this._scopedInstantiationService = instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService]));
		this._chatWidgetFocused = TerminalContextKeys.chatFocused.bindTo(this._contextKeyService);
		this._chatWidgetVisible = TerminalContextKeys.chatVisible.bindTo(this._contextKeyService);
		this._widgetContainer = document.createElement('div');
		this._widgetContainer.classList.add('terminal-inline-chat');
		this._container.appendChild(this._widgetContainer);
		// this._widget = this._register(this._scopedInstantiationService.createInstance(
		// 	ChatWidget,
		// 	{ viewId: 'terminal' },
		// 	{ supportsFileReferences: false, renderStyle: 'compact' },
		// 	{
		// 		listForeground: editorForeground,
		// 		listBackground: editorBackground,
		// 		inputEditorBackground: inputBackground,
		// 		resultEditorBackground: editorBackground
		// 	}));
		// this._widget.render(this._widgetContainer);
		// this._register(this._widget.onDidFocus(() => this._chatWidgetFocused.set(true)));

		const fakeParentEditorElement = document.createElement('div');

		// const editorConstructionOptions = this.inputEditorOptions.getEditorConstructionOptions();
		// this.setPlaceholderFontStyles(editorConstructionOptions.fontFamily!, editorConstructionOptions.fontSize!, editorConstructionOptions.lineHeight!);

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
				menuId: MenuId.TerminalChat,
				widgetMenuId: MENU_CELL_CHAT_WIDGET,
				statusMenuId: MENU_CELL_CHAT_WIDGET_STATUS,
				feedbackMenuId: MENU_CELL_CHAT_WIDGET_FEEDBACK
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
		// this._widget.setVisible(true);
		this._chatWidgetFocused.set(true);
		this._chatWidgetVisible.set(true);
		// this._widget.setInput('@terminal');
		// this._widget.setInputPlaceholder('Request a terminal command');
		// this._widget.focusInput();
		this._inlineChatWidget.focus();
	}
	hide(): void {
		this._widgetContainer.classList.add('hide');
		this._chatWidgetFocused.set(false);
		this._chatWidgetVisible.set(false);
		// this._widget.clear();
		this._instance.focus();
	}
	cancel(): void {
		// this._widget?.clear();
	}
	acceptInput(): void {
		// this._widget?.acceptInput();
	}
	layout(width: number): void {
		// this._widget?.layout(100, width < 300 ? 300 : width);
	}
	public get focusTracker(): IFocusTracker {
		return this._focusTracker;
	}
}
