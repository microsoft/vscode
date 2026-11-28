/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './editorViewGpu.css';
import type { EditorView, EditorViewConfig, EditorViewFontSmoothing, EditorViewGroup, EditorViewModule, CursorInput, CursorStyle, DecorationRangeInput, LineInput, ModelDeltaInput, SelectionInput, TokenInput } from './editorViewTypes.js';
import { getComputedStyle, getWindow, onDidUnregisterWindow, WindowIntervalTimer } from '../../../../base/browser/dom.js';
import { createFastDomNode, type FastDomNode } from '../../../../base/browser/fastDomNode.js';
import { Color } from '../../../../base/common/color.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, type Event } from '../../../../base/common/event.js';
import { markAsSingleton, type IDisposable } from '../../../../base/common/lifecycle.js';
import { resolveAmdNodeModulePath } from '../../../../amdX.js';
import { editorBackground, editorForeground, editorSelectionBackground, editorSelectionForeground, editorInactiveSelection } from '../../../../platform/theme/common/colorRegistry.js';
import { isHighContrast } from '../../../../platform/theme/common/theme.js';
import { editorActiveLineNumber, editorGutter, editorLineNumbers, editorLineHighlight, editorLineHighlightBorder, editorInactiveLineHighlight, editorCursorForeground, editorCursorBackground, editorMultiCursorPrimaryForeground, editorMultiCursorPrimaryBackground, editorMultiCursorSecondaryForeground, editorMultiCursorSecondaryBackground, editorWhitespaces } from '../../../common/core/editorColorRegistry.js';
import { EditorFontLigatures, EditorOption, editorGpuAcceleration, RenderLineNumbersType, TextEditorCursorBlinkingStyle, TextEditorCursorStyle } from '../../../common/config/editorOptions.js';
import { Position } from '../../../common/core/position.js';
import { TokenizationRegistry } from '../../../common/languages.js';
import type { IViewLineTokens } from '../../../common/tokens/lineTokens.js';
import type * as viewEvents from '../../../common/viewEvents.js';
import { ViewEventType } from '../../../common/viewEvents.js';
import type { ViewContext } from '../../../common/viewModel/viewContext.js';
import { HorizontalPosition, HorizontalRange, LineVisibleRanges, type ILinesVisibleRangesRequest, type IViewLines, type RenderingContext, type RestrictedRenderingContext } from '../../view/renderingContext.js';
import { ViewPart } from '../../view/viewPart.js';
import { Range } from '../../../common/core/range.js';
import { applyTextStyleRuns, type ITextStyleRun } from './editorViewTextStyles.js';
import { EditorViewModelSync } from './editorViewModelSync.js';
import type { IEditorViewLineWidthProvider } from '../viewLines/viewLines.js';
import type { IViewLineHitTestProvider } from '../../controller/mouseHandler.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

/**
 * Which editor surfaces the `@vscode/editor-view` (Rust/WASM) renderer draws
 * itself. Each `true` means "the GPU canvas owns this surface", so the matching
 * DOM view part is **not constructed, mounted or ticked** — see the gating in
 * `view.ts`. Flip a flag to `true` only once the renderer draws that surface
 * pixel-faithfully (guarded by the `@vscode/editor-view` `test/compare` harness),
 * so we progressively shed the parallel DOM editor's CPU/DOM cost one surface at
 * a time instead of in a risky big-bang cutover.
 */
export interface EditorViewGpuCapabilities {
	/** Text glyphs (DOM `ViewLines.renderText` is skipped). */
	readonly text: boolean;
	/** Selection highlight (`SelectionsOverlay`). */
	readonly selection: boolean;
	/** Current-line highlight, content + margin (`CurrentLine*Overlay`). */
	readonly currentLine: boolean;
	/**
	 * Text caret (`ViewCursors`). The renderer can draw it, but a DOM caret over
	 * the canvas blinks without presenting the canvas: toggling it costs the GPU
	 * process about 2 ms less a blink (`docs/gpu-process-time.md` in
	 * `@vscode/editor-view`).
	 */
	readonly cursor: boolean;
	/** Visible space/tab markers (`WhitespaceOverlay`). */
	readonly whitespace: boolean;
	/** Indentation and bracket-pair guides (`IndentGuidesOverlay`). */
	readonly guides: boolean;
	/** Gutter line numbers (`LineNumbersOverlay`). */
	readonly lineNumbers: boolean;
	/**
	 * Folding-control pixels. Transparent DOM controls remain mounted as pointer
	 * targets until the renderer owns gutter input.
	 */
	readonly foldingControls: boolean;
	/**
	 * Supported content decoration paints are GPU-owned individually; the DOM
	 * overlay remains mounted for every unsupported class/style.
	 */
	readonly supportedContentDecorations: boolean;
	/**
	 * Content/margin decorations: squiggles and inline/line decorations
	 * (`DecorationsOverlay`, `LinesDecorationsOverlay`,
	 * `MarginViewLineDecorationsOverlay`).
	 */
	readonly decorations: boolean;
	/** Vertical rulers (`Rulers`). */
	readonly rulers: boolean;
	/**
	 * Minimap (`Minimap`). While `false`, `Minimap` stays mounted and paints
	 * through `EditorViewGpu.minimapPainter` when the renderer can.
	 */
	readonly minimap: boolean;
	/**
	 * Overview ruler marks (`DecorationsOverviewRuler`). While `false`, the
	 * ruler stays mounted and paints through `EditorViewGpu.overviewRulerPainter`
	 * when the renderer can.
	 */
	readonly overviewRuler: boolean;
	/** Scroll shadow (`ScrollDecorationViewPart`). */
	readonly scrollDecoration: boolean;
	/** Block decorations outline (`BlockDecorations`). */
	readonly blockDecorations: boolean;
}

/**
 * What the Rust renderer draws **today**. Each unowned surface still falls to
 * its DOM view part until the renderer grows it. This is a synchronous, static
 * descriptor (it reflects what the renderer can do, not runtime state), so
 * `view.ts` can consult it while constructing the view even though the renderer
 * itself initializes asynchronously.
 */
/** Paint applied over a line's tokens; `key` identifies it for change detection. */
interface ILineTextStyle {
	/** High-contrast selected ranges, `[start, end, ...]`. */
	readonly selected: readonly number[];
	readonly key: string;
}

export const EDITOR_VIEW_GPU_CAPABILITIES: EditorViewGpuCapabilities = {
	text: true,
	selection: true,
	currentLine: true,
	cursor: false,
	whitespace: true,
	guides: true,
	lineNumbers: true,
	foldingControls: true,
	supportedContentDecorations: true,
	decorations: false,
	rulers: false,
	minimap: false,
	overviewRuler: false,
	scrollDecoration: false,
	blockDecorations: false,
};

/**
 * Replace `deleteCount` entries of `array` at `start` with `insertCount`
 * `undefined` entries, without spreading a large insert into `splice`.
 */
function spliceUnsent<T>(array: (T | undefined)[], start: number, deleteCount: number, insertCount: number): void {
	const tail = array.splice(start + deleteCount);
	array.length = Math.min(array.length, start);
	for (let i = 0; i < insertCount; i++) {
		array.push(undefined);
	}
	for (const value of tail) {
		array.push(value);
	}
}

/**
 * The editors of a window share one WebGPU device and glyph atlas through its
 * group, which is disposed with the window. `null` once a window's group
 * failed to give an editor a renderer, for example without WebGPU: the
 * window's editors then render with devices of their own.
 */
const editorViewGroups = new Map<Window, EditorViewGroup | null>();
let editorViewGroupsListener: IDisposable | undefined;

function editorViewGroup(mod: EditorViewModule, targetWindow: Window, fontSmoothing: EditorViewFontSmoothing): EditorViewGroup | undefined {
	if (!mod.EditorViewGroup) {
		return undefined;
	}
	let group = editorViewGroups.get(targetWindow);
	if (group === undefined) {
		group = new mod.EditorViewGroup({ fontSmoothing });
		editorViewGroups.set(targetWindow, group);
		editorViewGroupsListener ??= markAsSingleton(onDidUnregisterWindow(window => {
			editorViewGroups.get(window)?.dispose();
			editorViewGroups.delete(window);
		}));
	}
	return group ?? undefined;
}

/**
 * The smoothing of the editor's DOM text, for the renderer to rasterize glyphs
 * with: on macOS the workbench sets it from `workbench.fontAliasing`, whose
 * default leaves the browser's own, heavier one. Glyphs rasterized otherwise
 * look lighter or bolder than DOM text. A window's editors share its group, and
 * the workbench's smoothing.
 */
export function editorViewFontSmoothing(element: HTMLElement): EditorViewFontSmoothing {
	const smoothing = getComputedStyle(element).getPropertyValue('-webkit-font-smoothing');
	return smoothing === 'antialiased' || smoothing === 'subpixel-antialiased' || smoothing === 'none' ? smoothing : 'default';
}

let editorViewFailureReported = false;

/**
 * Render the window's editors with the DOM from now on, after the renderer
 * failed, and report why. A window's editors often fail together, for example
 * in a build without the package, so only the first failure is reported.
 */
function failEditorView(error: unknown): void {
	editorGpuAcceleration.disableEditorView();
	if (!editorViewFailureReported) {
		editorViewFailureReported = true;
		onUnexpectedError(error);
	}
}

/**
 * Experimental integration of the `@vscode/editor-view` (Rust/WASM) GPU renderer.
 *
 * This is a **read-only proof of concept**: it mounts a canvas over the editor
 * content and mirrors the current document's lines, tokens, font and theme
 * colors onto the external renderer, keeping it in sync as the document,
 * viewport, theme or configuration change. Input, selections and hit-testing
 * are still handled by the regular (DOM) editor underneath.
 *
 * It is only constructed when `editor.experimentalGpuAcceleration` is set to
 * `'editorView'`; with any other value nothing here runs.
 */
export class EditorViewGpu extends ViewPart implements IEditorViewLineWidthProvider, IViewLineHitTestProvider, IViewLines {

	public readonly canvas: FastDomNode<HTMLCanvasElement>;

	private _editorView: EditorView | undefined;
	private _disposed = false;
	/**
	 * Turns view events into the minimal set of model deltas (or a full reload).
	 * Renderer-free and unit-tested; this ViewPart only handles renderer readiness
	 * and executes the plan it produces.
	 */
	private readonly _sync = new EditorViewModelSync();
	/** `editor.experimental.editorViewGlyphCache`, an experiment; see the README. */
	private _glyphCache: 'runs' | 'characters';
	/** `editor.experimental.editorViewIncrementalRendering`; see the README. */
	private _incrementalRendering: boolean;
	/** `editor.experimental.editorViewOverscan`; see the README. */
	private _overscan: boolean;
	/**
	 * Where the canvas draws, in scroll space (CSS px): from `top`, the viewport
	 * plus `margin` above and below it, which scrolling shows by moving the
	 * canvas. `undefined` until the first frame.
	 */
	private _canvasPlacement: { top: number; margin: number } | undefined;
	/**
	 * Whether anything besides the vertical scroll position may have changed
	 * since the last frame drew; see {@link _moveCanvas}.
	 */
	private _changedBesidesScrollTop = true;
	/** The editor's size and pixel ratio when the last frame drew. */
	private _presentedSize: { width: number; height: number; dpr: number } | undefined;
	/** Gutter label of each view line as last sent to the renderer (mirrors its line list). */
	private _sentGutterLabels: (string | undefined)[] = [];
	/**
	 * Text-style key ({@link ILineTextStyle.key}) of each view line as last
	 * sent. `undefined` marks a line whose content the renderer does not have:
	 * lines are sent only before it paints, measures or minimaps them.
	 */
	private _sentTextStyle: (string | undefined)[] = [];
	/** Text-style key of lines built by `_buildLine`, recorded when they are sent. */
	private readonly _builtTextStyle = new WeakMap<LineInput, string>();
	/** Whether gutter labels or text styles of sent lines may have changed since they were checked. */
	private _lineStateDirty = true;
	/** 0-based `[start, end)` view lines checked since {@link _lineStateDirty} was last set. */
	private _lineStateChecked = { start: 0, end: 0 };
	/** Current selections in renderer coordinates (0-based line, 0-based UTF-16 column). */
	private _selections: SelectionInput[] = [];
	/** 0-based view lines carrying a cursor (deduped), on which the current-line highlight is painted. */
	private _cursorLines: number[] = [0];
	/** Whether every selection is empty (a bare cursor); gates the content current-line highlight. */
	private _selectionIsEmpty = true;
	/**
	 * Whether the editor is focused. Selection and current-line highlight colors
	 * differ between the focused and inactive states, mirroring the DOM editor's
	 * `.focused` CSS. Starts `false` and tracks {@link onFocusChanged}.
	 */
	private _focused = false;
	/**
	 * Caret positions (1-based `(lineNumber, column)`), one per cursor with the
	 * primary at index 0, as the DOM `ViewCursors` keeps them (primary +
	 * secondaries).
	 */
	private _cursorPositions: { lineNumber: number; column: number }[] = [{ lineNumber: 1, column: 1 }];
	/**
	 * Whether the caret is in its "on" phase this frame, when the renderer draws
	 * it ({@link EDITOR_VIEW_GPU_CAPABILITIES}`.cursor`). VS Code's blink is
	 * host-owned; we toggle this on {@link _blinkTimer} and repaint, and the
	 * renderer draws the caret only when it (and focus) permit.
	 */
	private _caretOn = true;
	/** Drives flat caret blinking (500ms), mirroring `ViewCursors`'s JS interval. */
	private readonly _blinkTimer = new WindowIntervalTimer();

	/** Flat-blink half-period, matching `ViewCursors.BLINK_INTERVAL`. */
	private static readonly BLINK_INTERVAL = 500;
	private static readonly GLYPH_CACHE_SETTING = 'editor.experimental.editorViewGlyphCache';
	private static readonly INCREMENTAL_RENDERING_SETTING = 'editor.experimental.editorViewIncrementalRendering';
	private static readonly OVERSCAN_SETTING = 'editor.experimental.editorViewOverscan';
	/** Editor root class while the renderer paints; see editorViewGpu.css. */
	public static readonly READY_CLASS_NAME = 'editor-view-gpu';
	private readonly _editorRoot: HTMLElement;
	/** Whether the renderer has painted, so the canvas may show through the DOM backgrounds. */
	private _ready = false;
	/** Counts renderer losses, so only the latest recovery commits. */
	private _rendererLosses = 0;
	private readonly _onDidChangeReady = this._register(new Emitter<void>());
	/**
	 * Fires when the renderer starts or stops painting, which changes
	 * {@link editorClassName} and whether the surface painters can paint.
	 */
	public readonly onDidChangeReady: Event<void> = this._onDidChangeReady.event;

	constructor(
		context: ViewContext,
		editorRoot: HTMLElement,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(context);
		this._editorRoot = editorRoot;
		const readGlyphCache = () => configurationService.getValue(EditorViewGpu.GLYPH_CACHE_SETTING) === 'runs' ? 'runs' : 'characters';
		const readIncrementalRendering = () => configurationService.getValue(EditorViewGpu.INCREMENTAL_RENDERING_SETTING) !== false;
		const readOverscan = () => configurationService.getValue(EditorViewGpu.OVERSCAN_SETTING) !== false;
		this._glyphCache = readGlyphCache();
		this._incrementalRendering = readIncrementalRendering();
		this._overscan = readOverscan();
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(EditorViewGpu.GLYPH_CACHE_SETTING) || e.affectsConfiguration(EditorViewGpu.INCREMENTAL_RENDERING_SETTING) || e.affectsConfiguration(EditorViewGpu.OVERSCAN_SETTING)) {
				this._glyphCache = readGlyphCache();
				this._incrementalRendering = readIncrementalRendering();
				this._overscan = readOverscan();
				this._present();
			}
		}));

		this.canvas = createFastDomNode(document.createElement('canvas'));
		this.canvas.setClassName('editorView-experimental-canvas');
		this.canvas.setPosition('absolute');
		this.canvas.setTop(0);
		this.canvas.setLeft(0);
		// `View` mounts the canvas as the editor's bottom layer. Pointer input
		// reaches the DOM editor above it, which remains the source of truth.
		this.canvas.domNode.style.pointerEvents = 'none';

		void this._initialize();
	}

	/**
	 * Classes for the editor root while the renderer paints. `View` owns the
	 * root's class name and rebuilds it on focus, configuration and theme
	 * changes, so it includes these instead of the root keeping added classes.
	 */
	public get editorClassName(): string {
		if (!this._ready) {
			return '';
		}
		return EditorViewGpu.READY_CLASS_NAME;
	}

	private _setReady(ready: boolean): void {
		if (this._ready !== ready) {
			this._ready = ready;
			this._onDidChangeReady.fire();
		}
	}

	private async _initialize(): Promise<void> {
		try {
			const url = resolveAmdNodeModulePath('@vscode/editor-view', 'dist/index.js');
			// Runtime-computed URL to keep bundlers from rewriting the import (same as @vscode/diff).
			const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ `${url}`) as EditorViewModule;
			if (this._disposed) {
				return;
			}

			const { width, height, dpr } = this._measure();
			const options = {
				width: Math.max(1, Math.round(width * dpr)),
				height: Math.max(1, Math.round(height * dpr)),
				config: this._buildConfig(),
				onRendererLost: () => this._onRendererLost(),
			};
			const targetWindow = getWindow(this._editorRoot);
			const fontSmoothing = editorViewFontSmoothing(this._editorRoot);
			const group = editorViewGroup(mod, targetWindow, fontSmoothing);
			try {
				this._editorView = await mod.EditorView.create(this.canvas.domNode, group ? { ...options, group } : { ...options, fontSmoothing });
			} catch (err) {
				if (!group || this._disposed) {
					throw err;
				}
				// The window's later editors render with devices of their own,
				// which can fall back to WebGL2; its earlier ones keep the group.
				if (editorViewGroups.get(targetWindow) === group) {
					editorViewGroups.set(targetWindow, null);
				}
				this._editorView = await mod.EditorView.create(this.canvas.domNode, { ...options, fontSmoothing });
			}
			if (this._disposed) {
				this._editorView.dispose();
				this._editorView = undefined;
				return;
			}

			// The renderer is ready; the planner still holds its initial full-reload
			// state, so the first present sizes the mirror and sends the lines it paints.
			this._present();
			// Only now let the canvas show through the DOM editor and gutter
			// backgrounds, so loading never shows an unpainted editor.
			this._setReady(true);
		} catch (err) {
			if (this._disposed) {
				return;
			}
			this._setReady(false);
			failEditorView(err);
		}
	}

	/**
	 * The renderer lost its GPU device or WebGL2 context (GPU process restart,
	 * driver update). The DOM backgrounds and the parts' 2D painters show until
	 * a new renderer paints; if none can be created, the editor falls back to
	 * DOM rendering.
	 */
	private _onRendererLost(): void {
		if (this._disposed) {
			return;
		}
		this._setReady(false);
		void this._recoverRenderer(++this._rendererLosses);
	}

	private async _recoverRenderer(loss: number): Promise<void> {
		const editorView = this._editorView;
		try {
			if (!editorView?.recoverRenderer) {
				throw new Error('The installed @vscode/editor-view package cannot recover a lost GPU device.');
			}
			await editorView.recoverRenderer();
			// A later loss starts its own recovery.
			if (this._disposed || loss !== this._rendererLosses) {
				return;
			}
			// The retained model survives; glyphs re-rasterize into the new atlas.
			this._present();
			this._setReady(true);
		} catch (err) {
			if (this._disposed || loss !== this._rendererLosses) {
				return;
			}
			failEditorView(err);
		}
	}

	// --- data extraction -----------------------------------------------------

	private _measure(): { width: number; height: number; dpr: number } {
		const layoutInfo = this._context.configuration.options.get(EditorOption.layoutInfo);
		return {
			width: layoutInfo.width,
			height: layoutInfo.height,
			// The editor's own window: auxiliary windows can be on monitors with a
			// different scale than the focused one.
			dpr: getWindow(this._editorRoot).devicePixelRatio || 1,
		};
	}

	private _buildConfig(): EditorViewConfig {
		const options = this._context.configuration.options;
		const fontInfo = options.get(EditorOption.fontInfo);
		const layoutInfo = options.get(EditorOption.layoutInfo);
		const fontLigatures = options.get(EditorOption.fontLigatures) !== EditorFontLigatures.OFF;
		const hasVerifiedAsciiCellWidth =
			fontInfo.isMonospace || fontInfo.fontFamily.trim().toLowerCase() === 'monospace';
		return {
			fontFamily: fontInfo.fontFamily,
			fontSize: fontInfo.fontSize,
			fontWeight: fontInfo.fontWeight,
			lineHeight: fontInfo.lineHeight,
			fontLigatures,
			monospaceWidth: !fontLigatures && hasVerifiedAsciiCellWidth ? fontInfo.spaceWidth : undefined,
			glyphCache: this._glyphCache,
			incrementalRendering: this._incrementalRendering,
			// Match the DOM editor's geometry so text/line-numbers land at the
			// same x offset: reserve exactly the editor's content-left as the
			// gutter, and expand tabs by the model's tab size.
			gutterWidth: layoutInfo.contentLeft,
			lineNumbersRight: layoutInfo.lineNumbersLeft + layoutInfo.lineNumbersWidth,
			tabSize: this._context.viewModel.model.getOptions().tabSize,
			...this._whitespaceConfig(),
			background: this._packColor(this._context.theme.getColor(editorBackground), 0x1e1e1eff),
			// `editorGutter.background` defaults to `editor.background`; mirror that
			// fallback so the margin matches the DOM view in every theme.
			gutterBackground: this._packColor(
				this._context.theme.getColor(editorGutter) ?? this._context.theme.getColor(editorBackground),
				0x1e1e1eff,
			),
			foreground: this._packColor(this._context.theme.getColor(editorForeground), 0xd4d4d4ff),
			lineNumberForeground: this._packColor(this._context.theme.getColor(editorLineNumbers), 0x858585ff),
			lineNumberActiveForeground: this._packColor(this._context.theme.getColor(editorActiveLineNumber), 0xc6c6c6ff),
			// 0-based view line whose label is drawn with the active color: the first
			// row of the primary cursor's model line, as `LineNumbersOverlay` does
			// (wrap continuation rows have no label).
			activeLine: this._activeGutterLine(),
			selections: this._selections,
			// `roundedSelection` mirrors the DOM `SelectionsOverlay`; the CSS
			// forces the radius off in high-contrast themes, so we do the same.
			roundedSelection: options.get(EditorOption.roundedSelection) && !isHighContrast(this._context.theme.type),
			...this._highlightColors(),
			...this._cursorConfig(),
		};
	}

	private _whitespaceConfig(): Pick<EditorViewConfig, 'renderWhitespace' | 'whitespaceColor' | 'spaceMarker' | 'tabMarker' | 'stopRenderingLineAfter'> {
		const options = this._context.configuration.options;
		const fontInfo = options.get(EditorOption.fontInfo);
		const spaceMarker = Math.abs(fontInfo.wsmiddotWidth - fontInfo.spaceWidth)
			< Math.abs(fontInfo.middotWidth - fontInfo.spaceWidth)
			? '\u2e31'
			: '\u00b7';
		return {
			renderWhitespace: options.get(EditorOption.renderWhitespace),
			whitespaceColor: this._packColor(this._context.theme.getColor(editorWhitespaces), 0xe3e4e229),
			spaceMarker,
			tabMarker: fontInfo.canUseHalfwidthRightwardsArrow ? '\uffeb' : '\u2192',
			stopRenderingLineAfter: options.get(EditorOption.stopRenderingLineAfter),
		};
	}

	/**
	 * Resolve the caret list, style and geometry, mirroring VS Code's
	 * `ViewCursor`. Unless the DOM draws the caret
	 * ({@link EDITOR_VIEW_GPU_CAPABILITIES}`.cursor`), it is painted when the
	 * editor is focused and the blink phase is "on" (both host-owned — see
	 * {@link _updateBlinking}); on those frames every cursor position gets a
	 * caret, coloured with `editorCursor.foreground` (single) or the
	 * `editorMultiCursor.*` palette (which itself defaults to
	 * `editorCursor.foreground`).
	 */
	private _cursorConfig(): Pick<EditorViewConfig, 'cursors' | 'cursorStyle' | 'cursorWidth' | 'cursorHeight'> {
		const options = this._context.configuration.options;
		const fontInfo = options.get(EditorOption.fontInfo);
		const style = this._cursorStyle(options.get(EditorOption.effectiveCursorStyle));
		// Match `ViewCursor`: cap the line-caret width at a typical character and
		// let the renderer fall back to 2px when the option is 0 (the default).
		const cursorWidth = Math.min(options.get(EditorOption.cursorWidth), fontInfo.typicalHalfwidthCharacterWidth);
		const cursorHeight = options.get(EditorOption.cursorHeight);

		const shouldShow = EDITOR_VIEW_GPU_CAPABILITIES.cursor && this._focused && this._caretOn && this._cursorPositions.length > 0;
		if (!shouldShow) {
			return { cursors: [], cursorStyle: style, cursorWidth, cursorHeight };
		}

		const theme = this._context.theme;
		const single = this._cursorPositions.length === 1;
		const fallback = 0xaeafadff; // editorCursor.foreground (dark) default.
		const cursorFg = theme.getColor(editorCursorForeground);
		// Caret foreground: single cursor uses `.cursor` (editorCursor.foreground);
		// with multiple, index 0 is primary and the rest secondary (both default
		// to editorCursor.foreground via the color registry).
		const primaryFg = single ? cursorFg : (theme.getColor(editorMultiCursorPrimaryForeground) ?? cursorFg);
		const secondaryFg = theme.getColor(editorMultiCursorSecondaryForeground) ?? cursorFg;
		// Caret background = the color a block caret repaints the covered char in
		// (VS Code's theming participant: the `*.background` token, else the
		// foreground's `opposite()`).
		const bgFor = (fg: Color | undefined, bg: Color | undefined): number =>
			this._packColor(bg ?? fg?.opposite(), 0);
		const primaryBg = single
			? bgFor(cursorFg, theme.getColor(editorCursorBackground))
			: bgFor(primaryFg, theme.getColor(editorMultiCursorPrimaryBackground) ?? theme.getColor(editorCursorBackground));
		const secondaryBg = bgFor(secondaryFg, theme.getColor(editorMultiCursorSecondaryBackground) ?? theme.getColor(editorCursorBackground));
		const primary = this._packColor(primaryFg, fallback);
		const secondary = this._packColor(secondaryFg, fallback);
		const cursors: CursorInput[] = this._cursorPositions.map((p, i) => ({
			// View positions are 1-based; the renderer is 0-based.
			line: p.lineNumber - 1,
			column: p.column - 1,
			color: i === 0 ? primary : secondary,
			background: i === 0 ? primaryBg : secondaryBg,
		}));
		return { cursors, cursorStyle: style, cursorWidth, cursorHeight };
	}

	private _cursorStyle(style: TextEditorCursorStyle): CursorStyle {
		switch (style) {
			case TextEditorCursorStyle.Block: return 'block';
			case TextEditorCursorStyle.Underline: return 'underline';
			case TextEditorCursorStyle.LineThin: return 'line-thin';
			case TextEditorCursorStyle.BlockOutline: return 'block-outline';
			case TextEditorCursorStyle.UnderlineThin: return 'underline-thin';
			case TextEditorCursorStyle.Line:
			default: return 'line';
		}
	}

	/**
	 * (Re)configure caret blinking when the renderer draws the caret. The DOM
	 * `ViewCursors` uses CSS animations / a JS interval; since the GPU canvas is
	 * painted imperatively we mirror the flat-blink interval here (approximating
	 * smooth/phase/expand as flat blink) and repaint each toggle. The caret
	 * shows solid on focus / cursor moves, then blinks; it is hidden entirely
	 * when unfocused (matching `_getCursorBlinking`'s `Hidden` on blur).
	 */
	private _updateBlinking(): void {
		this._blinkTimer.cancel();
		this._caretOn = true;
		if (!this._focused || !EDITOR_VIEW_GPU_CAPABILITIES.cursor) {
			return;
		}
		const style = this._context.configuration.options.get(EditorOption.cursorBlinking);
		if (style === TextEditorCursorBlinkingStyle.Hidden) {
			this._caretOn = false;
			return;
		}
		if (style !== TextEditorCursorBlinkingStyle.Solid) {
			this._blinkTimer.cancelAndSet(() => {
				this._caretOn = !this._caretOn;
				this._present();
			}, EditorViewGpu.BLINK_INTERVAL, getWindow(this._editorRoot));
		}
	}

	/**
	 * Resolve the selection and current-line highlight state, mirroring
	 * `currentLineHighlight.ts` and `selections.css`:
	 * - Selection uses `editor.selectionBackground` when focused,
	 *   `editor.inactiveSelectionBackground` otherwise.
	 * - The current-line highlight is drawn in the **content** area when
	 *   `renderLineHighlight` is `line`/`all`, the selection is empty, and focus
	 *   permits; in the **gutter** when `gutter`/`all` and focus permits (not
	 *   gated on the selection). Its fill uses `editor.lineHighlightBackground`
	 *   (focused) / `editor.inactiveLineHighlightBackground` (unfocused); the 2px
	 *   `editor.lineHighlightBorder` box is drawn when there is no opaque fill or
	 *   the theme explicitly defines a border. `renderLineHighlightOnlyWhenFocus`
	 *   suppresses both when unfocused.
	 */
	private _highlightColors(): Pick<EditorViewConfig, 'selectionBackground' | 'lineHighlightBackground' | 'lineHighlightBorder' | 'lineHighlightWidth' | 'highlightLines' | 'highlightContent' | 'highlightMargin'> {
		const theme = this._context.theme;
		const options = this._context.configuration.options;
		const selection = this._focused
			? theme.getColor(editorSelectionBackground)
			: theme.getColor(editorInactiveSelection);

		const mode = options.get(EditorOption.renderLineHighlight);
		const focusOk = !options.get(EditorOption.renderLineHighlightOnlyWhenFocus) || this._focused;
		const highlightContent = (mode === 'line' || mode === 'all') && this._selectionIsEmpty && focusOk;
		const highlightMargin = (mode === 'gutter' || mode === 'all') && focusOk;

		const lineHighlight = theme.getColor(editorLineHighlight);
		const inactiveLineHighlight = theme.getColor(editorInactiveLineHighlight);
		// Focused prefers the active color and falls back to the inactive one
		// (the `.focused` background rule is only emitted when the active color
		// exists); unfocused always uses the inactive color.
		const fill = this._focused ? (lineHighlight ?? inactiveLineHighlight) : inactiveLineHighlight;
		const hasOpaqueFill = !!fill && !fill.isTransparent();

		let lineHighlightBorder = 0;
		if (!lineHighlight || lineHighlight.isTransparent() || theme.value.defines(editorLineHighlightBorder)) {
			lineHighlightBorder = this._packColor(theme.getColor(editorLineHighlightBorder), 0);
		}

		return {
			selectionBackground: this._packColor(selection, 0),
			lineHighlightBackground: hasOpaqueFill ? this._packColor(fill, 0) : 0,
			lineHighlightBorder,
			lineHighlightWidth: Math.max(
				this._context.viewModel.viewLayout.getScrollWidth(),
				options.get(EditorOption.layoutInfo).contentWidth,
			),
			highlightLines: this._cursorLines,
			highlightContent,
			highlightMargin,
		};
	}

	private _packColor(color: Color | undefined, fallback: number): number {
		if (!color) {
			return fallback;
		}
		const { r, g, b, a } = color.rgba;
		return (((r & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | (Math.round(a * 255) & 0xff)) >>> 0;
	}

	/** Build one view line's `{ text, tokens }` payload from the view model. */
	private _buildLine(viewLineNumber: number, colorMap: number[], defaultForeground: number): LineInput {
		const lineData = this._context.viewModel.getViewLineData(viewLineNumber);
		const textStyle = this._lineTextStyle(viewLineNumber);
		const line: LineInput = {
			text: lineData.content,
			tokens: this._buildTokens(lineData.tokens, colorMap, defaultForeground, textStyle),
			gutterLabel: this._getGutterLabel(viewLineNumber),
			continuesWithWrappedLine: lineData.continuesWithWrappedLine,
			fauxIndentLength: lineData.minColumn - 1,
		};
		this._builtTextStyle.set(line, textStyle.key);
		return line;
	}

	/**
	 * Paint that the high-contrast selection applies over a 1-based view
	 * line's tokens. Its `key` changes exactly when that paint does for
	 * unchanged line content, so lines already sent are compared without
	 * reading them.
	 */
	private _lineTextStyle(viewLineNumber: number): ILineTextStyle {
		const selected = this._selectedTextRanges(viewLineNumber);
		return {
			selected,
			key: selected.join(),
		};
	}

	/**
	 * High-contrast themes color selected text with `editor.selectionForeground`
	 * (`inline-selected-text` in `ViewLine`). Returns the selected 0-based
	 * `[start, end, ...]` column ranges of a 1-based view line, sorted and
	 * merged, or none when the theme doesn't recolor selected text.
	 */
	private _selectedTextRanges(viewLineNumber: number): number[] {
		if (!this._selectionForeground || this._selections.length === 0) {
			return [];
		}
		const line = viewLineNumber - 1;
		const minColumn = this._context.viewModel.getLineMinColumn(viewLineNumber) - 1;
		const maxColumn = this._context.viewModel.getLineMaxColumn(viewLineNumber) - 1;
		const ranges: [number, number][] = [];
		for (const selection of this._selections) {
			if (selection.endLine < line || selection.startLine > line) {
				continue;
			}
			const start = selection.startLine === line ? selection.startColumn : minColumn;
			const end = selection.endLine === line ? selection.endColumn : maxColumn;
			if (start < end) {
				ranges.push([start, end]);
			}
		}
		ranges.sort((a, b) => a[0] - b[0]);
		const merged: number[] = [];
		for (const [start, end] of ranges) {
			if (merged.length && start <= merged[merged.length - 1]) {
				merged[merged.length - 1] = Math.max(merged[merged.length - 1], end);
			} else {
				merged.push(start, end);
			}
		}
		return merged;
	}

	/** Packed `editor.selectionForeground` while a high-contrast theme recolors selected text. */
	private get _selectionForeground(): number | undefined {
		const theme = this._context.theme;
		const color = isHighContrast(theme.type) ? theme.getColor(editorSelectionForeground) : undefined;
		return color && !color.isTransparent() ? this._packColor(color, 0) : undefined;
	}

	/**
	 * The gutter (line-number) label for a 1-based **view** line, mirroring the
	 * DOM `LineNumbersOverlay._getLineRenderLineNumber`. Soft-wrap continuation
	 * rows (whose model position is not at column 1) return `''` so their gutter
	 * stays blank; otherwise the label follows the `lineNumbers` option
	 * (off/on/relative/interval/custom). The renderer draws exactly this string,
	 * so wrapped lines no longer number every continuation row.
	 */
	private _getGutterLabel(viewLineNumber: number): string {
		const converter = this._context.viewModel.coordinatesConverter;
		const modelPosition = converter.convertViewPositionToModelPosition(new Position(viewLineNumber, 1));
		if (modelPosition.column !== 1) {
			// A soft-wrap continuation row: no number.
			return '';
		}
		const modelLineNumber = modelPosition.lineNumber;
		const lineNumbers = this._context.configuration.options.get(EditorOption.lineNumbers);
		switch (lineNumbers.renderType) {
			case RenderLineNumbersType.Off:
				return '';
			case RenderLineNumbersType.Custom:
				return lineNumbers.renderFn ? lineNumbers.renderFn(modelLineNumber) : '';
			case RenderLineNumbersType.Relative: {
				const diff = Math.abs(this._primaryCursorModelLineNumber() - modelLineNumber);
				return diff === 0 ? String(modelLineNumber) : String(diff);
			}
			case RenderLineNumbersType.Interval: {
				if (this._primaryCursorModelLineNumber() === modelLineNumber) {
					return String(modelLineNumber);
				}
				if (modelLineNumber % 10 === 0) {
					return String(modelLineNumber);
				}
				return '';
			}
			case RenderLineNumbersType.On:
			default:
				return String(modelLineNumber);
		}
	}

	/** Model line number of the primary cursor (for relative/interval labels). */
	private _primaryCursorModelLineNumber(): number {
		const primary = this._cursorPositions[0];
		if (!primary) {
			return 1;
		}
		return this._context.viewModel.coordinatesConverter
			.convertViewPositionToModelPosition(new Position(primary.lineNumber, primary.column))
			.lineNumber;
	}

	/** 0-based view line carrying the primary cursor's (labelled) first wrapped row. */
	private _activeGutterLine(): number {
		return this._context.viewModel.coordinatesConverter
			.convertModelPositionToViewPosition(new Position(this._primaryCursorModelLineNumber(), 1))
			.lineNumber - 1;
	}

	/**
	 * The token color palette (indexed by `ColorId`, pre-packed) plus the default
	 * foreground, resolved once so a batch of line/token rebuilds shares them.
	 */
	private _tokenColorContext(): { colorMap: number[]; defaultForeground: number } {
		return {
			colorMap: this._buildTokenColorMap(),
			defaultForeground: this._packColor(this._context.theme.getColor(editorForeground), 0xd4d4d4ff),
		};
	}

	/**
	 * Convert VS Code's `IViewLineTokens` (offsets + `ColorId`/font-style
	 * metadata) into the renderer's packed-color {@link TokenInput}s. The
	 * renderer lays runs out consecutively and does not fill gaps, so the tokens
	 * must tile the whole line — which they always do, so we derive each token's
	 * start from the previous token's end offset.
	 *
	 * Offsets are UTF-16 code-unit offsets into the line content, matching the
	 * string handed to the renderer.
	 */
	private _buildTokens(tokens: IViewLineTokens, colorMap: number[], defaultForeground: number, textStyle?: ILineTextStyle): TokenInput[] {
		const count = tokens.getCount();
		let result: TokenInput[] = new Array(count);
		let start = 0;
		for (let i = 0; i < count; i++) {
			const end = tokens.getEndOffset(i);
			const p = tokens.getPresentation(i);
			result[i] = {
				startColumn: start,
				endColumn: end,
				foreground: colorMap[p.foreground] ?? defaultForeground,
				bold: p.bold,
				italic: p.italic,
				underline: p.underline,
				strikethrough: p.strikethrough,
			};
			start = end;
		}
		if (textStyle?.selected.length) {
			// Applied last: `inline-selected-text` is the DOM's last decoration class.
			const foreground = this._selectionForeground;
			if (foreground !== undefined) {
				const runs: ITextStyleRun[] = [];
				for (let i = 0; i < textStyle.selected.length; i += 2) {
					runs.push({ start: textStyle.selected[i], end: textStyle.selected[i + 1], style: { foreground } });
				}
				result = applyTextStyleRuns(result, runs);
			}
		}
		return result;
	}

	/**
	 * The theme's token color palette, indexed by `ColorId` and pre-packed into
	 * the renderer's `0xRRGGBBAA` format. Rebuilt on every refresh so theme and
	 * color-map changes are reflected (see `onThemeChanged`/`onTokensColorsChanged`).
	 */
	private _buildTokenColorMap(): number[] {
		const themeColorMap = TokenizationRegistry.getColorMap();
		if (!themeColorMap) {
			return [];
		}
		const result: number[] = new Array(themeColorMap.length);
		for (let i = 0; i < themeColorMap.length; i++) {
			result[i] = this._packColor(themeColorMap[i], 0xd4d4d4ff);
		}
		return result;
	}

	// --- incremental sync ----------------------------------------------------

	/**
	 * Record an edit with the planner, unless the renderer isn't ready yet — in
	 * which case escalate to a full reload so the first present captures everything.
	 */
	private _recordEdit(record: (sync: EditorViewModelSync) => void): void {
		if (!this._editorView) {
			this._sync.scheduleFullReload();
			return;
		}
		record(this._sync);
	}

	/** Apply a delta to the mirror; on failure fall back to a full reload. */
	private _applyDelta(delta: ModelDeltaInput): void {
		try {
			this._editorView!.applyDelta(delta);
			if (delta.type === 'replaceLines') {
				this._sentGutterLabels.splice(delta.start, delta.deleteCount, ...delta.insert.map(line => line.gutterLabel));
				this._sentTextStyle.splice(delta.start, delta.deleteCount, ...delta.insert.map(line => this._builtTextStyle.get(line) ?? ''));
			}
		} catch (err) {
			onUnexpectedError(err);
			this._sync.scheduleFullReload();
		}
	}

	/**
	 * Replace `deleteCount` mirrored lines at 0-based `start` with `insertCount`
	 * lines whose content is sent once the renderer needs it.
	 */
	private _spliceLines(start: number, deleteCount: number, insertCount: number): void {
		try {
			if (this._editorView!.spliceLines) {
				this._editorView!.spliceLines(start, deleteCount, insertCount);
			} else {
				// npm 0.0.1 inserts lines only with content.
				this._editorView!.applyDelta({ type: 'replaceLines', start, deleteCount, insert: Array.from({ length: insertCount }, () => ({ text: '' })) });
			}
		} catch (err) {
			onUnexpectedError(err);
			this._sync.scheduleFullReload();
			return;
		}
		spliceUnsent(this._sentGutterLabels, start, deleteCount, insertCount);
		spliceUnsent(this._sentTextStyle, start, deleteCount, insertCount);
	}

	/**
	 * Gutter labels depend on other lines (inserts/deletes renumber everything
	 * below), the primary cursor (relative/interval) and the `lineNumbers`
	 * option, and text styles on (high-contrast) selections, so
	 * a line's stored payload can go stale without its content changing. Send
	 * the renderer's lines that it does not have, or whose label or text style
	 * differs. Lines are compared again only after something they depend on
	 * changed ({@link _lineStateDirty}), or when they newly enter the range.
	 */
	private _syncLineDerivedState({ start, end }: { start: number; end: number }): void {
		const all = this._lineStateDirty
			// A custom label function can change without an event.
			|| this._context.configuration.options.get(EditorOption.lineNumbers).renderType === RenderLineNumbersType.Custom;
		const checked = this._lineStateChecked;
		this._sendLines(start, end, line => this._sentTextStyle[line] === undefined
			|| ((all || line < checked.start || line >= checked.end)
				&& (this._getGutterLabel(line + 1) !== this._sentGutterLabels[line]
					|| this._lineTextStyle(line + 1).key !== this._sentTextStyle[line])));
		this._lineStateDirty = false;
		this._lineStateChecked = { start, end };
	}

	/** Send the lines in 0-based `[start, end)` the renderer does not have, before it reads them. */
	private _fillLines(start: number, end: number): void {
		this._sendLines(Math.max(0, start), Math.min(end, this._sentTextStyle.length), line => this._sentTextStyle[line] === undefined);
	}

	/** Send the lines in 0-based `[start, end)` that `needsSend` picks, as one `replaceLines` per contiguous run. */
	private _sendLines(start: number, end: number, needsSend: (line: number) => boolean): void {
		let ctx: { colorMap: number[]; defaultForeground: number } | undefined;
		let runStart = -1;
		const flush = (runEnd: number) => {
			if (runStart < 0) {
				return;
			}
			ctx ??= this._tokenColorContext();
			const insert: LineInput[] = [];
			for (let line = runStart; line < runEnd; line++) {
				insert.push(this._buildLine(line + 1, ctx.colorMap, ctx.defaultForeground));
			}
			this._applyDelta({ type: 'replaceLines', start: runStart, deleteCount: insert.length, insert });
			runStart = -1;
		};
		for (let line = start; line < end; line++) {
			if (needsSend(line)) {
				if (runStart < 0) {
					runStart = line;
				}
			} else {
				flush(line);
			}
		}
		flush(end);
	}

	/**
	 * 0-based `[start, end)` view lines the renderer may paint in the `height`
	 * CSS px from vertical offset `top`: the lines there with overscan, which
	 * starts at the line above a partly scrolled-past view zone.
	 */
	private _rendererLineRange(top: number, height: number): { start: number; end: number } {
		const lineCount = this._context.viewModel.getLineCount();
		if (lineCount === 0) {
			return { start: 0, end: 0 };
		}
		const viewLayout = this._context.viewLayout;
		return {
			start: Math.max(0, viewLayout.getLineNumberAtVerticalOffset(top) - 4),
			end: Math.min(lineCount, viewLayout.getLineNumberAtVerticalOffset(top + height) + 3),
		};
	}

	/**
	 * Execute the planner's batch: keep the mirror's line count in step with the
	 * view model and forget the content of lines that changed. Lines are read,
	 * in the (now final) view-model state, only when the renderer needs them —
	 * as the DOM `ViewLines` reads line data lazily at render time.
	 */
	private _syncModel(): void {
		if (!this._sync.hasPendingChanges) {
			// Nothing to apply — cheap guard so the per-frame measurement getters
			// (which may each call this) don't churn through `takePlan` allocations.
			return;
		}
		const plan = this._sync.takePlan();
		if (plan.fullReload) {
			try {
				this._editorView!.setLines([]);
			} catch (err) {
				onUnexpectedError(err);
			}
			this._sentGutterLabels = [];
			this._sentTextStyle = [];
			this._lineStateDirty = true;
			this._spliceLines(0, 0, this._context.viewModel.getLineCount());
			return;
		}
		if (plan.structural.length) {
			// Inserted and deleted lines renumber the labels below them.
			this._lineStateDirty = true;
		}
		for (const splice of plan.structural) {
			this._spliceLines(splice.start, splice.deleteCount, splice.insertCount);
		}
		for (const line of plan.staleLines) {
			if (line >= 1 && line <= this._sentTextStyle.length) {
				this._sentTextStyle[line - 1] = undefined;
			}
		}
	}

	/** Horizontal ranges of each request's range on each visible line, measured in one renderer call. */
	public linesVisibleRangesForRanges(requests: readonly ILinesVisibleRangesRequest[]): (LineVisibleRanges[] | null)[] {
		if (!this._editorView || requests.length === 0) {
			return requests.map(() => null);
		}
		const { width, height, dpr } = this._measure();
		this._editorView.setConfig(this._buildConfig());
		this._syncModel();
		const scrollTop = this._context.viewLayout.getCurrentScrollTop();
		// The renderer measures only the lines it can paint.
		const lines = this._rendererLineRange(scrollTop, height);
		this._fillLines(lines.start, lines.end);
		this._editorView.setViewport({
			width,
			height,
			scrollTop,
			scrollLeft: this._context.viewLayout.getCurrentScrollLeft(),
			devicePixelRatio: dpr,
		});
		const ranges: DecorationRangeInput[] = requests.map(request => ({
			startLine: request.range.startLineNumber - 1,
			startColumn: request.range.startColumn - 1,
			endLine: request.range.endLineNumber - 1,
			endColumn: request.range.endColumn - 1,
			includeNewLines: request.includeNewLines,
		}));
		return this._editorView.decorationRanges(ranges).map(lines => lines.length === 0 ? null : lines.map(line => new LineVisibleRanges(
			false,
			line.line + 1,
			[new HorizontalRange(line.left, line.width)],
			line.continuesOnNextLine,
		)));
	}

	// --- rendering -----------------------------------------------------------

	private _present(): void {
		if (!this._editorView || this._disposed) {
			return;
		}

		const { width, height, dpr } = this._measure();
		const scrollTop = this._context.viewLayout.getCurrentScrollTop();
		const scrollLeft = this._context.viewLayout.getCurrentScrollLeft();
		const canvas = this._placeCanvas(scrollTop, height, dpr);
		const backingWidth = Math.max(1, Math.round(width * dpr));
		const backingHeight = Math.max(1, Math.round(canvas.height * dpr));

		this.canvas.setWidth(width);
		this.canvas.setHeight(canvas.height);
		if (this.canvas.domNode.width !== backingWidth || this.canvas.domNode.height !== backingHeight) {
			this._editorView.resize(backingWidth, backingHeight);
		}
		this._offsetCanvas(canvas.top, scrollTop, dpr);

		this._editorView.setConfig(this._buildConfig());
		const styleLines = this._rendererLineRange(canvas.top, canvas.height);
		this._syncModel();
		this._syncLineDerivedState(styleLines);
		this._editorView.setViewport({
			width,
			height: canvas.height,
			scrollTop: canvas.top,
			scrollLeft,
			devicePixelRatio: dpr,
		});

		let shown = false;
		try {
			shown = this._editorView.render();
		} catch (err) {
			onUnexpectedError(err);
		}
		this._presentedSize = { width, height, dpr };
		// Until a frame shows, scrolling draws, so the next frame shows.
		this._changedBesidesScrollTop = !shown;
	}

	/**
	 * Show a frame in which only the vertical scroll position changed, and the
	 * canvas keeps its place, by moving the canvas: what it draws did not
	 * change, so the frame neither draws nor presents. Returns `false` when
	 * the frame must be drawn.
	 */
	private _moveCanvas(): boolean {
		const placement = this._canvasPlacement;
		if (this._changedBesidesScrollTop || !this._editorView || this._disposed || !placement || placement.margin === 0) {
			return false;
		}
		const { width, height, dpr } = this._measure();
		const size = this._presentedSize;
		if (!size || size.width !== width || size.height !== height || size.dpr !== dpr) {
			return false;
		}
		// Where `_placeCanvas` keeps the canvas in place.
		const scrollTop = this._context.viewLayout.getCurrentScrollTop();
		const margin = this._canOverscan(dpr) ? Math.ceil(height / 4) : 0;
		if (margin !== placement.margin || scrollTop < placement.top || scrollTop > placement.top + 2 * margin) {
			return false;
		}
		this._offsetCanvas(placement.top, scrollTop, dpr);
		return true;
	}

	/** Move the canvas, which draws from `top`, to show the viewport at `scrollTop`. */
	private _offsetCanvas(top: number, scrollTop: number, dpr: number): void {
		// Whole device pixels, so the compositor moves the picture without
		// resampling it: the renderer's own anchors when it has them, as only
		// they match where it draws at a fractional ratio.
		const editorView = this._editorView;
		const anchor = (position: number) => editorView?.scrollAnchor?.(position, dpr) ?? Math.round(position * dpr);
		const offset = (anchor(top) - anchor(scrollTop)) / dpr;
		this.canvas.domNode.style.transform = offset === 0 ? '' : `translate3d(0px, ${offset}px, 0px)`;
	}

	/**
	 * Where the canvas draws for the viewport at `scrollTop`, `height` CSS px
	 * tall: its `top` in scroll space and its `height`. When it can scroll by
	 * compositor, it draws a margin above and below the viewport and keeps its
	 * place while the viewport stays within it; frames that only scroll then
	 * draw nothing new, and moving the canvas shows the margin. Once the
	 * viewport leaves it, it moves to leave the whole margin ahead of the
	 * scroll. See the README.
	 */
	private _placeCanvas(scrollTop: number, height: number, dpr: number): { top: number; height: number } {
		const margin = this._canOverscan(dpr) ? Math.ceil(height / 4) : 0;
		const previous = this._canvasPlacement;
		let top: number;
		if (previous && previous.margin === margin && scrollTop >= previous.top && scrollTop <= previous.top + 2 * margin) {
			top = previous.top;
		} else if (!previous || previous.margin !== margin) {
			top = scrollTop - margin;
		} else if (scrollTop > previous.top) {
			top = scrollTop;
		} else {
			top = scrollTop - 2 * margin;
		}
		this._canvasPlacement = { top: margin > 0 ? Math.max(0, Math.round(top)) : scrollTop, margin };
		return { top: this._canvasPlacement.top, height: height + 2 * margin };
	}

	/**
	 * Whether a canvas at device pixel ratio `dpr`, the editor's or the
	 * minimap's, scrolls by compositor (`editor.experimental.editorViewOverscan`).
	 */
	private _canOverscan(dpr: number): boolean {
		const editorView = this._editorView;
		// Only a renderer that skips unchanged frames gains from the margin. At a
		// fractional ratio, only one that draws on the document's device pixels
		// (`scrollAnchor`) shows, moved, what it would draw.
		return this._overscan && this._incrementalRendering && (Number.isInteger(dpr) || !!editorView?.scrollAnchor)
			&& !!editorView?.supportsSurfaces && !!editorView.presentNextFrame;
	}

	public prepareRender(ctx: RenderingContext): void {
		// Nothing to prepare; the external renderer owns its own scene.
	}

	public render(ctx: RestrictedRenderingContext): void {
		if (!this._moveCanvas()) {
			this._present();
		}
	}

	// --- horizontal metrics (IEditorViewLineWidthProvider) -------------------
	//
	// `ViewLines.renderTextInEditorView` runs in the render phase *before* our
	// `render()` → `_present()`, so ensure the model mirror is current before
	// measuring. `_syncModel` reads the final view-model state and is idempotent
	// (a subsequent `_present` in the same frame takes an empty plan), so calling
	// it here does not double-apply edits.

	/**
	 * Max full-line width (CSS px) across the inclusive 1-based line range, from
	 * the renderer's real glyph advances, or `undefined` if it isn't ready.
	 */
	public getMaxLineWidth(startLineNumber: number, endLineNumber: number): number | undefined {
		if (!this._editorView) {
			return undefined;
		}
		this._syncModel();
		const lineCount = this._context.viewModel.getLineCount();
		const start = Math.max(0, Math.min(startLineNumber, lineCount) - 1);
		const end = Math.max(0, Math.min(endLineNumber, lineCount) - 1);
		this._fillLines(start, end + 1);
		return this._editorView.maxLineWidth(start, end);
	}

	/**
	 * Horizontal offset (CSS px, from line start) of a 1-based `column` on a
	 * 1-based `lineNumber`, from the renderer's real glyph advances, or
	 * `undefined` if it isn't ready. View coordinates are 1-based; the renderer
	 * is 0-based (matching the cursor/selection conversions elsewhere here).
	 */
	public getColumnOffset(lineNumber: number, column: number): number | undefined {
		if (!this._editorView || lineNumber < 1 || lineNumber > this._context.viewModel.getLineCount()) {
			return undefined;
		}
		this._syncModel();
		this._fillLines(lineNumber - 1, lineNumber);
		return this._editorView.columnOffset(lineNumber - 1, column - 1);
	}

	public getLineWidth(lineNumber: number): number | undefined {
		return this.getColumnOffset(lineNumber, this._context.viewModel.getLineMaxColumn(lineNumber));
	}

	public visibleRangeForPosition(position: Position): HorizontalPosition | null {
		const offset = this.getColumnOffset(position.lineNumber, position.column);
		return offset === undefined ? null : new HorizontalPosition(false, offset);
	}

	/** Horizontal ranges of `range` on each visible line. */
	public linesVisibleRangesForRange(range: Range, includeNewLines: boolean): LineVisibleRanges[] | null {
		return this.linesVisibleRangesForRanges([{ range, includeNewLines }])[0];
	}

	public getPositionAtCoordinate(lineNumber: number, mouseContentHorizontalOffset: number): Position | undefined {
		if (!this._editorView || lineNumber < 1 || lineNumber > this._context.viewModel.getLineCount()) {
			return undefined;
		}
		this._syncModel();
		this._fillLines(lineNumber - 1, lineNumber);
		const column = this._editorView.columnAtOffset(lineNumber - 1, mouseContentHorizontalOffset);
		return column === undefined ? undefined : new Position(lineNumber, column + 1);
	}

	// --- events --------------------------------------------------------------

	public override handleEvents(events: viewEvents.ViewEvent[]): void {
		for (const e of events) {
			if (e.type !== ViewEventType.ViewScrollChanged || e.scrollLeftChanged || e.scrollWidthChanged || e.scrollHeightChanged) {
				this._changedBesidesScrollTop = true;
				break;
			}
		}
		super.handleEvents(events);
	}

	public override forceShouldRender(): void {
		// A forced frame draws, and presents if asked to (`presentNextFrame`).
		this._changedBesidesScrollTop = true;
		super.forceShouldRender();
	}

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		// Font/layout/tab changes don't alter the model's text or tokens; the
		// fresh config is pushed on every present, so just request a repaint.
		// (Wrapping-column changes surface separately via `onLineMappingChanged`.)
		// The caret style/blink options may have changed, so re-arm blinking.
		this._updateBlinking();
		// `lineNumbers` decides the gutter labels.
		this._lineStateDirty = true;
		return true;
	}
	public override onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		// Mirror the full selection set so the renderer can paint it, and derive
		// the current-line highlight state (cursor lines + whether the selection
		// is empty). The active line number is derived from the primary cursor.
		// View selections are 1-based (line, column); the renderer is 0-based.
		const selections: SelectionInput[] = e.selections.map(s => ({
			startLine: s.startLineNumber - 1,
			startColumn: s.startColumn - 1,
			endLine: s.endLineNumber - 1,
			endColumn: s.endColumn - 1,
		}));
		// Distinct 0-based cursor (position) lines — VS Code highlights each one.
		const cursorLines = Array.from(new Set(e.selections.map(s => s.getPosition().lineNumber - 1))).sort((a, b) => a - b);
		this._selections = selections;
		this._cursorLines = cursorLines;
		this._selectionIsEmpty = e.selections.every(s => s.isEmpty());
		// Caret positions (1-based) for the renderer, primary first.
		this._cursorPositions = e.selections.map(s => {
			const p = s.getPosition();
			return { lineNumber: p.lineNumber, column: p.column };
		});
		// A cursor move re-shows the caret solid, then resumes blinking (so it
		// doesn't flicker while typing) — matching `ViewCursors`.
		this._updateBlinking();
		// Relative and interval labels follow the primary cursor, and
		// high-contrast themes color selected text.
		this._lineStateDirty = true;
		return true;
	}
	public override onFocusChanged(e: viewEvents.ViewFocusChangedEvent): boolean {
		if (this._focused === e.isFocused) {
			return false;
		}
		// Focus flips selection / current-line highlight to their active colors,
		// and gates the caret (hidden when unfocused).
		this._focused = e.isFocused;
		this._updateBlinking();
		return true;
	}
	public override onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		// The whole model was replaced (e.g. a different document).
		this._sync.scheduleFullReload();
		return true;
	}
	public override onLineMappingChanged(e: viewEvents.ViewLineMappingChangedEvent): boolean {
		// View↔model line mapping changed (word wrap / folding): view lines are
		// remapped wholesale, so incremental tracking no longer applies.
		this._sync.scheduleFullReload();
		return true;
	}
	public override onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
		this._recordEdit(sync => sync.onLinesChanged(e.fromLineNumber, e.count));
		return true;
	}
	public override onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		this._recordEdit(sync => sync.onLinesDeleted(e.fromLineNumber, e.toLineNumber));
		return true;
	}
	public override onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		this._recordEdit(sync => sync.onLinesInserted(e.fromLineNumber, e.toLineNumber));
		return true;
	}
	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return true;
	}
	public override onThemeChanged(e: viewEvents.ViewThemeChangedEvent): boolean {
		// Base colors are re-pushed via config every present, but token foreground
		// colors are baked into per-line tokens, so rebuild them all.
		this._sync.scheduleFullReload();
		this._lineStateDirty = true;
		return true;
	}
	public override onTokensChanged(e: viewEvents.ViewTokensChangedEvent): boolean {
		// Background tokenization (the hot path): refresh only the reported lines'
		// tokens, not the whole document.
		this._recordEdit(sync => sync.onTokensChanged(e.ranges, this._context.viewModel.getLineCount()));
		return true;
	}
	public override onTokensColorsChanged(e: viewEvents.ViewTokensColorsChangedEvent): boolean {
		// The theme's token color map changed; every line's token colors are stale.
		this._sync.scheduleFullReload();
		return true;
	}
	public override onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return true;
	}

	public override dispose(): void {
		this._disposed = true;
		this._blinkTimer.dispose();
		this._editorView?.dispose();
		this._editorView = undefined;
		this._ready = false;
		this.canvas.domNode.remove();
		super.dispose();
	}
}
