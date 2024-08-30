/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/inlineChatContentWidget.css';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from '../../../../editor/browser/editorBrowser.js';
import * as dom from '../../../../base/browser/dom.js';
import { IDimension } from '../../../../editor/common/core/dimension.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IPosition, Position } from '../../../../editor/common/core/position.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { inlineChatBackground, MENU_INLINE_CHAT_CONTENT_STATUS } from '../common/inlineChat.js';
import { Session } from './inlineChatSession.js';
import { ChatWidget, IChatWidgetLocationOptions } from '../../chat/browser/chatWidget.js';
import { ChatAgentLocation } from '../../chat/common/chatAgents.js';
import { editorBackground, editorForeground, inputBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { ChatModel } from '../../chat/common/chatModel.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { ScrollType } from '../../../../editor/common/editorCommon.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { TextOnlyMenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';

export class InlineChatContentWidget implements IContentWidget {

	readonly suppressMouseDown = false;
	readonly allowEditorOverflow = true;

	private readonly _store = new DisposableStore();
	private readonly _domNode = document.createElement('div');
	private readonly _inputContainer = document.createElement('div');
	private readonly _toolbarContainer = document.createElement('div');

	private _position?: IContentWidgetPosition;

	private readonly _onDidBlur = this._store.add(new Emitter<void>());
	readonly onDidBlur: Event<void> = this._onDidBlur.event;

	private _visible: boolean = false;
	private _focusNext: boolean = false;

	private readonly _defaultChatModel: ChatModel;
	private readonly _widget: ChatWidget;

	constructor(
		location: IChatWidgetLocationOptions,
		private readonly _editor: ICodeEditor,
		@IInstantiationService instaService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IQuickInputService quickInputService: IQuickInputService
	) {

		this._defaultChatModel = this._store.add(instaService.createInstance(ChatModel, undefined, ChatAgentLocation.Editor));

		const scopedInstaService = instaService.createChild(
			new ServiceCollection([
				IContextKeyService,
				this._store.add(contextKeyService.createScoped(this._domNode))
			]),
			this._store
		);

		this._widget = scopedInstaService.createInstance(
			ChatWidget,
			location,
			undefined,
			{
				defaultElementHeight: 32,
				editorOverflowWidgetsDomNode: _editor.getOverflowWidgetsDomNode(),
				renderStyle: 'minimal',
				renderInputOnTop: true,
				renderFollowups: true,
				supportsFileReferences: configurationService.getValue(`chat.experimental.variables.${location.location}`) === true,
				menus: {
					telemetrySource: 'inlineChat-content',
					executeToolbar: MenuId.ChatExecute,
				},
				filter: _item => false
			},
			{
				listForeground: editorForeground,
				listBackground: inlineChatBackground,
				inputEditorBackground: inputBackground,
				resultEditorBackground: editorBackground
			}
		);
		this._store.add(this._widget);
		this._widget.render(this._inputContainer);
		this._widget.setModel(this._defaultChatModel, {});
		this._store.add(this._widget.onDidChangeContentHeight(() => _editor.layoutContentWidget(this)));

		this._domNode.tabIndex = -1;
		this._domNode.className = 'inline-chat-content-widget interactive-session';

		this._domNode.appendChild(this._inputContainer);

		this._toolbarContainer.classList.add('toolbar');
		this._domNode.appendChild(this._toolbarContainer);

		const toolbar = this._store.add(scopedInstaService.createInstance(MenuWorkbenchToolBar, this._toolbarContainer, MENU_INLINE_CHAT_CONTENT_STATUS, {
			actionViewItemProvider: action => action instanceof MenuItemAction ? instaService.createInstance(TextOnlyMenuEntryActionViewItem, action, { conversational: true }) : undefined,
			toolbarOptions: { primaryGroup: '0_main' },
			icon: false,
			label: true,
		}));

		this._store.add(toolbar.onDidChangeMenuItems(() => {
			this._domNode.classList.toggle('contents', toolbar.getItemsLength() > 1);
		}));

		// note when the widget has been interaced with and disable "close on blur" if so
		let widgetHasBeenInteractedWith = false;
		this._store.add(this._widget.inputEditor.onDidChangeModelContent(() => {
			widgetHasBeenInteractedWith ||= this._widget.inputEditor.getModel()?.getValueLength() !== 0;
		}));
		this._store.add(this._widget.onDidChangeContext(() => {
			widgetHasBeenInteractedWith ||= true;
			_editor.layoutContentWidget(this);// https://github.com/microsoft/vscode/issues/221385
		}));

		const tracker = dom.trackFocus(this._domNode);
		this._store.add(tracker.onDidBlur(() => {
			if (this._visible && !widgetHasBeenInteractedWith && !quickInputService.currentQuickInput) {
				this._onDidBlur.fire();
			}
		}));
		this._store.add(tracker);
	}

	dispose(): void {
		this._store.dispose();
	}

	getId(): string {
		return 'inline-chat-content-widget';
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		return this._position ?? null;
	}

	beforeRender(): IDimension | null {

		const maxHeight = this._widget.input.inputEditor.getOption(EditorOption.lineHeight) * 5;
		const inputEditorHeight = this._widget.contentHeight;

		const height = Math.min(maxHeight, inputEditorHeight);
		const width = 400;
		this._widget.layout(height, width);

		dom.size(this._domNode, width, null);
		return null;
	}

	afterRender(): void {
		if (this._focusNext) {
			this._focusNext = false;
			this._widget.focusInput();
		}
	}

	// ---

	get chatWidget(): ChatWidget {
		return this._widget;
	}

	get isVisible(): boolean {
		return this._visible;
	}

	get value(): string {
		return this._widget.inputEditor.getValue();
	}

	show(position: IPosition, below: boolean) {
		if (!this._visible) {
			this._visible = true;
			this._focusNext = true;

			this._editor.revealRangeNearTopIfOutsideViewport(Range.fromPositions(position), ScrollType.Immediate);

			const wordInfo = this._editor.getModel()?.getWordAtPosition(position);

			this._position = {
				position: wordInfo ? new Position(position.lineNumber, wordInfo.startColumn) : position,
				preference: [below ? ContentWidgetPositionPreference.BELOW : ContentWidgetPositionPreference.ABOVE]
			};

			this._editor.addContentWidget(this);
			this._widget.setContext(true);
			this._widget.setVisible(true);
		}
	}

	hide() {
		if (this._visible) {
			this._visible = false;
			this._editor.removeContentWidget(this);
			this._widget.inputEditor.setValue('');
			this._widget.saveState();
			this._widget.setVisible(false);
		}
	}

	setSession(session: Session): void {
		this._widget.setModel(session.chatModel, {});
		this._widget.setInputPlaceholder(session.agent.description ?? '');
	}
}
