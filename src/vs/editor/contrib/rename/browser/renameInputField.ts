/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./renameInputField';
import { localize } from 'vs/nls';
import { canceled } from 'vs/base/common/errors';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { Range } from 'vs/editor/common/core/range';
import { IPosition, IRange } from 'vs/editor/common/editorCommon';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { IThemeService, ITheme } from "vs/platform/theme/common/themeService";
import { inputBackground, inputBorder, inputForeground } from "vs/platform/theme/common/colorRegistry";

export default class RenameInputField implements IContentWidget, IDisposable {

	private _editor: ICodeEditor;
	private _position: IPosition;
	private _domNode: HTMLElement;
	private _inputField: HTMLInputElement;
	private _visible: boolean;
	private _disposables: IDisposable[] = [];

	// Editor.IContentWidget.allowEditorOverflow
	public allowEditorOverflow: boolean = true;

	constructor(editor: ICodeEditor, @IThemeService private themeService: IThemeService) {
		this._editor = editor;
		this._editor.addContentWidget(this);

		this._disposables.push(editor.onDidChangeConfiguration(e => {
			if (e.fontInfo) {
				this.updateFont();
			}
		}));

		this._disposables.push(themeService.onThemeChange(theme => this.onThemeChange(theme)));
	}

	private onThemeChange(theme: ITheme): void {
		this.updateStyles(theme);
	}

	public dispose(): void {
		this._disposables = dispose(this._disposables);
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

			this.updateFont();
			this.updateStyles(this.themeService.getTheme());
		}
		return this._domNode;
	}

	private updateStyles(theme: ITheme): void {
		if (!this._inputField) {
			return;
		}

		const background = theme.getColor(inputBackground);
		const foreground = theme.getColor(inputForeground);
		const border = theme.getColor(inputBorder);

		this._inputField.style.backgroundColor = background ? background.toString() : null;
		this._inputField.style.color = foreground ? foreground.toString() : null;

		this._inputField.style.borderWidth = border ? '1px' : null;
		this._inputField.style.borderStyle = border ? 'solid' : null;
		this._inputField.style.borderColor = border ? border.toString() : null;
	}

	private updateFont(): void {
		if (!this._inputField) {
			return;
		}

		const fontInfo = this._editor.getConfiguration().fontInfo;
		this._inputField.style.fontFamily = fontInfo.fontFamily;
		this._inputField.style.fontWeight = fontInfo.fontWeight;
		this._inputField.style.fontSize = `${fontInfo.fontSize}px`;
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
			dispose(disposeOnDone);
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

			disposeOnDone.push(this._editor.onDidChangeCursorSelection(onCursorChanged));
			disposeOnDone.push(this._editor.onDidBlurEditor(this._currentCancelInput));

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
