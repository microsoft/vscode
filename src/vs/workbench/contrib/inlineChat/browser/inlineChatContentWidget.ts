/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/inlineChatContentWidget';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import * as dom from 'vs/base/browser/dom';
import { IDimension } from 'vs/editor/common/core/dimension';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { clamp } from 'vs/base/common/numbers';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ChatInputPart } from 'vs/workbench/contrib/chat/browser/chatInputPart';
import { MENU_INLINE_CHAT_INPUT } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { Session } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';

export class InlineChatContentWidget implements IContentWidget {

	readonly suppressMouseDown = false;
	readonly allowEditorOverflow = true;

	private readonly _store = new DisposableStore();
	private readonly _domNode = document.createElement('div');
	private readonly _inputContainer = document.createElement('div');
	private readonly _messageContainer = document.createElement('div');

	private _position?: IPosition;

	private readonly _onDidBlur = this._store.add(new Emitter<void>());
	readonly onDidBlur: Event<void> = this._onDidBlur.event;

	private _visible: boolean = false;
	private _focusNext: boolean = false;
	private readonly _widget: ChatInputPart;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService instaService: IInstantiationService,
	) {

		this._widget = instaService.createInstance(ChatInputPart, {
			renderFollowups: false, renderStyle: 'compact',
			menus: {
				executeToolbar: MENU_INLINE_CHAT_INPUT,
				telemetrySource: 'inlineChat'
			}
		});

		this._widget.render(this._inputContainer, '', null!);
		this._widget.setImplicitContextKinds([]);
		this._store.add(this._widget);
		this._store.add(this._widget.onDidChangeHeight(() => _editor.layoutContentWidget(this)));

		this._domNode.tabIndex = -1;
		this._domNode.className = 'inline-chat-content-widget interactive-session';

		this._domNode.appendChild(this._inputContainer);

		this._messageContainer.classList.add('hidden', 'message');
		this._domNode.appendChild(this._messageContainer);


		const tracker = dom.trackFocus(this._domNode);
		this._store.add(tracker.onDidBlur(() => {
			if (this._visible) {
				// this._onDidBlur.fire();
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
		if (!this._position) {
			return null;
		}
		return {
			position: this._position,
			preference: [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW]
		};
	}

	beforeRender(): IDimension | null {

		const contentWidth = this._editor.getLayoutInfo().contentWidth;
		const minWidth = Math.round(contentWidth * 0.33);
		const maxWidth = Math.round(contentWidth * 0.66);

		const width = clamp(220, minWidth, maxWidth);
		this._widget.layout(220, width);

		// const actualHeight = this._widget.inputPartHeight;
		// return new dom.Dimension(width, actualHeight);
		return null;
	}

	afterRender(): void {
		if (this._focusNext) {
			this._focusNext = false;
			this._widget.focus();
		}
	}

	// ---

	get isVisible(): boolean {
		return this._visible;
	}

	get value(): string {
		return this._widget.inputEditor.getValue();
	}

	show(position: IPosition) {
		if (!this._visible) {
			this._visible = true;
			this._focusNext = true;

			this._widget.setValue('');

			const wordInfo = this._editor.getModel()?.getWordAtPosition(position);

			this._position = wordInfo ? new Position(position.lineNumber, wordInfo.startColumn) : position;
			this._editor.addContentWidget(this);
		}
	}

	hide() {
		if (this._visible) {
			this._visible = false;
			this._editor.removeContentWidget(this);
		}
	}

	setSession(model: Session): void {
		this._widget.setState(model.chatModel.providerId, '');
		this._updateMessage(model.session.message ?? '');
	}

	private _updateMessage(message: string) {
		this._messageContainer.classList.toggle('hidden', !message);
		const renderedMessage = renderLabelWithIcons(message);
		dom.reset(this._messageContainer, ...renderedMessage);
		this._editor.layoutContentWidget(this);
	}

	acceptInput(): void {
		this._widget.acceptInput(this._widget.inputEditor.getValue());
		this._widget.saveState();
	}
}
