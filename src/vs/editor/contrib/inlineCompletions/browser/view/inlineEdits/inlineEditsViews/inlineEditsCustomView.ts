/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getWindow, n } from '../../../../../../../base/browser/dom.js';
import { IMouseEvent, StandardMouseEvent } from '../../../../../../../base/browser/mouseEvent.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { editorBackground } from '../../../../../../../platform/theme/common/colorRegistry.js';
import { asCssVariable } from '../../../../../../../platform/theme/common/colorUtils.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
import { ICodeEditor } from '../../../../../../browser/editorBrowser.js';
import { ObservableCodeEditor, observableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { Rect } from '../../../../../../browser/rect.js';
import { LineSource, renderLines, RenderOptions } from '../../../../../../browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js';
import { EditorOption } from '../../../../../../common/config/editorOptions.js';
import { LineRange } from '../../../../../../common/core/lineRange.js';
import { InlineCompletionDisplayLocation } from '../../../../../../common/languages.js';
import { ILanguageService } from '../../../../../../common/languages/language.js';
import { LineTokens } from '../../../../../../common/tokens/lineTokens.js';
import { TokenArray } from '../../../../../../common/tokens/tokenArray.js';
import { IInlineEditsView, InlineEditTabAction } from '../inlineEditsViewInterface.js';
import { getEditorBlendedColor, inlineEditIndicatorPrimaryBackground, inlineEditIndicatorSecondaryBackground, inlineEditIndicatorsuccessfulBackground } from '../theme.js';
import { maxContentWidthInRange, rectToProps } from '../utils/utils.js';

export class InlineEditsCustomView extends Disposable implements IInlineEditsView {

	private readonly _onDidClick = this._register(new Emitter<IMouseEvent>());
	readonly onDidClick = this._onDidClick.event;

	private readonly _isHovered = observableValue(this, false);
	readonly isHovered: IObservable<boolean> = this._isHovered;
	private readonly _viewRef = n.ref<HTMLDivElement>();

	private readonly _editorObs: ObservableCodeEditor;

	constructor(
		private readonly _editor: ICodeEditor,
		displayLocation: IObservable<InlineCompletionDisplayLocation | undefined>,
		tabAction: IObservable<InlineEditTabAction>,
		@IThemeService themeService: IThemeService,
		@ILanguageService private readonly _languageService: ILanguageService,
	) {
		super();

		this._editorObs = observableCodeEditor(this._editor);

		/* const styles = derived(reader => ({
			background: getEditorBlendedColor(modifiedChangedLineBackgroundColor, themeService).read(reader).toString(),
			border: asCssVariable(getModifiedBorderColor(tabAction).read(reader)),
		})); */

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

		/* const styles = derived(reader => ({
			background: asCssVariable(editorBackground),
			border: asCssVariable(getModifiedBorderColor(tabAction).read(reader)),
		})); */

		const state = displayLocation.map(dl => dl ? this.getState(dl) : undefined);

		const view = state.map(s => s ? this.getRendering(s, styles) : undefined);

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
			minContentWidthInPx: constObservable(0),
		}));

		this._register(autorun((reader) => {
			const v = view.read(reader);
			if (!v) { this._isHovered.set(false, undefined); return; }
			this._isHovered.set(overlay.isHovered.read(reader), undefined);
		}));
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

		const minEndOfLinePadding = 14;
		const paddingVertically = 0;
		const paddingHorizontally = 4;
		const horizontalOffsetWhenAboveBelow = 4;
		const verticalOffsetWhenAboveBelow = 2;
		// !! minEndOfLinePadding should always be larger than paddingHorizontally + horizontalOffsetWhenAboveBelow

		const rect = derived((reader) => {
			const w = this._editorObs.getOption(EditorOption.fontInfo).read(reader).typicalHalfwidthCharacterWidth;

			const startLineNumber = displayLocation.range.startLineNumber;
			const endLineNumber = displayLocation.range.endLineNumber;
			const { lineWidth, lineWidthBelow, lineWidthAbove, startContentLeftOffset, endContentLeftOffset } = contentState.read(reader);

			const contentLeft = this._editorObs.layoutInfoContentLeft.read(reader);
			const lineHeight = this._editorObs.getOption(EditorOption.lineHeight).read(reader);
			const scrollTop = this._editorObs.scrollTop.read(reader);
			const scrollLeft = this._editorObs.scrollLeft.read(reader);

			let position: 'end' | 'below' | 'above';
			if (startLineNumber === endLineNumber && endContentLeftOffset + 5 * w >= lineWidth) {
				position = 'end'; // Render at the end of the line if the range ends almost at the end of the line
			} else if (lineWidthBelow !== undefined && lineWidthBelow + minEndOfLinePadding - horizontalOffsetWhenAboveBelow - paddingHorizontally < startContentLeftOffset) {
				position = 'below'; // Render Below if possible
			} else if (lineWidthAbove !== undefined && lineWidthAbove + minEndOfLinePadding - horizontalOffsetWhenAboveBelow - paddingHorizontally < startContentLeftOffset) {
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
					deltaX = paddingHorizontally + minEndOfLinePadding;
					break;
				}
				case 'below': {
					topOfLine = this._editorObs.editor.getTopForLineNumber(startLineNumber + 1);
					contentStartOffset = startContentLeftOffset;
					deltaX = paddingHorizontally + horizontalOffsetWhenAboveBelow;
					deltaY = paddingVertically + verticalOffsetWhenAboveBelow;
					break;
				}
				case 'above': {
					topOfLine = this._editorObs.editor.getTopForLineNumber(startLineNumber - 1);
					contentStartOffset = startContentLeftOffset;
					deltaX = paddingHorizontally + horizontalOffsetWhenAboveBelow;
					deltaY = -paddingVertically + verticalOffsetWhenAboveBelow;
					break;
				}
			}

			const textRect = Rect.fromLeftTopWidthHeight(
				contentLeft + contentStartOffset - scrollLeft,
				topOfLine - scrollTop,
				w * displayLocation.label.length,
				lineHeight
			);

			return textRect.withMargin(paddingVertically, paddingHorizontally).translateX(deltaX).translateY(deltaY);
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

		const rect = state.rect.map(r => r.withMargin(0, 4));

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
