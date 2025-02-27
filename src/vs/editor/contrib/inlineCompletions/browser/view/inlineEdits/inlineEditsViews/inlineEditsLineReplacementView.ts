/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, getWindow, n } from '../../../../../../../base/browser/dom.js';
import { IMouseEvent, StandardMouseEvent } from '../../../../../../../base/browser/mouseEvent.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun, autorunDelta, constObservable, derived, IObservable } from '../../../../../../../base/common/observable.js';
import { editorBackground, scrollbarShadow } from '../../../../../../../platform/theme/common/colorRegistry.js';
import { asCssVariable } from '../../../../../../../platform/theme/common/colorUtils.js';
import { IEditorMouseEvent, IViewZoneChangeAccessor } from '../../../../../../browser/editorBrowser.js';
import { EditorMouseEvent } from '../../../../../../browser/editorDom.js';
import { ObservableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { Point } from '../../../../../../browser/point.js';
import { Rect } from '../../../../../../browser/rect.js';
import { LineSource, renderLines, RenderOptions } from '../../../../../../browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js';
import { EditorOption } from '../../../../../../common/config/editorOptions.js';
import { LineRange } from '../../../../../../common/core/lineRange.js';
import { OffsetRange } from '../../../../../../common/core/offsetRange.js';
import { Range } from '../../../../../../common/core/range.js';
import { ILanguageService } from '../../../../../../common/languages/language.js';
import { IModelDecorationOptions, TrackedRangeStickiness } from '../../../../../../common/model.js';
import { LineTokens } from '../../../../../../common/tokens/lineTokens.js';
import { TokenArray } from '../../../../../../common/tokens/tokenArray.js';
import { InlineDecoration, InlineDecorationType } from '../../../../../../common/viewModel.js';
import { IInlineEditsView, IInlineEditsViewHost } from '../inlineEditsViewInterface.js';
import { getModifiedBorderColor, modifiedChangedLineBackgroundColor } from '../theme.js';
import { getPrefixTrim, mapOutFalsy, rectToProps } from '../utils/utils.js';
import { rangesToBubbleRanges, Replacement } from './inlineEditsWordReplacementView.js';

export class InlineEditsLineReplacementView extends Disposable implements IInlineEditsView {

	private readonly _onDidClick = this._register(new Emitter<IMouseEvent>());
	readonly onDidClick = this._onDidClick.event;

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
		const verticalScrollbarWidth = this._editor.layoutInfoVerticalScrollbarWidth.read(reader);
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
			minContentWidthRequired: prefixLeftOffset + maxLineWidth + PADDING * 2 + verticalScrollbarWidth,
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
							top: layoutProps.lowerBackground.top - layoutProps.padding,
							left: layoutProps.lowerBackground.left - contentLeft,
							width: layoutProps.lowerBackground.width,
							height: layoutProps.padding * 2,
							background: asCssVariable(editorBackground),
						},
					}),
					n.div({
						style: {
							position: 'absolute',
							...rectToProps(reader => layout.read(reader).lowerBackground.translateX(-contentLeft)),
							borderRadius: '4px',
							background: asCssVariable(editorBackground),
							boxShadow: `${asCssVariable(scrollbarShadow)} 0 6px 6px -6px`,
							borderTop: `1px solid ${modifiedBorderColor}`,
							overflow: 'hidden',
							cursor: 'pointer',
							pointerEvents: 'auto',
						},
						onmousedown: e => {
							e.preventDefault(); // This prevents that the editor loses focus
						},
						onclick: (e) => this._onDidClick.fire(new StandardMouseEvent(getWindow(e), e)),
					}, [
						n.div({
							style: {
								position: 'absolute',
								top: 0,
								left: 0,
								width: '100%',
								height: '100%',
								background: asCssVariable(modifiedChangedLineBackgroundColor),
							},
						})
					]),
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
					}, [...modifiedLineElements.lines]),
					n.div({
						style: {
							position: 'absolute',
							...rectToProps(reader => layout.read(reader).background.translateX(-contentLeft)),
							borderRadius: '4px',

							border: `1px solid ${modifiedBorderColor}`,
							pointerEvents: 'none',
							boxSizing: 'border-box',
						}
					}, []),
				])
			];
		})
	]).keepUpdated(this._store);

	readonly isHovered = this._editor.isTargetHovered((e) => this._isMouseOverWidget(e), this._store);

	constructor(
		private readonly _editor: ObservableCodeEditor,
		private readonly _edit: IObservable<{
			originalRange: LineRange;
			modifiedRange: LineRange;
			modifiedLines: string[];
			replacements: Replacement[];
		} | undefined>,
		private readonly _host: IInlineEditsViewHost,
		@ILanguageService private readonly _languageService: ILanguageService
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
			minContentWidthInPx: derived(reader => {
				return this._layout.read(reader)?.minContentWidthRequired ?? 0;
			}),
			position: constObservable({ preference: { top: 0, left: 0 } }),
			allowEditorOverflow: false,
		}));
	}

	private _isMouseOverWidget(e: IEditorMouseEvent): boolean {
		const layout = this._layout.get();
		if (!layout || !(e.event instanceof EditorMouseEvent)) {
			return false;
		}

		return layout.lowerBackground.containsPoint(new Point(e.event.relativePos.x, e.event.relativePos.y));
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
