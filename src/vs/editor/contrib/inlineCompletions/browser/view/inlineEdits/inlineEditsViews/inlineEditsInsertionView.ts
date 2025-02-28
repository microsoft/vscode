/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { $, n } from '../../../../../../../base/browser/dom.js';
import { IMouseEvent } from '../../../../../../../base/browser/mouseEvent.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, derived, derivedWithStore, IObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { asCssVariable } from '../../../../../../../platform/theme/common/colorUtils.js';
import { ICodeEditor } from '../../../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { Rect } from '../../../../../../browser/rect.js';
import { LineSource, renderLines, RenderOptions } from '../../../../../../browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js';
import { EditorOption } from '../../../../../../common/config/editorOptions.js';
import { LineRange } from '../../../../../../common/core/lineRange.js';
import { Position } from '../../../../../../common/core/position.js';
import { Range } from '../../../../../../common/core/range.js';
import { ILanguageService } from '../../../../../../common/languages/language.js';
import { LineTokens } from '../../../../../../common/tokens/lineTokens.js';
import { TokenArray } from '../../../../../../common/tokens/tokenArray.js';
import { InlineDecoration, InlineDecorationType } from '../../../../../../common/viewModel.js';
import { GhostText, GhostTextPart } from '../../../model/ghostText.js';
import { GhostTextView } from '../../ghostText/ghostTextView.js';
import { IInlineEditsView, IInlineEditsViewHost } from '../inlineEditsViewInterface.js';
import { getModifiedBorderColor, modifiedChangedLineBackgroundColor } from '../theme.js';
import { createRectangle, getPrefixTrim, mapOutFalsy } from '../utils/utils.js';

export class InlineEditsInsertionView extends Disposable implements IInlineEditsView {
	private readonly _editorObs = observableCodeEditor(this._editor);

	private readonly _onDidClick = this._register(new Emitter<IMouseEvent>());
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

	private readonly _maxPrefixTrim = derived(reader => {
		const state = this._state.read(reader);
		if (!state) {
			return { prefixLeftOffset: 0, prefixTrim: 0 };

		}
		const textModel = this._editor.getModel()!;
		const eol = textModel.getEOL();
		const startsWithEol = state.text.startsWith(eol);
		const originalRange = new LineRange(state.lineNumber, state.lineNumber + (startsWithEol ? 0 : 1));
		let modifiedLines = state.text.split(eol);
		if (startsWithEol) {
			modifiedLines = modifiedLines.splice(1);
		} else {
			modifiedLines[0] = textModel.getLineContent(state.lineNumber) + modifiedLines[0];
		}

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

	protected readonly _ghostTextView = this._register(this._instantiationService.createInstance(GhostTextView,
		this._editor,
		{
			ghostText: this._ghostText,
			minReservedLineCount: constObservable(0),
			targetTextModel: this._editorObs.model.map(model => model ?? undefined),
			warning: constObservable(undefined),
		},
		observableValue(this, { syntaxHighlightingEnabled: true, extraClasses: ['inline-edit'] }),
		true,
		true
	));

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _input: IObservable<{
			lineNumber: number;
			startColumn: number;
			text: string;
		} | undefined>,
		private readonly _host: IInlineEditsViewHost,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILanguageService private readonly _languageService: ILanguageService,
	) {
		super();

		this._register(this._ghostTextView.onDidClick((e) => {
			this._onDidClick.fire(e);
		}));

		this._register(this._editorObs.createOverlayWidget({
			domNode: this._nonOverflowView.element,
			position: constObservable(null),
			allowEditorOverflow: false,
			minContentWidthInPx: derived(reader => {
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

		const renderOptions = RenderOptions.fromEditor(this._editor).withSetWidth(false);
		const lineWidths = lines.map(line => {
			const t = textModel.tokenization.tokenizeLinesAt(state.lineNumber, [line])?.[0];
			let tokens: LineTokens;
			if (t) {
				tokens = TokenArray.fromLineTokens(t).toLineTokens(line, this._languageService.languageIdCodec);
			} else {
				tokens = LineTokens.createEmpty(line, this._languageService.languageIdCodec);
			}

			return renderLines(new LineSource([tokens]), renderOptions, [], $('div'), true).minWidthInPx - 20; // TODO: always too much padding included, why?
		});

		// Take the max value that we observed.
		// Reset when either the edit changes or the editor text version.
		return Math.max(...lineWidths);
	});

	private readonly _trimVertically = derived(this, reader => {
		const text = this._state.read(reader)?.text;
		if (!text || text.trim() === '') {
			return { top: 0, bottom: 0 };
		}

		// Adjust for leading/trailing newlines
		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
		const eol = this._editor.getModel()!.getEOL();
		let topTrim = 0;
		let bottomTrim = 0;

		let i = 0;
		for (; i < text.length && text.startsWith(eol, i); i += eol.length) {
			topTrim += lineHeight;
		}

		for (let j = text.length; j > i && text.endsWith(eol, j); j -= eol.length) {
			bottomTrim += lineHeight;
		}

		return { top: topTrim, bottom: bottomTrim };
	});

	public readonly startLineOffset = this._trimVertically.map(v => v.top);
	public readonly originalLines = this._state.map(s => s ?
		new LineRange(
			s.lineNumber,
			Math.min(s.lineNumber + 2, this._editor.getModel()!.getLineCount() + 1)
		) : undefined
	);

	private readonly _overlayLayout = derivedWithStore(this, (reader, store) => {
		this._ghostText.read(reader);
		const state = this._state.read(reader);
		if (!state) {
			return null;
		}

		// Update the overlay when the position changes
		this._editorObs.observePosition(observableValue(this, new Position(state.lineNumber, state.column)), store).read(reader);

		const editorLayout = this._editorObs.layoutInfo.read(reader);
		const horizontalScrollOffset = this._editorObs.scrollLeft.read(reader);
		const verticalScrollbarWidth = this._editorObs.layoutInfoVerticalScrollbarWidth.read(reader);

		const right = editorLayout.contentLeft + this._editorMaxContentWidthInRange.read(reader) - horizontalScrollOffset;
		const prefixLeftOffset = this._maxPrefixTrim.read(reader).prefixLeftOffset ?? 0 /* fix due to observable bug? */;
		const left = editorLayout.contentLeft + prefixLeftOffset - horizontalScrollOffset;
		if (right <= left) {
			return null;
		}

		const { top: topTrim, bottom: bottomTrim } = this._trimVertically.read(reader);

		const scrollTop = this._editorObs.scrollTop.read(reader);
		const height = this._ghostTextView.height.read(reader) - topTrim - bottomTrim;
		const top = this._editor.getTopForLineNumber(state.lineNumber) - scrollTop + topTrim;
		const bottom = top + height;

		const overlay = new Rect(left, top, right, bottom);

		return {
			overlay,
			contentLeft: editorLayout.contentLeft,
			minContentWidthRequired: prefixLeftOffset + overlay.width + verticalScrollbarWidth,
			borderRadius: 4,
			padding: 3
		};
	}).recomputeInitiallyAndOnChange(this._store);

	private readonly _foregroundSvg = n.svg({
		transform: 'translate(-0.5 -0.5)',
		style: { overflow: 'visible', pointerEvents: 'none', position: 'absolute' },
	}, derived(reader => {
		const overlayLayoutObs = mapOutFalsy(this._overlayLayout).read(reader);
		if (!overlayLayoutObs) { return undefined; }

		const layoutInfo = overlayLayoutObs.read(reader);
		const overlay = layoutInfo.overlay;
		const croppedOverlay = new Rect(Math.max(overlay.left, layoutInfo.contentLeft), overlay.top, overlay.right, overlay.bottom);

		const rectangleOverlay = createRectangle(
			{
				topLeft: croppedOverlay.getLeftTop(),
				width: croppedOverlay.width + 1,
				height: croppedOverlay.height + 1,
			},
			layoutInfo.padding,
			layoutInfo.borderRadius,
			{ hideLeft: croppedOverlay.left !== overlay.left }
		);

		const modifiedBorderColor = getModifiedBorderColor(this._host.tabAction).read(reader);

		return [
			n.svgElem('path', {
				class: 'originalOverlay',
				d: rectangleOverlay,
				style: {
					fill: asCssVariable(modifiedChangedLineBackgroundColor),
					stroke: modifiedBorderColor,
					strokeWidth: '1px',
				}
			}),
		];
	})).keepUpdated(this._store);

	private readonly _nonOverflowView = n.div({
		class: 'inline-edits-view',
		style: {
			position: 'absolute',
			overflow: 'visible',
			top: '0px',
			left: '0px',
			zIndex: '0',
			display: this._display,
		},
	}, [
		[this._foregroundSvg],
	]).keepUpdated(this._store);

	readonly isHovered = this._ghostTextView.isHovered;
}
