/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, getWindow, n } from '../../../../../../../base/browser/dom.js';
import { IMouseEvent, StandardMouseEvent } from '../../../../../../../base/browser/mouseEvent.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { autorunDelta, constObservable, derived, IObservable } from '../../../../../../../base/common/observable.js';
import { editorBackground, scrollbarShadow } from '../../../../../../../platform/theme/common/colorRegistry.js';
import { asCssVariable } from '../../../../../../../platform/theme/common/colorUtils.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
import { IEditorMouseEvent, IViewZoneChangeAccessor } from '../../../../../../browser/editorBrowser.js';
import { EditorMouseEvent } from '../../../../../../browser/editorDom.js';
import { ObservableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { LineSource, renderLines, RenderOptions } from '../../../../../../browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js';
import { EditorOption } from '../../../../../../common/config/editorOptions.js';
import { Point } from '../../../../../../common/core/2d/point.js';
import { Rect } from '../../../../../../common/core/2d/rect.js';
import { Range } from '../../../../../../common/core/range.js';
import { LineRange } from '../../../../../../common/core/ranges/lineRange.js';
import { OffsetRange } from '../../../../../../common/core/ranges/offsetRange.js';
import { ILanguageService } from '../../../../../../common/languages/language.js';
import { LineTokens, TokenArray } from '../../../../../../common/tokens/lineTokens.js';
import { InlineDecoration, InlineDecorationType } from '../../../../../../common/viewModel/inlineDecorations.js';
import { IInlineEditsView, InlineEditTabAction } from '../inlineEditsViewInterface.js';
import { getEditorBlendedColor, getModifiedBorderColor, getOriginalBorderColor, modifiedChangedLineBackgroundColor, originalBackgroundColor } from '../theme.js';
import { getEditorValidOverlayRect, getPrefixTrim, mapOutFalsy, rectToProps } from '../utils/utils.js';

export class InlineEditsLineReplacementView extends Disposable implements IInlineEditsView {

	private readonly _onDidClick;
	readonly onDidClick;

	private readonly _maxPrefixTrim;

	private readonly _modifiedLineElements;


	private readonly _layout;

	private readonly _viewZoneInfo;

	private readonly _div;

	readonly isHovered;

	readonly minEditorScrollHeight;

	constructor(
		private readonly _editor: ObservableCodeEditor,
		private readonly _edit: IObservable<{
			originalRange: LineRange;
			modifiedRange: LineRange;
			modifiedLines: string[];
			replacements: Replacement[];
		} | undefined>,
		private readonly _isInDiffEditor: IObservable<boolean>,
		private readonly _tabAction: IObservable<InlineEditTabAction>,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super();
		this._onDidClick = this._register(new Emitter<IMouseEvent>());
		this.onDidClick = this._onDidClick.event;
		this._maxPrefixTrim = this._edit.map(e => e ? getPrefixTrim(e.replacements.flatMap(r => [r.originalRange, r.modifiedRange]), e.originalRange, e.modifiedLines, this._editor.editor) : undefined);
		this._modifiedLineElements = derived(this, reader => {
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

				const decorations = [];
				for (const modified of modifiedBubbles.filter(b => b.startLineNumber === lineNumber)) {
					const validatedEndColumn = Math.min(modified.endColumn, modLine.length + 1);
					decorations.push(new InlineDecoration(new Range(1, modified.startColumn, 1, validatedEndColumn), 'inlineCompletions-modified-bubble', InlineDecorationType.Regular));
				}

				// TODO: All lines should be rendered at once for one dom element
				const result = renderLines(new LineSource([tokens]), RenderOptions.fromEditor(this._editor.editor).withSetWidth(false).withScrollBeyondLastColumn(0), decorations, line, true);
				this._editor.getOption(EditorOption.fontInfo).read(reader); // update when font info changes

				requiredWidth = Math.max(requiredWidth, result.minWidthInPx);

				lines.push(line);
			}

			return { lines, requiredWidth: requiredWidth };
		});
		this._layout = derived(this, reader => {
			const modifiedLines = this._modifiedLineElements.read(reader);
			const maxPrefixTrim = this._maxPrefixTrim.read(reader);
			const edit = this._edit.read(reader);
			if (!modifiedLines || !maxPrefixTrim || !edit) {
				return undefined;
			}

			const { prefixLeftOffset } = maxPrefixTrim;
			const { requiredWidth } = modifiedLines;

			const originalLineHeights = this._editor.observeLineHeightsForLineRange(edit.originalRange).read(reader);
			const modifiedLineHeights = (() => {
				const lineHeights = originalLineHeights.slice(0, edit.modifiedRange.length);
				while (lineHeights.length < edit.modifiedRange.length) {
					lineHeights.push(originalLineHeights[originalLineHeights.length - 1]);
				}
				return lineHeights;
			})();

			const contentLeft = this._editor.layoutInfoContentLeft.read(reader);
			const verticalScrollbarWidth = this._editor.layoutInfoVerticalScrollbarWidth.read(reader);
			const scrollLeft = this._editor.scrollLeft.read(reader);
			const scrollTop = this._editor.scrollTop.read(reader);
			const editorLeftOffset = contentLeft - scrollLeft;

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
				bottomOfOriginalLines - topOfOriginalLines
			);
			const modifiedLinesOverlay = Rect.fromLeftTopWidthHeight(
				originalLinesOverlay.left,
				originalLinesOverlay.bottom,
				originalLinesOverlay.width,
				modifiedLineHeights.reduce((sum, h) => sum + h, 0)
			);
			const background = Rect.hull([originalLinesOverlay, modifiedLinesOverlay]);

			const lowerBackground = background.intersectVertical(new OffsetRange(originalLinesOverlay.bottom, Number.MAX_SAFE_INTEGER));
			const lowerText = new Rect(lowerBackground.left, lowerBackground.top, lowerBackground.right, lowerBackground.bottom);

			return {
				originalLinesOverlay,
				modifiedLinesOverlay,
				background,
				lowerBackground,
				lowerText,
				modifiedLineHeights,
				minContentWidthRequired: prefixLeftOffset + maxLineWidth + verticalScrollbarWidth,
			};
		});
		this._viewZoneInfo = derived<{ height: number; lineNumber: number } | undefined>(reader => {
			const shouldShowViewZone = this._editor.getOption(EditorOption.inlineSuggest).map(o => o.edits.allowCodeShifting === 'always').read(reader);
			if (!shouldShowViewZone) {
				return undefined;
			}

			const layout = this._layout.read(reader);
			const edit = this._edit.read(reader);
			if (!layout || !edit) {
				return undefined;
			}

			const viewZoneHeight = layout.lowerBackground.height;
			const viewZoneLineNumber = edit.originalRange.endLineNumberExclusive;
			return { height: viewZoneHeight, lineNumber: viewZoneLineNumber };
		});
		this.minEditorScrollHeight = derived(this, reader => {
			const layout = mapOutFalsy(this._layout).read(reader);
			if (!layout || this._viewZoneInfo.read(reader) !== undefined) {
				return 0;
			}
			return layout.read(reader).lowerText.bottom + this._editor.editor.getScrollTop();
		});
		this._div = n.div({
			class: 'line-replacement',
		}, [
			derived(this, reader => {
				const layout = mapOutFalsy(this._layout).read(reader);
				const modifiedLineElements = this._modifiedLineElements.read(reader);
				if (!layout || !modifiedLineElements) {
					return [];
				}

				const layoutProps = layout.read(reader);
				const contentLeft = this._editor.layoutInfoContentLeft.read(reader);

				const separatorWidth = this._isInDiffEditor.read(reader) ? 3 : 1;

				modifiedLineElements.lines.forEach((l, i) => {
					l.style.width = `${layoutProps.lowerText.width}px`;
					l.style.height = `${layoutProps.modifiedLineHeights[i]}px`;
					l.style.position = 'relative';
				});

				const modifiedBorderColor = getModifiedBorderColor(this._tabAction).read(reader);
				const originalBorderColor = getOriginalBorderColor(this._tabAction).read(reader);

				return [
					n.div({
						style: {
							position: 'absolute',
							...rectToProps((r) => getEditorValidOverlayRect(this._editor).read(r)),
							overflow: 'hidden',
							pointerEvents: 'none',
						}
					}, [
						n.div({
							class: 'borderAroundLineReplacement',
							style: {
								position: 'absolute',
								...rectToProps(reader => layout.read(reader).background.translateX(-contentLeft).withMargin(separatorWidth)),
								borderRadius: '4px',

								border: `${separatorWidth + 1}px solid ${asCssVariable(editorBackground)}`,
								boxSizing: 'border-box',
								pointerEvents: 'none',
							}
						}),
						n.div({
							class: 'originalOverlayLineReplacement',
							style: {
								position: 'absolute',
								...rectToProps(reader => layout.read(reader).background.translateX(-contentLeft)),
								borderRadius: '4px',

								border: getEditorBlendedColor(originalBorderColor, this._themeService).map(c => `1px solid ${c.toString()}`),
								pointerEvents: 'none',
								boxSizing: 'border-box',
								background: asCssVariable(originalBackgroundColor),
							}
						}),
						n.div({
							class: 'modifiedOverlayLineReplacement',
							style: {
								position: 'absolute',
								...rectToProps(reader => layout.read(reader).lowerBackground.translateX(-contentLeft)),
								borderRadius: '0 0 4px 4px',
								background: asCssVariable(editorBackground),
								boxShadow: `${asCssVariable(scrollbarShadow)} 0 6px 6px -6px`,
								border: `1px solid ${asCssVariable(modifiedBorderColor)}`,
								boxSizing: 'border-box',
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
									position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
									background: asCssVariable(modifiedChangedLineBackgroundColor),
								},
							})
						]),
						n.div({
							class: 'modifiedLinesLineReplacement',
							style: {
								position: 'absolute',
								boxSizing: 'border-box',
								...rectToProps(reader => layout.read(reader).lowerText.translateX(-contentLeft)),
								fontFamily: this._editor.getOption(EditorOption.fontFamily),
								fontSize: this._editor.getOption(EditorOption.fontSize),
								fontWeight: this._editor.getOption(EditorOption.fontWeight),
								pointerEvents: 'none',
								whiteSpace: 'nowrap',
								borderRadius: '0 0 4px 4px',
								overflow: 'hidden',
							}
						}, [...modifiedLineElements.lines]),
					])
				];
			})
		]).keepUpdated(this._store);
		this.isHovered = this._editor.isTargetHovered((e) => this._isMouseOverWidget(e), this._store);
		this._previousViewZoneInfo = undefined;

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

		this._register(this._editor.createOverlayWidget({
			domNode: this._div.element,
			minContentWidthInPx: derived(this, reader => {
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
	private _previousViewZoneInfo: { height: number; lineNumber: number; id: string } | undefined;

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
