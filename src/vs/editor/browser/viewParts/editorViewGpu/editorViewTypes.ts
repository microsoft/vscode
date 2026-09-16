/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Host-owned contract for the optional @vscode/editor-view 0.0.1 renderer.
 * Keep this subset independent of npm so OSS and Monaco compile without it.
 * Positions are zero-based UTF-16; colors are packed 0xRRGGBBAA.
 */
export interface EditorViewConfig {
	fontFamily: string;
	fontSize: number;
	lineHeight: number;
	fontLigatures?: boolean;
	monospaceWidth?: number;
	tabSize?: number;
	indentSize?: number;
	indentGuides?: boolean;
	indentGuideColors?: number[];
	activeIndentGuideColors?: number[];
	maxIndentGuideOffset?: number;
	renderWhitespace?: 'none' | 'boundary' | 'selection' | 'trailing' | 'all';
	whitespaceColor?: number;
	spaceMarker?: string;
	tabMarker?: string;
	stopRenderingLineAfter?: number;
	gutterWidth?: number;
	lineNumbersRight?: number;
	foldingControlLeft?: number;
	foldingControlWidth?: number;
	foldingControlForeground?: number;
	foldingControlFontFamily?: string;
	foldingControlFontSize?: number;
	foldingControlsHovered?: boolean;
	background: number;
	gutterBackground?: number;
	foreground: number;
	lineNumberForeground?: number;
	lineNumberActiveForeground?: number;
	activeLine?: number;
	selections?: SelectionInput[];
	selectionBackground?: number;
	roundedSelection?: boolean;
	lineHighlightBackground?: number;
	lineHighlightBorder?: number;
	lineHighlightWidth?: number;
	highlightLines?: number[];
	highlightContent?: boolean;
	highlightMargin?: boolean;
	cursors?: CursorInput[];
	cursorStyle?: CursorStyle;
	cursorWidth?: number;
	cursorHeight?: number;
}

export type CursorStyle = 'line' | 'line-thin' | 'block' | 'block-outline' | 'underline' | 'underline-thin';
export type FoldingControlInput = 'expanded' | 'expanded-auto-hide' | 'collapsed';

export interface CursorInput {
	line: number;
	column: number;
	color: number;
	background?: number;
}

export interface SelectionInput {
	startLine: number;
	startColumn: number;
	endLine: number;
	endColumn: number;
}

export interface TokenInput {
	startColumn: number;
	endColumn: number;
	foreground: number;
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	strikethrough?: boolean;
}

export interface LineInput {
	text: string;
	tokens?: TokenInput[];
	gutterLabel?: string;
	continuesWithWrappedLine?: boolean;
	fauxIndentLength?: number;
	indentGuideCount?: number;
	activeIndentGuideLevel?: number;
	foldingControl?: FoldingControlInput;
}

export type DecorationStrokeStyle = 'solid' | 'dotted' | 'dashed' | 'wavy';
export type DecorationKindInput =
	| { kind: 'background'; color: number }
	| { kind: 'foreground'; color: number }
	| { kind: 'underline'; color: number; style?: DecorationStrokeStyle; width?: number; inside?: boolean }
	| { kind: 'border'; color: number; style?: Exclude<DecorationStrokeStyle, 'wavy'>; width?: number };

export interface DecorationInput extends SelectionInput {
	id: number;
	styleId?: number;
	zIndex?: number;
	wholeLine?: boolean;
	fillLineBreak?: boolean;
	includeNewLines?: boolean;
	showIfCollapsed?: boolean;
	kind: DecorationKindInput;
}

export interface DecorationRangeInput extends SelectionInput {
	includeNewLines?: boolean;
}

export type ModelDeltaInput =
	| { type: 'replaceLines'; start: number; deleteCount: number; insert: LineInput[] }
	| { type: 'setTokens'; line: number; tokens: TokenInput[] }
	| { type: 'setIndentGuides'; start: number; counts: number[]; activeLevels?: number[] }
	| { type: 'setFoldingControls'; controls: (FoldingControlInput | null)[] }
	| { type: 'setDecorations'; decorations: DecorationInput[] }
	| { type: 'upsertDecoration'; decoration: DecorationInput }
	| { type: 'removeDecoration'; id: number };

export interface EditorView {
	setLines(lines: LineInput[]): void;
	applyDelta(delta: ModelDeltaInput): void;
	setConfig(config: EditorViewConfig): void;
	setViewport(viewport: { width: number; height: number; scrollTop?: number; scrollLeft?: number; devicePixelRatio?: number }): void;
	decorationRanges(ranges: DecorationRangeInput[]): { line: number; left: number; width: number; continuesOnNextLine: boolean }[][];
	maxLineWidth(startLine: number, endLine: number): number;
	columnOffset(line: number, column: number): number;
	columnAtOffset(line: number, offset: number): number | undefined;
	resize(width: number, height: number): void;
	render(): boolean;
	dispose(): void;
}

export interface EditorViewModule {
	EditorView: {
		create(canvas: HTMLCanvasElement, options: { width: number; height: number; config: EditorViewConfig }): Promise<EditorView>;
	};
}
