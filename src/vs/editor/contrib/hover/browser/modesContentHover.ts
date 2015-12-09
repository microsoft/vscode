/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!vs/base/browser/ui/progressbar/progressbar';
import nls = require('vs/nls');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import {TPromise} from 'vs/base/common/winjs.base';
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import HoverOperation = require('./hoverOperation');
import HoverWidget = require('./hoverWidgets');
import HtmlContent = require('vs/base/common/htmlContent');
import {renderHtml} from 'vs/base/browser/htmlContentRenderer';
import {tokenizeToHtmlContent} from 'vs/editor/common/modes/textToHtmlTokenizer';
import {Range} from 'vs/editor/common/core/range';
import {ExtraInfoRegistry, getExtraInfoAtPosition} from '../common/hover';


class ModesContentComputer implements HoverOperation.IHoverComputer<Modes.IComputeExtraInfoResult[]> {

	private _editor: EditorBrowser.ICodeEditor;
	private _result: Modes.IComputeExtraInfoResult[];
	private _range: EditorCommon.IEditorRange;

	constructor(editor: EditorBrowser.ICodeEditor) {
		this._editor = editor;
		this._range = null;
	}

	public setRange(range: EditorCommon.IEditorRange): void {
		this._range = range;
		this._result = [];
	}

	public clearResult(): void {
		this._result = [];
	}

	public computeAsync(): TPromise<Modes.IComputeExtraInfoResult[]> {

		let model = this._editor.getModel();
		if (!ExtraInfoRegistry.has(model)) {
			return TPromise.as(null);
		}

		return getExtraInfoAtPosition(model, {
			lineNumber: this._range.startLineNumber,
			column: this._range.startColumn
		});
	}

	public computeSync(): Modes.IComputeExtraInfoResult[] {
		var result:Modes.IComputeExtraInfoResult[] = [];
		var lineNumber = this._range.startLineNumber;

		if (lineNumber > this._editor.getModel().getLineCount()) {
			// Illegal line number => no results
			return result;
		}

		var lineDecorations = this._editor.getLineDecorations(lineNumber);
		var maxColumn = this._editor.getModel().getLineMaxColumn(lineNumber);
		lineDecorations.forEach((d) => {
			var startColumn = (d.range.startLineNumber === lineNumber) ? d.range.startColumn : 1;
			var endColumn = (d.range.endLineNumber === lineNumber) ? d.range.endColumn : maxColumn;

			if (startColumn <= this._range.startColumn && this._range.endColumn <= endColumn && (d.options.hoverMessage || (d.options.htmlMessage && d.options.htmlMessage.length > 0))) {
				var obj:Modes.IComputeExtraInfoResult = {
					value: d.options.hoverMessage,
					range: new Range(this._range.startLineNumber, startColumn, this._range.startLineNumber, endColumn)
				};
				if(d.options.htmlMessage) {
					obj.htmlContent = d.options.htmlMessage;
				}
				result.push(obj);
			}
		});
		return result;
	}

	public onResult(result: Modes.IComputeExtraInfoResult[], isFromSynchronousComputation: boolean): void {
		// Always put synchronous messages before asynchronous ones
		if (isFromSynchronousComputation) {
			this._result = result.concat(this._result);
		} else {
			this._result = this._result.concat(result);
		}
	}

	public getResult(): Modes.IComputeExtraInfoResult[] {
		return this._result.slice(0);
	}

	public getResultWithLoadingMessage(): Modes.IComputeExtraInfoResult[] {
		return this._result.slice(0).concat([this._getLoadingMessage()]);
	}

	private _getLoadingMessage(): Modes.IComputeExtraInfoResult {
		return {
			range: this._range,
			htmlContent: [{
				tagName: 'div',
				className: '',
				children: [{
					text: nls.localize('modesContentHover.loading', "Loading...")
				}]
			}]
		};
	}
}

export class ModesContentHoverWidget extends HoverWidget.ContentHoverWidget {

	static ID = 'editor.contrib.modesContentHoverWidget';
	private _messages: Modes.IComputeExtraInfoResult[];
	private _lastRange: EditorCommon.IEditorRange;
	private _computer: ModesContentComputer;
	private _hoverOperation: HoverOperation.HoverOperation<Modes.IComputeExtraInfoResult[]>;
	private _highlightDecorations:string[];
	private _isChangingDecorations: boolean;

	constructor(editor: EditorBrowser.ICodeEditor) {
		super(ModesContentHoverWidget.ID, editor);

		this._computer = new ModesContentComputer(this._editor);
		this._highlightDecorations = [];
		this._isChangingDecorations = false;

		this._hoverOperation = new HoverOperation.HoverOperation(
			this._computer,
			(result:Modes.IComputeExtraInfoResult[]) => this._withResult(result, true),
			null,
			(result:any) => this._withResult(result, false)
		);
	}

	public onModelDecorationsChanged(): void {
		if (this._isChangingDecorations) {
			return;
		}
		if (this._isVisible) {
			// The decorations have changed and the hover is visible,
			// we need to recompute the displayed text
			this._hoverOperation.cancel();
			this._computer.clearResult();
			this._hoverOperation.start();
		}
	}

	public startShowingAt(range: EditorCommon.IEditorRange): void {
		if (this._lastRange) {
			if (this._lastRange.equalsRange(range)) {
				// We have to show the widget at the exact same range as before, so no work is needed
				return;
			}
		}

		this._hoverOperation.cancel();

		if (this._isVisible) {
			// The range might have changed, but the hover is visible
			// Instead of hiding it completely, filter out messages that are still in the new range and
			// kick off a new computation
			if (this._showAtPosition.lineNumber !== range.startLineNumber) {
				this.hide();
			} else {
				var filteredMessages: Modes.IComputeExtraInfoResult[] = [];
				for (var i = 0, len = this._messages.length; i < len; i++) {
					var msg = this._messages[i];
					var rng = msg.range;
					if (rng.startColumn <= range.startColumn && rng.endColumn >= range.endColumn) {
						filteredMessages.push(msg);
					}
				}
				if (filteredMessages.length > 0) {
					this._renderMessages(range, filteredMessages);
				} else {
					this.hide();
				}
			}
		}

		this._lastRange = range;
		this._computer.setRange(range);
		this._hoverOperation.start();
	}

	public hide(): void {
		this._lastRange = null;
		this._hoverOperation.cancel();
		super.hide();
		this._isChangingDecorations = true;
		this._highlightDecorations = this._editor.deltaDecorations(this._highlightDecorations, []);
		this._isChangingDecorations = false;
	}

	public _withResult(result: Modes.IComputeExtraInfoResult[], complete:boolean): void {
		this._messages = result;

		if (this._messages.length > 0) {
			this._renderMessages(this._lastRange, this._messages);
		} else if(complete) {
			this.hide();
		}
	}

	// TODO@Alex: pull this out into a common utility class
	private _renderMessages(renderRange: EditorCommon.IRange, messages: Modes.IComputeExtraInfoResult[]): void {

		// update column from which to show
		var renderColumn = Number.MAX_VALUE,
			highlightRange = messages[0].range,
			fragment = document.createDocumentFragment();

		messages.forEach((msg) => {
			if (!msg.range) {
				return;
			}

			renderColumn = Math.min(renderColumn, msg.range.startColumn);
			highlightRange = Range.plusRange(highlightRange, msg.range);

			var row:HTMLElement = document.createElement('div');
			var span:HTMLElement = null;
			var container = row;

			if (msg.className) {
				span = document.createElement('span');
				span.className = msg.className;
				container = span;
				row.appendChild(span);
			}

			if(msg.htmlContent && msg.htmlContent.length > 0) {
				msg.htmlContent.forEach((content) => {
					container.appendChild(renderHtml(content, undefined, (modeId, value) => {
						let mode: Modes.IMode;
						let model = this._editor.getModel();
						if (!model.isDisposed()) {
							mode = model.getMode();
						}
						return tokenizeToHtmlContent(value, model.getMode());
					}));
				});
			} else {
				container.textContent = msg.value;
			}

			fragment.appendChild(row);
		});

		this._domNode.textContent = '';
		this._domNode.appendChild(fragment);

		// show
		this.showAt({
			lineNumber: renderRange.startLineNumber,
			column: renderColumn
		});

		this._isChangingDecorations = true;
		this._highlightDecorations = this._editor.deltaDecorations(this._highlightDecorations, [{
			range: highlightRange,
			options: {
				className: 'hoverHighlight'
			}
		}]);
		this._isChangingDecorations = false;
	}
}