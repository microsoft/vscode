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
import { EditorOption } from 'vs/editor/common/config/editorOptions';

export const CONTEXT_RENAME_INPUT_VISIBLE = new RawContextKey<boolean>('renameInputVisible', false);

export class RenameInputField implements IContentWidget, IDisposable {


	private _position?: Position;
	private _domNode?: HTMLElement;
	private _inputField?: HTMLInputElement;
	private _visible?: boolean;
	private readonly _visibleContextKey: IContextKey<boolean>;
	private readonly _disposables = new DisposableStore();

	// Editor.IContentWidget.allowEditorOverflow
	allowEditorOverflow: boolean = true;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _themeService: IThemeService,
		contextKeyService: IContextKeyService,
	) {
		this._visibleContextKey = CONTEXT_RENAME_INPUT_VISIBLE.bindTo(contextKeyService);

		this._editor.addContentWidget(this);

		this._disposables.add(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.fontInfo)) {
				this._updateFont();
			}
		}));

		this._disposables.add(_themeService.onThemeChange(this._updateStyles, this));
	}

	dispose(): void {
		this._disposables.dispose();
		this._editor.removeContentWidget(this);
	}

	getId(): string {
		return '__renameInputWidget';
	}

	getDomNode(): HTMLElement {
		if (!this._domNode) {
			this._inputField = document.createElement('input');
			this._inputField.className = 'rename-input';
			this._inputField.type = 'text';
			this._inputField.setAttribute('aria-label', localize('renameAriaLabel', "Rename input. Type new name and press Enter to commit."));
			this._domNode = document.createElement('div');
			this._domNode.style.height = `${this._editor.getOption(EditorOption.lineHeight)}px`;
			this._domNode.className = 'monaco-editor rename-box';
			this._domNode.appendChild(this._inputField);

			this._updateFont();
			this._updateStyles(this._themeService.getTheme());
		}
		return this._domNode;
	}

	private _updateStyles(theme: ITheme): void {
		if (!this._inputField) {
			return;
		}

		const background = theme.getColor(inputBackground);
		const foreground = theme.getColor(inputForeground);
		const widgetShadowColor = theme.getColor(widgetShadow);
		const border = theme.getColor(inputBorder);

		this._inputField.style.backgroundColor = background ? background.toString() : '';
		this._inputField.style.color = foreground ? foreground.toString() : '';

		this._inputField.style.borderWidth = border ? '1px' : '0px';
		this._inputField.style.borderStyle = border ? 'solid' : 'none';
		this._inputField.style.borderColor = border ? border.toString() : 'none';

		this._domNode!.style.boxShadow = widgetShadowColor ? ` 0 2px 8px ${widgetShadowColor}` : '';
	}

	private _updateFont(): void {
		if (!this._inputField) {
			return;
		}

		const fontInfo = this._editor.getOption(EditorOption.fontInfo);
		this._inputField.style.fontFamily = fontInfo.fontFamily;
		this._inputField.style.fontWeight = fontInfo.fontWeight;
		this._inputField.style.fontSize = `${fontInfo.fontSize}px`;
	}

	getPosition(): IContentWidgetPosition | null {
		return this._visible
			? { position: this._position!, preference: [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE] }
			: null;
	}

	private _currentAcceptInput: (() => void) | null = null;
	private _currentCancelInput: ((focusEditor: boolean) => void) | null = null;

	acceptInput(): void {
		if (this._currentAcceptInput) {
			this._currentAcceptInput();
		}
	}

	cancelInput(focusEditor: boolean): void {
		if (this._currentCancelInput) {
			this._currentCancelInput(focusEditor);
		}
	}

	getInput(where: IRange, value: string, selectionStart: number, selectionEnd: number): Promise<string | boolean> {

		this._position = new Position(where.startLineNumber, where.startColumn);
		this._inputField!.value = value;
		this._inputField!.setAttribute('selectionStart', selectionStart.toString());
		this._inputField!.setAttribute('selectionEnd', selectionEnd.toString());
		this._inputField!.size = Math.max((where.endColumn - where.startColumn) * 1.1, 20);

		const disposeOnDone = new DisposableStore();

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

		}).finally(() => {
			disposeOnDone.dispose();
			this._hide();
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
