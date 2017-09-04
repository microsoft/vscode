/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import URI from 'vs/base/common/uri';
import { onUnexpectedError } from 'vs/base/common/errors';
import * as dom from 'vs/base/browser/dom';
import { TPromise } from 'vs/base/common/winjs.base';
import { renderMarkdown } from 'vs/base/browser/htmlContentRenderer';
import { IOpenerService, NullOpenerService } from 'vs/platform/opener/common/opener';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IRange, Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { HoverProviderRegistry, Hover, IColor, IColorFormatter } from 'vs/editor/common/modes';
import { tokenizeToString } from 'vs/editor/common/modes/textToHtmlTokenizer';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { getHover } from '../common/hover';
import { HoverOperation, IHoverComputer } from './hoverOperation';
import { ContentHoverWidget } from './hoverWidgets';
import { IMarkdownString, MarkdownString, isEmptyMarkdownString } from 'vs/base/common/htmlContent';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModelWithDecorations';
import { ColorPickerModel } from 'vs/editor/contrib/colorPicker/browser/colorPickerModel';
import { ColorPickerWidget } from 'vs/editor/contrib/colorPicker/browser/colorPickerWidget';
import { ColorDetector } from 'vs/editor/contrib/colorPicker/browser/colorDetector';
import { Color, RGBA } from 'vs/base/common/color';
import { IDisposable, empty as EmptyDisposable, dispose, combinedDisposable } from 'vs/base/common/lifecycle';
const $ = dom.$;

class ColorHover {

	constructor(
		public readonly range: IRange,
		public readonly color: IColor,
		public readonly formatters: IColorFormatter[]
	) { }
}

type HoverPart = Hover | ColorHover;

class ModesContentComputer implements IHoverComputer<HoverPart[]> {

	private _editor: ICodeEditor;
	private _result: HoverPart[];
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

	computeAsync(): TPromise<HoverPart[]> {
		const model = this._editor.getModel();

		if (!HoverProviderRegistry.has(model)) {
			return TPromise.as(null);
		}

		return getHover(model, new Position(
			this._range.startLineNumber,
			this._range.startColumn
		));
	}

	computeSync(): HoverPart[] {
		const lineNumber = this._range.startLineNumber;

		if (lineNumber > this._editor.getModel().getLineCount()) {
			// Illegal line number => no results
			return [];
		}

		const colorDetector = ColorDetector.get(this._editor);
		const maxColumn = this._editor.getModel().getLineMaxColumn(lineNumber);
		const lineDecorations = this._editor.getLineDecorations(lineNumber);
		let didFindColor = false;

		const result = lineDecorations.map(d => {
			const startColumn = (d.range.startLineNumber === lineNumber) ? d.range.startColumn : 1;
			const endColumn = (d.range.endLineNumber === lineNumber) ? d.range.endColumn : maxColumn;

			if (startColumn > this._range.startColumn || this._range.endColumn > endColumn) {
				return null;
			}

			const range = new Range(this._range.startLineNumber, startColumn, this._range.startLineNumber, endColumn);
			const colorRange = colorDetector.getColorRange(d.range.getStartPosition());

			if (!didFindColor && colorRange) {
				didFindColor = true;

				const { color, formatters } = colorRange;
				return new ColorHover(d.range, color, formatters);
			} else {
				if (isEmptyMarkdownString(d.options.hoverMessage)) {
					return null;
				}

				let contents: IMarkdownString[];

				if (d.options.hoverMessage) {
					if (Array.isArray(d.options.hoverMessage)) {
						contents = [...d.options.hoverMessage];
					} else {
						contents = [d.options.hoverMessage];
					}
				}

				return { contents, range };
			}
		});

		return result.filter(d => !!d);
	}

	onResult(result: HoverPart[], isFromSynchronousComputation: boolean): void {
		// Always put synchronous messages before asynchronous ones
		if (isFromSynchronousComputation) {
			this._result = result.concat(this._result.sort((a, b) => {
				if (a instanceof ColorHover) { // sort picker messages at to the top
					return -1;
				} else if (b instanceof ColorHover) {
					return 1;
				}
				return 0;
			}));
		} else {
			this._result = this._result.concat(result);
		}
	}

	getResult(): HoverPart[] {
		return this._result.slice(0);
	}

	getResultWithLoadingMessage(): HoverPart[] {
		return this._result.slice(0).concat([this._getLoadingMessage()]);
	}

	private _getLoadingMessage(): HoverPart {
		return {
			range: this._range,
			contents: [new MarkdownString().appendText(nls.localize('modesContentHover.loading', "Loading..."))]
		};
	}
}

export class ModesContentHoverWidget extends ContentHoverWidget {

	static ID = 'editor.contrib.modesContentHoverWidget';

	private _messages: HoverPart[];
	private _lastRange: Range;
	private _computer: ModesContentComputer;
	private _hoverOperation: HoverOperation<HoverPart[]>;
	private _highlightDecorations: string[];
	private _isChangingDecorations: boolean;
	private _openerService: IOpenerService;
	private _modeService: IModeService;
	private _shouldFocus: boolean;
	private _colorPicker: ColorPickerWidget;

	private renderDisposable: IDisposable = EmptyDisposable;
	private toDispose: IDisposable[];

	constructor(editor: ICodeEditor, openerService: IOpenerService, modeService: IModeService) {
		super(ModesContentHoverWidget.ID, editor);

		this._computer = new ModesContentComputer(this._editor);
		this._highlightDecorations = [];
		this._isChangingDecorations = false;
		this._openerService = openerService || NullOpenerService;
		this._modeService = modeService;

		this._hoverOperation = new HoverOperation(
			this._computer,
			result => this._withResult(result, true),
			null,
			result => this._withResult(result, false)
		);

		this.toDispose = [];
		this.toDispose.push(dom.addStandardDisposableListener(this.getDomNode(), dom.EventType.FOCUS, () => {
			if (this._colorPicker) {
				dom.addClass(this.getDomNode(), 'colorpicker-hover');
			}
		}));
		this.toDispose.push(dom.addStandardDisposableListener(this.getDomNode(), dom.EventType.BLUR, () => {
			dom.removeClass(this.getDomNode(), 'colorpicker-hover');
		}));
	}

	dispose(): void {
		this.renderDisposable.dispose();
		this.renderDisposable = EmptyDisposable;
		this._hoverOperation.cancel();
		this.toDispose = dispose(this.toDispose);
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

			if (!this._colorPicker) { // TODO@Michel ensure that displayed text for other decorations is computed even if color picker is in place
				this._hoverOperation.start();
			}
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
				var filteredMessages: HoverPart[] = [];
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
		this.renderDisposable.dispose();
		this.renderDisposable = EmptyDisposable;
		this._colorPicker = null;
	}

	isColorPickerVisible(): boolean {
		if (this._colorPicker) {
			return true;
		}
		return false;
	}

	private _withResult(result: HoverPart[], complete: boolean): void {
		this._messages = result;

		if (this._lastRange && this._messages.length > 0) {
			this._renderMessages(this._lastRange, this._messages);
		} else if (complete) {
			this.hide();
		}
	}

	private _renderMessages(renderRange: Range, messages: HoverPart[]): void {
		this.renderDisposable.dispose();
		this._colorPicker = null;

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

			if (!(msg instanceof ColorHover)) {
				msg.contents
					.filter(contents => !isEmptyMarkdownString(contents))
					.forEach(contents => {
						const renderedContents = renderMarkdown(contents, {
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
									return tokenizeToString(value, modeId);
								});
							}
						});

						fragment.appendChild($('div.hover-row', null, renderedContents));
					});
			} else {
				const { red, green, blue, alpha } = msg.color;
				const rgba = new RGBA(red * 255, green * 255, blue * 255, alpha);
				const color = new Color(rgba);

				const formatters = [...msg.formatters];
				const text = this._editor.getModel().getValueInRange(msg.range);

				let formatterIndex = 0;

				for (let i = 0; i < formatters.length; i++) {
					if (text === formatters[i].format(msg.color)) {
						formatterIndex = i;
						break;
					}
				}

				const model = new ColorPickerModel(color, formatters, formatterIndex);
				const widget = new ColorPickerWidget(fragment, model, this._editor.getConfiguration().pixelRatio);

				const editorModel = this._editor.getModel();
				let range = new Range(msg.range.startLineNumber, msg.range.startColumn, msg.range.endLineNumber, msg.range.endColumn);

				const updateEditorModel = () => {
					const text = model.formatter.format({
						red: model.color.rgba.r / 255,
						green: model.color.rgba.g / 255,
						blue: model.color.rgba.b / 255,
						alpha: model.color.rgba.a
					});
					editorModel.pushEditOperations([], [{ identifier: null, range, text, forceMoveMarkers: false }], () => []);
					this._editor.pushUndoStop();
					range = range.setEndPosition(range.endLineNumber, range.startColumn + text.length);
				};

				const colorListener = model.onColorFlushed(updateEditorModel);

				this._colorPicker = widget;
				this.renderDisposable = combinedDisposable([colorListener, widget]);
			}
		});

		// show
		this.showAt(new Position(renderRange.startLineNumber, renderColumn), this._shouldFocus);

		this.updateContents(fragment);

		if (this._colorPicker) {
			this._colorPicker.layout();
		}

		this._isChangingDecorations = true;
		this._highlightDecorations = this._editor.deltaDecorations(this._highlightDecorations, [{
			range: highlightRange,
			options: ModesContentHoverWidget._DECORATION_OPTIONS
		}]);
		this._isChangingDecorations = false;
	}

	private static _DECORATION_OPTIONS = ModelDecorationOptions.register({
		className: 'hoverHighlight'
	});
}
