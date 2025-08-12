/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getWindow, n } from '../../../../../../../base/browser/dom.js';
import { IMouseEvent, StandardMouseEvent } from '../../../../../../../base/browser/mouseEvent.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, derivedObservableWithCache, IObservable, IReader, observableValue } from '../../../../../../../base/common/observable.js';
import { editorBackground } from '../../../../../../../platform/theme/common/colorRegistry.js';
import { asCssVariable } from '../../../../../../../platform/theme/common/colorUtils.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
import { ICodeEditor } from '../../../../../../browser/editorBrowser.js';
import { ObservableCodeEditor, observableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { LineSource, renderLines, RenderOptions } from '../../../../../../browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js';
import { EditorOption } from '../../../../../../common/config/editorOptions.js';
import { Rect } from '../../../../../../common/core/2d/rect.js';
import { LineRange } from '../../../../../../common/core/ranges/lineRange.js';
import { InlineCompletionDisplayLocation } from '../../../../../../common/languages.js';
import { ILanguageService } from '../../../../../../common/languages/language.js';
import { LineTokens, TokenArray } from '../../../../../../common/tokens/lineTokens.js';
import { IInlineEditsView, InlineEditTabAction } from '../inlineEditsViewInterface.js';
import { getEditorBlendedColor, inlineEditIndicatorPrimaryBackground, inlineEditIndicatorSecondaryBackground, inlineEditIndicatorsuccessfulBackground } from '../theme.js';
import { getContentRenderWidth, maxContentWidthInRange, rectToProps } from '../utils/utils.js';

const MIN_END_OF_LINE_PADDING = 14;
const PADDING_VERTICALLY = 0;
const PADDING_HORIZONTALLY = 4;
const HORIZONTAL_OFFSET_WHEN_ABOVE_BELOW = 4;
const VERTICAL_OFFSET_WHEN_ABOVE_BELOW = 2;
// !! minEndOfLinePadding should always be larger than paddingHorizontally + horizontalOffsetWhenAboveBelow

export class InlineEditsCustomView extends Disposable implements IInlineEditsView {

	private readonly _onDidClick = this._register(new Emitter<IMouseEvent>());
	readonly onDidClick = this._onDidClick.event;

	private readonly _isHovered = observableValue(this, false);
	readonly isHovered: IObservable<boolean> = this._isHovered;
	private readonly _viewRef = n.ref<HTMLDivElement>();

	private readonly _editorObs: ObservableCodeEditor;

	readonly minEditorScrollHeight: IObservable<number>;

	constructor(
		private readonly _editor: ICodeEditor,
		displayLocation: IObservable<InlineCompletionDisplayLocation | undefined>,
		tabAction: IObservable<InlineEditTabAction>,
		@IThemeService themeService: IThemeService,
		@ILanguageService private readonly _languageService: ILanguageService,
	) {
		super();

		this._editorObs = observableCodeEditor(this._editor);

		const styles = tabAction.map((v, reader) => {
			let border;
			switch (v) {
				case InlineEditTabAction.Inactive: border = inlineEditIndicatorSecondaryBackground; break;
				case InlineEditTabAction.Jump: border = inlineEditIndicatorPrimaryBackground; break;
				case InlineEditTabAction.Accept: border = inlineEditIndicatorsuccessfulBackground; break;
			}
			return {
				border: getEditorBlendedColor(border, themeService).read(reader).toString(),
				background: asCssVariable(editorBackground)
			};
		});

		const state = displayLocation.map(dl => dl ? this.getState(dl) : undefined);

		const view = state.map(s => s ? this.getRendering(s, styles) : undefined);

		this.minEditorScrollHeight = derived(reader => {
			const s = state.read(reader);
			if (!s) {
				return 0;
			}
			return s.rect.read(reader).bottom + this._editor.getScrollTop();
		});

		const overlay = n.div({
			class: 'inline-edits-custom-view',
			style: {
				position: 'absolute',
				overflow: 'visible',
				top: '0px',
				left: '0px',
				display: 'block',
			},
		}, [view]).keepUpdated(this._store);

		this._register(this._editorObs.createOverlayWidget({
			domNode: overlay.element,
			position: constObservable(null),
			allowEditorOverflow: false,
			minContentWidthInPx: derivedObservableWithCache<number>(this, (reader, prev) => {
				const s = state.read(reader);
				if (!s) { return prev ?? 0; }

				const current = s.rect.map(rect => rect.right).read(reader)
					+ this._editorObs.layoutInfoVerticalScrollbarWidth.read(reader)
					+ PADDING_HORIZONTALLY
					- this._editorObs.layoutInfoContentLeft.read(reader);
				return Math.max(prev ?? 0, current); // will run into infinite loop otherwise TODO: fix this
			}).recomputeInitiallyAndOnChange(this._store),
		}));

		this._register(autorun((reader) => {
			const v = view.read(reader);
			if (!v) { this._isHovered.set(false, undefined); return; }
			this._isHovered.set(overlay.isHovered.read(reader), undefined);
		}));
	}

	// TODO: this is very similar to side by side `fitsInsideViewport`, try to use the same function
	private fitsInsideViewport(range: LineRange, displayLabel: string, reader: IReader | undefined): boolean {
		const editorWidth = this._editorObs.layoutInfoWidth.read(reader);
		const editorContentLeft = this._editorObs.layoutInfoContentLeft.read(reader);
		const editorVerticalScrollbar = this._editor.getLayoutInfo().verticalScrollbarWidth;
		const minimapWidth = this._editorObs.layoutInfoMinimap.read(reader).minimapLeft !== 0 ? this._editorObs.layoutInfoMinimap.read(reader).minimapWidth : 0;

		const maxOriginalContent = maxContentWidthInRange(this._editorObs, range, undefined);
		const maxModifiedContent = getContentRenderWidth(displayLabel, this._editor, this._editor.getModel()!);
		const padding = PADDING_HORIZONTALLY + MIN_END_OF_LINE_PADDING;

		return maxOriginalContent + maxModifiedContent + padding < editorWidth - editorContentLeft - editorVerticalScrollbar - minimapWidth;
	}

	private getState(displayLocation: InlineCompletionDisplayLocation): { rect: IObservable<Rect>; label: string } {

		const contentState = derived((reader) => {
			const startLineNumber = displayLocation.range.startLineNumber;
			const endLineNumber = displayLocation.range.endLineNumber;
			const startColumn = displayLocation.range.startColumn;
			const endColumn = displayLocation.range.endColumn;
			const lineCount = this._editor.getModel()?.getLineCount() ?? 0;

			const lineWidth = maxContentWidthInRange(this._editorObs, new LineRange(startLineNumber, startLineNumber + 1), reader);
			const lineWidthBelow = startLineNumber + 1 <= lineCount ? maxContentWidthInRange(this._editorObs, new LineRange(startLineNumber + 1, startLineNumber + 2), reader) : undefined;
			const lineWidthAbove = startLineNumber - 1 >= 1 ? maxContentWidthInRange(this._editorObs, new LineRange(startLineNumber - 1, startLineNumber), reader) : undefined;
			const startContentLeftOffset = this._editor.getOffsetForColumn(startLineNumber, startColumn);
			const endContentLeftOffset = this._editor.getOffsetForColumn(endLineNumber, endColumn);

			return {
				lineWidth,
				lineWidthBelow,
				lineWidthAbove,
				startContentLeftOffset,
				endContentLeftOffset
			};
		});

		const startLineNumber = displayLocation.range.startLineNumber;
		const endLineNumber = displayLocation.range.endLineNumber;
		// only check viewport once in the beginning when rendering the view
		const fitsInsideViewport = this.fitsInsideViewport(new LineRange(startLineNumber, endLineNumber + 1), displayLocation.label, undefined);

		const rect = derived((reader) => {
			const w = this._editorObs.getOption(EditorOption.fontInfo).read(reader).typicalHalfwidthCharacterWidth;

			const { lineWidth, lineWidthBelow, lineWidthAbove, startContentLeftOffset, endContentLeftOffset } = contentState.read(reader);

			const contentLeft = this._editorObs.layoutInfoContentLeft.read(reader);
			const lineHeight = this._editorObs.observeLineHeightForLine(startLineNumber).recomputeInitiallyAndOnChange(reader.store).read(reader);
			const scrollTop = this._editorObs.scrollTop.read(reader);
			const scrollLeft = this._editorObs.scrollLeft.read(reader);

			let position: 'end' | 'below' | 'above';
			if (startLineNumber === endLineNumber && endContentLeftOffset + 5 * w >= lineWidth && fitsInsideViewport) {
				position = 'end'; // Render at the end of the line if the range ends almost at the end of the line
			} else if (lineWidthBelow !== undefined && lineWidthBelow + MIN_END_OF_LINE_PADDING - HORIZONTAL_OFFSET_WHEN_ABOVE_BELOW - PADDING_HORIZONTALLY < startContentLeftOffset) {
				position = 'below'; // Render Below if possible
			} else if (lineWidthAbove !== undefined && lineWidthAbove + MIN_END_OF_LINE_PADDING - HORIZONTAL_OFFSET_WHEN_ABOVE_BELOW - PADDING_HORIZONTALLY < startContentLeftOffset) {
				position = 'above'; // Render Above if possible
			} else {
				position = 'end'; // Render at the end of the line otherwise
			}

			let topOfLine;
			let contentStartOffset;
			let deltaX = 0;
			let deltaY = 0;

			switch (position) {
				case 'end': {
					topOfLine = this._editorObs.editor.getTopForLineNumber(startLineNumber);
					contentStartOffset = lineWidth;
					deltaX = PADDING_HORIZONTALLY + MIN_END_OF_LINE_PADDING;
					break;
				}
				case 'below': {
					topOfLine = this._editorObs.editor.getTopForLineNumber(startLineNumber + 1);
					contentStartOffset = startContentLeftOffset;
					deltaX = PADDING_HORIZONTALLY + HORIZONTAL_OFFSET_WHEN_ABOVE_BELOW;
					deltaY = PADDING_VERTICALLY + VERTICAL_OFFSET_WHEN_ABOVE_BELOW;
					break;
				}
				case 'above': {
					topOfLine = this._editorObs.editor.getTopForLineNumber(startLineNumber - 1);
					contentStartOffset = startContentLeftOffset;
					deltaX = PADDING_HORIZONTALLY + HORIZONTAL_OFFSET_WHEN_ABOVE_BELOW;
					deltaY = -PADDING_VERTICALLY + VERTICAL_OFFSET_WHEN_ABOVE_BELOW;
					break;
				}
			}

			const textRect = Rect.fromLeftTopWidthHeight(
				contentLeft + contentStartOffset - scrollLeft,
				topOfLine - scrollTop,
				w * displayLocation.label.length,
				lineHeight
			);

			return textRect.withMargin(PADDING_VERTICALLY, PADDING_HORIZONTALLY).translateX(deltaX).translateY(deltaY);
		});

		return {
			rect,
			label: displayLocation.label
		};
	}

	private getRendering(state: { rect: IObservable<Rect>; label: string }, styles: IObservable<{ background: string; border: string }>) {

		const line = document.createElement('div');
		const t = this._editor.getModel()!.tokenization.tokenizeLinesAt(1, [state.label])?.[0];
		let tokens: LineTokens;
		if (t) {
			tokens = TokenArray.fromLineTokens(t).toLineTokens(state.label, this._languageService.languageIdCodec);
		} else {
			tokens = LineTokens.createEmpty(state.label, this._languageService.languageIdCodec);
		}

		const result = renderLines(new LineSource([tokens]), RenderOptions.fromEditor(this._editor).withSetWidth(false).withScrollBeyondLastColumn(0), [], line, true);
		line.style.width = `${result.minWidthInPx}px`;

		const rect = state.rect.map(r => r.withMargin(0, PADDING_HORIZONTALLY));

		return n.div({
			class: 'collapsedView',
			ref: this._viewRef,
			style: {
				position: 'absolute',
				...rectToProps(reader => rect.read(reader)),
				overflow: 'hidden',
				boxSizing: 'border-box',
				cursor: 'pointer',
				border: styles.map(s => `1px solid ${s.border}`),
				borderRadius: '4px',
				backgroundColor: styles.map(s => s.background),

				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				whiteSpace: 'nowrap',
			},
			onclick: (e) => { this._onDidClick.fire(new StandardMouseEvent(getWindow(e), e)); }
		}, [
			line
		]);
	}
}
