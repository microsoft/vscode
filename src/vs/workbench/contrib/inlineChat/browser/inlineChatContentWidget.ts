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
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { inlineChatBackground } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { Session } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { ChatWidget } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { ChatAgentLocation } from 'vs/workbench/contrib/chat/common/chatAgents';
import { editorBackground, editorForeground, inputBackground } from 'vs/platform/theme/common/colorRegistry';
import { ChatModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { Range } from 'vs/editor/common/core/range';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { EditorOption } from 'vs/editor/common/config/editorOptions';

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

	private readonly _defaultChatModel: ChatModel;
	private readonly _widget: ChatWidget;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService instaService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {

		this._defaultChatModel = this._store.add(instaService.createInstance(ChatModel, `inlineChatDefaultModel/editorContentWidgetPlaceholder`, undefined));

		const scopedInstaService = instaService.createChild(
			new ServiceCollection([
				IContextKeyService,
				this._store.add(contextKeyService.createScoped(this._domNode))
			])
		);

		this._widget = scopedInstaService.createInstance(
			ChatWidget,
			ChatAgentLocation.Editor,
			{ resource: true },
			{
				defaultElementHeight: 32,
				editorOverflowWidgetsDomNode: _editor.getOverflowWidgetsDomNode(),
				renderStyle: 'compact',
				renderInputOnTop: true,
				supportsFileReferences: false,
				menus: {
					telemetrySource: 'inlineChat-content'
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
		this._store.add(this._widget.inputEditor.onDidContentSizeChange(() => _editor.layoutContentWidget(this)));

		this._domNode.tabIndex = -1;
		this._domNode.className = 'inline-chat-content-widget interactive-session';

		this._domNode.appendChild(this._inputContainer);

		this._messageContainer.classList.add('hidden', 'message');
		this._domNode.appendChild(this._messageContainer);


		const tracker = dom.trackFocus(this._domNode);
		this._store.add(tracker.onDidBlur(() => {
			if (this._visible
				// && !"ON"
			) {
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
		if (!this._position) {
			return null;
		}
		return {
			position: this._position,
			preference: [ContentWidgetPositionPreference.ABOVE]
		};
	}

	beforeRender(): IDimension | null {

		const maxHeight = this._widget.input.inputEditor.getOption(EditorOption.lineHeight) * 5;
		const inputEditorHeight = this._widget.inputEditor.getContentHeight();

		this._widget.inputEditor.layout(new dom.Dimension(360, Math.min(maxHeight, inputEditorHeight)));

		// const actualHeight = this._widget.inputPartHeight;
		// return new dom.Dimension(width, actualHeight);
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

	show(position: IPosition) {
		if (!this._visible) {
			this._visible = true;
			this._focusNext = true;

			this._editor.revealRangeNearTopIfOutsideViewport(Range.fromPositions(position));
			this._widget.inputEditor.setValue('');

			const wordInfo = this._editor.getModel()?.getWordAtPosition(position);

			this._position = wordInfo ? new Position(position.lineNumber, wordInfo.startColumn) : position;
			this._editor.addContentWidget(this);
			this._widget.setVisible(true);
		}
	}

	hide() {
		if (this._visible) {
			this._visible = false;
			this._editor.removeContentWidget(this);
			this._widget.saveState();
			this._widget.setVisible(false);
		}
	}

	setSession(session: Session): void {
		this._widget.setModel(session.chatModel, {});
		this._widget.setInputPlaceholder(session.session.placeholder ?? '');
		this._updateMessage(session.session.message ?? '');
	}

	private _updateMessage(message: string) {
		this._messageContainer.classList.toggle('hidden', !message);
		const renderedMessage = renderLabelWithIcons(message);
		dom.reset(this._messageContainer, ...renderedMessage);
		this._editor.layoutContentWidget(this);
	}
}
