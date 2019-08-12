/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./renameInputField';
import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { localize } from 'vs/nls';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { inputBackground, inputBorder, inputForeground, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { ITheme, IThemeService } from 'vs/platform/theme/common/themeService';

export const CONTEXT_RENAME_INPUT_VISIBLE = new RawContextKey<boolean>('renameInputVisible', false);

export class RenameInputField implements IContentWidget, IDisposable {

	private _editor: ICodeEditor;
	private _position?: Position;
	private _domNode?: HTMLElement;
	private _inputField?: HTMLInputElement;
	private _visible?: boolean;
	private readonly _visibleContextKey: IContextKey<boolean>;
	private readonly _disposables = new DisposableStore();

	// Editor.IContentWidget.allowEditorOverflow
	allowEditorOverflow: boolean = true;

	constructor(
		editor: ICodeEditor,
		private readonly themeService: IThemeService,
		contextKeyService: IContextKeyService,
	) {
		this._visibleContextKey = CONTEXT_RENAME_INPUT_VISIBLE.bindTo(contextKeyService);

		this._editor = editor;
		this._editor.addContentWidget(this);

		this._disposables.add(editor.onDidChangeConfiguration(e => {
			if (e.fontInfo) {
				this.updateFont();
			}
		}));

		this._disposables.add(themeService.onThemeChange(theme => this.onThemeChange(theme)));
	}

	private onThemeChange(theme: ITheme): void {
		this.updateStyles(theme);
	}

	public dispose(): void {
		this._disposables.dispose();
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
		const widgetShadowColor = theme.getColor(widgetShadow);
		const border = theme.getColor(inputBorder);

		this._inputField.style.backgroundColor = background ? background.toString() : null;
		this._inputField.style.color = foreground ? foreground.toString() : null;

		this._inputField.style.borderWidth = border ? '1px' : '0px';
		this._inputField.style.borderStyle = border ? 'solid' : 'none';
		this._inputField.style.borderColor = border ? border.toString() : 'none';

		this._domNode!.style.boxShadow = widgetShadowColor ? ` 0 2px 8px ${widgetShadowColor}` : null;
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

	public getPosition(): IContentWidgetPosition | null {
		return this._visible
			? { position: this._position!, preference: [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE] }
			: null;
	}

	private _currentAcceptInput: (() => void) | null = null;
	private _currentCancelInput: ((focusEditor: boolean) => void) | null = null;

	public acceptInput(): void {
		if (this._currentAcceptInput) {
			this._currentAcceptInput();
		}
	}

	public cancelInput(focusEditor: boolean): void {
		if (this._currentCancelInput) {
			this._currentCancelInput(focusEditor);
		}
	}

	public getInput(where: IRange, value: string, selectionStart: number, selectionEnd: number): Promise<string | boolean> {

		this._position = new Position(where.startLineNumber, where.startColumn);
		this._inputField!.value = value;
		this._inputField!.setAttribute('selectionStart', selectionStart.toString());
		this._inputField!.setAttribute('selectionEnd', selectionEnd.toString());
		this._inputField!.size = Math.max((where.endColumn - where.startColumn) * 1.1, 20);

		const disposeOnDone = new DisposableStore();
		const always = () => {
			disposeOnDone.dispose();
			this._hide();
		};

		return new Promise<string | boolean>(resolve => {

			this._currentCancelInput = (focusEditor) => {
				this._currentAcceptInput = null;
				this._currentCancelInput = null;
				resolve(focusEditor);
				return true;
			};

			this._currentAcceptInput = () => {
				if (this._inputField!.value.trim().length === 0 || this._inputField!.value === value) {
					// empty or whitespace only or not changed
					this.cancelInput(true);
					return;
				}

				this._currentAcceptInput = null;
				this._currentCancelInput = null;
				resolve(this._inputField!.value);
			};

			let onCursorChanged = () => {
				const editorPosition = this._editor.getPosition();
				if (!editorPosition || !Range.containsPosition(where, editorPosition)) {
					this.cancelInput(true);
				}
			};

			disposeOnDone.add(this._editor.onDidChangeCursorSelection(onCursorChanged));
			disposeOnDone.add(this._editor.onDidBlurEditorWidget(() => this.cancelInput(false)));

			this._show();

		}).then(newValue => {
			always();
			return newValue;
		}, err => {
			always();
			return Promise.reject(err);
		});
	}

	private _show(): void {
		this._editor.revealLineInCenterIfOutsideViewport(this._position!.lineNumber, ScrollType.Smooth);
		this._visible = true;
		this._visibleContextKey.set(true);
		this._editor.layoutContentWidget(this);

		setTimeout(() => {
			this._inputField!.focus();
			this._inputField!.setSelectionRange(
				parseInt(this._inputField!.getAttribute('selectionStart')!),
				parseInt(this._inputField!.getAttribute('selectionEnd')!));
		}, 100);
	}

	private _hide(): void {
		this._visible = false;
		this._visibleContextKey.reset();
		this._editor.layoutContentWidget(this);
	}
}
