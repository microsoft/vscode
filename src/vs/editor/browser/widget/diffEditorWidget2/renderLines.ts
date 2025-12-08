/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { applyFontInfo } from 'vs/editor/browser/config/domFontInfo';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { diffEditorWidgetTtPolicy } from 'vs/editor/browser/widget/diffEditorWidget';
import { EditorFontLigatures, EditorOption, FindComputedEditorOptionValueById } from 'vs/editor/common/config/editorOptions';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { StringBuilder } from 'vs/editor/common/core/stringBuilder';
import { ModelLineProjectionData } from 'vs/editor/common/modelLineProjectionData';
import { IViewLineTokens, LineTokens } from 'vs/editor/common/tokens/lineTokens';
import { LineDecoration } from 'vs/editor/common/viewLayout/lineDecorations';
import { RenderLineInput, renderViewLine } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { InlineDecoration, ViewLineRenderingData } from 'vs/editor/common/viewModel';

const ttPolicy = diffEditorWidgetTtPolicy;

export function renderLines(source: LineSource, options: RenderOptions, decorations: InlineDecoration[], domNode: HTMLElement): RenderLinesResult {
	applyFontInfo(domNode, options.fontInfo);

	const hasCharChanges = (decorations.length > 0);

	const sb = new StringBuilder(10000);
	let maxCharsPerLine = 0;
	let renderedLineCount = 0;
	const viewLineCounts: number[] = [];
	for (let lineIndex = 0; lineIndex < source.lineTokens.length; lineIndex++) {
		const lineNumber = lineIndex + 1;
		const lineTokens = source.lineTokens[lineIndex];
		const lineBreakData = source.lineBreakData[lineIndex];
		const actualDecorations = LineDecoration.filter(decorations, lineNumber, 1, Number.MAX_SAFE_INTEGER);

		if (lineBreakData) {
			let lastBreakOffset = 0;
			for (const breakOffset of lineBreakData.breakOffsets) {
				const viewLineTokens = lineTokens.sliceAndInflate(lastBreakOffset, breakOffset, 0);
				maxCharsPerLine = Math.max(maxCharsPerLine, renderOriginalLine(
					renderedLineCount,
					viewLineTokens,
					LineDecoration.extractWrapped(actualDecorations, lastBreakOffset, breakOffset),
					hasCharChanges,
					source.mightContainNonBasicASCII,
					source.mightContainRTL,
					options,
					sb
				));
				renderedLineCount++;
				lastBreakOffset = breakOffset;
			}
			viewLineCounts.push(lineBreakData.breakOffsets.length);
		} else {
			viewLineCounts.push(1);
			maxCharsPerLine = Math.max(maxCharsPerLine, renderOriginalLine(
				renderedLineCount,
				lineTokens,
				actualDecorations,
				hasCharChanges,
				source.mightContainNonBasicASCII,
				source.mightContainRTL,
				options,
				sb,
			));
			renderedLineCount++;
		}
	}
	maxCharsPerLine += options.scrollBeyondLastColumn;

	const html = sb.build();
	const trustedhtml = ttPolicy ? ttPolicy.createHTML(html) : html;
	domNode.innerHTML = trustedhtml as string;
	const minWidthInPx = (maxCharsPerLine * options.typicalHalfwidthCharacterWidth);

	return {
		heightInLines: renderedLineCount,
		minWidthInPx,
		viewLineCounts,
	};
}


export class LineSource {
	constructor(
		public readonly lineTokens: LineTokens[],
		public readonly lineBreakData: (ModelLineProjectionData | null)[],
		public readonly mightContainNonBasicASCII: boolean,
		public readonly mightContainRTL: boolean,
	) { }
}

export class RenderOptions {
	public static fromEditor(editor: ICodeEditor): RenderOptions {

		const modifiedEditorOptions = editor.getOptions();
		const fontInfo = modifiedEditorOptions.get(EditorOption.fontInfo);
		const layoutInfo = modifiedEditorOptions.get(EditorOption.layoutInfo);

		return new RenderOptions(
			editor.getModel()?.getOptions().tabSize || 0,
			fontInfo,
			modifiedEditorOptions.get(EditorOption.disableMonospaceOptimizations),
			fontInfo.typicalHalfwidthCharacterWidth,
			modifiedEditorOptions.get(EditorOption.scrollBeyondLastColumn),

			modifiedEditorOptions.get(EditorOption.lineHeight),

			layoutInfo.decorationsWidth,
			modifiedEditorOptions.get(EditorOption.stopRenderingLineAfter),
			modifiedEditorOptions.get(EditorOption.renderWhitespace),
			modifiedEditorOptions.get(EditorOption.renderControlCharacters),
			modifiedEditorOptions.get(EditorOption.fontLigatures),
		);
	}

	constructor(
		public readonly tabSize: number,
		public readonly fontInfo: FontInfo,
		public readonly disableMonospaceOptimizations: boolean,
		public readonly typicalHalfwidthCharacterWidth: number,
		public readonly scrollBeyondLastColumn: number,
		public readonly lineHeight: number,
		public readonly lineDecorationsWidth: number,
		public readonly stopRenderingLineAfter: number,
		public readonly renderWhitespace: FindComputedEditorOptionValueById<EditorOption.renderWhitespace>,
		public readonly renderControlCharacters: boolean,
		public readonly fontLigatures: FindComputedEditorOptionValueById<EditorOption.fontLigatures>,
	) { }
}

export interface RenderLinesResult {
	minWidthInPx: number;
	heightInLines: number;
	viewLineCounts: number[];
}

function renderOriginalLine(
	viewLineIdx: number,
	lineTokens: IViewLineTokens,
	decorations: LineDecoration[],
	hasCharChanges: boolean,
	mightContainNonBasicASCII: boolean,
	mightContainRTL: boolean,
	options: RenderOptions,
	sb: StringBuilder,
): number {

	sb.appendString('<div class="view-line');
	if (!hasCharChanges) {
		// No char changes
		sb.appendString(' char-delete');
	}
	sb.appendString('" style="top:');
	sb.appendString(String(viewLineIdx * options.lineHeight));
	sb.appendString('px;width:1000000px;">');

	const lineContent = lineTokens.getLineContent();
	const isBasicASCII = ViewLineRenderingData.isBasicASCII(lineContent, mightContainNonBasicASCII);
	const containsRTL = ViewLineRenderingData.containsRTL(lineContent, isBasicASCII, mightContainRTL);
	const output = renderViewLine(new RenderLineInput(
		(options.fontInfo.isMonospace && !options.disableMonospaceOptimizations),
		options.fontInfo.canUseHalfwidthRightwardsArrow,
		lineContent,
		false,
		isBasicASCII,
		containsRTL,
		0,
		lineTokens,
		decorations,
		options.tabSize,
		0,
		options.fontInfo.spaceWidth,
		options.fontInfo.middotWidth,
		options.fontInfo.wsmiddotWidth,
		options.stopRenderingLineAfter,
		options.renderWhitespace,
		options.renderControlCharacters,
		options.fontLigatures !== EditorFontLigatures.OFF,
		null // Send no selections, original line cannot be selected
	), sb);

	sb.appendString('</div>');

	return output.characterMapping.getHorizontalOffset(output.characterMapping.length);
}
