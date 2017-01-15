/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./lightBulbWidget';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Event, { Emitter, any } from 'vs/base/common/event';
import Severity from 'vs/base/common/severity';
import * as dom from 'vs/base/browser/dom';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { QuickFixComputeEvent } from 'vs/editor/contrib/quickFix/common/quickFixModel';


export class LightBulbWidget implements IOverlayWidget, IDisposable {

	private _editor: ICodeEditor;
	private _line: number;
	private _domNode: HTMLElement;
	private _visible: boolean;
	private _onClick = new Emitter<{ x: number, y: number }>();
	private _model: QuickFixComputeEvent;
	private _toDispose: IDisposable[] = [];

	constructor(editor: ICodeEditor) {
		this._editor = editor;
		this._editor.addOverlayWidget(this);
		this._toDispose.push(this._editor.onDidScrollChange(() => {
			if (this._visible) {
				this._layout();
			}
		}));
		this._toDispose.push(any<any>(
			this._editor.onDidChangeConfiguration,
			this._editor.onDidChangeModelDecorations
		)(() => {
			// hide when something has been added to glyph margin
			if (this._visible && !this._hasSpaceInGlyphMargin(this._line)) {
				this.hide();
			}
		}));
	}

	public dispose(): void {
		this._editor.removeOverlayWidget(this);
		this._toDispose = dispose(this._toDispose);
	}

	get onClick(): Event<{ x: number, y: number }> {
		return this._onClick.event;
	}

	getId(): string {
		return '__lightBulbWidget';
	}

	getDomNode(): HTMLElement {
		if (!this._domNode) {
			this._domNode = document.createElement('div');
			this._domNode.style.width = '21px';
			this._domNode.style.height = '20px';
			this._domNode.className = 'lightbulb-glyph hidden';
			this._toDispose.push(dom.addDisposableListener(this._domNode, 'mousedown', (e: MouseEvent) => {
				e.preventDefault();

				// a bit of extra work to make sure the menu
				// doesn't cover the line-text
				const {top, height} = dom.getDomNodePagePosition(this._domNode);
				const {lineHeight} = this._editor.getConfiguration();
				this._onClick.fire({
					x: e.clientX,
					y: top + height + Math.floor(lineHeight / 3)
				});
			}));
		}
		return this._domNode;
	}

	getPosition(): IOverlayWidgetPosition {
		return null;
	}

	set model(e: QuickFixComputeEvent) {
		this._model = e;
		this.hide();
		const modelNow = this._model;
		e.fixes.done(fixes => {
			if (modelNow === this._model && fixes && fixes.length > 0) {
				this.show(e);
			} else {
				this.hide();
			}
		}, err => {
			this.hide();
		});
	}

	get model(): QuickFixComputeEvent {
		return this._model;
	}

	show(e: QuickFixComputeEvent): void {
		const line = e.range.startLineNumber;
		if (!this._hasSpaceInGlyphMargin(line)) {
			return;
		}
		if (!this._visible || this._line !== line) {
			this._line = line;
			this._visible = true;
			this._layout();
			this._domNode.dataset['severity'] = e.severity >= Severity.Warning ? 'high' : '';
		}
	}

	private _hasSpaceInGlyphMargin(line: number): boolean {
		if (!this._editor.getRawConfiguration().glyphMargin) {
			return false;
		}
		const decorations = this._editor.getLineDecorations(line);
		if (decorations) {
			for (const {options} of decorations) {
				if (options.glyphMarginClassName) {
					return false;
				}
			}
		}
		return true;
	}

	private _layout(): void {
		const topForLineNumber = this._editor.getTopForLineNumber(this._line);
		const editorScrollTop = this._editor.getScrollTop();
		const top = topForLineNumber - editorScrollTop;
		this._domNode.style.top = `${top}px`;
		this._domNode.style.left = `${0}px`;
		this._domNode.classList.remove('hidden');
	}

	hide(): void {
		if (this._visible) {
			this._visible = false;
			this._domNode.classList.add('hidden');
		}
	}
}
