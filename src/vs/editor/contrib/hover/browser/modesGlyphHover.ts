/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IModelDecoration, IRange} from 'vs/editor/common/editorCommon';
import {ICodeEditor} from 'vs/editor/browser/editorBrowser';
import {HoverOperation, IHoverComputer} from './hoverOperation';
import {GlyphHoverWidget} from './hoverWidgets';

export interface IHoverMessage {
	value?: string;
	range?: IRange;
	className?: string;
}

class MarginComputer implements IHoverComputer<IHoverMessage[]> {

	private _editor: ICodeEditor;
	private _lineNumber: number;
	private _result: IHoverMessage[];

	constructor(editor:ICodeEditor) {
		this._editor = editor;
		this._lineNumber = -1;
	}

	public setLineNumber(lineNumber: number): void {
		this._lineNumber = lineNumber;
		this._result = [];
	}

	public clearResult(): void {
		this._result = [];
	}

	public computeSync(): IHoverMessage[] {
		var result: IHoverMessage[] = [],
			lineDecorations = this._editor.getLineDecorations(this._lineNumber),
			i: number,
			len: number,
			d: IModelDecoration;

		for (i = 0, len = lineDecorations.length; i < len; i++) {
			d = lineDecorations[i];

			if (d.options.glyphMarginClassName && d.options.hoverMessage) {
				result.push({
					value: d.options.hoverMessage
				});
			}
		}

		return result;
	}

	public onResult(result: IHoverMessage[], isFromSynchronousComputation: boolean): void {
		this._result = this._result.concat(result);
	}

	public getResult(): IHoverMessage[] {
		return this._result;
	}

	public getResultWithLoadingMessage(): IHoverMessage[] {
		return this.getResult();
	}
}

export class ModesGlyphHoverWidget extends GlyphHoverWidget {

	static ID = 'editor.contrib.modesGlyphHoverWidget';
	private _messages: IHoverMessage[];
	private _lastLineNumber: number;

	private _computer: MarginComputer;
	private _hoverOperation: HoverOperation<IHoverMessage[]>;

	constructor(editor: ICodeEditor) {
		super(ModesGlyphHoverWidget.ID, editor);

		this._lastLineNumber = -1;

		this._computer = new MarginComputer(this._editor);

		this._hoverOperation = new HoverOperation(
			this._computer,
			(result:IHoverMessage[]) => this._withResult(result),
			null,
			(result:any) => this._withResult(result)
		);

	}

	public onModelDecorationsChanged(): void {
		if (this._isVisible) {
			// The decorations have changed and the hover is visible,
			// we need to recompute the displayed text
			this._hoverOperation.cancel();
			this._computer.clearResult();
			this._hoverOperation.start();
		}
	}

	public startShowingAt(lineNumber: number): void {
		if (this._lastLineNumber === lineNumber) {
			// We have to show the widget at the exact same line number as before, so no work is needed
			return;
		}

		this._hoverOperation.cancel();

		this.hide();

		this._lastLineNumber = lineNumber;
		this._computer.setLineNumber(lineNumber);
		this._hoverOperation.start();
	}

	public hide(): void {
		this._lastLineNumber = -1;
		this._hoverOperation.cancel();
		super.hide();
	}

	public _withResult(result:IHoverMessage[]): void {
		this._messages = result;

		if (this._messages.length > 0) {
			this._renderMessages(this._lastLineNumber, this._messages);
		} else {
			this.hide();
		}
	}

	private _renderMessages(lineNumber: number, messages: IHoverMessage[]): void {

		var fragment = document.createDocumentFragment();

		messages.forEach((msg) => {

			var row:HTMLElement = document.createElement('div');
			var span:HTMLElement = null;

			if (msg.className) {
				span = document.createElement('span');
				span.textContent = msg.value;
				span.className = msg.className;
				row.appendChild(span);
			} else {
				row.textContent = msg.value;
			}

			fragment.appendChild(row);
		});

		this._domNode.textContent = '';
		this._domNode.appendChild(fragment);

		// show
		this.showAt(lineNumber);
	}
}