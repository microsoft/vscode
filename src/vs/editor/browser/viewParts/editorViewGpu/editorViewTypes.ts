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
	/** Newer than 0.0.2, which ignores it. */
	fontWeight?: number | string;
	lineHeight: number;
	fontLigatures?: boolean;
	monospaceWidth?: number;
	/** Newer than 0.0.1, which ignores it. */
	glyphCache?: 'runs' | 'characters';
	/** Newer than 0.0.1, which always redraws in full. */
	incrementalRendering?: boolean;
	tabSize?: number;
	indentSize?: number;
	indentGuides?: boolean;
	bracketGuides?: boolean;
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

export type BracketGuideInput = (
	| { column: number; visibleColumn?: never }
	| { visibleColumn: number; column?: never }
) & {
	color: number;
	horizontalLine?: { top: boolean; endColumn: number };
};

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
	/** The token's own color when `foreground` paints a decoration's over it; the minimap paints this. */
	baseForeground?: number;
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

/**
 * Top padding plus space between view lines (view zones). `beforeLine` is the
 * zero-based view line the space sits above, i.e. VS Code's `afterLineNumber`.
 */
export interface VerticalLayoutInput {
	paddingTop?: number;
	whitespaces: { beforeLine: number; height: number }[];
}

/** Minimap paint settings; lengths are canvas pixels, as in `minimap.ts`. */
export interface MinimapConfig {
	width: number;
	height: number;
	lineHeight: number;
	charWidth: number;
	fontScale: number;
	renderCharacters: boolean;
	background: number;
	/** `minimap.foregroundOpacity`, 0..1. */
	foregroundAlpha: number;
	selectionColor?: number;
	defaultForeground: number;
	tabSize?: number;
}

export interface MinimapDecorationInput extends SelectionInput {
	color: number;
	position: 'inline' | 'gutter';
	zIndex?: number;
}

export interface MinimapRenderInput {
	/** Zero-based first painted minimap line; `endLine` is exclusive. */
	startLine: number;
	endLine: number;
	topPaddingLines?: number;
	/** Minimap line `i` shows zero-based view line `lines[i]`. */
	sampling?: { ratio: number; lines: ArrayLike<number> };
}

export interface OverviewRulerConfig {
	width: number;
	height: number;
	lanes: number;
	pixelRatio: number;
	background?: number;
	border?: number;
	hideCursor?: boolean;
}

export interface OverviewRulerDecorationGroup {
	color: number;
	/** `lane, startLine, endLine` triples with zero-based view lines. */
	data: ArrayLike<number>;
}

export interface OverviewRulerCursorInput {
	line: number;
	color: number;
}

export interface SolidRectInput {
	x: number;
	y: number;
	width: number;
	height: number;
	color: number;
}

export interface EditorView {
	setLines(lines: LineInput[]): void;
	applyDelta(delta: ModelDeltaInput): void;
	/**
	 * Remove `deleteCount` lines at `start` and insert `insertCount` empty lines,
	 * whose content hosts send before the renderer reads them. Absent in npm 0.0.1.
	 */
	spliceLines?(start: number, deleteCount: number, insertCount: number): void;
	/** Absent in npm 0.0.1; hosts must check before enabling bracket guide paint. */
	setBracketGuides?(start: number, guides: BracketGuideInput[][]): void;
	/** Folding controls for consecutive view lines from `start`; other lines keep theirs. Absent in npm 0.0.1. */
	setFoldingControls?(start: number, controls: (FoldingControlInput | null)[]): void;
	/** Absent in npm 0.0.1; hosts must check before rendering padding or view zones. */
	setVerticalLayout?(layout: VerticalLayoutInput): void;
	setConfig(config: EditorViewConfig): void;
	setViewport(viewport: { width: number; height: number; scrollTop?: number; scrollLeft?: number; devicePixelRatio?: number }): void;
	decorationRanges(ranges: DecorationRangeInput[]): { line: number; left: number; width: number; continuesOnNextLine: boolean }[][];
	maxLineWidth(startLine: number, endLine: number): number;
	columnOffset(line: number, column: number): number;
	columnAtOffset(line: number, offset: number): number | undefined;
	/**
	 * The device pixel row of the document that the top row of a frame
	 * scrolled to `scrollTop` shows at `devicePixelRatio`. Renderers that have
	 * it draw content on the document's device pixels, so moving a frame by
	 * the difference of two anchors shows what drawing it at the other scroll
	 * position would, at any ratio. Absent in npm 0.0.1.
	 */
	scrollAnchor?(scrollTop: number, devicePixelRatio: number): number;
	resize(width: number, height: number): void;
	render(): boolean;
	/**
	 * Present the next frame of every surface even if it shows what its canvas
	 * shows already. Renderers that have it present only frames that change
	 * the picture. Absent in npm 0.0.1.
	 */
	presentNextFrame?(): void;
	/**
	 * Auxiliary surfaces (minimap, overview ruler, scrollbar sliders) share the
	 * renderer's WebGPU device. Absent in npm 0.0.1, and `false` on WebGL2.
	 */
	readonly supportsSurfaces?: boolean;
	attachSurface?(id: string, canvas: HTMLCanvasElement, width: number, height: number): void;
	resizeSurface?(id: string, width: number, height: number): void;
	detachSurface?(id: string): void;
	setMinimap?(config: MinimapConfig | undefined): void;
	setMinimapCharSheet?(scale: number, charData: Uint8Array): void;
	setMinimapDecorations?(decorations: MinimapDecorationInput[]): void;
	renderMinimap?(surfaceId: string, input: MinimapRenderInput): boolean;
	setOverviewRuler?(config: OverviewRulerConfig | undefined): void;
	setOverviewRulerDecorations?(groups: OverviewRulerDecorationGroup[]): void;
	renderOverviewRuler?(surfaceId: string, scrollHeight: number, cursors: OverviewRulerCursorInput[]): boolean;
	renderRects?(surfaceId: string, rects: SolidRectInput[]): boolean;
	/**
	 * Replace a renderer lost with its GPU device or WebGL2 context, keeping
	 * retained state; auxiliary surfaces must be attached again. Absent in npm 0.0.1.
	 */
	recoverRenderer?(): Promise<void>;
	dispose(): void;
}

/**
 * Editor views that share one WebGPU device and glyph atlas (absent in npm
 * 0.0.1): the views draw with one set of pipelines, every canvas they render
 * in a task is submitted at once, and a glyph rasterized for one is drawn by
 * all. Needs WebGPU; dispose it after its views.
 */
export interface EditorViewGroup {
	dispose(): void;
}

/**
 * How the renderer anti-aliases glyphs, as values of `-webkit-font-smoothing`;
 * `'default'` keeps the browser's own smoothing.
 */
export type EditorViewFontSmoothing = 'antialiased' | 'subpixel-antialiased' | 'none' | 'default';

export interface EditorViewModule {
	EditorView: {
		create(canvas: HTMLCanvasElement, options: {
			width: number;
			height: number;
			config: EditorViewConfig;
			/** Called when the renderer loses its GPU device or WebGL2 context. Ignored by npm 0.0.1. */
			onRendererLost?: (reason: string) => void;
			/** Share the group's WebGPU device and glyph atlas; creating the renderer rejects without WebGPU. */
			group?: EditorViewGroup;
			/** How to anti-alias glyphs; not with a `group`, which sets it for its views. */
			fontSmoothing?: EditorViewFontSmoothing;
		}): Promise<EditorView>;
	};
	/** Absent in npm 0.0.1. */
	EditorViewGroup?: new (options?: { fontSmoothing?: EditorViewFontSmoothing }) => EditorViewGroup;
}
