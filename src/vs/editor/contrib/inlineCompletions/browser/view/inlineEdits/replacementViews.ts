/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, autorunDelta, constObservable, derived, mapObservableArrayCached } from '../../../../../../base/common/observable.js';
import { editorHoverStatusBarBackground } from '../../../../../../platform/theme/common/colorRegistry.js';
import { registerColor, transparent } from '../../../../../../platform/theme/common/colorUtils.js';
import { ObservableCodeEditor } from '../../../../../browser/observableCodeEditor.js';
import { Point } from '../../../../../browser/point.js';
import { Rect } from '../../../../../browser/rect.js';
import { LineSource, renderLines, RenderOptions } from '../../../../../browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js';
import { EditorOption } from '../../../../../common/config/editorOptions.js';
import { SingleOffsetEdit } from '../../../../../common/core/offsetEdit.js';
import { OffsetRange } from '../../../../../common/core/offsetRange.js';
import { SingleTextEdit } from '../../../../../common/core/textEdit.js';
import { ILanguageService } from '../../../../../common/languages/language.js';
import { LineTokens } from '../../../../../common/tokens/lineTokens.js';
import { TokenArray } from '../../../../../common/tokens/tokenArray.js';
import { getPrefixTrim, mapOutFalsy, n, rectToProps } from './utils.js';
import { localize } from '../../../../../../nls.js';
import { IInlineEditsView } from './sideBySideDiff.js';
import { Range } from '../../../../../common/core/range.js';
import { InlineDecoration, InlineDecorationType } from '../../../../../common/viewModel.js';
import { IModelDecorationOptions, TrackedRangeStickiness } from '../../../../../common/model.js';
import { $ } from '../../../../../../base/browser/dom.js';
import { IObservable } from '../../../../../../base/common/observableInternal/base.js';
import { IViewZoneChangeAccessor } from '../../../../../browser/editorBrowser.js';
import { LineRange } from '../../../../../common/core/lineRange.js';
export const transparentHoverBackground = registerColor(
	'inlineEdit.wordReplacementView.background',
	{
		light: transparent(editorHoverStatusBarBackground, 0.1),
		dark: transparent(editorHoverStatusBarBackground, 0.1),
		hcLight: transparent(editorHoverStatusBarBackground, 0.1),
		hcDark: transparent(editorHoverStatusBarBackground, 0.1),
	},
	localize('inlineEdit.wordReplacementView.background', 'Background color for the inline edit word replacement view.')
);

export class WordReplacementView extends Disposable implements IInlineEditsView {

	public static MAX_LENGTH = 100;

	private readonly _start = this._editor.observePosition(constObservable(this._edit.range.getStartPosition()), this._store);
	private readonly _end = this._editor.observePosition(constObservable(this._edit.range.getEndPosition()), this._store);

	private readonly _line = document.createElement('div');

	private readonly _text = derived(reader => {
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

	private readonly _editLocations = mapObservableArrayCached(this, constObservable(this._innerEdits), (edit, store) => {
		const start = this._editor.observePosition(constObservable(edit.range.getStartPosition()), store);
		const end = this._editor.observePosition(constObservable(edit.range.getEndPosition()), store);
		return { start, end, edit };
	}).recomputeInitiallyAndOnChange(this._store);

	private readonly _layout = derived(this, reader => {
		this._text.read(reader);
		const widgetStart = this._start.read(reader);
		const widgetEnd = this._end.read(reader);

		if (!widgetStart || !widgetEnd || widgetStart.x > widgetEnd.x) {
			return undefined;
		}

		const contentLeft = this._editor.layoutInfoContentLeft.read(reader);
		const lineHeight = this._editor.getOption(EditorOption.lineHeight).read(reader);
		const scrollLeft = this._editor.scrollLeft.read(reader);
		const w = this._editor.getOption(EditorOption.fontInfo).read(reader).typicalHalfwidthCharacterWidth;
		const modifiedLeftOffset = 20;
		const modifiedTopOffset = 5;
		const PADDING = 4;

		const originalLine = Rect.fromLeftTopWidthHeight(widgetStart.x + contentLeft - scrollLeft, widgetStart.y, widgetEnd.x - widgetStart.x, lineHeight);
		const modifiedLine = Rect.fromLeftTopWidthHeight(originalLine.left + modifiedLeftOffset, originalLine.top + lineHeight + modifiedTopOffset, this._edit.text.length * w + 5, originalLine.height);
		const background = Rect.hull([originalLine, modifiedLine]).withMargin(PADDING);

		let textLengthDelta = 0;
		const editLocations = this._editLocations.read(reader);
		const innerEdits = [];
		for (const editLocation of editLocations) {
			const editStart = editLocation.start.read(reader);
			const editEnd = editLocation.end.read(reader);
			const edit = editLocation.edit;

			if (!editStart || !editEnd || editStart.x > editEnd.x) {
				return;
			}

			const original = Rect.fromLeftTopWidthHeight(editStart.x + contentLeft - scrollLeft, editStart.y, editEnd.x - editStart.x, lineHeight);
			const modified = Rect.fromLeftTopWidthHeight(original.left + modifiedLeftOffset + textLengthDelta * w, original.top + lineHeight + modifiedTopOffset, edit.text.length * w + 5, original.height);

			textLengthDelta += edit.text.length - (edit.range.endColumn - edit.range.startColumn);

			innerEdits.push({ original, modified });
		}

		const lowerBackground = background.intersectVertical(new OffsetRange(originalLine.bottom, Number.MAX_SAFE_INTEGER));
		const lowerText = new Rect(lowerBackground.left + modifiedLeftOffset + 6, lowerBackground.top + modifiedTopOffset, lowerBackground.right, lowerBackground.bottom); // TODO: left seems slightly off? zooming?

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

	private readonly _div = n.div({
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

			const edits = layoutProps.innerEdits.map(edit => ({ modified: edit.modified.moveLeft(contentLeft), original: edit.original.moveLeft(contentLeft) }));

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
							...rectToProps(reader => layout.read(reader).lowerBackground.moveLeft(contentLeft)),
							borderRadius: '4px',
							background: 'var(--vscode-editor-background)',
							boxShadow: 'var(--vscode-scrollbar-shadow) 0 6px 6px -6px'
						},
					}, []),
					n.div({
						style: {
							position: 'absolute',
							padding: '0px',
							boxSizing: 'border-box',
							...rectToProps(reader => layout.read(reader).lowerText.moveLeft(contentLeft)),
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

							background: 'var(--vscode-inlineEdit-modifiedChangedTextBackground)',
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
							background: 'var(--vscode-inlineEdit-originalChangedTextBackground)',
							pointerEvents: 'none',
						}
					}, [])),
					n.div({
						style: {
							position: 'absolute',
							...rectToProps(reader => layout.read(reader).background.moveLeft(contentLeft)),
							borderRadius: '4px',

							border: '1px solid var(--vscode-editorHoverWidget-border)',
							//background: 'rgba(122, 122, 122, 0.12)', looks better
							background: 'var(--vscode-inlineEdit-wordReplacementView-background)',
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
							left: derived(reader => layout.read(reader).modifiedLine.moveLeft(contentLeft).left - 15),
							top: derived(reader => layout.read(reader).modifiedLine.top),
						}
					}, [
						n.svgElem('path', {
							d: 'M1 0C1 2.98966 1 4.92087 1 7.49952C1 8.60409 1.89543 9.5 3 9.5H10.5',
							stroke: 'var(--vscode-editorHoverWidget-foreground)',
						}),
						n.svgElem('path', {
							d: 'M6 6.5L9.99999 9.49998L6 12.5',
							stroke: 'var(--vscode-editorHoverWidget-foreground)',
						})
					]),

				])
			];
		})
	]).keepUpdated(this._store);

	readonly isHovered = derived(this, reader => {
		return this._div.getIsHovered(this._store).read(reader);
	});

	constructor(
		private readonly _editor: ObservableCodeEditor,
		/** Must be single-line in both sides */
		private readonly _edit: SingleTextEdit,
		private readonly _innerEdits: SingleTextEdit[],
		@ILanguageService private readonly _languageService: ILanguageService,
	) {
		super();

		this._register(this._editor.createOverlayWidget({
			domNode: this._div.element,
			minContentWidthInPx: constObservable(0),
			position: constObservable({ preference: { top: 0, left: 0 } }),
			allowEditorOverflow: false,
		}));
	}
}

export class LineReplacementView extends Disposable implements IInlineEditsView {

	private readonly _originalBubblesDecorationCollection = this._editor.editor.createDecorationsCollection();
	private readonly _originalBubblesDecorationOptions: IModelDecorationOptions = {
		description: 'inlineCompletions-original-bubble',
		className: 'inlineCompletions-original-bubble',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	};

	private readonly _maxPrefixTrim = this._edit.map(e => e ? getPrefixTrim(e.replacements.flatMap(r => [r.originalRange, r.modifiedRange]), e.originalRange, e.modifiedLines, this._editor.editor) : undefined);

	private readonly _modifiedLineElements = derived(reader => {
		const lines = [];
		let requiredWidth = 0;

		const prefixTrim = this._maxPrefixTrim.read(reader);
		const edit = this._edit.read(reader);
		if (!edit || !prefixTrim) {
			return undefined;
		}

		const maxPrefixTrim = prefixTrim.prefixTrim;
		const modifiedBubbles = rangesToBubbleRanges(edit.replacements.map(r => r.modifiedRange)).map(r => new Range(r.startLineNumber, r.startColumn - maxPrefixTrim, r.endLineNumber, r.endColumn - maxPrefixTrim));

		const textModel = this._editor.model.get()!;
		const startLineNumber = edit.modifiedRange.startLineNumber;
		for (let i = 0; i < edit.modifiedRange.length; i++) {
			const line = document.createElement('div');
			const lineNumber = startLineNumber + i;
			const modLine = edit.modifiedLines[i].slice(maxPrefixTrim);

			const t = textModel.tokenization.tokenizeLinesAt(lineNumber, [modLine])?.[0];
			let tokens: LineTokens;
			if (t) {
				tokens = TokenArray.fromLineTokens(t).toLineTokens(modLine, this._languageService.languageIdCodec);
			} else {
				tokens = LineTokens.createEmpty(modLine, this._languageService.languageIdCodec);
			}

			// Inline decorations are broken down into individual spans. To be able to render rounded corners, we need to set the start and end decorations separately.
			const decorations = [];
			for (const modified of modifiedBubbles.filter(b => b.startLineNumber === lineNumber)) {
				const validatedEndColumn = Math.min(modified.endColumn, modLine.length + 1);
				decorations.push(new InlineDecoration(new Range(1, modified.startColumn, 1, validatedEndColumn), 'inlineCompletions-modified-bubble', InlineDecorationType.Regular));
				decorations.push(new InlineDecoration(new Range(1, modified.startColumn, 1, modified.startColumn + 1), 'start', InlineDecorationType.Regular));
				decorations.push(new InlineDecoration(new Range(1, validatedEndColumn - 1, 1, validatedEndColumn), 'end', InlineDecorationType.Regular));
			}

			// TODO: All lines should be rendered at once for one dom element
			const result = renderLines(new LineSource([tokens]), RenderOptions.fromEditor(this._editor.editor).withSetWidth(false), decorations, line, true);
			this._editor.getOption(EditorOption.fontInfo).read(reader); // update when font info changes

			requiredWidth = Math.max(requiredWidth, result.minWidthInPx);

			lines.push(line);
		}

		return { lines, requiredWidth: requiredWidth - 10 }; // TODO: Width is always too large, why?
	});


	private readonly _layout = derived(this, reader => {
		const modifiedLines = this._modifiedLineElements.read(reader);
		const maxPrefixTrim = this._maxPrefixTrim.read(reader);
		const edit = this._edit.read(reader);
		if (!modifiedLines || !maxPrefixTrim || !edit) {
			return undefined;
		}

		const { prefixLeftOffset } = maxPrefixTrim;
		const { requiredWidth } = modifiedLines;

		const lineHeight = this._editor.getOption(EditorOption.lineHeight).read(reader);
		const contentLeft = this._editor.layoutInfoContentLeft.read(reader);
		const scrollLeft = this._editor.scrollLeft.read(reader);
		const scrollTop = this._editor.scrollTop.read(reader);
		const editorLeftOffset = contentLeft - scrollLeft;
		const PADDING = 4;

		const textModel = this._editor.editor.getModel()!;

		const originalLineWidths = edit.originalRange.mapToLineArray(line => this._editor.editor.getOffsetForColumn(line, textModel.getLineMaxColumn(line)) - prefixLeftOffset);
		const maxLineWidth = Math.max(...originalLineWidths, requiredWidth);

		const startLineNumber = edit.originalRange.startLineNumber;
		const endLineNumber = edit.originalRange.endLineNumberExclusive - 1;
		const topOfOriginalLines = this._editor.editor.getTopForLineNumber(startLineNumber) - scrollTop;
		const bottomOfOriginalLines = this._editor.editor.getBottomForLineNumber(endLineNumber) - scrollTop;

		// Box Widget positioning
		const originalLinesOverlay = Rect.fromLeftTopWidthHeight(
			editorLeftOffset + prefixLeftOffset,
			topOfOriginalLines,
			maxLineWidth,
			bottomOfOriginalLines - topOfOriginalLines + PADDING
		);
		const modifiedLinesOverlay = Rect.fromLeftTopWidthHeight(
			originalLinesOverlay.left,
			originalLinesOverlay.bottom + PADDING,
			originalLinesOverlay.width,
			edit.modifiedRange.length * lineHeight
		);
		const background = Rect.hull([originalLinesOverlay, modifiedLinesOverlay]).withMargin(PADDING);

		const lowerBackground = background.intersectVertical(new OffsetRange(originalLinesOverlay.bottom, Number.MAX_SAFE_INTEGER));
		const lowerText = new Rect(lowerBackground.left + PADDING, lowerBackground.top + PADDING, lowerBackground.right, lowerBackground.bottom);

		return {
			originalLinesOverlay,
			modifiedLinesOverlay,
			background,
			lowerBackground,
			lowerText,
			padding: PADDING,
			minContentWidthRequired: maxLineWidth + PADDING * 2,
		};
	});

	private readonly _viewZoneInfo = derived<{ height: number; lineNumber: number } | undefined>(reader => {
		const shouldShowViewZone = this._editor.getOption(EditorOption.inlineSuggest).map(o => o.edits.codeShifting).read(reader);
		if (!shouldShowViewZone) {
			return undefined;
		}

		const layout = this._layout.read(reader);
		const edit = this._edit.read(reader);
		if (!layout || !edit) {
			return undefined;
		}

		const viewZoneHeight = layout.lowerBackground.height + 2 * layout.padding;
		const viewZoneLineNumber = edit.originalRange.endLineNumberExclusive;
		return { height: viewZoneHeight, lineNumber: viewZoneLineNumber };
	});

	private readonly _div = n.div({
		class: 'line-replacement',
	}, [
		derived(reader => {
			const layout = mapOutFalsy(this._layout).read(reader);
			const modifiedLineElements = this._modifiedLineElements.read(reader);
			if (!layout || !modifiedLineElements) {
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

			const lineHeight = this._editor.getOption(EditorOption.lineHeight).read(reader);
			modifiedLineElements.lines.forEach(l => {
				l.style.width = `${layout.read(reader).lowerText.width}px`;
				l.style.height = `${lineHeight}px`;
				l.style.position = 'relative';
			});

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
					n.div({ // overlay to make sure the code is not visible between original and modified lines
						style: {
							position: 'absolute',
							top: layoutProps.lowerBackground.top - layoutProps.padding,
							left: layoutProps.lowerBackground.left - contentLeft,
							width: layoutProps.lowerBackground.width,
							height: layoutProps.padding * 2,
							background: 'var(--vscode-editor-background)',
						},
					}),
					n.div({ // styling for the modified lines widget
						style: {
							position: 'absolute',
							...rectToProps(reader => layout.read(reader).lowerBackground.moveLeft(contentLeft)),
							borderRadius: '4px',
							background: 'var(--vscode-editor-background)',
							boxShadow: 'var(--vscode-scrollbar-shadow) 0 6px 6px -6px',
							borderTop: '1px solid var(--vscode-editorHoverWidget-border)',
							overflow: 'hidden',
						},
					}, [
						n.div({ // adds background color to modified lines widget (may be transparent)
							style: {
								position: 'absolute',
								top: 0,
								left: 0,
								width: '100%',
								height: '100%',
								background: 'var(--vscode-inlineEdit-modifiedChangedLineBackground)',
							},
						})
					]),
					n.div({
						style: {
							position: 'absolute',
							padding: '0px',
							boxSizing: 'border-box',
							...rectToProps(reader => layout.read(reader).lowerText.moveLeft(contentLeft)),
							fontFamily: this._editor.getOption(EditorOption.fontFamily),
							fontSize: this._editor.getOption(EditorOption.fontSize),
							fontWeight: this._editor.getOption(EditorOption.fontWeight),
							pointerEvents: 'none',
						}
					}, [...modifiedLineElements.lines]),
					n.div({
						style: {
							position: 'absolute',
							...rectToProps(reader => layout.read(reader).background.moveLeft(contentLeft)),
							borderRadius: '4px',

							border: '1px solid var(--vscode-editorHoverWidget-border)',
							//background: 'rgba(122, 122, 122, 0.12)', looks better
							background: 'var(--vscode-inlineEdit-wordReplacementView-background)',
							pointerEvents: 'none',
							boxSizing: 'border-box',
						}
					}, []),
				])
			];
		})
	]).keepUpdated(this._store);

	readonly isHovered = derived(this, reader => {
		return this._div.getIsHovered(this._store).read(reader);
	});

	constructor(
		private readonly _editor: ObservableCodeEditor,
		private readonly _edit: IObservable<{
			originalRange: LineRange;
			modifiedRange: LineRange;
			modifiedLines: string[];
			replacements: Replacement[];
		} | undefined>,
		@ILanguageService private readonly _languageService: ILanguageService,
	) {
		super();

		this._register(toDisposable(() => this._originalBubblesDecorationCollection.clear()));
		this._register(toDisposable(() => this._editor.editor.changeViewZones(accessor => this.removePreviousViewZone(accessor))));

		this._register(autorunDelta(this._viewZoneInfo, ({ lastValue, newValue }) => {
			if (lastValue === newValue || (lastValue?.height === newValue?.height && lastValue?.lineNumber === newValue?.lineNumber)) {
				return;
			}
			this._editor.editor.changeViewZones((changeAccessor) => {
				this.removePreviousViewZone(changeAccessor);
				if (!newValue) { return; }
				this.addViewZone(newValue, changeAccessor);
			});
		}));

		this._register(autorun(reader => {
			const edit = this._edit.read(reader);
			const originalBubbles = [];
			if (edit) {
				originalBubbles.push(...rangesToBubbleRanges(edit.replacements.map(r => r.originalRange)));
			}
			this._originalBubblesDecorationCollection.set(originalBubbles.map(r => ({ range: r, options: this._originalBubblesDecorationOptions })));
		}));

		this._register(this._editor.createOverlayWidget({
			domNode: this._div.element,
			minContentWidthInPx: derived(reader => { // TODO: is this helping?
				return this._layout.read(reader)?.minContentWidthRequired ?? 0;
			}),
			position: constObservable({ preference: { top: 0, left: 0 } }),
			allowEditorOverflow: false,
		}));
	}

	// View Zones

	private _previousViewZoneInfo: { height: number; lineNumber: number; id: string } | undefined = undefined;

	private removePreviousViewZone(changeAccessor: IViewZoneChangeAccessor) {
		if (!this._previousViewZoneInfo) {
			return;
		}

		changeAccessor.removeZone(this._previousViewZoneInfo.id);

		const cursorLineNumber = this._editor.cursorLineNumber.get();
		if (cursorLineNumber !== null && cursorLineNumber >= this._previousViewZoneInfo.lineNumber) {
			this._editor.editor.setScrollTop(this._editor.scrollTop.get() - this._previousViewZoneInfo.height);
		}

		this._previousViewZoneInfo = undefined;
	}

	private addViewZone(viewZoneInfo: { height: number; lineNumber: number }, changeAccessor: IViewZoneChangeAccessor) {
		const activeViewZone = changeAccessor.addZone({
			afterLineNumber: viewZoneInfo.lineNumber - 1,
			heightInPx: viewZoneInfo.height, // move computation to layout?
			domNode: $('div'),
		});

		this._previousViewZoneInfo = { height: viewZoneInfo.height, lineNumber: viewZoneInfo.lineNumber, id: activeViewZone };

		const cursorLineNumber = this._editor.cursorLineNumber.get();
		if (cursorLineNumber !== null && cursorLineNumber >= viewZoneInfo.lineNumber) {
			this._editor.editor.setScrollTop(this._editor.scrollTop.get() + viewZoneInfo.height);
		}
	}
}

function rangesToBubbleRanges(ranges: Range[]): Range[] {
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

export class WordInsertView extends Disposable implements IInlineEditsView {
	private readonly _start = this._editor.observePosition(constObservable(this._edit.range.getStartPosition()), this._store);

	private readonly _layout = derived(this, reader => {
		const start = this._start.read(reader);
		if (!start) {
			return undefined;
		}
		const contentLeft = this._editor.layoutInfoContentLeft.read(reader);
		const lineHeight = this._editor.getOption(EditorOption.lineHeight).read(reader);

		const w = this._editor.getOption(EditorOption.fontInfo).read(reader).typicalHalfwidthCharacterWidth;
		const width = this._edit.text.length * w + 5;

		const center = new Point(contentLeft + start.x + w / 2 - this._editor.scrollLeft.read(reader), start.y);

		const modified = Rect.fromLeftTopWidthHeight(center.x - width / 2, center.y + lineHeight + 5, width, lineHeight);
		const background = Rect.hull([Rect.fromPoint(center), modified]).withMargin(4);

		return {
			modified,
			center,
			background,
			lowerBackground: background.intersectVertical(new OffsetRange(modified.top - 2, Number.MAX_SAFE_INTEGER)),
		};
	});

	private readonly _div = n.div({
		class: 'word-insert',
	}, [
		derived(reader => {
			const layout = mapOutFalsy(this._layout).read(reader);
			if (!layout) {
				return [];
			}

			return [
				n.div({
					style: {
						position: 'absolute',
						...rectToProps(reader => layout.read(reader).lowerBackground),
						borderRadius: '4px',
						background: 'var(--vscode-editor-background)'
					}
				}, []),
				n.div({
					style: {
						position: 'absolute',
						...rectToProps(reader => layout.read(reader).modified),
						borderRadius: '4px',
						padding: '0px',
						textAlign: 'center',
						background: 'var(--vscode-inlineEdit-modifiedChangedTextBackground)',
						fontFamily: this._editor.getOption(EditorOption.fontFamily),
						fontSize: this._editor.getOption(EditorOption.fontSize),
						fontWeight: this._editor.getOption(EditorOption.fontWeight),
					}
				}, [
					this._edit.text,
				]),
				n.div({
					style: {
						position: 'absolute',
						...rectToProps(reader => layout.read(reader).background),
						borderRadius: '4px',
						border: '1px solid var(--vscode-editorHoverWidget-border)',
						//background: 'rgba(122, 122, 122, 0.12)', looks better
						background: 'var(--vscode-inlineEdit-wordReplacementView-background)',
					}
				}, []),
				n.svg({
					viewBox: '0 0 12 18',
					width: 12,
					height: 18,
					fill: 'none',
					style: {
						position: 'absolute',
						left: derived(reader => layout.read(reader).center.x - 9),
						top: derived(reader => layout.read(reader).center.y + 4),
						transform: 'scale(1.4, 1.4)',
					}
				}, [
					n.svgElem('path', {
						d: 'M5.06445 0H7.35759C7.35759 0 7.35759 8.47059 7.35759 11.1176C7.35759 13.7647 9.4552 18 13.4674 18C17.4795 18 -2.58445 18 0.281373 18C3.14719 18 5.06477 14.2941 5.06477 11.1176C5.06477 7.94118 5.06445 0 5.06445 0Z',
						fill: 'var(--vscode-inlineEdit-modifiedChangedTextBackground)',
					})
				])

			];
		})
	]).keepUpdated(this._store);

	readonly isHovered = constObservable(false);

	constructor(
		private readonly _editor: ObservableCodeEditor,
		/** Must be single-line in both sides */
		private readonly _edit: SingleTextEdit,
	) {
		super();

		this._register(this._editor.createOverlayWidget({
			domNode: this._div.element,
			minContentWidthInPx: constObservable(0),
			position: constObservable({ preference: { top: 0, left: 0 } }),
			allowEditorOverflow: false,
		}));
	}
}
