/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderMarkdown } from 'vs/base/browser/markdownRenderer';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { Event } from 'vs/base/common/event';
import { IMarkdownString, isMarkdownString } from 'vs/base/common/htmlContent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { DisposableStore, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./messageController';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { EditorCommand, EditorContributionInstantiation, registerEditorCommand, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IPosition } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution, ScrollType } from 'vs/editor/common/editorCommon';
import { PositionAffinity } from 'vs/editor/common/model';
import { openLinkFromMarkdown } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import * as nls from 'vs/nls';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import * as dom from 'vs/base/browser/dom';

export class MessageController implements IEditorContribution {

	public static readonly ID = 'editor.contrib.messageController';

	static readonly MESSAGE_VISIBLE = new RawContextKey<boolean>('messageVisible', false, nls.localize('messageVisible', 'Whether the editor is currently showing an inline message'));

	static get(editor: ICodeEditor): MessageController | null {
		return editor.getContribution<MessageController>(MessageController.ID);
	}

	private readonly _editor: ICodeEditor;
	private readonly _visible: IContextKey<boolean>;
	private readonly _messageWidget = new MutableDisposable<MessageWidget>();
	private readonly _messageListeners = new DisposableStore();
	private _message: { element: HTMLElement; dispose: () => void } | undefined;
	private _mouseOverMessage: boolean = false;

	constructor(
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IOpenerService private readonly _openerService: IOpenerService
	) {

		this._editor = editor;
		this._visible = MessageController.MESSAGE_VISIBLE.bindTo(contextKeyService);
	}

	dispose(): void {
		this._message?.dispose();
		this._messageListeners.dispose();
		this._messageWidget.dispose();
		this._visible.reset();
	}

	isVisible() {
		return this._visible.get();
	}

	showMessage(message: IMarkdownString | string, position: IPosition): void {

		alert(isMarkdownString(message) ? message.value : message);

		this._visible.set(true);
		this._messageWidget.clear();
		this._messageListeners.clear();
		this._message = isMarkdownString(message) ? renderMarkdown(message, {
			actionHandler: {
				callback: (url) => {
					this.closeMessage();
					openLinkFromMarkdown(this._openerService, url, isMarkdownString(message) ? message.isTrusted : undefined);
				},
				disposables: this._messageListeners
			},
		}) : undefined;
		this._messageWidget.value = new MessageWidget(this._editor, position, typeof message === 'string' ? message : this._message!.element);

		// close on blur (debounced to allow to tab into the message), cursor, model change, dispose
		this._messageListeners.add(Event.debounce(this._editor.onDidBlurEditorText, (last, event) => event, 0)(() => {
			if (this._mouseOverMessage) {
				return; // override when mouse over message
			}

			if (this._messageWidget.value && dom.isAncestor(dom.getActiveElement(), this._messageWidget.value.getDomNode())) {
				return; // override when focus is inside the message
			}

			this.closeMessage();
		}
		));
		this._messageListeners.add(this._editor.onDidChangeCursorPosition(() => this.closeMessage()));
		this._messageListeners.add(this._editor.onDidDispose(() => this.closeMessage()));
		this._messageListeners.add(this._editor.onDidChangeModel(() => this.closeMessage()));
		this._messageListeners.add(dom.addDisposableListener(this._messageWidget.value.getDomNode(), dom.EventType.MOUSE_ENTER, () => this._mouseOverMessage = true, true));
		this._messageListeners.add(dom.addDisposableListener(this._messageWidget.value.getDomNode(), dom.EventType.MOUSE_LEAVE, () => this._mouseOverMessage = false, true));

		// close on mouse move
		let bounds: Range;
		this._messageListeners.add(this._editor.onMouseMove(e => {
			// outside the text area
			if (!e.target.position) {
				return;
			}

			if (!bounds) {
				// define bounding box around position and first mouse occurance
				bounds = new Range(position.lineNumber - 3, 1, e.target.position.lineNumber + 3, 1);
			} else if (!bounds.containsPosition(e.target.position)) {
				// check if position is still in bounds
				this.closeMessage();
			}
		}));
	}

	closeMessage(): void {
		this._visible.reset();
		this._messageListeners.clear();
		if (this._messageWidget.value) {
			this._messageListeners.add(MessageWidget.fadeOut(this._messageWidget.value));
		}
	}
}

const MessageCommand = EditorCommand.bindToContribution<MessageController>(MessageController.get);


registerEditorCommand(new MessageCommand({
	id: 'leaveEditorMessage',
	precondition: MessageController.MESSAGE_VISIBLE,
	handler: c => c.closeMessage(),
	kbOpts: {
		weight: KeybindingWeight.EditorContrib + 30,
		primary: KeyCode.Escape
	}
}));

class MessageWidget implements IContentWidget {

	// Editor.IContentWidget.allowEditorOverflow
	readonly allowEditorOverflow = true;
	readonly suppressMouseDown = false;

	private readonly _editor: ICodeEditor;
	private readonly _position: IPosition;
	private readonly _domNode: HTMLDivElement;

	static fadeOut(messageWidget: MessageWidget): IDisposable {
		const dispose = () => {
			messageWidget.dispose();
			clearTimeout(handle);
			messageWidget.getDomNode().removeEventListener('animationend', dispose);
		};
		const handle = setTimeout(dispose, 110);
		messageWidget.getDomNode().addEventListener('animationend', dispose);
		messageWidget.getDomNode().classList.add('fadeOut');
		return { dispose };
	}

	constructor(editor: ICodeEditor, { lineNumber, column }: IPosition, text: HTMLElement | string) {

		this._editor = editor;
		this._editor.revealLinesInCenterIfOutsideViewport(lineNumber, lineNumber, ScrollType.Smooth);
		this._position = { lineNumber, column };

		this._domNode = document.createElement('div');
		this._domNode.classList.add('monaco-editor-overlaymessage');
		this._domNode.style.marginLeft = '-6px';

		const anchorTop = document.createElement('div');
		anchorTop.classList.add('anchor', 'top');
		this._domNode.appendChild(anchorTop);

		const message = document.createElement('div');
		if (typeof text === 'string') {
			message.classList.add('message');
			message.textContent = text;
		} else {
			text.classList.add('message');
			message.appendChild(text);
		}
		this._domNode.appendChild(message);

		const anchorBottom = document.createElement('div');
		anchorBottom.classList.add('anchor', 'below');
		this._domNode.appendChild(anchorBottom);

		this._editor.addContentWidget(this);
		this._domNode.classList.add('fadeIn');
	}

	dispose() {
		this._editor.removeContentWidget(this);
	}

	getId(): string {
		return 'messageoverlay';
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IContentWidgetPosition {
		return {
			position: this._position,
			preference: [
				ContentWidgetPositionPreference.ABOVE,
				ContentWidgetPositionPreference.BELOW,
			],
			positionAffinity: PositionAffinity.Right,
		};
	}

	afterRender(position: ContentWidgetPositionPreference | null): void {
		this._domNode.classList.toggle('below', position === ContentWidgetPositionPreference.BELOW);
	}

}

registerEditorContribution(MessageController.ID, MessageController, EditorContributionInstantiation.Lazy);
