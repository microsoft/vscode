/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTrustedTypesPolicy } from 'vs/base/browser/trustedTypes';
import { Event } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, autorun, derived, observableFromEvent, observableSignalFromEvent, observableValue } from 'vs/base/common/observable';
import * as strings from 'vs/base/common/strings';
import 'vs/css!./ghostText';
import { applyFontInfo } from 'vs/editor/browser/config/domFontInfo';
import { ICodeEditor, IViewZoneChangeAccessor } from 'vs/editor/browser/editorBrowser';
import { EditorFontLigatures, EditorOption, IComputedEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { StringBuilder } from 'vs/editor/common/core/stringBuilder';
import { ILanguageIdCodec } from 'vs/editor/common/languages';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IModelDeltaDecoration, ITextModel, InjectedTextCursorStops, PositionAffinity } from 'vs/editor/common/model';
import { LineTokens } from 'vs/editor/common/tokens/lineTokens';
import { LineDecoration } from 'vs/editor/common/viewLayout/lineDecorations';
import { RenderLineInput, renderViewLine } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { InlineDecorationType } from 'vs/editor/common/viewModel';
import { GhostTextOrReplacement, GhostTextReplacement } from 'vs/editor/contrib/inlineCompletions/browser/ghostText';
import { ColumnRange, applyObservableDecorations } from 'vs/editor/contrib/inlineCompletions/browser/utils';

export const GHOST_TEXT_DESCRIPTION = 'ghost-text';
export interface IGhostTextWidgetModel {
	readonly targetTextModel: IObservable<ITextModel | undefined>;
	readonly ghostTexts: IObservable<GhostTextOrReplacement[] | undefined>;
	readonly minReservedLineCount: IObservable<number>;
}

export class GhostTextWidget extends Disposable {
	private readonly isDisposed = observableValue(this, false);
	private readonly currentTextModel = observableFromEvent(this.editor.onDidChangeModel, () => /** @description editor.model */ this.editor.getModel());

	constructor(
		private readonly editor: ICodeEditor,
		private readonly model: IGhostTextWidgetModel,
		@ILanguageService private readonly languageService: ILanguageService,
	) {
		super();

		this._register(toDisposable(() => { this.isDisposed.set(true, undefined); }));
		this._register(applyObservableDecorations(this.editor, this.decorations));
	}

	private readonly uiState = derived(this, reader => {
		if (this.isDisposed.read(reader)) {
			return undefined;
		}
		const textModel = this.currentTextModel.read(reader);
		if (textModel !== this.model.targetTextModel.read(reader)) {
			return undefined;
		}
		const ghostTexts = this.model.ghostTexts.read(reader);
		if (!ghostTexts) {
			return undefined;
		}

		const replacedRanges: (ColumnRange | undefined)[] = [];

		const inlineTexts: { column: number; text: string; preview: boolean }[][] = [];
		const additionalLines: LineData[][] = [];

		function addToAdditionalLines(index: number, lines: readonly string[], className: string | undefined) {
			const additionalLinesForIndex = additionalLines[index] ?? [];
			if (additionalLinesForIndex.length > 0) {
				const lastLine = additionalLinesForIndex[additionalLinesForIndex.length - 1];
				if (className) {
					lastLine.decorations.push(new LineDecoration(lastLine.content.length + 1, lastLine.content.length + 1 + lines[0].length, className, InlineDecorationType.Regular));
				}
				lastLine.content += lines[0];

				lines = lines.slice(1);
			}
			for (const line of lines) {
				additionalLinesForIndex.push({
					content: line,
					decorations: className ? [new LineDecoration(1, line.length + 1, className, InlineDecorationType.Regular)] : []
				});
			}
			additionalLines[index] = additionalLinesForIndex;
		}

		const additionalReservedLineCount = this.model.minReservedLineCount.read(reader);
		const hiddenRanges: (ColumnRange | undefined)[] = [];
		const lineNumbers: number[] = [];

		for (const [index, ghostText] of ghostTexts.entries()) {
			const inlineText: { column: number; text: string; preview: boolean }[] = [];

			const textBufferLine = textModel.getLineContent(ghostText.lineNumber);

			let hiddenTextStartColumn: number | undefined = undefined;
			let lastIdx = 0;
			for (const part of ghostText.parts) {
				let lines = part.lines;
				if (hiddenTextStartColumn === undefined) {
					inlineText.push({
						column: part.column,
						text: lines[0],
						preview: part.preview,
					});
					lines = lines.slice(1);
				} else {
					addToAdditionalLines(index, [textBufferLine.substring(lastIdx, part.column - 1)], undefined);
				}

				if (lines.length > 0) {
					addToAdditionalLines(index, lines, GHOST_TEXT_DESCRIPTION);
					if (hiddenTextStartColumn === undefined && part.column <= textBufferLine.length) {
						hiddenTextStartColumn = part.column;
					}
				}

				lastIdx = part.column - 1;
			}
			if (hiddenTextStartColumn !== undefined) {
				addToAdditionalLines(index, [textBufferLine.substring(lastIdx)], undefined);
			}

			const hiddenRange = hiddenTextStartColumn !== undefined ? new ColumnRange(hiddenTextStartColumn, textBufferLine.length + 1) : undefined;
			const replacedRange = ghostText instanceof GhostTextReplacement ? ghostText.columnRange : undefined;
			hiddenRanges.push(hiddenRange);
			replacedRanges.push(replacedRange);
			lineNumbers.push(ghostText.lineNumber);
			inlineTexts.push(inlineText);
		}

		return {
			replacedRanges,
			inlineTexts,
			additionalLines,
			hiddenRanges,
			lineNumbers,
			additionalReservedLineCount,
			targetTextModel: textModel,
		};
	});

	private readonly decorations = derived(this, reader => {
		const uiState = this.uiState.read(reader);
		if (!uiState) {
			return [];
		}

		const decorations: IModelDeltaDecoration[] = [];

		for (let i = 0; i < uiState.replacedRanges.length; i++) {
			const replacedRange = uiState.replacedRanges[i];
			if (replacedRange) {
				decorations.push({
					range: replacedRange.toRange(uiState.lineNumbers[i]),
					options: { inlineClassName: 'inline-completion-text-to-replace', description: 'GhostTextReplacement' }
				});
			}

			const hiddenRange = uiState.hiddenRanges[i];
			if (hiddenRange) {
				decorations.push({
					range: hiddenRange.toRange(uiState.lineNumbers[i]),
					options: { inlineClassName: 'ghost-text-hidden', description: 'ghost-text-hidden', }
				});
			}

			const inlineText = uiState.inlineTexts[i];
			for (const p of inlineText) {
				decorations.push({
					range: Range.fromPositions(new Position(uiState.lineNumbers[i], p.column)),
					options: {
						description: GHOST_TEXT_DESCRIPTION,
						after: { content: p.text, inlineClassName: p.preview ? 'ghost-text-decoration-preview' : 'ghost-text-decoration', cursorStops: InjectedTextCursorStops.Left },
						showIfCollapsed: true,
					}
				});
			}
		}

		return decorations;
	});

	private readonly additionalLinesWidget = this._register(
		new AdditionalLinesWidget(
			this.editor,
			this.languageService.languageIdCodec,
			derived(reader => {
				/** @description lines */
				const uiState = this.uiState.read(reader);
				return uiState ? {
					lineNumbers: uiState.lineNumbers,
					additionalLines: uiState.additionalLines,
					minReservedLineCount: uiState.additionalReservedLineCount,
					targetTextModel: uiState.targetTextModel,
				} : undefined;
			})
		)
	);

	public ownsViewZone(viewZoneId: string): boolean {
		return this.additionalLinesWidget.viewZoneIds.includes(viewZoneId);
	}
}

class AdditionalLinesWidget extends Disposable {
	private _viewZoneIds: string[] = [];
	public get viewZoneIds(): string[] { return this._viewZoneIds; }

	private readonly editorOptionsChanged = observableSignalFromEvent('editorOptionChanged', Event.filter(
		this.editor.onDidChangeConfiguration,
		e => e.hasChanged(EditorOption.disableMonospaceOptimizations)
			|| e.hasChanged(EditorOption.stopRenderingLineAfter)
			|| e.hasChanged(EditorOption.renderWhitespace)
			|| e.hasChanged(EditorOption.renderControlCharacters)
			|| e.hasChanged(EditorOption.fontLigatures)
			|| e.hasChanged(EditorOption.fontInfo)
			|| e.hasChanged(EditorOption.lineHeight)
	));

	constructor(
		private readonly editor: ICodeEditor,
		private readonly languageIdCodec: ILanguageIdCodec,
		private readonly lines: IObservable<{ targetTextModel: ITextModel; lineNumbers: number[]; additionalLines: LineData[][]; minReservedLineCount: number } | undefined>
	) {
		super();

		this._register(autorun(reader => {
			/** @description update view zone */
			const lines = this.lines.read(reader);
			this.editorOptionsChanged.read(reader);

			if (lines) {
				this.updateLines(lines.lineNumbers, lines.additionalLines, lines.minReservedLineCount);
			} else {
				this.clear();
			}
		}));
	}

	public override dispose(): void {
		super.dispose();
		this.clear();
	}

	private clear(): void {
		this.editor.changeViewZones((changeAccessor) => {
			this._clear(changeAccessor);
		});
	}

	private _clear(changeAccessor: IViewZoneChangeAccessor): void {
		if (this._viewZoneIds) {
			for (const id of this._viewZoneIds) {
				changeAccessor.removeZone(id);
				this._viewZoneIds = [];
			}
		}
	}

	private updateLines(lineNumbers: number[], additionalLines: LineData[][], minReservedLineCount: number): void {
		const textModel = this.editor.getModel();
		if (!textModel) {
			return;
		}

		const { tabSize } = textModel.getOptions();

		this.editor.changeViewZones((changeAccessor) => {
			this._clear(changeAccessor);

			for (let i = 0; i < additionalLines.length; i++) {
				const heightInLines = Math.max(additionalLines[i].length, minReservedLineCount);
				if (heightInLines > 0) {
					const afterLineNumber = lineNumbers[i];
					const afterColumnAffinity = PositionAffinity.Right;
					const domNode = document.createElement('div');
					renderLines(domNode, tabSize, additionalLines[i], this.editor.getOptions(), this.languageIdCodec);

					this._viewZoneIds.push(changeAccessor.addZone({
						afterLineNumber,
						heightInLines,
						domNode,
						afterColumnAffinity
					}));
				}
			}
		});
	}
}

interface LineData {
	content: string; // Must not contain a linebreak!
	decorations: LineDecoration[];
}

function renderLines(domNode: HTMLElement, tabSize: number, lines: LineData[], opts: IComputedEditorOptions, languageIdCodec: ILanguageIdCodec): void {
	const disableMonospaceOptimizations = opts.get(EditorOption.disableMonospaceOptimizations);
	const stopRenderingLineAfter = opts.get(EditorOption.stopRenderingLineAfter);
	// To avoid visual confusion, we don't want to render visible whitespace
	const renderWhitespace = 'none';
	const renderControlCharacters = opts.get(EditorOption.renderControlCharacters);
	const fontLigatures = opts.get(EditorOption.fontLigatures);
	const fontInfo = opts.get(EditorOption.fontInfo);
	const lineHeight = opts.get(EditorOption.lineHeight);

	const sb = new StringBuilder(10000);
	sb.appendString('<div class="suggest-preview-text">');

	for (let i = 0, len = lines.length; i < len; i++) {
		const lineData = lines[i];
		const line = lineData.content;
		sb.appendString('<div class="view-line');
		sb.appendString('" style="top:');
		sb.appendString(String(i * lineHeight));
		sb.appendString('px;width:1000000px;">');

		const isBasicASCII = strings.isBasicASCII(line);
		const containsRTL = strings.containsRTL(line);
		const lineTokens = LineTokens.createEmpty(line, languageIdCodec);

		renderViewLine(new RenderLineInput(
			(fontInfo.isMonospace && !disableMonospaceOptimizations),
			fontInfo.canUseHalfwidthRightwardsArrow,
			line,
			false,
			isBasicASCII,
			containsRTL,
			0,
			lineTokens,
			lineData.decorations,
			tabSize,
			0,
			fontInfo.spaceWidth,
			fontInfo.middotWidth,
			fontInfo.wsmiddotWidth,
			stopRenderingLineAfter,
			renderWhitespace,
			renderControlCharacters,
			fontLigatures !== EditorFontLigatures.OFF,
			null
		), sb);

		sb.appendString('</div>');
	}
	sb.appendString('</div>');

	applyFontInfo(domNode, fontInfo);
	const html = sb.build();
	const trustedhtml = ttPolicy ? ttPolicy.createHTML(html) : html;
	domNode.innerHTML = trustedhtml as string;
}

const ttPolicy = createTrustedTypesPolicy('editorGhostText', { createHTML: value => value });
