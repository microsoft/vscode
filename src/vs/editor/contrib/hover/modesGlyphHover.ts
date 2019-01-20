/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from 'vs/base/browser/dom';
import { IMarkdownString, isEmptyMarkdownString } from 'vs/base/common/htmlContent';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { HoverOperation, HoverStartMode, IHoverComputer } from 'vs/editor/contrib/hover/hoverOperation';
import { GlyphHoverWidget } from 'vs/editor/contrib/hover/hoverWidgets';
import { MarkdownRenderer } from 'vs/editor/contrib/markdown/markdownRenderer';

export interface IHoverMessage {
	value: IMarkdownString;
}

class MarginComputer implements IHoverComputer<IHoverMessage[]> {

	private _editor: ICodeEditor;
	private _lineNumber: number;
	private _result: IHoverMessage[];

	constructor(editor: ICodeEditor) {
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

		const toHoverMessage = (contents: IMarkdownString): IHoverMessage => {
			return {
				value: contents
			};
		};

		const lineDecorations = this._editor.getLineDecorations(this._lineNumber);

		const result: IHoverMessage[] = [];
		if (!lineDecorations) {
			return result;
		}

		for (const d of lineDecorations) {
			if (!d.options.glyphMarginClassName) {
				continue;
			}

			const hoverMessage = d.options.glyphMarginHoverMessage;
			if (!hoverMessage || isEmptyMarkdownString(hoverMessage)) {
				continue;
			}

			if (Array.isArray(hoverMessage)) {
				result.push(...hoverMessage.map(toHoverMessage));
			} else {
				result.push(toHoverMessage(hoverMessage));
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

	public static readonly ID = 'editor.contrib.modesGlyphHoverWidget';
	private _messages: IHoverMessage[];
	private _lastLineNumber: number;

	private _markdownRenderer: MarkdownRenderer;
	private _computer: MarginComputer;
	private _hoverOperation: HoverOperation<IHoverMessage[]>;
	private _renderDisposeables: IDisposable[];

	constructor(editor: ICodeEditor, markdownRenderer: MarkdownRenderer) {
		super(ModesGlyphHoverWidget.ID, editor);

		this._lastLineNumber = -1;

		this._markdownRenderer = markdownRenderer;
		this._computer = new MarginComputer(this._editor);

		this._hoverOperation = new HoverOperation(
			this._computer,
			(result: IHoverMessage[]) => this._withResult(result),
			undefined,
			(result: any) => this._withResult(result),
			300
		);

	}

	public dispose(): void {
		this._renderDisposeables = dispose(this._renderDisposeables);
		this._hoverOperation.cancel();
		super.dispose();
	}

	public onModelDecorationsChanged(): void {
		if (this.isVisible) {
			// The decorations have changed and the hover is visible,
			// we need to recompute the displayed text
			this._hoverOperation.cancel();
			this._computer.clearResult();
			this._hoverOperation.start(HoverStartMode.Delayed);
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
		this._hoverOperation.start(HoverStartMode.Delayed);
	}

	public hide(): void {
		this._lastLineNumber = -1;
		this._hoverOperation.cancel();
		super.hide();
	}

	public _withResult(result: IHoverMessage[]): void {
		this._messages = result;

		if (this._messages.length > 0) {
			this._renderMessages(this._lastLineNumber, this._messages);
		} else {
			this.hide();
		}
	}

	private _renderMessages(lineNumber: number, messages: IHoverMessage[]): void {
		dispose(this._renderDisposeables);
		this._renderDisposeables = [];

		const fragment = document.createDocumentFragment();

		messages.forEach((msg) => {
			const renderedContents = this._markdownRenderer.render(msg.value);
			this._renderDisposeables.push(renderedContents);
			fragment.appendChild($('div.hover-row', undefined, renderedContents.element));
		});

		this.updateContents(fragment);
		this.showAt(lineNumber);
	}
}
