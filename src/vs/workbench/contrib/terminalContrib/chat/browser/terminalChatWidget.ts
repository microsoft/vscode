/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { editorBackground, editorForeground, inputBackground } from 'vs/platform/theme/common/colorRegistry';
import { ChatWidget } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { IDetachedTerminalInstance, ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';

export class TerminalChatWidget extends Disposable {
	private _widget: ChatWidget | undefined;
	private _scopedInstantiationService: IInstantiationService;
	private readonly _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;
	private _widgetContainer: HTMLElement | undefined;
	private _chatWidgetFocused: IContextKey<boolean>;
	private _chatWidgetVisible: IContextKey<boolean>;
	constructor(
		private readonly _container: HTMLElement,
		private readonly _instance: ITerminalInstance | IDetachedTerminalInstance,

		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService) {
		super();
		const scopedContextKeyService = this._register(this._contextKeyService.createScoped(this._container));
		this._scopedInstantiationService = this._instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService]));
		this._chatWidgetFocused = TerminalContextKeys.chatFocused.bindTo(this._contextKeyService);
		this._chatWidgetVisible = TerminalContextKeys.chatVisible.bindTo(this._contextKeyService);
	}
	reveal(): void {
		this._widgetContainer = document.createElement('div');
		this._widgetContainer.classList.add('terminal-chat-widget');
		this._widget = this._register(this._scopedInstantiationService.createInstance(
			ChatWidget,
			{ viewId: 'terminal' },
			{ supportsFileReferences: false, renderStyle: 'compact' },
			{
				listForeground: editorForeground,
				listBackground: editorBackground,
				inputEditorBackground: inputBackground,
				resultEditorBackground: editorBackground
			}));
		this._widget.render(this._widgetContainer);
		this._container.appendChild(this._widgetContainer);
		this._register(this._widget.onDidFocus(() => {
			this._onDidFocus.fire();
			this._chatWidgetFocused.set(true);
		}));
		this._widget.setVisible(true);
		this._chatWidgetVisible.set(true);
		this._widget.setInput('@terminal');
		this._widget.setInputPlaceholder('Request a terminal command');
		this._widget.focusInput();
	}
	hide(): void {
		if (this._widgetContainer) {
			this._container.removeChild(this._widgetContainer);
		}
		this._chatWidgetVisible.set(false);
	}
	cancel(): void {
		this._widget?.clear();
	}
	acceptInput(): void {
		this._widget?.acceptInput();
	}
	layout(width: number): void {
		this._widget?.layout(40, width);
	}
}
