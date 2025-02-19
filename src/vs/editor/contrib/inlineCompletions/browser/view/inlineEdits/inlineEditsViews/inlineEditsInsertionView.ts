/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { $, n } from '../../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, derived, derivedWithStore, IObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { asCssVariable } from '../../../../../../../platform/theme/common/colorUtils.js';
import { ICodeEditor } from '../../../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { Point } from '../../../../../../browser/point.js';
import { LineSource, renderLines, RenderOptions } from '../../../../../../browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js';
import { EditorOption } from '../../../../../../common/config/editorOptions.js';
import { LineRange } from '../../../../../../common/core/lineRange.js';
import { Position } from '../../../../../../common/core/position.js';
import { Range } from '../../../../../../common/core/range.js';
import { ILanguageService } from '../../../../../../common/languages/language.js';
import { LineTokens } from '../../../../../../common/tokens/lineTokens.js';
import { TokenArray } from '../../../../../../common/tokens/tokenArray.js';
import { GhostText, GhostTextPart } from '../../../model/ghostText.js';
import { GhostTextView } from '../../ghostText/ghostTextView.js';
import { IInlineEditsView, IInlineEditsViewHost } from '../inlineEditsViewInterface.js';
import { getModifiedBorderColor, modifiedChangedLineBackgroundColor } from '../theme.js';
import { createRectangle, mapOutFalsy } from '../utils/utils.js';

export class InlineEditsInsertionView extends Disposable implements IInlineEditsView {
	private readonly _editorObs = observableCodeEditor(this._editor);

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

	private readonly _ghostText = derived<GhostText | undefined>(reader => {
		const state = this._state.read(reader);
		if (!state) { return undefined; }
		return new GhostText(state.lineNumber, [new GhostTextPart(state.column, state.text, false)]);
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

		this._register(this._editorObs.createOverlayWidget({
			domNode: this._nonOverflowView.element,
			position: constObservable(null),
			allowEditorOverflow: false,
			minContentWidthInPx: derived(reader => {
				const info = this._overlayLayout.read(reader);
				if (info === null) { return 0; }
				return info.code1.x - info.codeStart1.x;
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

		const left = editorLayout.contentLeft + this._editorMaxContentWidthInRange.read(reader) - horizontalScrollOffset;
		const codeLeft = editorLayout.contentLeft;
		if (left <= codeLeft) {
			return null;
		}

		const { top: topTrim, bottom: bottomTrim } = this._trimVertically.read(reader);

		const scrollTop = this._editorObs.scrollTop.read(reader);
		const height = this._ghostTextView.height.read(reader) - topTrim - bottomTrim;
		const top = this._editor.getTopForLineNumber(state.lineNumber) - scrollTop + topTrim;
		const bottom = top + height;

		const code1 = new Point(left, top);
		const codeStart1 = new Point(codeLeft, top);
		const code2 = new Point(left, bottom);
		const codeStart2 = new Point(codeLeft, bottom);

		return {
			code1,
			codeStart1,
			code2,
			codeStart2,
			horizontalScrollOffset,
			padding: 3,
			borderRadius: 4,
		};
	}).recomputeInitiallyAndOnChange(this._store);

	private readonly _foregroundSvg = n.svg({
		transform: 'translate(-0.5 -0.5)',
		style: { overflow: 'visible', pointerEvents: 'none', position: 'absolute' },
	}, derived(reader => {
		const overlayLayoutObs = mapOutFalsy(this._overlayLayout).read(reader);
		if (!overlayLayoutObs) { return undefined; }

		const layoutInfo = overlayLayoutObs.read(reader);

		const rectangleOverlay = createRectangle(
			{
				topLeft: layoutInfo.codeStart1,
				width: layoutInfo.code1.x - layoutInfo.codeStart1.x + 1,
				height: layoutInfo.code2.y - layoutInfo.code1.y + 1,
			},
			layoutInfo.padding,
			layoutInfo.borderRadius,
			{ hideLeft: layoutInfo.horizontalScrollOffset !== 0 }
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

	readonly isHovered = constObservable(false);
}
