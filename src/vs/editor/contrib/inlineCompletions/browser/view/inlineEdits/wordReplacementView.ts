/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, derived } from '../../../../../../base/common/observable.js';
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
import { mapOutFalsy, n, rectToProps } from './utils.js';
import { localize } from '../../../../../../nls.js';
export const transparentHoverBackground = registerColor(
	'inlineEdit.wordReplacementView.background',
	{
		light: transparent(editorHoverStatusBarBackground, 0.1),
		dark: transparent(editorHoverStatusBarBackground, 0.5),
		hcLight: transparent(editorHoverStatusBarBackground, 0.1),
		hcDark: transparent(editorHoverStatusBarBackground, 0.1),
	},
	localize('inlineEdit.wordReplacementView.background', 'Background color for the inline edit word replacement view.')
);

export class WordReplacementView extends Disposable {
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

	private readonly _layout = derived(this, reader => {
		this._text.read(reader);
		const start = this._start.read(reader);
		const end = this._end.read(reader);
		if (!start || !end) {
			return undefined;
		}
		const contentLeft = this._editor.layoutInfoContentLeft.read(reader);
		const lineHeight = this._editor.getOption(EditorOption.lineHeight).read(reader);
		if (start.x > end.x) {
			return undefined;
		}
		const original = Rect.fromLeftTopWidthHeight(start.x + contentLeft - this._editor.scrollLeft.read(reader), start.y, end.x - start.x, lineHeight);
		const w = this._editor.getOption(EditorOption.fontInfo).read(reader).typicalHalfwidthCharacterWidth;
		const modified = Rect.fromLeftTopWidthHeight(original.left + 20, original.top + lineHeight + 5, this._edit.text.length * w + 5, original.height);
		const background = Rect.hull([original, modified]).withMargin(4);

		return {
			original,
			modified,
			background,
			lowerBackground: background.intersectVertical(new OffsetRange(original.bottom, Number.MAX_SAFE_INTEGER)),
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
					this._line,
				]),
				n.div({
					style: {
						position: 'absolute',
						...rectToProps(reader => layout.read(reader).original),
						borderRadius: '4px',
						boxSizing: 'border-box',
						background: 'var(--vscode-inlineEdit-originalChangedTextBackground)',
					}
				}, []),
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
					width: 11,
					height: 13,
					viewBox: '0 0 11 13',
					fill: 'none',
					style: {
						position: 'absolute',
						left: derived(reader => layout.read(reader).modified.left - 15),
						top: derived(reader => layout.read(reader).modified.top),
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

			];
		})
	]).keepUpdated(this._store);

	constructor(
		private readonly _editor: ObservableCodeEditor,
		/** Must be single-line in both sides */
		private readonly _edit: SingleTextEdit,
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

export class WordInsertView extends Disposable {
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
