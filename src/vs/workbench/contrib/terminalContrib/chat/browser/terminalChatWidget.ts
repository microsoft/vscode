/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, IFocusTracker, trackFocus } from 'vs/base/browser/dom';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/terminalChatWidget';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { localize } from 'vs/nls';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IChatAccessibilityService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatProgress } from 'vs/workbench/contrib/chat/common/chatService';
import { InlineChatWidget } from 'vs/workbench/contrib/inlineChat/browser/inlineChatWidget';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { MENU_TERMINAL_CHAT_INPUT, MENU_TERMINAL_CHAT_WIDGET, MENU_TERMINAL_CHAT_WIDGET_FEEDBACK, MENU_TERMINAL_CHAT_WIDGET_STATUS } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChat';

export class TerminalChatWidget extends Disposable {
	private readonly _scopedInstantiationService: IInstantiationService;
	private readonly _widgetContainer: HTMLElement;
	private readonly _ctxChatWidgetFocused: IContextKey<boolean>;
	private readonly _ctxChatWidgetVisible: IContextKey<boolean>;
	private readonly _ctxResponseEditorFocused!: IContextKey<boolean>;

	private readonly _inlineChatWidget: InlineChatWidget;
	private readonly _responseElement: HTMLElement;
	private readonly _focusTracker: IFocusTracker;
	private _responseWidget: CodeEditorWidget | undefined;

	public get inlineChatWidget(): InlineChatWidget { return this._inlineChatWidget; }

	constructor(
		private readonly _container: HTMLElement,
		private readonly _instance: ITerminalInstance,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IChatAccessibilityService private readonly _chatAccessibilityService: IChatAccessibilityService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IModelService private readonly _modelService: IModelService
	) {
		super();
		const scopedContextKeyService = this._register(this._contextKeyService.createScoped(this._container));
		this._scopedInstantiationService = instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService]));
		this._ctxChatWidgetFocused = TerminalContextKeys.chatFocused.bindTo(this._contextKeyService);
		this._ctxChatWidgetVisible = TerminalContextKeys.chatVisible.bindTo(this._contextKeyService);
		this._ctxResponseEditorFocused = TerminalContextKeys.chatResponseEditorFocused.bindTo(this._contextKeyService);

		this._widgetContainer = document.createElement('div');
		this._widgetContainer.classList.add('terminal-inline-chat');
		this._container.appendChild(this._widgetContainer);

		this._responseElement = document.createElement('div');
		this._responseElement.classList.add('terminal-inline-chat-response');
		this._widgetContainer.prepend(this._responseElement);

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
		this._inlineChatWidget.updateInfo(localize('welcome.1', "AI-generated commands may be incorrect"));
		this._widgetContainer.appendChild(this._inlineChatWidget.domNode);

		this._focusTracker = this._register(trackFocus(this._widgetContainer));
	}
	renderTerminalCommand(codeBlock: string, requestId: number, shellType?: string): void {
		this._chatAccessibilityService.acceptResponse(codeBlock, requestId);
		this._responseElement.classList.remove('hide');
		if (!this._responseWidget) {
			this._responseWidget = this._register(this._scopedInstantiationService.createInstance(CodeEditorWidget, this._responseElement, {
				padding: { top: 2, bottom: 2 },
				overviewRulerLanes: 0,
				glyphMargin: false,
				lineNumbers: 'off',
				folding: false,
				hideCursorInOverviewRuler: true,
				selectOnLineNumbers: false,
				selectionHighlight: false,
				scrollbar: {
					useShadows: false,
					vertical: 'hidden',
					horizontal: 'auto',
					alwaysConsumeMouseWheel: false
				},
				lineDecorationsWidth: 0,
				overviewRulerBorder: false,
				scrollBeyondLastLine: false,
				renderLineHighlight: 'none',
				fixedOverflowWidgets: true,
				dragAndDrop: false,
				revealHorizontalRightPadding: 5,
				minimap: { enabled: false },
				guides: { indentation: false },
				rulers: [],
				renderWhitespace: 'none',
				dropIntoEditor: { enabled: true },
				quickSuggestions: false,
				suggest: {
					showIcons: false,
					showSnippets: false,
					showWords: true,
					showStatusBar: false,
				},
			}, { isSimpleWidget: true }));
			this._register(this._responseWidget.onDidFocusEditorText(() => this._ctxResponseEditorFocused.set(true)));
			this._register(this._responseWidget.onDidBlurEditorText(() => this._ctxResponseEditorFocused.set(false)));
			this._getTextModel(URI.from({ path: `terminal-inline-chat-${this._instance.instanceId}`, scheme: 'terminal-inline-chat', fragment: codeBlock })).then((model) => {
				if (!model || !this._responseWidget) {
					return;
				}
				this._responseWidget.layout(new Dimension(400, 0));
				this._responseWidget.setModel(model);
				const height = this._responseWidget.getContentHeight();
				this._responseWidget.layout(new Dimension(400, height));
			});
		} else {
			this._responseWidget.setValue(codeBlock);
		}
		this._responseWidget.getModel()?.setLanguage(this._getLanguageFromShell(shellType));
	}

	private _getLanguageFromShell(shell?: string): string {
		switch (shell) {
			case 'fish':
				return this._languageService.isRegisteredLanguageId('fish') ? 'fish' : 'shellscript';
			case 'zsh':
				return this._languageService.isRegisteredLanguageId('zsh') ? 'zsh' : 'shellscript';
			case 'bash':
				return this._languageService.isRegisteredLanguageId('bash') ? 'bash' : 'shellscript';
			case 'sh':
				return 'shellscript';
			case 'pwsh':
				return 'powershell';
			default:
				return 'plaintext';
		}
	}

	renderMessage(message: string, accessibilityRequestId: number, requestId: string): void {
		this._responseElement.classList.add('hide');
		this._inlineChatWidget.updateChatMessage({ message: new MarkdownString(message), requestId, providerId: 'terminal' });
		this._chatAccessibilityService.acceptResponse(message, accessibilityRequestId);
	}

	private async _getTextModel(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}
		return this._modelService.createModel(resource.fragment, null, resource, false);
	}
	reveal(): void {
		this._inlineChatWidget.layout(new Dimension(400, 150));
		this._widgetContainer.classList.remove('hide');
		this._ctxChatWidgetFocused.set(true);
		this._ctxChatWidgetVisible.set(true);
		this._inlineChatWidget.focus();
	}
	hide(): void {
		this._responseElement?.classList.add('hide');
		this._widgetContainer.classList.add('hide');
		this._inlineChatWidget.value = '';
		this._responseWidget?.setValue('');
		this._ctxChatWidgetFocused.set(false);
		this._ctxChatWidgetVisible.set(false);
		this._instance.focus();
	}
	cancel(): void {
		// TODO: Impl
		this._inlineChatWidget.value = '';
	}
	focus(): void {
		this._inlineChatWidget.focus();
	}
	hasFocus(): boolean {
		return this._inlineChatWidget.hasFocus();
	}
	input(): string {
		return this._inlineChatWidget.value;
	}
	setValue(value?: string) {
		this._inlineChatWidget.value = value ?? '';
		if (!value) {
			this._responseElement?.classList.add('hide');
		}
	}
	acceptCommand(): void {
		const value = this._responseWidget?.getValue();
		if (!value) {
			return;
		}
		this._instance.sendText(value, false, true);
		this.hide();
	}
	updateProgress(progress?: IChatProgress): void {
		this._inlineChatWidget.updateProgress(progress?.kind === 'content' || progress?.kind === 'markdownContent');
	}
	public get focusTracker(): IFocusTracker {
		return this._focusTracker;
	}
}
