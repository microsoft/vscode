/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!vs/base/browser/ui/progressbar/progressbar';
import * as nls from 'vs/nls';
import URI from 'vs/base/common/uri';
import { onUnexpectedError } from 'vs/base/common/errors';
import { $ } from 'vs/base/browser/dom';
import { TPromise } from 'vs/base/common/winjs.base';
import { renderMarkedString } from 'vs/base/browser/htmlContentRenderer';
import { IOpenerService, NullOpenerService } from 'vs/platform/opener/common/opener';
import { IModeService } from 'vs/editor/common/services/modeService';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/editorCommon';
import { HoverProviderRegistry, Hover } from 'vs/editor/common/modes';
import { tokenizeToString } from 'vs/editor/common/modes/textToHtmlTokenizer';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { getHover } from '../common/hover';
import { HoverOperation, IHoverComputer } from './hoverOperation';
import { ContentHoverWidget } from './hoverWidgets';
import { textToMarkedString, MarkedString } from 'vs/base/common/htmlContent';

class ModesContentComputer implements IHoverComputer<Hover[]> {

	private _editor: ICodeEditor;
	private _result: Hover[];
	private _range: Range;

	constructor(editor: ICodeEditor) {
		this._editor = editor;
		this._range = null;
	}

	setRange(range: Range): void {
		this._range = range;
		this._result = [];
	}

	clearResult(): void {
		this._result = [];
	}

	computeAsync(): TPromise<Hover[]> {
		const model = this._editor.getModel();

		if (!HoverProviderRegistry.has(model)) {
			return TPromise.as(null);
		}

		return getHover(model, new Position(
			this._range.startLineNumber,
			this._range.startColumn
		));
	}

	computeSync(): Hover[] {
		const lineNumber = this._range.startLineNumber;

		if (lineNumber > this._editor.getModel().getLineCount()) {
			// Illegal line number => no results
			return [];
		}

		const hasHoverContent = (contents: MarkedString | MarkedString[]) => {
			return contents && (!Array.isArray(contents) || (<MarkedString[]>contents).length > 0);
		};

		const maxColumn = this._editor.getModel().getLineMaxColumn(lineNumber);
		const lineDecorations = this._editor.getLineDecorations(lineNumber);

		const result = lineDecorations.map(d => {
			const startColumn = (d.range.startLineNumber === lineNumber) ? d.range.startColumn : 1;
			const endColumn = (d.range.endLineNumber === lineNumber) ? d.range.endColumn : maxColumn;

			if (startColumn > this._range.startColumn || this._range.endColumn > endColumn || !hasHoverContent(d.options.hoverMessage)) {
				return null;
			}

			const range = new Range(this._range.startLineNumber, startColumn, this._range.startLineNumber, endColumn);
			let contents: MarkedString[];

			if (d.options.hoverMessage) {
				if (Array.isArray(d.options.hoverMessage)) {
					contents = [...d.options.hoverMessage];
				} else {
					contents = [d.options.hoverMessage];
				}
			}

			return { contents, range };
		});

		return result.filter(d => !!d);
	}

	onResult(result: Hover[], isFromSynchronousComputation: boolean): void {
		// Always put synchronous messages before asynchronous ones
		if (isFromSynchronousComputation) {
			this._result = result.concat(this._result);
		} else {
			this._result = this._result.concat(result);
		}
	}

	getResult(): Hover[] {
		return this._result.slice(0);
	}

	getResultWithLoadingMessage(): Hover[] {
		return this._result.slice(0).concat([this._getLoadingMessage()]);
	}

	private _getLoadingMessage(): Hover {
		return {
			range: this._range,
			contents: [textToMarkedString(nls.localize('modesContentHover.loading', "Loading..."))]
		};
	}
}

export class ModesContentHoverWidget extends ContentHoverWidget {

	static ID = 'editor.contrib.modesContentHoverWidget';

	private _messages: Hover[];
	private _lastRange: Range;
	private _computer: ModesContentComputer;
	private _hoverOperation: HoverOperation<Hover[]>;
	private _highlightDecorations: string[];
	private _isChangingDecorations: boolean;
	private _openerService: IOpenerService;
	private _modeService: IModeService;
	private _shouldFocus: boolean;

	constructor(editor: ICodeEditor, openerService: IOpenerService, modeService: IModeService) {
		super(ModesContentHoverWidget.ID, editor);

		this._computer = new ModesContentComputer(this._editor);
		this._highlightDecorations = [];
		this._isChangingDecorations = false;
		this._openerService = openerService || NullOpenerService;
		this._modeService = modeService;

		this._hoverOperation = new HoverOperation(
			this._computer,
			(result: Hover[]) => this._withResult(result, true),
			null,
			(result: any) => this._withResult(result, false)
		);
	}

	dispose(): void {
		this._hoverOperation.cancel();
		super.dispose();
	}

	onModelDecorationsChanged(): void {
		if (this._isChangingDecorations) {
			return;
		}
		if (this.isVisible) {
			// The decorations have changed and the hover is visible,
			// we need to recompute the displayed text
			this._hoverOperation.cancel();
			this._computer.clearResult();
			this._hoverOperation.start();
		}
	}

	startShowingAt(range: Range, focus: boolean): void {
		if (this._lastRange && this._lastRange.equalsRange(range)) {
			// We have to show the widget at the exact same range as before, so no work is needed
			return;
		}

		this._hoverOperation.cancel();

		if (this.isVisible) {
			// The range might have changed, but the hover is visible
			// Instead of hiding it completely, filter out messages that are still in the new range and
			// kick off a new computation
			if (this._showAtPosition.lineNumber !== range.startLineNumber) {
				this.hide();
			} else {
				var filteredMessages: Hover[] = [];
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
		this._shouldFocus = focus;
		this._hoverOperation.start();
	}

	hide(): void {
		this._lastRange = null;
		this._hoverOperation.cancel();
		super.hide();
		this._isChangingDecorations = true;
		this._highlightDecorations = this._editor.deltaDecorations(this._highlightDecorations, []);
		this._isChangingDecorations = false;
	}

	_withResult(result: Hover[], complete: boolean): void {
		this._messages = result;

		if (this._lastRange && this._messages.length > 0) {
			this._renderMessages(this._lastRange, this._messages);
		} else if (complete) {
			this.hide();
		}
	}

	private _renderMessages(renderRange: IRange, messages: Hover[]): void {

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

			msg.contents
				.filter(contents => !!contents)
				.forEach(contents => {
					const renderedContents = renderMarkedString(contents, {
						actionCallback: (content) => {
							this._openerService.open(URI.parse(content)).then(void 0, onUnexpectedError);
						},
						codeBlockRenderer: (languageAlias, value): string | TPromise<string> => {
							// In markdown,
							// it is possible that we stumble upon language aliases (e.g.js instead of javascript)
							// it is possible no alias is given in which case we fall back to the current editor lang
							const modeId = languageAlias
								? this._modeService.getModeIdForLanguageName(languageAlias)
								: this._editor.getModel().getLanguageIdentifier().language;

							return this._modeService.getOrCreateMode(modeId).then(_ => {
								return `<div class="code">${tokenizeToString(value, modeId)}</div>`;
							});
						}
					});

					fragment.appendChild($('div.hover-row', null, renderedContents));
				});
		});

		// show
		this.showAt({
			lineNumber: renderRange.startLineNumber,
			column: renderColumn
		}, this._shouldFocus);

		this.updateContents(fragment);

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