/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./indentGuides';
import { DynamicViewOverlay } from 'vs/editor/browser/view/dynamicViewOverlay';
import { editorBracketHighlightingForeground1, editorBracketHighlightingForeground2, editorBracketHighlightingForeground3, editorBracketHighlightingForeground4, editorBracketHighlightingForeground5, editorBracketHighlightingForeground6, editorBracketPairGuideActiveBackground1, editorBracketPairGuideActiveBackground2, editorBracketPairGuideActiveBackground3, editorBracketPairGuideActiveBackground4, editorBracketPairGuideActiveBackground5, editorBracketPairGuideActiveBackground6, editorBracketPairGuideBackground1, editorBracketPairGuideBackground2, editorBracketPairGuideBackground3, editorBracketPairGuideBackground4, editorBracketPairGuideBackground5, editorBracketPairGuideBackground6, editorIndentGuide1, editorIndentGuide2, editorIndentGuide3, editorIndentGuide4, editorIndentGuide5, editorIndentGuide6, editorActiveIndentGuide1, editorActiveIndentGuide2, editorActiveIndentGuide3, editorActiveIndentGuide4, editorActiveIndentGuide5, editorActiveIndentGuide6 } from 'vs/editor/common/core/editorColorRegistry';
import { RenderingContext } from 'vs/editor/browser/view/renderingContext';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import * as viewEvents from 'vs/editor/common/viewEvents';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { EditorOption, InternalGuidesOptions } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { ArrayQueue } from 'vs/base/common/arrays';
import { Color } from 'vs/base/common/color';
import { isDefined } from 'vs/base/common/types';
import { BracketPairGuidesClassNames } from 'vs/editor/common/model/guidesTextModelPart';
import { IndentGuide, HorizontalGuidesState } from 'vs/editor/common/textModelGuides';

export class IndentGuidesOverlay extends DynamicViewOverlay {

	private readonly _context: ViewContext;
	private _primaryPosition: Position | null;
	private _lineHeight: number;
	private _spaceWidth: number;
	private _renderResult: string[] | null;
	private _maxIndentLeft: number;
	private _bracketPairGuideOptions: InternalGuidesOptions;

	constructor(context: ViewContext) {
		super();
		this._context = context;
		this._primaryPosition = null;

		const options = this._context.configuration.options;
		const wrappingInfo = options.get(EditorOption.wrappingInfo);
		const fontInfo = options.get(EditorOption.fontInfo);

		this._lineHeight = options.get(EditorOption.lineHeight);
		this._spaceWidth = fontInfo.spaceWidth;
		this._maxIndentLeft = wrappingInfo.wrappingColumn === -1 ? -1 : (wrappingInfo.wrappingColumn * fontInfo.typicalHalfwidthCharacterWidth);
		this._bracketPairGuideOptions = options.get(EditorOption.guides);

		this._renderResult = null;

		this._context.addEventHandler(this);
	}

	public override dispose(): void {
		this._context.removeEventHandler(this);
		this._renderResult = null;
		super.dispose();
	}

	// --- begin event handlers

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		const options = this._context.configuration.options;
		const wrappingInfo = options.get(EditorOption.wrappingInfo);
		const fontInfo = options.get(EditorOption.fontInfo);

		this._lineHeight = options.get(EditorOption.lineHeight);
		this._spaceWidth = fontInfo.spaceWidth;
		this._maxIndentLeft = wrappingInfo.wrappingColumn === -1 ? -1 : (wrappingInfo.wrappingColumn * fontInfo.typicalHalfwidthCharacterWidth);
		this._bracketPairGuideOptions = options.get(EditorOption.guides);

		return true;
	}
	public override onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		const selection = e.selections[0];
		const newPosition = selection.getPosition();
		if (!this._primaryPosition?.equals(newPosition)) {
			this._primaryPosition = newPosition;
			return true;
		}

		return false;
	}
	public override onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		// true for inline decorations
		return true;
	}
	public override onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		return true;
	}
	public override onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
		return true;
	}
	public override onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		return true;
	}
	public override onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		return true;
	}
	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return e.scrollTopChanged;// || e.scrollWidthChanged;
	}
	public override onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return true;
	}
	public override onLanguageConfigurationChanged(e: viewEvents.ViewLanguageConfigurationEvent): boolean {
		return true;
	}

	// --- end event handlers

	public prepareRender(ctx: RenderingContext): void {
		if (!this._bracketPairGuideOptions.indentation && this._bracketPairGuideOptions.bracketPairs === false) {
			this._renderResult = null;
			return;
		}

		const visibleStartLineNumber = ctx.visibleRange.startLineNumber;
		const visibleEndLineNumber = ctx.visibleRange.endLineNumber;
		const scrollWidth = ctx.scrollWidth;
		const lineHeight = this._lineHeight;

		const activeCursorPosition = this._primaryPosition;

		const indents = this.getGuidesByLine(
			visibleStartLineNumber,
			Math.min(visibleEndLineNumber + 1, this._context.viewModel.getLineCount()),
			activeCursorPosition
		);

		const output: string[] = [];
		for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
			const lineIndex = lineNumber - visibleStartLineNumber;
			const indent = indents[lineIndex];
			let result = '';
			const leftOffset = ctx.visibleRangeForPosition(new Position(lineNumber, 1))?.left ?? 0;
			for (const guide of indent) {
				const left =
					guide.column === -1
						? leftOffset + (guide.visibleColumn - 1) * this._spaceWidth
						: ctx.visibleRangeForPosition(
							new Position(lineNumber, guide.column)
						)!.left;

				if (left > scrollWidth || (this._maxIndentLeft > 0 && left > this._maxIndentLeft)) {
					break;
				}

				const className = guide.horizontalLine ? (guide.horizontalLine.top ? 'horizontal-top' : 'horizontal-bottom') : 'vertical';

				const width = guide.horizontalLine
					? (ctx.visibleRangeForPosition(
						new Position(lineNumber, guide.horizontalLine.endColumn)
					)?.left ?? (left + this._spaceWidth)) - left
					: this._spaceWidth;

				result += `<div class="core-guide ${guide.className} ${className}" style="left:${left}px;height:${lineHeight}px;width:${width}px"></div>`;
			}
			output[lineIndex] = result;
		}
		this._renderResult = output;
	}

	private getGuidesByLine(
		visibleStartLineNumber: number,
		visibleEndLineNumber: number,
		activeCursorPosition: Position | null
	): IndentGuide[][] {
		const bracketGuides = this._bracketPairGuideOptions.bracketPairs !== false
			? this._context.viewModel.getBracketGuidesInRangeByLine(
				visibleStartLineNumber,
				visibleEndLineNumber,
				activeCursorPosition,
				{
					highlightActive: this._bracketPairGuideOptions.highlightActiveBracketPair,
					horizontalGuides: this._bracketPairGuideOptions.bracketPairsHorizontal === true
						? HorizontalGuidesState.Enabled
						: this._bracketPairGuideOptions.bracketPairsHorizontal === 'active'
							? HorizontalGuidesState.EnabledForActive
							: HorizontalGuidesState.Disabled,
					includeInactive: this._bracketPairGuideOptions.bracketPairs === true,
				}
			)
			: null;

		const indentGuides = this._bracketPairGuideOptions.indentation
			? this._context.viewModel.getLinesIndentGuides(
				visibleStartLineNumber,
				visibleEndLineNumber
			)
			: null;

		let activeIndentStartLineNumber = 0;
		let activeIndentEndLineNumber = 0;
		let activeIndentLevel = 0;

		if (this._bracketPairGuideOptions.highlightActiveIndentation !== false && activeCursorPosition) {
			const activeIndentInfo = this._context.viewModel.getActiveIndentGuide(activeCursorPosition.lineNumber, visibleStartLineNumber, visibleEndLineNumber);
			activeIndentStartLineNumber = activeIndentInfo.startLineNumber;
			activeIndentEndLineNumber = activeIndentInfo.endLineNumber;
			activeIndentLevel = activeIndentInfo.indent;
		}

		const { indentSize } = this._context.viewModel.model.getOptions();

		const result: IndentGuide[][] = [];
		for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
			const lineGuides = new Array<IndentGuide>();
			result.push(lineGuides);

			const bracketGuidesInLine = bracketGuides ? bracketGuides[lineNumber - visibleStartLineNumber] : [];
			const bracketGuidesInLineQueue = new ArrayQueue(bracketGuidesInLine);

			const indentGuidesInLine = indentGuides ? indentGuides[lineNumber - visibleStartLineNumber] : 0;

			for (let indentLvl = 1; indentLvl <= indentGuidesInLine; indentLvl++) {
				const indentGuide = (indentLvl - 1) * indentSize + 1;
				const isActive =
					// Disable active indent guide if there are bracket guides.
					(this._bracketPairGuideOptions.highlightActiveIndentation === 'always' || bracketGuidesInLine.length === 0) &&
					activeIndentStartLineNumber <= lineNumber &&
					lineNumber <= activeIndentEndLineNumber &&
					indentLvl === activeIndentLevel;
				lineGuides.push(...bracketGuidesInLineQueue.takeWhile(g => g.visibleColumn < indentGuide) || []);
				const peeked = bracketGuidesInLineQueue.peek();
				if (!peeked || peeked.visibleColumn !== indentGuide || peeked.horizontalLine) {
					lineGuides.push(
						new IndentGuide(
							indentGuide,
							-1,
							`core-guide-indent lvl-${(indentLvl - 1) % 30}` + (isActive ? ' indent-active' : ''),
							null,
							-1,
							-1,
						)
					);
				}
			}

			lineGuides.push(...bracketGuidesInLineQueue.takeWhile(g => true) || []);
		}

		return result;
	}

	public render(startLineNumber: number, lineNumber: number): string {
		if (!this._renderResult) {
			return '';
		}
		const lineIndex = lineNumber - startLineNumber;
		if (lineIndex < 0 || lineIndex >= this._renderResult.length) {
			return '';
		}
		return this._renderResult[lineIndex];
	}
}

function transparentToUndefined(color: Color | undefined): Color | undefined {
	if (color && color.isTransparent()) {
		return undefined;
	}
	return color;
}

registerThemingParticipant((theme, collector) => {

	const colors = [
		{ bracketColor: editorBracketHighlightingForeground1, guideColor: editorBracketPairGuideBackground1, guideColorActive: editorBracketPairGuideActiveBackground1 },
		{ bracketColor: editorBracketHighlightingForeground2, guideColor: editorBracketPairGuideBackground2, guideColorActive: editorBracketPairGuideActiveBackground2 },
		{ bracketColor: editorBracketHighlightingForeground3, guideColor: editorBracketPairGuideBackground3, guideColorActive: editorBracketPairGuideActiveBackground3 },
		{ bracketColor: editorBracketHighlightingForeground4, guideColor: editorBracketPairGuideBackground4, guideColorActive: editorBracketPairGuideActiveBackground4 },
		{ bracketColor: editorBracketHighlightingForeground5, guideColor: editorBracketPairGuideBackground5, guideColorActive: editorBracketPairGuideActiveBackground5 },
		{ bracketColor: editorBracketHighlightingForeground6, guideColor: editorBracketPairGuideBackground6, guideColorActive: editorBracketPairGuideActiveBackground6 }
	];
	const colorProvider = new BracketPairGuidesClassNames();

	const indentColors = [
		{ indentColor: editorIndentGuide1, indentColorActive: editorActiveIndentGuide1 },
		{ indentColor: editorIndentGuide2, indentColorActive: editorActiveIndentGuide2 },
		{ indentColor: editorIndentGuide3, indentColorActive: editorActiveIndentGuide3 },
		{ indentColor: editorIndentGuide4, indentColorActive: editorActiveIndentGuide4 },
		{ indentColor: editorIndentGuide5, indentColorActive: editorActiveIndentGuide5 },
		{ indentColor: editorIndentGuide6, indentColorActive: editorActiveIndentGuide6 },
	];

	const colorValues = colors
		.map(c => {
			const bracketColor = theme.getColor(c.bracketColor);
			const guideColor = theme.getColor(c.guideColor);
			const guideColorActive = theme.getColor(c.guideColorActive);

			const effectiveGuideColor = transparentToUndefined(transparentToUndefined(guideColor) ?? bracketColor?.transparent(0.3));
			const effectiveGuideColorActive = transparentToUndefined(transparentToUndefined(guideColorActive) ?? bracketColor);

			if (!effectiveGuideColor || !effectiveGuideColorActive) {
				return undefined;
			}

			return {
				guideColor: effectiveGuideColor,
				guideColorActive: effectiveGuideColorActive,
			};
		})
		.filter(isDefined);

	const indentColorValues = indentColors
		.map(c => {
			const indentColor = theme.getColor(c.indentColor);
			const indentColorActive = theme.getColor(c.indentColorActive);

			const effectiveIndentColor = transparentToUndefined(indentColor);
			const effectiveIndentColorActive = transparentToUndefined(indentColorActive);

			if (!effectiveIndentColor || !effectiveIndentColorActive) {
				return undefined;
			}

			return {
				indentColor: effectiveIndentColor,
				indentColorActive: effectiveIndentColorActive,
			};
		})
		.filter(isDefined);

	if (colorValues.length > 0) {
		for (let level = 0; level < 30; level++) {
			const colors = colorValues[level % colorValues.length];
			collector.addRule(`.monaco-editor .${colorProvider.getInlineClassNameOfLevel(level).replace(/ /g, '.')} { --guide-color: ${colors.guideColor}; --guide-color-active: ${colors.guideColorActive}; }`);
		}

		collector.addRule(`.monaco-editor .vertical { box-shadow: 1px 0 0 0 var(--guide-color) inset; }`);
		collector.addRule(`.monaco-editor .horizontal-top { border-top: 1px solid var(--guide-color); }`);
		collector.addRule(`.monaco-editor .horizontal-bottom { border-bottom: 1px solid var(--guide-color); }`);

		collector.addRule(`.monaco-editor .vertical.${colorProvider.activeClassName} { box-shadow: 1px 0 0 0 var(--guide-color-active) inset; }`);
		collector.addRule(`.monaco-editor .horizontal-top.${colorProvider.activeClassName} { border-top: 1px solid var(--guide-color-active); }`);
		collector.addRule(`.monaco-editor .horizontal-bottom.${colorProvider.activeClassName} { border-bottom: 1px solid var(--guide-color-active); }`);
	}

	if (indentColorValues.length > 0) {
		for (let level = 0; level < 30; level++) {
			const colors = indentColorValues[level % indentColorValues.length];
			collector.addRule(`.monaco-editor .lines-content .core-guide-indent.lvl-${level} { --indent-color: ${colors.indentColor}; --indent-color-active: ${colors.indentColorActive}; }`);
		}

		collector.addRule(`.monaco-editor .lines-content .core-guide-indent { box-shadow: 1px 0 0 0 var(--indent-color) inset; }`);
		collector.addRule(`.monaco-editor .lines-content .core-guide-indent.indent-active { box-shadow: 1px 0 0 0 var(--indent-color-active) inset; }`);
	}
});
