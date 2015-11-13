/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./rename';
import {TPromise} from 'vs/base/common/winjs.base';
import strings = require('vs/base/common/strings');
import errors = require('vs/base/common/errors');
import lifecycle = require('vs/base/common/lifecycle');
import EditorCommon = require('vs/editor/common/editorCommon');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import {Range} from 'vs/editor/common/core/range';

class RenameInputField implements EditorBrowser.IContentWidget, lifecycle.IDisposable {

	private _editor: EditorBrowser.ICodeEditor;
	private _position: EditorCommon.IPosition;
	private _domNode: HTMLElement;
	private _inputField: HTMLInputElement;
	private _visible: boolean;

	// Editor.IContentWidget.allowEditorOverflow
	public allowEditorOverflow = true;

	constructor(editor: EditorBrowser.ICodeEditor) {
		this._editor = editor;
		this._editor.addContentWidget(this);
	}

	public dispose(): void {
		this._editor.removeContentWidget(this);
	}

	public getId(): string {
		return '__renameInputWidget';
	}

	public getDomNode(): HTMLElement {
		if (!this._domNode) {
			this._inputField = document.createElement('input');
			this._inputField.className = 'rename-input';
			this._domNode = document.createElement('div');
			this._domNode.style.height = `${this._editor.getConfiguration().lineHeight}px`;
			this._domNode.className = 'monaco-editor rename-box';
			this._domNode.appendChild(this._inputField);
		}
		return this._domNode;
	}

	public getPosition(): EditorBrowser.IContentWidgetPosition {
		return this._visible
			? { position: this._position, preference: [EditorBrowser.ContentWidgetPositionPreference.BELOW, EditorBrowser.ContentWidgetPositionPreference.ABOVE] }
			: null;
	}

	private _currentAcceptInput: () => void = null;
	private _currentCancelInput: () => void = null;

	public acceptInput(): void {
		if (this._currentAcceptInput) {
			this._currentAcceptInput();
		}
	}

	public cancelInput(): void {
		if (this._currentCancelInput) {
			this._currentCancelInput();
		}
	}

	public getInput(where: EditorCommon.IRange, value: string, selectionStart: number, selectionEnd: number): TPromise<string> {

		this._position = { lineNumber: where.startLineNumber, column: where.startColumn };
		this._inputField.value = value;
		this._inputField.setAttribute('selectionStart', selectionStart.toString());
		this._inputField.setAttribute('selectionEnd', selectionEnd.toString());
		this._inputField.size = Math.max((where.endColumn - where.startColumn) * 1.1, 20);

		var disposeOnDone: lifecycle.IDisposable[] = [],
			always: Function;

		always = () => {
			lifecycle.disposeAll(disposeOnDone);
			this._hide();
		};

		return new TPromise<string>((c, e) => {

			this._currentCancelInput = () => {
				this._currentAcceptInput = null;
				this._currentCancelInput = null;
				e(errors.canceled());
				return true;
			};

			this._currentAcceptInput = () => {
				if (this._inputField.value.trim().length === 0 || this._inputField.value === value) {
					// empty or whitespace only or not changed
					this._currentCancelInput();
					return;
				}

				this._currentAcceptInput = null;
				this._currentCancelInput = null;
				c(this._inputField.value);
			}

			var onCursorChanged = () => {
				if (!Range.containsPosition(where, this._editor.getPosition())) {
					this._currentCancelInput();
				}
			};

			disposeOnDone.push(this._editor.addListener2(EditorCommon.EventType.CursorSelectionChanged, onCursorChanged));
			disposeOnDone.push(this._editor.addListener2(EditorCommon.EventType.EditorBlur, this._currentCancelInput));

			this._show();

		}, this._currentCancelInput).then(value => {
			always();
			return value;
		}, err => {
			always();
			return TPromise.wrapError(err);
		});
	}

	private _show(): void{
		this._visible = true;
		this._editor.layoutContentWidget(this);

		setTimeout(() => {
			this._inputField.focus();
			this._inputField.setSelectionRange(
				parseInt(this._inputField.getAttribute('selectionStart')),
				parseInt(this._inputField.getAttribute('selectionEnd')));
		}, 25);
	}

	private _hide(): void {
		this._visible = false;
		this._editor.layoutContentWidget(this);
	}
}

export = RenameInputField;
