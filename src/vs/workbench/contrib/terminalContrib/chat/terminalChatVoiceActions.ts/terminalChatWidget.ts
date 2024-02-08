/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Widget } from 'vs/base/browser/ui/widget';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ITerminalInstance, IDetachedTerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import * as dom from 'vs/base/browser/dom';
import { KeyCode } from 'vs/base/common/keyCodes';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { _inputEditorOptions } from 'vs/workbench/contrib/inlineChat/browser/inlineChatWidget';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { IModelService } from 'vs/editor/common/services/model';
import { URI } from 'vs/base/common/uri';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IVoiceChatExecuteActionContext } from 'vs/workbench/contrib/chat/browser/actions/chatExecuteActions';
import { ActionViewItem, IActionViewItemOptions } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { IAction } from 'vs/base/common/actions';
import { ChatSubmitEditorAction, ChatSubmitSecondaryAgentEditorAction } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { chatAgentLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';

const INPUT_EDITOR_MAX_HEIGHT = 250;

export class TerminalChatWidget extends Widget {
	private readonly _focusTracker: dom.IFocusTracker;
	private readonly _domNode: HTMLElement;
	private _toolbar!: MenuWorkbenchToolBar;
	private _isVisible: boolean = false;
	private _width: number = 0;
	private _chatWidgetFocused: IContextKey<boolean>;
	private _chatWidgetVisible: IContextKey<boolean>;
	// TODO: add a IChatModel to this widget, set this to true when a session is started and false when it is ended
	private _chatSessionInProgress: IContextKey<boolean>;
	private _chatInputHasText: IContextKey<boolean>;
	private _widget: CodeEditorWidget | undefined;
	private _inputEditorHeight: number = 0;

	constructor(
		private readonly _instance: ITerminalInstance | IDetachedTerminalInstance,
		@IContextViewService _contextViewService: IContextViewService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IContextMenuService _contextMenuService: IContextMenuService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IModelService private readonly _modelService: IModelService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super();
		this._domNode = document.createElement('div');
		this._domNode.classList.add('terminal-chat-widget');
		this.onkeyup(this._domNode, e => {
			if (e.equals(KeyCode.Escape)) {
				this.hide();
				e.preventDefault();
				return;
			}
		});
		this._chatWidgetFocused = TerminalContextKeys.chatFocused.bindTo(this._contextKeyService);
		this._chatWidgetVisible = TerminalContextKeys.chatVisible.bindTo(this._contextKeyService);
		this._chatSessionInProgress = TerminalContextKeys.chatSessionInProgress.bindTo(this._contextKeyService);
		this._chatInputHasText = TerminalContextKeys.chatInputHasText.bindTo(this._contextKeyService);
		this._focusTracker = this._register(dom.trackFocus(this._domNode));
		this._register(this._focusTracker.onDidFocus(this._onFocusTrackerFocus.bind(this)));
		this._register(this._focusTracker.onDidBlur(this._onFocusTrackerBlur.bind(this)));
	}

	public hide(animated = true): void {
		if (this._isVisible) {
			this._isVisible = false;
			this._chatWidgetVisible.reset();
			this._domNode.classList.toggle('suppress-transition', !animated);
			this._domNode.classList.remove('visible-transition');
			this._domNode.setAttribute('aria-hidden', 'true');
			this._instance.focus();

			// Need to delay toggling visibility until after Transition, then visibility hidden - removes from tabIndex list
			setTimeout(() => {
				this._domNode.classList.add('hide');
				this._domNode.classList.remove('visible', 'suppress-transition');
			}, animated ? 200 : 0);
		}
	}

	public layout(width: number = this._width): void {
		this._width = width;
	}

	public isVisible(): boolean {
		return this._isVisible;
	}

	public getDomNode() {
		return this._domNode;
	}

	public get focusTracker(): dom.IFocusTracker {
		return this._focusTracker;
	}

	public reveal(animated = true): void {
		if (this._isVisible) {
			return;
		}

		this._isVisible = true;
		this._domNode.classList.remove('hide');
		this.layout();
		this._chatWidgetVisible.set(true);
		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			isSimpleWidget: true,
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([
				SnippetController2.ID,
				SuggestController.ID
			])
		};
		setTimeout(() => {
			this._domNode.classList.toggle('suppress-transition', !animated);
			this._domNode.classList.add('visible', 'visible-transition');
			this._domNode.setAttribute('aria-hidden', 'false');
			this._domNode.style.zIndex = '33 !important';
			if (!animated) {
				setTimeout(() => {
					this._domNode.classList.remove('suppress-transition');
				}, 0);
			}
			this._widget = this._instantiationService.createInstance(CodeEditorWidget, this._domNode, _inputEditorOptions, codeEditorWidgetOptions);
			this._widget.setModel(undefined);
			if (!this._widget.getModel()) {
				let model = this._modelService.getModel(URI.from({ path: `terminalInlineChatWidget`, scheme: 'terminalInlineChatWidget', fragment: 'Chat Widget' }));
				if (!model) {
					model = this._modelService.createModel('', null, URI.from({ path: `terminalInlineChatWidget`, scheme: 'terminalInlineChatWidget', fragment: 'Chat Widget' }), true);
				}
				this._widget.setModel(model);
			}
			const widgetDomNode = this._widget.getDomNode();
			if (!widgetDomNode) {
				return;
			}
			this._domNode.appendChild(widgetDomNode);
			this._register(this._widget.onDidChangeModelContent(() => {
				const currentHeight = Math.min(this._widget!.getContentHeight(), INPUT_EDITOR_MAX_HEIGHT);
				if (currentHeight !== this._inputEditorHeight) {
					this._inputEditorHeight = currentHeight;
					widgetDomNode.style.height = `${currentHeight}px`;
				}

				const model = this._widget!.getModel();
				const inputHasText = !!model && model.getValueLength() > 0;
				this._chatInputHasText.set(inputHasText);
			}));

			this._toolbar = this._register(this._instantiationService.createInstance(MenuWorkbenchToolBar, widgetDomNode, MenuId.TerminalChatExecute, {
				menuOptions: {
					shouldForwardArgs: true
				},
				hiddenItemStrategy: HiddenItemStrategy.Ignore, // keep it lean when hiding items and avoid a "..." overflow menu
				actionViewItemProvider: (action, options) => {
					if (action.id === TerminalCommandId.SubmitChat) {
						return this._instantiationService.createInstance(SubmitButtonActionViewItem, { widget: this._widget }, action, options);
					}

					return undefined;
				}
			}));
			this._toolbar.getElement().classList.add('interactive-execute-toolbar');
			this._toolbar.context = { widget: this._widget };
			this._domNode.appendChild(this._toolbar.getElement());
			this._widget.focus();
		}, 0);
	}

	public acceptInput(): void {
		if (!this._isVisible) {
			return;
		} else {
			// TODO: Implement
			console.log(`accepted input ${this._widget?.getValue()}`);
		}
	}

	public cancel(): void {
		// TODO: Implement
		this._chatSessionInProgress.reset();
	}

	protected _onFocusTrackerFocus() {
		this._chatWidgetFocused.set(true);
	}

	protected _onFocusTrackerBlur() {
		this._chatWidgetFocused.reset();
	}
}

class SubmitButtonActionViewItem extends ActionViewItem {
	private readonly _tooltip: string;

	constructor(
		context: {
			widget?: CodeEditorWidget;
			inputValue?: string;
			voice?: IVoiceChatExecuteActionContext;
		},
		action: IAction,
		options: IActionViewItemOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IChatAgentService chatAgentService: IChatAgentService,
	) {
		super(context, action, options);

		const primaryKeybinding = keybindingService.lookupKeybinding(ChatSubmitEditorAction.ID)?.getLabel();
		let tooltip = action.label;
		if (primaryKeybinding) {
			tooltip += ` (${primaryKeybinding})`;
		}

		const secondaryAgent = chatAgentService.getSecondaryAgent();
		if (secondaryAgent) {
			const secondaryKeybinding = keybindingService.lookupKeybinding(ChatSubmitSecondaryAgentEditorAction.ID)?.getLabel();
			if (secondaryKeybinding) {
				tooltip += `\n${chatAgentLeader}${secondaryAgent.id} (${secondaryKeybinding})`;
			}
		}

		this._tooltip = tooltip;
	}

	protected override getTooltip(): string | undefined {
		return this._tooltip;
	}
}
