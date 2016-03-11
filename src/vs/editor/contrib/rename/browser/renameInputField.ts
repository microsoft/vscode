/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./rename';
import {localize} from 'vs/nls';
import {canceled} from 'vs/base/common/errors';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {TPromise} from 'vs/base/common/winjs.base';
import {Range} from 'vs/editor/common/core/range';
import {EventType, IPosition, IRange} from 'vs/editor/common/editorCommon';
import {ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition} from 'vs/editor/browser/editorBrowser';

export default class RenameInputField implements IContentWidget, IDisposable {

	private _editor: ICodeEditor;
	private _position: IPosition;
	private _domNode: HTMLElement;
	private _inputField: HTMLInputElement;
	private _visible: boolean;

	// Editor.IContentWidget.allowEditorOverflow
	public allowEditorOverflow: boolean = true;

	constructor(editor: ICodeEditor) {
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
			this._inputField.type = 'text';
			this._inputField.setAttribute('aria-label', localize('renameAriaLabel', "Rename input. Type new name and press Enter to commit."));
			this._domNode = document.createElement('div');
			this._domNode.style.height = `${this._editor.getConfiguration().lineHeight}px`;
			this._domNode.className = 'monaco-editor rename-box';
			this._domNode.appendChild(this._inputField);
		}
		return this._domNode;
	}

	public getPosition(): IContentWidgetPosition {
		return this._visible
			? { position: this._position, preference: [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE] }
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

	public getInput(where: IRange, value: string, selectionStart: number, selectionEnd: number): TPromise<string> {

		this._position = { lineNumber: where.startLineNumber, column: where.startColumn };
		this._inputField.value = value;
		this._inputField.setAttribute('selectionStart', selectionStart.toString());
		this._inputField.setAttribute('selectionEnd', selectionEnd.toString());
		this._inputField.size = Math.max((where.endColumn - where.startColumn) * 1.1, 20);

		let disposeOnDone: IDisposable[] = [],
			always: Function;

		always = () => {
			disposeAll(disposeOnDone);
			this._hide();
		};

		return new TPromise<string>((c, e) => {

			this._currentCancelInput = () => {
				this._currentAcceptInput = null;
				this._currentCancelInput = null;
				e(canceled());
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
			};

			let onCursorChanged = () => {
				if (!Range.containsPosition(where, this._editor.getPosition())) {
					this._currentCancelInput();
				}
			};

			disposeOnDone.push(this._editor.addListener2(EventType.CursorSelectionChanged, onCursorChanged));
			disposeOnDone.push(this._editor.addListener2(EventType.EditorBlur, this._currentCancelInput));

			this._show();

		}, this._currentCancelInput).then(newValue => {
			always();
			return newValue;
		}, err => {
			always();
			return TPromise.wrapError(err);
		});
	}

	private _show(): void {
		this._editor.revealLineInCenterIfOutsideViewport(this._position.lineNumber);
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
