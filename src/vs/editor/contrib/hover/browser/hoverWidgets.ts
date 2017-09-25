/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { KeyCode } from 'vs/base/common/keyCodes';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { toggleClass } from 'vs/base/browser/dom';
import { Position } from 'vs/editor/common/core/position';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import { Widget } from 'vs/base/browser/ui/widget';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IConfigurationChangedEvent } from 'vs/editor/common/config/editorOptions';

export class ContentHoverWidget extends Widget implements editorBrowser.IContentWidget {

	private _id: string;
	protected _editor: editorBrowser.ICodeEditor;
	private _isVisible: boolean;
	private _containerDomNode: HTMLElement;
	private _domNode: HTMLElement;
	protected _showAtPosition: Position;
	private _stoleFocus: boolean;
	private scrollbar: DomScrollableElement;
	private disposables: IDisposable[] = [];

	// Editor.IContentWidget.allowEditorOverflow
	public allowEditorOverflow = true;

	protected get isVisible(): boolean {
		return this._isVisible;
	}

	protected set isVisible(value: boolean) {
		this._isVisible = value;
		toggleClass(this._containerDomNode, 'hidden', !this._isVisible);
	}

	constructor(id: string, editor: editorBrowser.ICodeEditor) {
		super();
		this._id = id;
		this._editor = editor;
		this._isVisible = false;

		this._containerDomNode = document.createElement('div');
		this._containerDomNode.className = 'monaco-editor-hover hidden';
		this._containerDomNode.tabIndex = 0;

		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-editor-hover-content';

		this.scrollbar = new DomScrollableElement(this._domNode, {});
		this.disposables.push(this.scrollbar);
		this._containerDomNode.appendChild(this.scrollbar.getDomNode());

		this.onkeydown(this._containerDomNode, (e: IKeyboardEvent) => {
			if (e.equals(KeyCode.Escape)) {
				this.hide();
			}
		});

		this._register(this._editor.onDidChangeConfiguration((e: IConfigurationChangedEvent) => {
			if (e.fontInfo) {
				this.updateFont();
			}
		}));

		this._editor.onDidLayoutChange(e => this.updateMaxHeight());

		this.updateMaxHeight();
		this._editor.addContentWidget(this);
		this._showAtPosition = null;
	}

	public getId(): string {
		return this._id;
	}

	public getDomNode(): HTMLElement {
		return this._containerDomNode;
	}

	public showAt(position: Position, focus: boolean): void {
		// Position has changed
		this._showAtPosition = new Position(position.lineNumber, position.column);
		this.isVisible = true;

		this._editor.layoutContentWidget(this);
		// Simply force a synchronous render on the editor
		// such that the widget does not really render with left = '0px'
		this._editor.render();
		this._stoleFocus = focus;
		if (focus) {
			this._containerDomNode.focus();
		}
	}

	public hide(): void {
		if (!this.isVisible) {
			return;
		}

		this.isVisible = false;

		this._editor.layoutContentWidget(this);
		if (this._stoleFocus) {
			this._editor.focus();
		}
	}

	public getPosition(): editorBrowser.IContentWidgetPosition {
		if (this.isVisible) {
			return {
				position: this._showAtPosition,
				preference: [
					editorBrowser.ContentWidgetPositionPreference.ABOVE,
					editorBrowser.ContentWidgetPositionPreference.BELOW
				]
			};
		}
		return null;
	}

	public dispose(): void {
		this._editor.removeContentWidget(this);
		this.disposables = dispose(this.disposables);
		super.dispose();
	}

	private updateFont(): void {
		const codeTags: HTMLElement[] = Array.prototype.slice.call(this._domNode.getElementsByTagName('code'));
		const codeClasses: HTMLElement[] = Array.prototype.slice.call(this._domNode.getElementsByClassName('code'));

		[...codeTags, ...codeClasses].forEach(node => this._editor.applyFontInfo(node));
	}

	protected updateContents(node: Node): void {
		this._domNode.textContent = '';
		this._domNode.appendChild(node);
		this.updateFont();

		this._editor.layoutContentWidget(this);
		this.scrollbar.scanDomNode();
	}

	private updateMaxHeight(): void {
		const height = Math.max(this._editor.getLayoutInfo().height / 4, 250);
		const { fontSize, lineHeight } = this._editor.getConfiguration().fontInfo;

		this._domNode.style.fontSize = `${fontSize}px`;
		this._domNode.style.lineHeight = `${lineHeight}px`;
		this._domNode.style.maxHeight = `${height}px`;
	}
}

export class GlyphHoverWidget extends Widget implements editorBrowser.IOverlayWidget {

	private _id: string;
	protected _editor: editorBrowser.ICodeEditor;
	private _isVisible: boolean;
	private _domNode: HTMLElement;
	protected _showAtLineNumber: number;

	constructor(id: string, editor: editorBrowser.ICodeEditor) {
		super();
		this._id = id;
		this._editor = editor;
		this._isVisible = false;

		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-editor-hover hidden';
		this._domNode.setAttribute('aria-hidden', 'true');
		this._domNode.setAttribute('role', 'presentation');

		this._showAtLineNumber = -1;

		this._register(this._editor.onDidChangeConfiguration((e: IConfigurationChangedEvent) => {
			if (e.fontInfo) {
				this.updateFont();
			}
		}));

		this._editor.addOverlayWidget(this);
	}

	protected get isVisible(): boolean {
		return this._isVisible;
	}

	protected set isVisible(value: boolean) {
		this._isVisible = value;
		toggleClass(this._domNode, 'hidden', !this._isVisible);
	}

	public getId(): string {
		return this._id;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public showAt(lineNumber: number): void {
		this._showAtLineNumber = lineNumber;

		if (!this.isVisible) {
			this.isVisible = true;
		}

		const editorLayout = this._editor.getLayoutInfo();
		const topForLineNumber = this._editor.getTopForLineNumber(this._showAtLineNumber);
		const editorScrollTop = this._editor.getScrollTop();
		const lineHeight = this._editor.getConfiguration().lineHeight;
		const nodeHeight = this._domNode.clientHeight;
		const top = topForLineNumber - editorScrollTop - ((nodeHeight - lineHeight) / 2);

		this._domNode.style.left = `${editorLayout.glyphMarginLeft + editorLayout.glyphMarginWidth}px`;
		this._domNode.style.top = `${Math.max(Math.round(top), 0)}px`;
	}

	public hide(): void {
		if (!this.isVisible) {
			return;
		}
		this.isVisible = false;
	}

	public getPosition(): editorBrowser.IOverlayWidgetPosition {
		return null;
	}

	public dispose(): void {
		this._editor.removeOverlayWidget(this);
		super.dispose();
	}

	private updateFont(): void {
		const codeTags: HTMLElement[] = Array.prototype.slice.call(this._domNode.getElementsByTagName('code'));
		const codeClasses: HTMLElement[] = Array.prototype.slice.call(this._domNode.getElementsByClassName('code'));

		[...codeTags, ...codeClasses].forEach(node => this._editor.applyFontInfo(node));
	}

	protected updateContents(node: Node): void {
		this._domNode.textContent = '';
		this._domNode.appendChild(node);
		this.updateFont();
	}
}
