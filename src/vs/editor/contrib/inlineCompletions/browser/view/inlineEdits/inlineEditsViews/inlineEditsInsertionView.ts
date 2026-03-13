/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { $, n } from '../../../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { asCssVariable } from '../../../../../../../platform/theme/common/colorUtils.js';
import { ICodeEditor } from '../../../../../../browser/editorBrowser.js';
import { ObservableCodeEditor, observableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { LineSource, renderLines, RenderOptions } from '../../../../../../browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js';
import { Rect } from '../../../../../../common/core/2d/rect.js';
import { Position } from '../../../../../../common/core/position.js';
import { Range } from '../../../../../../common/core/range.js';
import { LineRange } from '../../../../../../common/core/ranges/lineRange.js';
import { OffsetRange } from '../../../../../../common/core/ranges/offsetRange.js';
import { ILanguageService } from '../../../../../../common/languages/language.js';
import { LineTokens, TokenArray } from '../../../../../../common/tokens/lineTokens.js';
import { InlineDecoration, InlineDecorationType } from '../../../../../../common/viewModel/inlineDecorations.js';
import { GhostText, GhostTextPart } from '../../../model/ghostText.js';
import { InlineCompletionEditorType } from '../../../model/provideInlineCompletions.js';
import { GhostTextView, IGhostTextWidgetData } from '../../ghostText/ghostTextView.js';
import { IInlineEditsView, InlineEditClickEvent, InlineEditTabAction } from '../inlineEditsViewInterface.js';
import { getEditorBackgroundColor, getModifiedBorderColor, INLINE_EDITS_BORDER_RADIUS, modifiedBackgroundColor } from '../theme.js';
import { getPrefixTrim, mapOutFalsy } from '../utils/utils.js';

const BORDER_WIDTH = 1;
const WIDGET_SEPARATOR_WIDTH = 1;
const WIDGET_SEPARATOR_DIFF_EDITOR_WIDTH = 3;
const BORDER_RADIUS = INLINE_EDITS_BORDER_RADIUS;

export class InlineEditsInsertionView extends Disposable implements IInlineEditsView {
	private readonly _editorObs: ObservableCodeEditor;

	private readonly _onDidClick = this._register(new Emitter<InlineEditClickEvent>());
	readonly onDidClick = this._onDidClick.event;

	private readonly _state = derived(this, reader => {
		const state = this._input.read(reader);
		if (!state) { return undefined; }

		const textModel = this._editor.getModel()!;
		const eol = textModel.getEOL();

		if (state.startColumn === 1 && state.lineNumber > 1 && textModel.getLineLength(state.lineNumber) !== 0 && state.text.endsWith(eol) && !state.text.startsWith(eol)) {
			const endOfLineColumn = textModel.getLineLength(state.lineNumber - 1) + 1;
			return { lineNumber: state.lineNumber - 1, column: endOfLineColumn, text: eol + state.text.slice(0, -eol.length) };
		}

		return { lineNumber: state.lineNumber, column: state.startColumn, text: state.text };
	});

	private readonly _trimVertically = derived(this, reader => {
		const state = this._state.read(reader);
		const text = state?.text;
		if (!text || text.trim() === '') {
			return { topOffset: 0, bottomOffset: 0, linesTop: 0, linesBottom: 0 };
		}

		// Adjust for leading/trailing newlines
		const lineHeight = this._editor.getLineHeightForPosition(new Position(state.lineNumber, 1));
		const eol = this._editor.getModel()!.getEOL();
		let linesTop = 0;
		let linesBottom = 0;

		let i = 0;
		for (; i < text.length && text.startsWith(eol, i); i += eol.length) {
			linesTop += 1;
		}

		for (let j = text.length; j > i && text.endsWith(eol, j); j -= eol.length) {
			linesBottom += 1;
		}

		return { topOffset: linesTop * lineHeight, bottomOffset: linesBottom * lineHeight, linesTop, linesBottom };
	});

	private readonly _maxPrefixTrim = derived(this, reader => {
		const state = this._state.read(reader);
		if (!state) {
			return { prefixLeftOffset: 0, prefixTrim: 0 };
		}

		const textModel = this._editor.getModel()!;
		const eol = textModel.getEOL();

		const trimVertically = this._trimVertically.read(reader);

		const lines = state.text.split(eol);
		const modifiedLines = lines.slice(trimVertically.linesTop, lines.length - trimVertically.linesBottom);
		if (trimVertically.linesTop === 0) {
			modifiedLines[0] = textModel.getLineContent(state.lineNumber) + modifiedLines[0];
		}

		const originalRange = new LineRange(state.lineNumber, state.lineNumber + (trimVertically.linesTop > 0 ? 0 : 1));

		return getPrefixTrim([], originalRange, modifiedLines, this._editor);
	});

	private readonly _ghostText = derived<GhostText | undefined>(reader => {
		const state = this._state.read(reader);
		const prefixTrim = this._maxPrefixTrim.read(reader);
		if (!state) { return undefined; }

		const textModel = this._editor.getModel()!;
		const eol = textModel.getEOL();
		const modifiedLines = state.text.split(eol);

		const inlineDecorations = modifiedLines.map((line, i) => new InlineDecoration(
			new Range(i + 1, i === 0 ? 1 : prefixTrim.prefixTrim + 1, i + 1, line.length + 1),
			'modified-background',
			InlineDecorationType.Regular
		));

		return new GhostText(state.lineNumber, [new GhostTextPart(state.column, state.text, false, inlineDecorations)]);
	});

	protected readonly _ghostTextView: GhostTextView;
	readonly isHovered: IObservable<boolean>;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _input: IObservable<{
			lineNumber: number;
			startColumn: number;
			text: string;
			editorType: InlineCompletionEditorType;
		} | undefined>,
		private readonly _tabAction: IObservable<InlineEditTabAction>,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageService private readonly _languageService: ILanguageService,
	) {
		super();

		this._editorObs = observableCodeEditor(this._editor);

		this._ghostTextView = this._register(instantiationService.createInstance(
			GhostTextView,
			this._editor,
			derived(reader => {
				const ghostText = this._ghostText.read(reader);
				if (!ghostText) {
					return undefined;
				}
				return {
					ghostText: ghostText,
					handleInlineCompletionShown: (data) => {
						// This is a no-op for the insertion view, as it is handled by the InlineEditsView.
					},
					warning: undefined,
				} satisfies IGhostTextWidgetData;
			}),
			{
				extraClasses: ['inline-edit'],
				isClickable: true,
				shouldKeepCursorStable: true,
			}
		));

		this.isHovered = this._ghostTextView.isHovered;

		this._register(this._ghostTextView.onDidClick((e) => {
			this._onDidClick.fire(new InlineEditClickEvent(e));
		}));

		this._register(this._editorObs.createOverlayWidget({
			domNode: this._view.element,
			position: constObservable(null),
			allowEditorOverflow: false,
			minContentWidthInPx: derived(this, reader => {
				const info = this._overlayLayout.read(reader);
				if (info === null) { return 0; }
				return info.minContentWidthRequired;
			}),
		}));
	}

	private readonly _display = derived(this, reader => !!this._state.read(reader) ? 'block' : 'none');

	private readonly _editorMaxContentWidthInRange = derived(this, reader => {
		const state = this._state.read(reader);
		if (!state) {
			return 0;
		}
		this._editorObs.versionId.read(reader);
		const textModel = this._editor.getModel()!;
		const eol = textModel.getEOL();

		const textBeforeInsertion = state.text.startsWith(eol) ? '' : textModel.getValueInRange(new Range(state.lineNumber, 1, state.lineNumber, state.column));
		const textAfterInsertion = textModel.getValueInRange(new Range(state.lineNumber, state.column, state.lineNumber, textModel.getLineLength(state.lineNumber) + 1));
		const text = textBeforeInsertion + state.text + textAfterInsertion;
		const lines = text.split(eol);

		const renderOptions = RenderOptions.fromEditor(this._editor).withSetWidth(false).withScrollBeyondLastColumn(0);
		const lineWidths = lines.map(line => {
			const t = textModel.tokenization.tokenizeLinesAt(state.lineNumber, [line])?.[0];
			let tokens: LineTokens;
			if (t) {
				tokens = TokenArray.fromLineTokens(t).toLineTokens(line, this._languageService.languageIdCodec);
			} else {
				tokens = LineTokens.createEmpty(line, this._languageService.languageIdCodec);
			}

			return renderLines(new LineSource([tokens]), renderOptions, [], $('div'), true).minWidthInPx;
		});

		// Take the max value that we observed.
		// Reset when either the edit changes or the editor text version.
		return Math.max(...lineWidths);
	});

	public readonly startLineOffset = this._trimVertically.map(v => v.topOffset);
	public readonly originalLines = this._state.map(s => s ?
		new LineRange(
			s.lineNumber,
			Math.min(s.lineNumber + 2, this._editor.getModel()!.getLineCount() + 1)
		) : undefined
	);

	private readonly _overlayLayout = derived(this, (reader) => {
		this._ghostText.read(reader);
		const state = this._state.read(reader);
		if (!state) {
			return null;
		}

		// Update the overlay when the position changes
		this._editorObs.observePosition(observableValue(this, new Position(state.lineNumber, state.column)), reader.store).read(reader);

		const editorLayout = this._editorObs.layoutInfo.read(reader);
		const horizontalScrollOffset = this._editorObs.scrollLeft.read(reader);
		const verticalScrollbarWidth = this._editorObs.layoutInfoVerticalScrollbarWidth.read(reader);

		const right = editorLayout.contentLeft + this._editorMaxContentWidthInRange.read(reader) - horizontalScrollOffset;
		const prefixLeftOffset = this._maxPrefixTrim.read(reader).prefixLeftOffset ?? 0 /* fix due to observable bug? */;
		const left = editorLayout.contentLeft + prefixLeftOffset - horizontalScrollOffset;
		if (right <= left) {
			return null;
		}

		const { topOffset: topTrim, bottomOffset: bottomTrim } = this._trimVertically.read(reader);

		const scrollTop = this._editorObs.scrollTop.read(reader);
		const height = this._ghostTextView.height.read(reader) - topTrim - bottomTrim;
		const top = this._editor.getTopForLineNumber(state.lineNumber) - scrollTop + topTrim;
		const bottom = top + height;

		const overlay = new Rect(left, top, right, bottom);

		return {
			overlay,
			startsAtContentLeft: prefixLeftOffset === 0,
			contentLeft: editorLayout.contentLeft,
			minContentWidthRequired: prefixLeftOffset + overlay.width + verticalScrollbarWidth,
		};
	}).recomputeInitiallyAndOnChange(this._store);

	private readonly _modifiedOverlay = n.div({
		style: { pointerEvents: 'none', }
	}, derived(this, reader => {
		const overlayLayoutObs = mapOutFalsy(this._overlayLayout).read(reader);
		if (!overlayLayoutObs) { return undefined; }

		// Create an overlay which hides the left hand side of the original overlay when it overflows to the left
		// such that there is a smooth transition at the edge of content left
		const overlayHider = overlayLayoutObs.map(layoutInfo => Rect.fromLeftTopRightBottom(
			layoutInfo.contentLeft - BORDER_RADIUS - BORDER_WIDTH,
			layoutInfo.overlay.top,
			layoutInfo.contentLeft,
			layoutInfo.overlay.bottom
		)).read(reader);

		const separatorWidth = this._input.map(i => i?.editorType === InlineCompletionEditorType.DiffEditor ? WIDGET_SEPARATOR_DIFF_EDITOR_WIDTH : WIDGET_SEPARATOR_WIDTH).read(reader);
		const overlayRect = overlayLayoutObs.map(l => l.overlay.withMargin(0, BORDER_WIDTH, 0, l.startsAtContentLeft ? 0 : BORDER_WIDTH).intersectHorizontal(new OffsetRange(overlayHider.left, Number.MAX_SAFE_INTEGER)));
		const underlayRect = overlayRect.map(rect => rect.withMargin(separatorWidth, separatorWidth));

		const editorBackground = getEditorBackgroundColor(this._input.read(undefined)?.editorType ?? InlineCompletionEditorType.TextEditor);
		return [
			n.div({
				class: 'originalUnderlayInsertion',
				style: {
					...underlayRect.read(reader).toStyles(),
					borderRadius: BORDER_RADIUS,
					border: `${BORDER_WIDTH + separatorWidth}px solid ${editorBackground}`,
					boxSizing: 'border-box',
				}
			}),
			n.div({
				class: 'originalOverlayInsertion',
				style: {
					...overlayRect.read(reader).toStyles(),
					borderRadius: BORDER_RADIUS,
					border: getModifiedBorderColor(this._tabAction).map(bc => `${BORDER_WIDTH}px solid ${asCssVariable(bc)}`),
					boxSizing: 'border-box',
					backgroundColor: asCssVariable(modifiedBackgroundColor),
				}
			}),
			n.div({
				class: 'originalOverlayHiderInsertion',
				style: {
					...overlayHider.toStyles(),
					backgroundColor: editorBackground,
				}
			})
		];
	})).keepUpdated(this._store);

	private readonly _view = n.div({
		class: 'inline-edits-view',
		style: {
			position: 'absolute',
			overflow: 'visible',
			top: '0px',
			left: '0px',
			display: this._display,
		},
	}, [
		[this._modifiedOverlay],
	]).keepUpdated(this._store);
}
