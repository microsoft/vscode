/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./messageController';
import { any } from 'vs/base/common/event';
import { setDisposableTimeout } from 'vs/base/common/async';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { commonEditorContribution, CommonEditorRegistry, EditorCommand } from 'vs/editor/common/editorCommonExtensions';
import { ICodeEditor, IContentWidget, IContentWidgetPosition, ContentWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';
import { IContextKeyService, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';

@commonEditorContribution
export class MessageController {

	private static _id = 'editor.contrib.messageController';

	static CONTEXT_SNIPPET_MODE = new RawContextKey<boolean>('messageVisible', false);

	static get(editor: editorCommon.ICommonCodeEditor): MessageController {
		return editor.getContribution<MessageController>(MessageController._id);
	}

	getId(): string {
		return MessageController._id;
	}

	private _editor: ICodeEditor;
	private _visible: IContextKey<boolean>;
	private _messageWidget: MessageWidget;
	private _messageListeners: IDisposable[] = [];

	constructor(
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		this._editor = editor;
		this._visible = MessageController.CONTEXT_SNIPPET_MODE.bindTo(contextKeyService);
	}

	dispose() {
		this._visible.reset();
	}

	showMessage(message: string, position: editorCommon.IPosition): void {

		this._visible.set(true);
		dispose(this._messageWidget);
		this._messageListeners = dispose(this._messageListeners);
		this._messageWidget = new MessageWidget(this._editor, position, message);

		// close on blur, cursor, model change, dispose
		this._messageListeners.push(any<any>(
			this._editor.onDidBlurEditorText,
			this._editor.onDidChangeCursorPosition,
			this._editor.onDidDispose,
			this._editor.onDidChangeModel
		)(this.closeMessage, this));

		// close after 3s
		this._messageListeners.push(setDisposableTimeout(() => this.closeMessage(), 3000));

		// close on mouse move
		let bounds: Range;
		this._messageListeners.push(this._editor.onMouseMove(e => {
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
		this._messageListeners = dispose(this._messageListeners);
		this._messageListeners.push(MessageWidget.fadeOut(this._messageWidget));
	}
}

const MessageCommand = EditorCommand.bindToContribution<MessageController>(MessageController.get);


CommonEditorRegistry.registerEditorCommand(new MessageCommand({
	id: 'leaveEditorMessage',
	precondition: MessageController.CONTEXT_SNIPPET_MODE,
	handler: c => c.closeMessage(),
	kbOpts: {
		weight: CommonEditorRegistry.commandWeight(30),
		primary: KeyCode.Escape
	}
}));

class MessageWidget implements IContentWidget {

	// Editor.IContentWidget.allowEditorOverflow
	readonly allowEditorOverflow = true;
	readonly suppressMouseDown = false;

	private _editor: ICodeEditor;
	private _position: editorCommon.IPosition;
	private _domNode: HTMLDivElement;

	static fadeOut(messageWidget: MessageWidget): IDisposable {
		let handle: number;
		const dispose = () => {
			messageWidget.dispose();
			clearTimeout(handle);
			messageWidget.getDomNode().removeEventListener('animationend', dispose);
		};
		handle = setTimeout(dispose, 110);
		messageWidget.getDomNode().addEventListener('animationend', dispose);
		messageWidget.getDomNode().classList.add('fadeOut');
		return { dispose };
	}

	constructor(editor: ICodeEditor, { lineNumber, column }: editorCommon.IPosition, text: string) {

		this._editor = editor;
		this._editor.revealLinesInCenterIfOutsideViewport(lineNumber, lineNumber);
		this._position = { lineNumber, column: 1 };

		this._domNode = document.createElement('div');
		this._domNode.style.paddingLeft = `${editor.getOffsetForColumn(lineNumber, column) - 6}px`;
		this._domNode.classList.add('monaco-editor-overlaymessage');

		const message = document.createElement('div');
		message.classList.add('message');
		message.textContent = text;
		this._domNode.appendChild(message);

		const anchor = document.createElement('div');
		anchor.classList.add('anchor');
		this._domNode.appendChild(anchor);

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
		return { position: this._position, preference: [ContentWidgetPositionPreference.ABOVE] };
	}
}
