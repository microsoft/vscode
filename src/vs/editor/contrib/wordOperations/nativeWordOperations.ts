/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Disposable } from 'vs/base/common/lifecycle';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ICodeEditor, IContentWidget, IContentWidgetPosition, ContentWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IPosition } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { registerEditorContribution, EditorCommand, registerEditorCommand } from 'vs/editor/browser/editorExtensions';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';

export class NativeWordController extends Disposable implements editorCommon.IEditorContribution {
	private static readonly _id = 'editor.contrib.nativeWordController';

	static get(editor: ICodeEditor): NativeWordController {
		return editor.getContribution<NativeWordController>(NativeWordController._id);
	}

	getId(): string {
		return NativeWordController._id;
	}

	private _editor: ICodeEditor;
	private _widget: NativeLineEditableContent;

	constructor(
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super();
		this._editor = editor;
		this._widget = new NativeLineEditableContent(this._editor);
	}

	moveLeft() {
		let position = this._editor.getPosition();
		let newPosition = this._widget.moveWordLeft(this._editor, position);
		console.log(newPosition);
		this._editor.setSelections([new Selection(newPosition.lineNumber, newPosition.column, newPosition.lineNumber, newPosition.column)]);
		this._editor.focus();
	}
}

class NativeLineEditableContent implements IContentWidget {
	private _position: IPosition;

	getId(): string {
		return 'nativeLine';
	}
	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IContentWidgetPosition {
		return { position: this._position, preference: [ContentWidgetPositionPreference.BELOW] };
	}
	private _domNode: HTMLDivElement;
	private _span: HTMLSpanElement;

	constructor(editor: ICodeEditor) {
		this._domNode = document.createElement('div');
		this._domNode.style.top = '-1000px';
		this._domNode.style.width = '1023px';
		this._span = document.createElement('span');
		this._span.contentEditable = 'true';
		this._span.style.visibility = 'initial';
		this._domNode.appendChild(this._span);
		editor.addContentWidget(this);
	}

	moveWordLeft(editor: ICodeEditor, position: IPosition): IPosition {
		this._position = position;
		let line = this._position.lineNumber;
		let content = editor.getModel().getLineContent(line);
		this._span.textContent = content.substr(0, position.column - 1);
		const selection = window.getSelection();
		const firstRange = selection.getRangeAt(0);
		console.log(firstRange);
		const range = document.createRange();
		range.selectNodeContents(this._span);
		selection.removeAllRanges();
		selection.addRange(range);
		selection.collapseToEnd();
		(<any>selection).modify('extend', 'backward', 'word');
		let characterCnt = selection.toString().length;

		selection.removeAllRanges();
		selection.addRange(firstRange);
		return {
			lineNumber: line,
			column: this._position.column - characterCnt
		};
	}
}

registerEditorContribution(NativeWordController);

const NativeCommand = EditorCommand.bindToContribution<NativeWordController>(NativeWordController.get);

registerEditorCommand(new NativeCommand({
	id: 'editor.moveNativeWordLeft',
	precondition: null,
	handler: x => x.moveLeft(),
	kbOpts: {
		weight: KeybindingWeight.EditorContrib + 5,
		kbExpr: EditorContextKeys.focus,
		primary: null
	}
}));