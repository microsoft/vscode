/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Color, RGBA } from 'vs/base/common/color';
import { IMarkdownString, MarkdownString, isEmptyMarkdownString, markedStringsEquals } from 'vs/base/common/htmlContent';
import { IDisposable, DisposableStore, combinedDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { DocumentColorProvider, Hover as MarkdownHover, HoverProviderRegistry, IColor, TokenizationRegistry } from 'vs/editor/common/modes';
import { getColorPresentations } from 'vs/editor/contrib/colorPicker/color';
import { ColorDetector } from 'vs/editor/contrib/colorPicker/colorDetector';
import { ColorPickerModel } from 'vs/editor/contrib/colorPicker/colorPickerModel';
import { ColorPickerWidget } from 'vs/editor/contrib/colorPicker/colorPickerWidget';
import { getHover } from 'vs/editor/contrib/hover/getHover';
import { HoverOperation, HoverStartMode, IHoverComputer } from 'vs/editor/contrib/hover/hoverOperation';
import { MarkdownRenderer } from 'vs/editor/browser/core/markdownRenderer';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { coalesce, asArray } from 'vs/base/common/arrays';
import { IOpenerService, NullOpenerService } from 'vs/platform/opener/common/opener';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IIdentifiedSingleEditOperation, IModelDecoration, ITextModel, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import { Constants } from 'vs/base/common/uint';
import { textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Widget } from 'vs/base/browser/ui/widget';
import { KeyCode } from 'vs/base/common/keyCodes';
import { HoverWidget } from 'vs/base/browser/ui/hover/hoverWidget';
import { MarkerHover, MarkerHoverParticipant } from 'vs/editor/contrib/hover/markerHoverParticipant';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

const $ = dom.$;

export interface IHoverPart {
	readonly range: Range;
	equals(other: IHoverPart | HoverPart): boolean;
}

export interface IEditorHover {
	hide(): void;
}

export interface IEditorHoverParticipant<T extends HoverPart> {
	computeHoverPart(hoverRange: Range, model: ITextModel, decoration: IModelDecoration): T | null;
	renderHoverParts(hoverParts: MarkerHover[], fragment: DocumentFragment): IDisposable;
}

class ColorHover {

	constructor(
		public readonly range: IRange,
		public readonly color: IColor,
		public readonly provider: DocumentColorProvider
	) { }
}

export type HoverPart = MarkdownHover | ColorHover | MarkerHover;

class ModesContentComputer implements IHoverComputer<HoverPart[]> {

	private readonly _editor: ICodeEditor;
	private _result: HoverPart[];
	private _range?: Range;

	constructor(
		editor: ICodeEditor,
		private readonly _markerHoverParticipant: IEditorHoverParticipant<MarkerHover>
	) {
		this._editor = editor;
		this._result = [];
	}

	setRange(range: Range): void {
		this._range = range;
		this._result = [];
	}

	clearResult(): void {
		this._result = [];
	}

	computeAsync(token: CancellationToken): Promise<HoverPart[]> {
		if (!this._editor.hasModel() || !this._range) {
			return Promise.resolve([]);
		}

		const model = this._editor.getModel();

		if (!HoverProviderRegistry.has(model)) {
			return Promise.resolve([]);
		}

		return getHover(model, new Position(
			this._range.startLineNumber,
			this._range.startColumn
		), token);
	}

	computeSync(): HoverPart[] {
		if (!this._editor.hasModel() || !this._range) {
			return [];
		}

		const model = this._editor.getModel();
		const lineNumber = this._range.startLineNumber;

		if (lineNumber > this._editor.getModel().getLineCount()) {
			// Illegal line number => no results
			return [];
		}

		const colorDetector = ColorDetector.get(this._editor);
		const maxColumn = model.getLineMaxColumn(lineNumber);
		const lineDecorations = this._editor.getLineDecorations(lineNumber);
		let didFindColor = false;

		const hoverRange = this._range;
		const result = lineDecorations.map((d): HoverPart | null => {
			const startColumn = (d.range.startLineNumber === lineNumber) ? d.range.startColumn : 1;
			const endColumn = (d.range.endLineNumber === lineNumber) ? d.range.endColumn : maxColumn;

			if (startColumn > hoverRange.startColumn || hoverRange.endColumn > endColumn) {
				return null;
			}

			const markerHover = this._markerHoverParticipant.computeHoverPart(hoverRange, model, d);
			if (markerHover) {
				return markerHover;
			}

			const range = new Range(hoverRange.startLineNumber, startColumn, hoverRange.startLineNumber, endColumn);

			const colorData = colorDetector.getColorData(d.range.getStartPosition());

			if (!didFindColor && colorData) {
				didFindColor = true;

				const { color, range } = colorData.colorInfo;
				return new ColorHover(range, color, colorData.provider);
			} else {
				if (isEmptyMarkdownString(d.options.hoverMessage)) {
					return null;
				}

				const contents: IMarkdownString[] = d.options.hoverMessage ? asArray(d.options.hoverMessage) : [];
				return { contents, range };
			}
		});

		return coalesce(result);
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

export class ModesContentHoverWidget extends Widget implements IContentWidget {

	static readonly ID = 'editor.contrib.modesContentHoverWidget';

	private readonly _markerHoverParticipant: IEditorHoverParticipant<MarkerHover>;

	protected readonly _hover: HoverWidget;
	private readonly _id: string;
	protected _editor: ICodeEditor;
	private _isVisible: boolean;
	protected _showAtPosition: Position | null;
	protected _showAtRange: Range | null;
	private _stoleFocus: boolean;

	// Editor.IContentWidget.allowEditorOverflow
	public allowEditorOverflow = true;

	private _messages: HoverPart[];
	private _lastRange: Range | null;
	private readonly _computer: ModesContentComputer;
	private readonly _hoverOperation: HoverOperation<HoverPart[]>;
	private _highlightDecorations: string[];
	private _isChangingDecorations: boolean;
	private _shouldFocus: boolean;
	private _colorPicker: ColorPickerWidget | null;

	private readonly renderDisposable = this._register(new MutableDisposable<IDisposable>());

	protected get isVisible(): boolean {
		return this._isVisible;
	}

	protected set isVisible(value: boolean) {
		this._isVisible = value;
		this._hover.containerDomNode.classList.toggle('hidden', !this._isVisible);
	}

	constructor(
		editor: ICodeEditor,
		private readonly _hoverVisibleKey: IContextKey<boolean>,
		instantiationService: IInstantiationService,
		private readonly _themeService: IThemeService,
		private readonly _modeService: IModeService,
		private readonly _openerService: IOpenerService = NullOpenerService,
	) {
		super();

		this._markerHoverParticipant = instantiationService.createInstance(MarkerHoverParticipant, editor, this);

		this._hover = this._register(new HoverWidget());
		this._id = ModesContentHoverWidget.ID;
		this._editor = editor;
		this._isVisible = false;
		this._stoleFocus = false;

		this.onkeydown(this._hover.containerDomNode, (e: IKeyboardEvent) => {
			if (e.equals(KeyCode.Escape)) {
				this.hide();
			}
		});

		this._register(this._editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (e.hasChanged(EditorOption.fontInfo)) {
				this.updateFont();
			}
		}));

		this._editor.onDidLayoutChange(() => this.layout());

		this.layout();
		this._editor.addContentWidget(this);
		this._showAtPosition = null;
		this._showAtRange = null;
		this._stoleFocus = false;

		this._messages = [];
		this._lastRange = null;
		this._computer = new ModesContentComputer(this._editor, this._markerHoverParticipant);
		this._highlightDecorations = [];
		this._isChangingDecorations = false;
		this._shouldFocus = false;
		this._colorPicker = null;

		this._hoverOperation = new HoverOperation(
			this._computer,
			result => this._withResult(result, true),
			null,
			result => this._withResult(result, false),
			this._editor.getOption(EditorOption.hover).delay
		);

		this._register(dom.addStandardDisposableListener(this.getDomNode(), dom.EventType.FOCUS, () => {
			if (this._colorPicker) {
				this.getDomNode().classList.add('colorpicker-hover');
			}
		}));
		this._register(dom.addStandardDisposableListener(this.getDomNode(), dom.EventType.BLUR, () => {
			this.getDomNode().classList.remove('colorpicker-hover');
		}));
		this._register(editor.onDidChangeConfiguration(() => {
			this._hoverOperation.setHoverTime(this._editor.getOption(EditorOption.hover).delay);
		}));
		this._register(TokenizationRegistry.onDidChange(() => {
			if (this.isVisible && this._lastRange && this._messages.length > 0) {
				this._messages = this._messages.map(msg => {
					// If a color hover is visible, we need to update the message that
					// created it so that the color matches the last chosen color
					if (msg instanceof ColorHover && !!this._lastRange?.intersectRanges(msg.range) && this._colorPicker?.model.color) {
						const color = this._colorPicker.model.color;
						const newColor = {
							red: color.rgba.r / 255,
							green: color.rgba.g / 255,
							blue: color.rgba.b / 255,
							alpha: color.rgba.a
						};
						return new ColorHover(msg.range, newColor, msg.provider);
					} else {
						return msg;
					}
				});

				this._hover.contentsDomNode.textContent = '';
				this._renderMessages(this._lastRange, this._messages);
			}
		}));
	}

	dispose(): void {
		this._hoverOperation.cancel();
		this._editor.removeContentWidget(this);
		super.dispose();
	}

	public getId(): string {
		return this._id;
	}

	public getDomNode(): HTMLElement {
		return this._hover.containerDomNode;
	}

	public showAt(position: Position, range: Range | null, focus: boolean): void {
		// Position has changed
		this._showAtPosition = position;
		this._showAtRange = range;
		this._hoverVisibleKey.set(true);
		this.isVisible = true;

		this._editor.layoutContentWidget(this);
		// Simply force a synchronous render on the editor
		// such that the widget does not really render with left = '0px'
		this._editor.render();
		this._stoleFocus = focus;
		if (focus) {
			this._hover.containerDomNode.focus();
		}
	}

	public getPosition(): IContentWidgetPosition | null {
		if (this.isVisible) {
			return {
				position: this._showAtPosition,
				range: this._showAtRange,
				preference: [
					ContentWidgetPositionPreference.ABOVE,
					ContentWidgetPositionPreference.BELOW
				]
			};
		}
		return null;
	}

	private updateFont(): void {
		const codeClasses: HTMLElement[] = Array.prototype.slice.call(this._hover.contentsDomNode.getElementsByClassName('code'));
		codeClasses.forEach(node => this._editor.applyFontInfo(node));
	}

	protected updateContents(node: Node): void {
		this._hover.contentsDomNode.textContent = '';
		this._hover.contentsDomNode.appendChild(node);
		this.updateFont();

		this._editor.layoutContentWidget(this);
		this._hover.onContentsChanged();
	}

	private layout(): void {
		const height = Math.max(this._editor.getLayoutInfo().height / 4, 250);
		const { fontSize, lineHeight } = this._editor.getOption(EditorOption.fontInfo);

		this._hover.contentsDomNode.style.fontSize = `${fontSize}px`;
		this._hover.contentsDomNode.style.lineHeight = `${lineHeight}px`;
		this._hover.contentsDomNode.style.maxHeight = `${height}px`;
		this._hover.contentsDomNode.style.maxWidth = `${Math.max(this._editor.getLayoutInfo().width * 0.66, 500)}px`;
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
				this._hoverOperation.start(HoverStartMode.Delayed);
			}
		}
	}

	startShowingAt(range: Range, mode: HoverStartMode, focus: boolean): void {
		if (this._lastRange && this._lastRange.equalsRange(range)) {
			// We have to show the widget at the exact same range as before, so no work is needed
			return;
		}

		this._hoverOperation.cancel();

		if (this.isVisible) {
			// The range might have changed, but the hover is visible
			// Instead of hiding it completely, filter out messages that are still in the new range and
			// kick off a new computation
			if (!this._showAtPosition || this._showAtPosition.lineNumber !== range.startLineNumber) {
				this.hide();
			} else {
				let filteredMessages: HoverPart[] = [];
				for (let i = 0, len = this._messages.length; i < len; i++) {
					const msg = this._messages[i];
					const rng = msg.range;
					if (rng && rng.startColumn <= range.startColumn && rng.endColumn >= range.endColumn) {
						filteredMessages.push(msg);
					}
				}
				if (filteredMessages.length > 0) {
					if (hoverContentsEquals(filteredMessages, this._messages)) {
						return;
					}
					this._renderMessages(range, filteredMessages);
				} else {
					this.hide();
				}
			}
		}

		this._lastRange = range;
		this._computer.setRange(range);
		this._shouldFocus = focus;
		this._hoverOperation.start(mode);
	}

	hide(): void {
		this._lastRange = null;
		this._hoverOperation.cancel();

		if (this.isVisible) {
			setTimeout(() => {
				// Give commands a chance to see the key
				if (!this.isVisible) {
					this._hoverVisibleKey.set(false);
				}
			}, 0);
			this.isVisible = false;

			this._editor.layoutContentWidget(this);
			if (this._stoleFocus) {
				this._editor.focus();
			}
		}

		this._isChangingDecorations = true;
		this._highlightDecorations = this._editor.deltaDecorations(this._highlightDecorations, []);
		this._isChangingDecorations = false;
		this.renderDisposable.clear();
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
		let renderColumn = Constants.MAX_SAFE_SMALL_INTEGER;
		let highlightRange: Range | null = messages[0].range ? Range.lift(messages[0].range) : null;
		let fragment = document.createDocumentFragment();
		let isEmptyHoverContent = true;

		let containColorPicker = false;
		const markdownDisposeables = new DisposableStore();
		const markerMessages: MarkerHover[] = [];
		messages.forEach((msg) => {
			if (!msg.range) {
				return;
			}

			renderColumn = Math.min(renderColumn, msg.range.startColumn);
			highlightRange = highlightRange ? Range.plusRange(highlightRange, msg.range) : Range.lift(msg.range);

			if (msg instanceof ColorHover) {
				containColorPicker = true;

				const { red, green, blue, alpha } = msg.color;
				const rgba = new RGBA(Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255), alpha);
				const color = new Color(rgba);

				if (!this._editor.hasModel()) {
					return;
				}

				const editorModel = this._editor.getModel();
				let range = new Range(msg.range.startLineNumber, msg.range.startColumn, msg.range.endLineNumber, msg.range.endColumn);
				let colorInfo = { range: msg.range, color: msg.color };

				// create blank olor picker model and widget first to ensure it's positioned correctly.
				const model = new ColorPickerModel(color, [], 0);
				const widget = new ColorPickerWidget(fragment, model, this._editor.getOption(EditorOption.pixelRatio), this._themeService);

				getColorPresentations(editorModel, colorInfo, msg.provider, CancellationToken.None).then(colorPresentations => {
					model.colorPresentations = colorPresentations || [];
					if (!this._editor.hasModel()) {
						// gone...
						return;
					}
					const originalText = this._editor.getModel().getValueInRange(msg.range);
					model.guessColorPresentation(color, originalText);

					const updateEditorModel = () => {
						let textEdits: IIdentifiedSingleEditOperation[];
						let newRange: Range;
						if (model.presentation.textEdit) {
							textEdits = [model.presentation.textEdit as IIdentifiedSingleEditOperation];
							newRange = new Range(
								model.presentation.textEdit.range.startLineNumber,
								model.presentation.textEdit.range.startColumn,
								model.presentation.textEdit.range.endLineNumber,
								model.presentation.textEdit.range.endColumn
							);
							const trackedRange = this._editor.getModel()!._setTrackedRange(null, newRange, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter);
							this._editor.pushUndoStop();
							this._editor.executeEdits('colorpicker', textEdits);
							newRange = this._editor.getModel()!._getTrackedRange(trackedRange) || newRange;
						} else {
							textEdits = [{ identifier: null, range, text: model.presentation.label, forceMoveMarkers: false }];
							newRange = range.setEndPosition(range.endLineNumber, range.startColumn + model.presentation.label.length);
							this._editor.pushUndoStop();
							this._editor.executeEdits('colorpicker', textEdits);
						}

						if (model.presentation.additionalTextEdits) {
							textEdits = [...model.presentation.additionalTextEdits as IIdentifiedSingleEditOperation[]];
							this._editor.executeEdits('colorpicker', textEdits);
							this.hide();
						}
						this._editor.pushUndoStop();
						range = newRange;
					};

					const updateColorPresentations = (color: Color) => {
						return getColorPresentations(editorModel, {
							range: range,
							color: {
								red: color.rgba.r / 255,
								green: color.rgba.g / 255,
								blue: color.rgba.b / 255,
								alpha: color.rgba.a
							}
						}, msg.provider, CancellationToken.None).then((colorPresentations) => {
							model.colorPresentations = colorPresentations || [];
						});
					};

					const colorListener = model.onColorFlushed((color: Color) => {
						updateColorPresentations(color).then(updateEditorModel);
					});
					const colorChangeListener = model.onDidChangeColor(updateColorPresentations);

					this._colorPicker = widget;
					this.showAt(range.getStartPosition(), range, this._shouldFocus);
					this.updateContents(fragment);
					this._colorPicker.layout();

					this.renderDisposable.value = combinedDisposable(colorListener, colorChangeListener, widget, markdownDisposeables);
				});
			} else {
				if (msg instanceof MarkerHover) {
					markerMessages.push(msg);
					isEmptyHoverContent = false;
				} else {
					msg.contents
						.filter(contents => !isEmptyMarkdownString(contents))
						.forEach(contents => {
							const markdownHoverElement = $('div.hover-row.markdown-hover');
							const hoverContentsElement = dom.append(markdownHoverElement, $('div.hover-contents'));
							const renderer = markdownDisposeables.add(new MarkdownRenderer({ editor: this._editor }, this._modeService, this._openerService));
							markdownDisposeables.add(renderer.onDidRenderAsync(() => {
								hoverContentsElement.className = 'hover-contents code-hover-contents';
								this._hover.onContentsChanged();
							}));
							const renderedContents = markdownDisposeables.add(renderer.render(contents));
							hoverContentsElement.appendChild(renderedContents.element);
							fragment.appendChild(markdownHoverElement);
							isEmptyHoverContent = false;
						});
				}
			}
		});

		if (markerMessages.length) {
			this.renderDisposable.value = combinedDisposable(this._markerHoverParticipant.renderHoverParts(markerMessages, fragment), markdownDisposeables);
		}

		// show

		if (!containColorPicker && !isEmptyHoverContent) {
			this.showAt(new Position(renderRange.startLineNumber, renderColumn), highlightRange, this._shouldFocus);
			this.updateContents(fragment);
		}

		this._isChangingDecorations = true;
		this._highlightDecorations = this._editor.deltaDecorations(this._highlightDecorations, highlightRange ? [{
			range: highlightRange,
			options: ModesContentHoverWidget._DECORATION_OPTIONS
		}] : []);
		this._isChangingDecorations = false;
	}

	private static readonly _DECORATION_OPTIONS = ModelDecorationOptions.register({
		className: 'hoverHighlight'
	});
}

function hoverContentsEquals(first: HoverPart[], second: HoverPart[]): boolean {
	if ((!first && second) || (first && !second) || first.length !== second.length) {
		return false;
	}
	for (let i = 0; i < first.length; i++) {
		const firstElement = first[i];
		const secondElement = second[i];
		if (firstElement instanceof MarkerHover) {
			if (!firstElement.equals(secondElement)) {
				return false;
			}
		} else if (firstElement instanceof ColorHover || secondElement instanceof ColorHover) {
			return false;
		} else if (firstElement instanceof MarkerHover || secondElement instanceof MarkerHover) {
			return false;
		} else if (!markedStringsEquals(firstElement.contents, secondElement.contents)) {
			return false;
		}
	}
	return true;
}

registerThemingParticipant((theme, collector) => {
	const linkFg = theme.getColor(textLinkForeground);
	if (linkFg) {
		collector.addRule(`.monaco-hover .hover-contents a.code-link span:hover { color: ${linkFg}; }`);
	}
});
