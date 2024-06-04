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
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
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
import { GhostText, GhostTextReplacement } from 'vs/editor/contrib/inlineCompletions/browser/ghostText';
import { ColumnRange, applyObservableDecorations } from 'vs/editor/contrib/inlineCompletions/browser/utils';

export const GHOST_TEXT_DESCRIPTION = 'ghost-text';
export interface IGhostTextWidgetModel {
	readonly targetTextModel: IObservable<ITextModel | undefined>;
	readonly ghostText: IObservable<GhostText | GhostTextReplacement | undefined>;
	readonly minReservedLineCount: IObservable<number>;
}

export class GhostTextWidget extends Disposable {
	private readonly isDisposed = observableValue(this, false);
	private readonly currentTextModel = observableFromEvent(this, this.editor.onDidChangeModel, () => /** @description editor.model */ this.editor.getModel());

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
		const ghostText = this.model.ghostText.read(reader);
		if (!ghostText) {
			return undefined;
		}

		const replacedRange = ghostText instanceof GhostTextReplacement ? ghostText.columnRange : undefined;

		const inlineTexts: { column: number; text: string; preview: boolean }[] = [];
		const additionalLines: LineData[] = [];

		function addToAdditionalLines(lines: readonly string[], className: string | undefined) {
			if (additionalLines.length > 0) {
				const lastLine = additionalLines[additionalLines.length - 1];
				if (className) {
					lastLine.decorations.push(new LineDecoration(lastLine.content.length + 1, lastLine.content.length + 1 + lines[0].length, className, InlineDecorationType.Regular));
				}
				lastLine.content += lines[0];

				lines = lines.slice(1);
			}
			for (const line of lines) {
				additionalLines.push({
					content: line,
					decorations: className ? [new LineDecoration(1, line.length + 1, className, InlineDecorationType.Regular)] : []
				});
			}
		}

		const textBufferLine = textModel.getLineContent(ghostText.lineNumber);

		let hiddenTextStartColumn: number | undefined = undefined;
		let lastIdx = 0;
		for (const part of ghostText.parts) {
			let lines = part.lines;
			if (hiddenTextStartColumn === undefined) {
				inlineTexts.push({
					column: part.column,
					text: lines[0],
					preview: part.preview,
				});
				lines = lines.slice(1);
			} else {
				addToAdditionalLines([textBufferLine.substring(lastIdx, part.column - 1)], undefined);
			}

			if (lines.length > 0) {
				addToAdditionalLines(lines, GHOST_TEXT_DESCRIPTION);
				if (hiddenTextStartColumn === undefined && part.column <= textBufferLine.length) {
					hiddenTextStartColumn = part.column;
				}
			}

			lastIdx = part.column - 1;
		}
		if (hiddenTextStartColumn !== undefined) {
			addToAdditionalLines([textBufferLine.substring(lastIdx)], undefined);
		}

		const hiddenRange = hiddenTextStartColumn !== undefined ? new ColumnRange(hiddenTextStartColumn, textBufferLine.length + 1) : undefined;

		return {
			replacedRange,
			inlineTexts,
			additionalLines,
			hiddenRange,
			lineNumber: ghostText.lineNumber,
			additionalReservedLineCount: this.model.minReservedLineCount.read(reader),
			targetTextModel: textModel,
		};
	});

	private readonly decorations = derived(this, reader => {
		const uiState = this.uiState.read(reader);
		if (!uiState) {
			return [];
		}

		const decorations: IModelDeltaDecoration[] = [];

		if (uiState.replacedRange) {
			decorations.push({
				range: uiState.replacedRange.toRange(uiState.lineNumber),
				options: { inlineClassName: 'inline-completion-text-to-replace', description: 'GhostTextReplacement' }
			});
		}

		if (uiState.hiddenRange) {
			decorations.push({
				range: uiState.hiddenRange.toRange(uiState.lineNumber),
				options: { inlineClassName: 'ghost-text-hidden', description: 'ghost-text-hidden', }
			});
		}

		for (const p of uiState.inlineTexts) {
			decorations.push({
				range: Range.fromPositions(new Position(uiState.lineNumber, p.column)),
				options: {
					description: GHOST_TEXT_DESCRIPTION,
					after: { content: p.text, inlineClassName: p.preview ? 'ghost-text-decoration-preview' : 'ghost-text-decoration', cursorStops: InjectedTextCursorStops.Left },
					showIfCollapsed: true,
				}
			});
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
					lineNumber: uiState.lineNumber,
					additionalLines: uiState.additionalLines,
					minReservedLineCount: uiState.additionalReservedLineCount,
					targetTextModel: uiState.targetTextModel,
				} : undefined;
			})
		)
	);

	public ownsViewZone(viewZoneId: string): boolean {
		return this.additionalLinesWidget.viewZoneId === viewZoneId;
	}
}

export class AdditionalLinesWidget extends Disposable {
	private _viewZoneId: string | undefined = undefined;
	public get viewZoneId(): string | undefined { return this._viewZoneId; }

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
		private readonly lines: IObservable<{ targetTextModel: ITextModel; lineNumber: number; additionalLines: LineData[]; minReservedLineCount: number } | undefined>
	) {
		super();

		this._register(autorun(reader => {
			/** @description update view zone */
			const lines = this.lines.read(reader);
			this.editorOptionsChanged.read(reader);

			if (lines) {
				this.updateLines(lines.lineNumber, lines.additionalLines, lines.minReservedLineCount);
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
			if (this._viewZoneId) {
				changeAccessor.removeZone(this._viewZoneId);
				this._viewZoneId = undefined;
			}
		});
	}

	private updateLines(lineNumber: number, additionalLines: LineData[], minReservedLineCount: number): void {
		const textModel = this.editor.getModel();
		if (!textModel) {
			return;
		}

		const { tabSize } = textModel.getOptions();

		this.editor.changeViewZones((changeAccessor) => {
			if (this._viewZoneId) {
				changeAccessor.removeZone(this._viewZoneId);
				this._viewZoneId = undefined;
			}

			const heightInLines = Math.max(additionalLines.length, minReservedLineCount);
			if (heightInLines > 0) {
				const domNode = document.createElement('div');
				renderLines(domNode, tabSize, additionalLines, this.editor.getOptions(), this.languageIdCodec);

				this._viewZoneId = changeAccessor.addZone({
					afterLineNumber: lineNumber,
					heightInLines: heightInLines,
					domNode,
					afterColumnAffinity: PositionAffinity.Right
				});
			}
		});
	}
}

export interface LineData {
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

export const ttPolicy = createTrustedTypesPolicy('editorGhostText', { createHTML: value => value });
