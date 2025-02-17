/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { n, ObserverNodeWithElement } from '../../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, derived, observableValue } from '../../../../../../../base/common/observable.js';
import { editorBackground, editorHoverForeground, scrollbarShadow } from '../../../../../../../platform/theme/common/colorRegistry.js';
import { asCssVariable } from '../../../../../../../platform/theme/common/colorUtils.js';
import { ObservableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { Point } from '../../../../../../browser/point.js';
import { Rect } from '../../../../../../browser/rect.js';
import { LineSource, renderLines, RenderOptions } from '../../../../../../browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js';
import { EditorOption } from '../../../../../../common/config/editorOptions.js';
import { SingleOffsetEdit } from '../../../../../../common/core/offsetEdit.js';
import { OffsetRange } from '../../../../../../common/core/offsetRange.js';
import { Range } from '../../../../../../common/core/range.js';
import { SingleTextEdit } from '../../../../../../common/core/textEdit.js';
import { ILanguageService } from '../../../../../../common/languages/language.js';
import { LineTokens } from '../../../../../../common/tokens/lineTokens.js';
import { TokenArray } from '../../../../../../common/tokens/tokenArray.js';
import { IInlineEditsView, IInlineEditsViewHost } from '../inlineEditsViewInterface.js';
import { getModifiedBorderColor, modifiedChangedTextOverlayColor, originalChangedTextOverlayColor, replacementViewBackground } from '../theme.js';
import { mapOutFalsy, rectToProps } from '../utils/utils.js';

export class InlineEditsWordReplacementView extends Disposable implements IInlineEditsView {

	public static MAX_LENGTH = 100;

	private readonly _start = this._editor.observePosition(constObservable(this._edit.range.getStartPosition()), this._store);
	private readonly _end = this._editor.observePosition(constObservable(this._edit.range.getEndPosition()), this._store);

	private readonly _line = document.createElement('div');

	private readonly _hoverableElement = observableValue<ObserverNodeWithElement | null>(this, null);

	readonly isHovered = this._hoverableElement.map((e, reader) => e?.didMouseMoveDuringHover.read(reader) ?? false);

	constructor(
		private readonly _editor: ObservableCodeEditor,
		/** Must be single-line in both sides */
		private readonly _edit: SingleTextEdit,
		private readonly _innerEdits: SingleTextEdit[],
		private readonly _host: IInlineEditsViewHost,
		@ILanguageService private readonly _languageService: ILanguageService,
	) {
		super();

		this._register(this._editor.createOverlayWidget({
			domNode: this._root.element,
			minContentWidthInPx: constObservable(0),
			position: constObservable({ preference: { top: 0, left: 0 } }),
			allowEditorOverflow: false,
		}));
	}

	private readonly _renderTextEffect = derived(_reader => {
		const tm = this._editor.model.get()!;
		const origLine = tm.getLineContent(this._edit.range.startLineNumber);

		const edit = SingleOffsetEdit.replace(new OffsetRange(this._edit.range.startColumn - 1, this._edit.range.endColumn - 1), this._edit.text);
		const lineToTokenize = edit.apply(origLine);
		const t = tm.tokenization.tokenizeLinesAt(this._edit.range.startLineNumber, [lineToTokenize])?.[0];
		let tokens: LineTokens;
		if (t) {
			tokens = TokenArray.fromLineTokens(t).slice(edit.getRangeAfterApply()).toLineTokens(this._edit.text, this._languageService.languageIdCodec);
		} else {
			tokens = LineTokens.createEmpty(this._edit.text, this._languageService.languageIdCodec);
		}
		renderLines(new LineSource([tokens]), RenderOptions.fromEditor(this._editor.editor).withSetWidth(false), [], this._line, true);
	});

	private readonly _editLocations = this._innerEdits.map(edit => {
		const start = this._editor.observePosition(constObservable(edit.range.getStartPosition()), this._store);
		const end = this._editor.observePosition(constObservable(edit.range.getEndPosition()), this._store);
		return { start, end, edit };
	});

	private readonly _layout = derived(this, reader => {
		this._renderTextEffect.read(reader);
		const widgetStart = this._start.read(reader);
		const widgetEnd = this._end.read(reader);//

		if (!widgetStart || !widgetEnd || widgetStart.x > widgetEnd.x) {
			return undefined;
		}

		const contentLeft = this._editor.layoutInfoContentLeft.read(reader);
		const lineHeight = this._editor.getOption(EditorOption.lineHeight).read(reader);
		const scrollLeft = this._editor.scrollLeft.read(reader);
		const w = this._editor.getOption(EditorOption.fontInfo).read(reader).typicalHalfwidthCharacterWidth;

		const modifiedLeftOffset = 20;
		const modifiedTopOffset = 5;
		const modifiedOffset = new Point(modifiedLeftOffset, modifiedTopOffset);
		const PADDING = 4;

		const originalLine = Rect.fromPoints(widgetStart, widgetEnd).withHeight(lineHeight).translateX(contentLeft - scrollLeft);
		const modifiedLine = Rect.fromPointSize(originalLine.getLeftBottom().add(modifiedOffset), new Point(this._edit.text.length * w + 5, originalLine.height));
		const background = Rect.hull([originalLine, modifiedLine]).withMargin(PADDING);

		let textLengthDelta = 0;
		const innerEdits = [];
		for (const editLocation of this._editLocations) {
			const editStart = editLocation.start.read(reader);
			const editEnd = editLocation.end.read(reader);
			const edit = editLocation.edit;

			if (!editStart || !editEnd || editStart.x > editEnd.x) {
				return undefined;
			}

			const original = Rect.fromLeftTopWidthHeight(editStart.x + contentLeft - scrollLeft, editStart.y, editEnd.x - editStart.x, lineHeight);
			const modified = Rect.fromLeftTopWidthHeight(original.left + modifiedLeftOffset + textLengthDelta * w, original.bottom + modifiedTopOffset, edit.text.length * w + 5, original.height);

			textLengthDelta += edit.text.length - (edit.range.endColumn - edit.range.startColumn);

			innerEdits.push({ original, modified });
		}

		const lowerBackground = background.intersectVertical(new OffsetRange(originalLine.bottom, Number.MAX_SAFE_INTEGER));
		const lowerText = new Rect(lowerBackground.left + modifiedLeftOffset + 6, lowerBackground.top + modifiedTopOffset, lowerBackground.right, lowerBackground.bottom); // TODO: left seems slightly off? zooming?

		// debugView(debugLogRects({ lowerBackground }, this._editor.editor.getContainerDomNode()), reader);

		return {
			originalLine,
			modifiedLine,
			background,
			innerEdits,
			lowerBackground,
			lowerText,
			padding: PADDING
		};
	});

	private readonly _root = n.div({
		class: 'word-replacement',
	}, [
		derived(reader => {
			const layout = mapOutFalsy(this._layout).read(reader);
			if (!layout) {
				return [];
			}

			const layoutProps = layout.read(reader);
			const scrollLeft = this._editor.scrollLeft.read(reader);
			let contentLeft = this._editor.layoutInfoContentLeft.read(reader);
			let contentWidth = this._editor.contentWidth.read(reader);
			const contentHeight = this._editor.editor.getContentHeight();

			if (scrollLeft === 0) {
				contentLeft -= layoutProps.padding;
				contentWidth += layoutProps.padding;
			}

			const edits = layoutProps.innerEdits.map(edit => ({ modified: edit.modified.translateX(-contentLeft), original: edit.original.translateX(-contentLeft) }));

			const modifiedBorderColor = getModifiedBorderColor(this._host.tabAction).read(reader);

			return [
				n.div({
					style: {
						position: 'absolute',
						top: 0,
						left: contentLeft,
						width: contentWidth,
						height: contentHeight,
						overflow: 'hidden',
						pointerEvents: 'none',
					}
				}, [
					n.div({
						style: {
							position: 'absolute',
							...rectToProps(reader => layout.read(reader).lowerBackground.translateX(-contentLeft)),
							borderRadius: '4px',
							background: asCssVariable(editorBackground),
							boxShadow: `${asCssVariable(scrollbarShadow)} 0 6px 6px -6px`,
							cursor: 'pointer',
							pointerEvents: 'auto',
						},
						onmouseup: () => this._host.accept(),
						obsRef: (elem) => {
							this._hoverableElement.set(elem, undefined);
						}
					}),
					n.div({
						style: {
							position: 'absolute',
							padding: '0px',
							boxSizing: 'border-box',
							...rectToProps(reader => layout.read(reader).lowerText.translateX(-contentLeft)),
							fontFamily: this._editor.getOption(EditorOption.fontFamily),
							fontSize: this._editor.getOption(EditorOption.fontSize),
							fontWeight: this._editor.getOption(EditorOption.fontWeight),
							pointerEvents: 'none',
						}
					}, [this._line]),
					...edits.map(edit => n.div({
						style: {
							position: 'absolute',
							top: edit.modified.top,
							left: edit.modified.left,
							width: edit.modified.width,
							height: edit.modified.height,
							borderRadius: '4px',

							background: asCssVariable(modifiedChangedTextOverlayColor),
							pointerEvents: 'none',
						}
					}), []),
					...edits.map(edit => n.div({
						style: {
							position: 'absolute',
							top: edit.original.top,
							left: edit.original.left,
							width: edit.original.width,
							height: edit.original.height,
							borderRadius: '4px',
							boxSizing: 'border-box',
							background: asCssVariable(originalChangedTextOverlayColor),
							pointerEvents: 'none',
						}
					}, [])),
					n.div({
						style: {
							position: 'absolute',
							...rectToProps(reader => layout.read(reader).background.translateX(-contentLeft)),
							borderRadius: '4px',

							border: `1px solid ${modifiedBorderColor}`,
							//background: 'rgba(122, 122, 122, 0.12)', looks better
							background: asCssVariable(replacementViewBackground),
							pointerEvents: 'none',
							boxSizing: 'border-box',
						}
					}, []),

					n.svg({
						width: 11,
						height: 13,
						viewBox: '0 0 11 13',
						fill: 'none',
						style: {
							position: 'absolute',
							left: derived(reader => layout.read(reader).modifiedLine.translateX(-contentLeft).left - 15),
							top: derived(reader => layout.read(reader).modifiedLine.top),
						}
					}, [
						n.svgElem('path', {
							d: 'M1 0C1 2.98966 1 4.92087 1 7.49952C1 8.60409 1.89543 9.5 3 9.5H10.5',
							stroke: asCssVariable(editorHoverForeground),
						}),
						n.svgElem('path', {
							d: 'M6 6.5L9.99999 9.49998L6 12.5',
							stroke: asCssVariable(editorHoverForeground),
						})
					]),

				])
			];
		})
	]).keepUpdated(this._store);
}

export function rangesToBubbleRanges(ranges: Range[]): Range[] {
	const result: Range[] = [];
	while (ranges.length) {
		let range = ranges.shift()!;
		if (range.startLineNumber !== range.endLineNumber) {
			ranges.push(new Range(range.startLineNumber + 1, 1, range.endLineNumber, range.endColumn));
			range = new Range(range.startLineNumber, range.startColumn, range.startLineNumber, Number.MAX_SAFE_INTEGER); // TODO: this is not correct
		}

		result.push(range);
	}
	return result;

}

export interface Replacement {
	originalRange: Range;
	modifiedRange: Range;
}
