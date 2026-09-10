/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../base/browser/dom.js';
import { Sequencer } from '../../../../base/common/async.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import type { IMarker as IXtermMarker, Terminal as RawXtermTerminal } from '@xterm/xterm';
import type { ITerminalCommand } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalService, type IDetachedTerminalInstance, type IDetachedXtermTerminal } from './terminal.js';
import { DetachedProcessInfo } from './detachedTerminal.js';
import { XtermTerminal } from './xterm/xtermTerminal.js';
import { TERMINAL_BACKGROUND_COLOR } from '../common/terminalColorRegistry.js';
import { PANEL_BACKGROUND } from '../../../common/theme.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { Color } from '../../../../base/common/color.js';
import type { IChatTerminalToolInvocationData } from '../../chat/common/chatService/chatService.js';
import type { IColorTheme } from '../../../../platform/theme/common/themeService.js';
import { ICurrentPartialCommand } from '../../../../platform/terminal/common/capabilities/commandDetection/terminalCommand.js';
import type { ITerminalFont } from '../common/terminal.js';

function getChatTerminalBackgroundColor(theme: IColorTheme, contextKeyService: IContextKeyService, storedBackground?: string): Color | undefined {
	if (storedBackground) {
		const color = Color.fromHex(storedBackground);
		if (color) {
			return color;
		}
	}

	const terminalBackground = theme.getColor(TERMINAL_BACKGROUND_COLOR);
	if (terminalBackground) {
		return terminalBackground;
	}

	const isInEditor = ChatContextKeys.inChatEditor.getValue(contextKeyService);
	return theme.getColor(isInEditor ? editorBackground : PANEL_BACKGROUND);
}

/**
 * Computes the maximum column width of content in a terminal buffer.
 * Iterates through each line and finds the rightmost non-empty cell.
 *
 * @param buffer The buffer to measure
 * @param cols The terminal column count (used to clamp line length)
 * @returns The maximum column width (number of columns used), or 0 if all lines are empty
 */
export function computeMaxBufferColumnWidth(buffer: { readonly length: number; getLine(y: number): { readonly length: number; getCell(x: number): { getChars(): string } | undefined } | undefined }, cols: number): number {
	let maxWidth = 0;

	for (let y = 0; y < buffer.length; y++) {
		const line = buffer.getLine(y);
		if (!line) {
			continue;
		}

		// Find the last non-empty cell by iterating backwards
		const lineLength = Math.min(line.length, cols);
		for (let x = lineLength - 1; x >= 0; x--) {
			if (line.getCell(x)?.getChars()) {
				maxWidth = Math.max(maxWidth, x + 1);
				break;
			}
		}
	}

	return maxWidth;
}

/**
 * Checks if two VT strings match around a boundary where we would slice.
 * This is an efficient O(1) check that verifies a small window of characters
 * before the slice point to detect if the VT sequences have diverged (common on Windows).
 *
 * @param newVT The new VT text to compare.
 * @param oldVT The old VT text to compare against.
 * @param slicePoint The point where we would slice. Must be <= both string lengths.
 * @param windowSize The number of characters before slicePoint to check (default 50).
 * @returns True if the boundary matches, false if VT sequences have diverged.
 */
export function vtBoundaryMatches(newVT: string, oldVT: string, slicePoint: number, windowSize: number = 50): boolean {
	const start = Math.max(0, slicePoint - windowSize);
	const end = slicePoint;
	for (let i = start; i < end; i++) {
		if (newVT.charCodeAt(i) !== oldVT.charCodeAt(i)) {
			return false;
		}
	}
	return true;
}

export interface IDetachedTerminalCommandMirrorRenderResult {
	lineCount?: number;
	maxColumnWidth?: number;
}

interface IDetachedTerminalCommandMirror {
	attach(container: HTMLElement): Promise<void>;
	renderCommand(): Promise<IDetachedTerminalCommandMirrorRenderResult | undefined>;
	layout(widthPx: number): Promise<IDetachedTerminalCommandMirrorRenderResult | undefined>;
	getRowHeightPx(): number | undefined;
	onDidUpdate: Event<IDetachedTerminalCommandMirrorRenderResult>;
	onDidInput: Event<string>;
	onDidChangeRowHeight: Event<void>;
}

const enum ChatTerminalMirrorMetrics {
	MirrorRowCount = 10,
	MirrorColCountFallback = 80,
	/**
	 * Pre-attach estimate of the horizontal space the mirror content cannot use: the gutter
	 * every workbench xterm gets via `.monaco-workbench .xterm { padding-left: 20px }`
	 * (terminal.css). Once attached, the real value is measured from computed styles.
	 */
	MirrorHorizontalPaddingPx = 20,
	/**
	 * Maximum number of lines for which we compute the max column width.
	 * Computing max column width iterates the entire buffer, so we skip it
	 * for large outputs to avoid performance issues.
	 */
	MaxLinesForColumnWidthComputation = 100
}

/**
 * Computes the number of columns a chat terminal mirror should use to fill the available width
 * of its container, using the same cell math as {@link getXtermScaledDimensions}.
 *
 * @param availableWidthPx The container width in CSS pixels.
 * @param font The terminal font with measured char metrics.
 * @param devicePixelRatio The window's device pixel ratio.
 * @param horizontalChromePx Horizontal space the DOM chrome takes from the container width,
 * measured from computed styles when available; defaults to the static estimate.
 * @returns The column count, or the default fallback when the width or font is unmeasurable.
 */
export function computeChatTerminalMirrorCols(availableWidthPx: number, font: ITerminalFont, devicePixelRatio: number, horizontalChromePx: number = ChatTerminalMirrorMetrics.MirrorHorizontalPaddingPx): number {
	if (!isFinite(availableWidthPx) || availableWidthPx <= 0 || !font.charWidth) {
		return ChatTerminalMirrorMetrics.MirrorColCountFallback;
	}
	const dpr = isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
	const scaledWidthAvailable = (availableWidthPx - horizontalChromePx) * dpr;
	const scaledCharWidth = font.charWidth * dpr + font.letterSpacing;
	return Math.max(Math.floor(scaledWidthAvailable / scaledCharWidth), 1);
}

function getMirrorRaw(detached: IDetachedTerminalInstance): RawXtermTerminal {
	return (detached.xterm as IDetachedXtermTerminal & { raw: RawXtermTerminal }).raw;
}

/**
 * Enables cursor line reflow on a mirror's terminal. The mirror is a readonly output preview
 * with no prompt line to protect, so resize reflow should re-wrap the cursor line like any
 * other line (xterm skips it by default).
 */
function enableCursorLineReflow(detached: IDetachedTerminalInstance): void {
	getMirrorRaw(detached).options.reflowCursorLine = true;
}

/**
 * Gets the device pixel ratio of the window the mirror's terminal is rendered in, so cell
 * math stays correct in auxiliary windows on monitors with different scaling.
 */
function getMirrorDevicePixelRatio(detached: IDetachedTerminalInstance): number {
	return getWindow(getMirrorRaw(detached).element).devicePixelRatio;
}

/**
 * Measures the horizontal space the mirror's DOM chrome takes from the container width by
 * reading the xterm element's computed padding, the same way the panel terminal does. xterm's
 * own scrollbar is hidden in the chat preview, so unlike the panel terminal it takes no
 * space. Returns undefined before the terminal is attached.
 */
function measureMirrorHorizontalChrome(detached: IDetachedTerminalInstance): number | undefined {
	const element = getMirrorRaw(detached).element;
	if (!element) {
		return undefined;
	}
	const style = getWindow(element).getComputedStyle(element);
	const chrome = parseInt(style.paddingLeft) + parseInt(style.paddingRight);
	return isNaN(chrome) ? undefined : Math.max(chrome, 0);
}

/**
 * Computes the height in CSS pixels of one rendered row from the mirror's font. Once the
 * renderer has initialized, {@link XtermTerminal.getFont} reports its actual cell metrics,
 * so the value matches what xterm paints; before that it is the configuration-based
 * estimate. Returns undefined while the terminal or its metrics are unavailable.
 */
function getMirrorRowHeightPx(detached: IDetachedTerminalInstance | undefined): number | undefined {
	const font = detached?.xterm.getFont();
	if (!font?.charHeight || font.charHeight <= 0) {
		return undefined;
	}
	const lineHeight = font.lineHeight > 0 ? font.lineHeight : 1;
	return font.charHeight * lineHeight;
}

/**
 * Computes the line count for terminal output between start and end lines.
 * The end line is exclusive (points to the line after output ends).
 */
function computeOutputLineCount(startLine: number, endLine: number): number {
	return Math.max(endLine - startLine, 0);
}

/**
 * Computes the number of rendered rows occupied by a terminal snapshot.
 * The cursor line is included when it contains content and excluded when it
 * is the empty line after a trailing newline.
 */
export function computeSnapshotLineCount(buffer: {
	readonly baseY: number;
	readonly cursorY: number;
	getLine(y: number): { translateToString(trimRight?: boolean): string } | undefined;
}, lineCount?: number): number {
	if (lineCount !== undefined) {
		return lineCount;
	}

	const cursorLineIndex = buffer.baseY + buffer.cursorY;
	const hasCursorLineContent = !!buffer.getLine(cursorLineIndex)?.translateToString(true);
	const endLine = cursorLineIndex + (hasCursorLineContent ? 1 : 0);
	return computeOutputLineCount(0, endLine);
}

export async function getCommandOutputSnapshot(
	xtermTerminal: XtermTerminal,
	command: ITerminalCommand,
	log?: (reason: 'fallback' | 'primary', error: unknown) => void
): Promise<{ text: string; lineCount: number } | undefined> {
	const executedMarker = command.executedMarker;
	const endMarker = command.endMarker;

	if (!endMarker || endMarker.isDisposed) {
		return undefined;
	}

	if (!executedMarker || executedMarker.isDisposed) {
		const raw = xtermTerminal.raw;
		const buffer = raw.buffer.active;
		const offsets = [
			-(buffer.baseY + buffer.cursorY),
			-buffer.baseY,
			0
		];
		let startMarker: IXtermMarker | undefined;
		for (const offset of offsets) {
			startMarker = raw.registerMarker(offset);
			if (startMarker) {
				break;
			}
		}
		if (!startMarker || startMarker.isDisposed) {
			return { text: '', lineCount: 0 };
		}
		const startLine = startMarker.line;
		let text: string | undefined;
		try {
			text = await xtermTerminal.getRangeAsVT(startMarker, endMarker, true);
		} catch (error) {
			log?.('fallback', error);
			return undefined;
		} finally {
			startMarker.dispose();
		}
		if (!text) {
			return { text: '', lineCount: 0 };
		}
		const endLine = endMarker.line;
		const lineCount = computeOutputLineCount(startLine, endLine);
		return { text, lineCount };
	}

	const startLine = executedMarker.line;
	const endLine = endMarker.line;
	const lineCount = computeOutputLineCount(startLine, endLine);

	let text: string | undefined;
	try {
		text = await xtermTerminal.getRangeAsVT(executedMarker, endMarker, true);
	} catch (error) {
		log?.('primary', error);
		return undefined;
	}
	if (!text) {
		return { text: '', lineCount: 0 };
	}

	return { text, lineCount };
}

/**
 * Mirrors a terminal command's output into a detached terminal instance.
 * Used in the chat terminal tool progress part to show command output.
 */
export class DetachedTerminalCommandMirror extends Disposable implements IDetachedTerminalCommandMirror {
	// Streaming approach
	// ------------------
	// The mirror maintains a VT snapshot of the command's output and incrementally updates a
	// detached xterm instance instead of re-rendering the whole range on every change.
	//
	// - A *dirty range* is the set of buffer rows that may have diverged between the source
	//   terminal and the detached mirror. It is tracked by:
	//     - `_lastUpToDateCursorY`: the last cursor row in the source buffer for which the
	//       mirror is known to be fully up to date.
	//     - `_lowestDirtyCursorY`: the smallest (top-most) cursor row that has been affected
	//       by new data or cursor movement since the last flush.
	//
	// - When new data arrives or the cursor moves, xterm events and `onData` callbacks are
	//   used to update `_lowestDirtyCursorY`. This effectively marks everything from that row
	//   downwards as potentially stale.
	//
	// - If the dirty range starts exactly at the previous end of the mirrored output (that is,
	//   `_lowestDirtyCursorY` is at or after `_lastUpToDateCursorY` and no earlier rows have
	//   changed), the mirror can *append* VT that corresponds only to the new rows.
	//
	// - If the cursor moves or data is written above the previously mirrored end (for example,
	//   when the command rewrites lines, uses carriage returns, or modifies earlier rows),
	//   `_lowestDirtyCursorY` will be before `_lastUpToDateCursorY`. In that case the mirror
	//   cannot safely append and instead falls back to taking a fresh VT snapshot of the
	//   entire command range and *rewrites* the detached terminal content.

	private _detachedTerminal: IDetachedTerminalInstance | undefined;
	private _detachedTerminalPromise: Promise<IDetachedTerminalInstance> | undefined;
	private _attachedContainer: HTMLElement | undefined;
	private readonly _streamingDisposables = this._register(new DisposableStore());
	private readonly _onDidUpdateEmitter = this._register(new Emitter<IDetachedTerminalCommandMirrorRenderResult>());
	public readonly onDidUpdate: Event<IDetachedTerminalCommandMirrorRenderResult> = this._onDidUpdateEmitter.event;
	private readonly _onDidInputEmitter = this._register(new Emitter<string>());
	public readonly onDidInput: Event<string> = this._onDidInputEmitter.event;
	private readonly _onDidChangeRowHeightEmitter = this._register(new Emitter<void>());
	public readonly onDidChangeRowHeight: Event<void> = this._onDidChangeRowHeightEmitter.event;
	private _renderListenerInstalled = false;
	private _lastObservedRowHeight: number | undefined;

	private _lastVT = '';
	private _lineCount = 0;
	private _maxColumnWidth = 0;
	private _lastUpToDateCursorY: number | undefined;
	private _lowestDirtyCursorY: number | undefined;
	private _flushPromise: Promise<void> | undefined;
	private _dirtyScheduled = false;
	private _isStreaming = false;
	private _sourceRaw: RawXtermTerminal | undefined;

	constructor(
		private readonly _xtermTerminal: XtermTerminal,
		private readonly _command: ITerminalCommand,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		super();
		this._register(toDisposable(() => {
			this._stopStreaming();
		}));
	}

	async attach(container: HTMLElement): Promise<void> {
		if (this._store.isDisposed) {
			return;
		}
		let terminal: IDetachedTerminalInstance;
		try {
			terminal = await this._getOrCreateTerminal();
		} catch (error) {
			if (error instanceof CancellationError) {
				return;
			}
			throw error;
		}
		if (this._store.isDisposed) {
			return;
		}
		if (this._attachedContainer !== container) {
			container.classList.add('chat-terminal-output-terminal');
			terminal.attachToElement(container, { enableGpu: false });
			this._attachedContainer = container;
		}
		this._installFirstRenderListener(terminal);
	}

	/**
	 * The height in CSS pixels of one rendered row of this mirror, or undefined until the
	 * detached terminal exists. Reflects the renderer's actual cell metrics once it has
	 * rendered, so box-height math matches what xterm paints.
	 */
	getRowHeightPx(): number | undefined {
		if (this._store.isDisposed) {
			return undefined;
		}
		return getMirrorRowHeightPx(this._detachedTerminal);
	}

	private _installFirstRenderListener(detached: IDetachedTerminalInstance): void {
		if (this._renderListenerInstalled) {
			return;
		}
		this._renderListenerInstalled = true;
		// Renders can change the cell metrics: the first render replaces the measured font
		// estimate with the renderer's actual dimensions, and later ones can reflect DPR
		// changes (e.g. the window moving to a differently scaled monitor). Only the
		// changes are announced, so the per-frame cost is one number comparison.
		this._register(getMirrorRaw(detached).onRender(() => this._notifyRowHeightIfChanged()));
	}

	private _notifyRowHeightIfChanged(): void {
		const rowHeight = this.getRowHeightPx();
		if (rowHeight !== undefined && rowHeight !== this._lastObservedRowHeight) {
			this._lastObservedRowHeight = rowHeight;
			this._onDidChangeRowHeightEmitter.fire();
		}
	}

	async renderCommand(): Promise<IDetachedTerminalCommandMirrorRenderResult | undefined> {
		if (this._store.isDisposed) {
			return undefined;
		}
		let detached: IDetachedTerminalInstance;
		try {
			detached = await this._getOrCreateTerminal();
		} catch (error) {
			if (error instanceof CancellationError) {
				return undefined;
			}
			throw error;
		}
		if (this._store.isDisposed) {
			return undefined;
		}
		let vt;
		try {
			vt = await this._getCommandOutputAsVT(this._xtermTerminal);
		} catch {
			// ignore and treat as no output
		}
		if (!vt) {
			return undefined;
		}
		if (this._store.isDisposed) {
			return undefined;
		}

		await new Promise<void>(resolve => {
			// Only append if the boundary around the slice point matches; otherwise rewrite.
			// This is an efficient constant-time check (checking up to 50 characters) instead of comparing the entire prefix.
			// On Windows, VT sequences can differ even for equivalent content, causing corruption
			// if we blindly append.
			const canAppend = !!this._lastVT && vt.text.length >= this._lastVT.length && this._vtBoundaryMatches(vt.text, this._lastVT.length);
			if (!canAppend) {
				// Use \x1bc (RIS) + new content in one write to avoid a blank frame
				const payload = this._lastVT ? `\x1bc${vt.text}` : vt.text;
				if (payload) {
					detached.xterm.write(payload, resolve);
				} else {
					resolve();
				}
			} else {
				const appended = vt.text.slice(this._lastVT.length);
				if (appended) {
					detached.xterm.write(appended, resolve);
				} else {
					resolve();
				}
			}
		});

		this._lastVT = vt.text;

		const sourceRaw = this._xtermTerminal.raw;
		if (sourceRaw) {
			this._sourceRaw = sourceRaw;
			this._lastUpToDateCursorY = this._getAbsoluteCursorY(sourceRaw);
			if (!this._isStreaming && (!this._command.endMarker || this._command.endMarker.isDisposed)) {
				this._startStreaming(sourceRaw);
			}
		}

		this._lineCount = this._getRenderedLineCount();
		// Only compute max column width after the command finishes and for small outputs
		const commandFinished = this._command.endMarker && !this._command.endMarker.isDisposed;
		if (commandFinished && this._lineCount <= ChatTerminalMirrorMetrics.MaxLinesForColumnWidthComputation) {
			this._maxColumnWidth = this._computeMaxColumnWidth();
		}

		return { lineCount: this._lineCount, maxColumnWidth: this._maxColumnWidth };
	}

	/**
	 * Resizes the mirror to fill the given width, relying on xterm's native resize reflow to
	 * re-wrap soft-wrapped lines. No-op when the resulting cols are unchanged. The column
	 * count derives from the mirror's own xterm font metrics, which reflect the actual
	 * renderer cell size rather than a configuration-based estimate.
	 */
	async layout(widthPx: number): Promise<IDetachedTerminalCommandMirrorRenderResult | undefined> {
		if (this._store.isDisposed || widthPx <= 0) {
			return undefined;
		}
		let detached: IDetachedTerminalInstance;
		try {
			detached = await this._getOrCreateTerminal();
		} catch (error) {
			if (error instanceof CancellationError) {
				return undefined;
			}
			throw error;
		}
		if (this._store.isDisposed) {
			return undefined;
		}
		const cols = computeChatTerminalMirrorCols(widthPx, detached.xterm.getFont(), getMirrorDevicePixelRatio(detached), measureMirrorHorizontalChrome(detached));
		if (detached.xterm.cols === cols) {
			return undefined;
		}
		// Wait for any in-flight streaming flush so the resize does not interleave with it
		await this._flushPromise;
		if (this._store.isDisposed || detached.xterm.cols === cols) {
			return undefined;
		}
		// Native resize reflow re-wraps the buffer in place; rewriting the cached VT here
		// instead would flash a cleared frame on every resize
		detached.xterm.resize(cols, ChatTerminalMirrorMetrics.MirrorRowCount);
		if (!this._lastVT) {
			return undefined;
		}
		this._lineCount = this._getRenderedLineCount();
		const commandFinished = this._command.endMarker && !this._command.endMarker.isDisposed;
		if (commandFinished && this._lineCount <= ChatTerminalMirrorMetrics.MaxLinesForColumnWidthComputation) {
			this._maxColumnWidth = this._computeMaxColumnWidth();
		}
		return { lineCount: this._lineCount, maxColumnWidth: this._maxColumnWidth };
	}

	private async _getCommandOutputAsVT(source: XtermTerminal): Promise<{ text: string } | undefined> {
		if (this._store.isDisposed) {
			return undefined;
		}
		const executedMarker = this._command.executedMarker ?? (this._command as unknown as ICurrentPartialCommand).commandExecutedMarker;
		if (!executedMarker) {
			return undefined;
		}

		const endMarker = this._command.endMarker;
		const text = await source.getRangeAsVT(executedMarker, endMarker, endMarker?.line !== executedMarker.line);
		if (this._store.isDisposed) {
			return undefined;
		}
		if (!text) {
			return { text: '' };
		}

		return { text };
	}

	private _getRenderedLineCount(): number {
		// Prefer counting the mirror's own rendered rows: they reflect the mirror's column
		// count, which can differ from the source terminal's after a width layout
		const detachedBuffer = this._detachedTerminal?.xterm.buffer.active;
		if (detachedBuffer) {
			return computeSnapshotLineCount(detachedBuffer);
		}

		// Calculate line count from the command's markers when available
		const endMarker = this._command.endMarker;
		if (this._command.executedMarker && endMarker && !endMarker.isDisposed) {
			const startLine = this._command.executedMarker.line;
			const endLine = endMarker.line;
			return computeOutputLineCount(startLine, endLine);
		}

		// During streaming (no end marker), calculate from the source terminal buffer
		const executedMarker = this._command.executedMarker ?? (this._command as unknown as ICurrentPartialCommand).commandExecutedMarker;
		if (executedMarker && this._sourceRaw) {
			const buffer = this._sourceRaw.buffer.active;
			const currentLine = buffer.baseY + buffer.cursorY;
			return computeOutputLineCount(executedMarker.line, currentLine);
		}

		return this._lineCount;
	}

	private _computeMaxColumnWidth(): number {
		const detached = this._detachedTerminal;
		if (!detached) {
			return 0;
		}
		return computeMaxBufferColumnWidth(detached.xterm.buffer.active, detached.xterm.cols);
	}

	private async _getOrCreateTerminal(): Promise<IDetachedTerminalInstance> {
		if (this._detachedTerminal) {
			return this._detachedTerminal;
		}
		if (this._detachedTerminalPromise) {
			return this._detachedTerminalPromise;
		}
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		const createPromise = (async () => {
			const colorProvider = {
				getBackgroundColor: (theme: IColorTheme) => getChatTerminalBackgroundColor(theme, this._contextKeyService)
			};
			const processInfo = new DetachedProcessInfo({ initialCwd: '' });
			const detached = await this._terminalService.createDetachedTerminal({
				cols: this._xtermTerminal.raw.cols ?? ChatTerminalMirrorMetrics.MirrorColCountFallback,
				rows: ChatTerminalMirrorMetrics.MirrorRowCount,
				readonly: false,
				processInfo,
				disableOverviewRuler: true,
				colorProvider
			});
			if (this._store.isDisposed) {
				processInfo.dispose();
				detached.dispose();
				throw new CancellationError();
			}
			enableCursorLineReflow(detached);
			this._detachedTerminal = detached;
			this._register(processInfo);
			this._register(detached);

			// Forward input from the mirror terminal to the source terminal
			this._register(detached.onData(data => this._onDidInputEmitter.fire(data)));
			return detached;
		})();
		this._detachedTerminalPromise = createPromise;
		return createPromise;
	}

	private _startStreaming(raw: RawXtermTerminal): void {
		if (this._store.isDisposed || this._isStreaming) {
			return;
		}
		this._isStreaming = true;
		this._streamingDisposables.add(Event.any(raw.onCursorMove, raw.onLineFeed, raw.onWriteParsed)(() => this._handleCursorEvent()));
		this._streamingDisposables.add(raw.onData(() => this._handleCursorEvent()));
	}

	private _stopStreaming(): void {
		if (!this._isStreaming) {
			return;
		}
		this._streamingDisposables.clear();
		this._isStreaming = false;
		this._lowestDirtyCursorY = undefined;
		this._sourceRaw = undefined;
	}

	private _handleCursorEvent(): void {
		if (this._store.isDisposed || !this._sourceRaw) {
			return;
		}
		const cursorY = this._getAbsoluteCursorY(this._sourceRaw);
		this._lowestDirtyCursorY = this._lowestDirtyCursorY === undefined ? cursorY : Math.min(this._lowestDirtyCursorY, cursorY);
		this._scheduleFlush();
	}

	private _scheduleFlush(): void {
		if (this._dirtyScheduled || this._store.isDisposed) {
			return;
		}
		this._dirtyScheduled = true;
		queueMicrotask(() => {
			this._dirtyScheduled = false;
			if (this._store.isDisposed) {
				return;
			}
			this._flushDirtyRange();
		});
	}

	private _flushDirtyRange(): void {
		if (this._store.isDisposed || this._flushPromise) {
			return;
		}
		this._flushPromise = this._doFlushDirtyRange().finally(() => {
			this._flushPromise = undefined;
		});
	}

	private async _doFlushDirtyRange(): Promise<void> {
		if (this._store.isDisposed) {
			return;
		}
		const sourceRaw = this._xtermTerminal.raw;
		let detached = this._detachedTerminal;
		if (!detached) {
			try {
				detached = await this._getOrCreateTerminal();
			} catch (error) {
				if (error instanceof CancellationError) {
					return;
				}
				throw error;
			}
		}
		if (this._store.isDisposed) {
			return;
		}
		const detachedRaw = detached?.xterm;
		if (!sourceRaw || !detachedRaw) {
			return;
		}

		this._sourceRaw = sourceRaw;
		const currentCursor = this._getAbsoluteCursorY(sourceRaw);
		const previousCursor = this._lastUpToDateCursorY ?? currentCursor;
		const startCandidate = this._lowestDirtyCursorY ?? currentCursor;
		this._lowestDirtyCursorY = undefined;

		const startLine = Math.min(previousCursor, startCandidate);
		// Ensure we resolve any pending flush even when no actual new output is available.
		const vt = await this._getCommandOutputAsVT(this._xtermTerminal);
		if (!vt) {
			return;
		}
		if (this._store.isDisposed) {
			return;
		}

		if (vt.text === this._lastVT) {
			this._lastUpToDateCursorY = currentCursor;
			if (this._command.endMarker && !this._command.endMarker.isDisposed) {
				this._stopStreaming();
			}
			return;
		}

		// Only append if: (1) cursor hasn't moved backwards, and (2) boundary around slice point matches.
		// This is an efficient O(1) check instead of comparing the entire prefix.
		// On Windows, VT sequences can differ even for equivalent content, so we must verify.
		const canAppend = !!this._lastVT && startLine >= previousCursor && vt.text.length >= this._lastVT.length && this._vtBoundaryMatches(vt.text, this._lastVT.length);
		await new Promise<void>(resolve => {
			if (!canAppend) {
				// Use \x1bc (RIS) + new content in one write to avoid a blank frame
				const payload = this._lastVT ? `\x1bc${vt.text}` : vt.text;
				if (payload) {
					detachedRaw.write(payload, resolve);
				} else {
					resolve();
				}
			} else {
				const appended = vt.text.slice(this._lastVT.length);
				if (appended) {
					detachedRaw.write(appended, resolve);
				} else {
					resolve();
				}
			}
		});

		this._lastVT = vt.text;
		this._lineCount = this._getRenderedLineCount();
		this._lastUpToDateCursorY = currentCursor;

		const commandFinished = this._command.endMarker && !this._command.endMarker.isDisposed;
		if (commandFinished) {
			// Only compute max column width after the command finishes and for small outputs
			if (this._lineCount <= ChatTerminalMirrorMetrics.MaxLinesForColumnWidthComputation) {
				this._maxColumnWidth = this._computeMaxColumnWidth();
			}
			this._stopStreaming();
		}

		this._onDidUpdateEmitter.fire({ lineCount: this._lineCount, maxColumnWidth: this._maxColumnWidth });
	}

	private _getAbsoluteCursorY(raw: RawXtermTerminal): number {
		return raw.buffer.active.baseY + raw.buffer.active.cursorY;
	}

	/**
	 * Checks if the new VT text matches the old VT around the boundary where we would slice.
	 */
	private _vtBoundaryMatches(newVT: string, slicePoint: number): boolean {
		return vtBoundaryMatches(newVT, this._lastVT, slicePoint);
	}
}

/**
 * Mirrors a terminal output snapshot into a detached terminal instance.
 * Used when the terminal has been disposed of but we still want to show the output.
 */
export class DetachedTerminalSnapshotMirror extends Disposable {
	private _detachedTerminal: Promise<IDetachedTerminalInstance> | undefined;
	private _resolvedTerminal: IDetachedTerminalInstance | undefined;
	private _attachedContainer: HTMLElement | undefined;

	private _output: IChatTerminalToolInvocationData['terminalCommandOutput'] | undefined;
	private _container: HTMLElement | undefined;
	private readonly _renderSequencer = new Sequencer();
	private _outputVersion = 0;
	private _renderedVersion = -1;
	private _lastRenderedLineCount: number | undefined;
	private _lastRenderedMaxColumnWidth: number | undefined;
	private _lastRenderedText = '';
	private readonly _onDidChangeRowHeightEmitter = this._register(new Emitter<void>());
	public readonly onDidChangeRowHeight: Event<void> = this._onDidChangeRowHeightEmitter.event;
	private _renderListenerInstalled = false;
	private _lastObservedRowHeight: number | undefined;

	constructor(
		output: IChatTerminalToolInvocationData['terminalCommandOutput'] | undefined,
		private readonly _getTheme: () => IChatTerminalToolInvocationData['terminalTheme'] | undefined,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();
		this._output = output;
		const processInfo = this._register(new DetachedProcessInfo({ initialCwd: '' }));
		this._detachedTerminal = this._terminalService.createDetachedTerminal({
			cols: ChatTerminalMirrorMetrics.MirrorColCountFallback,
			rows: ChatTerminalMirrorMetrics.MirrorRowCount,
			readonly: true,
			processInfo,
			disableOverviewRuler: true,
			colorProvider: {
				getBackgroundColor: theme => {
					const storedBackground = this._getTheme()?.background;
					return getChatTerminalBackgroundColor(theme, this._contextKeyService, storedBackground);
				}
			}
		}).then(terminal => {
			// If the store is already disposed, dispose the terminal immediately
			if (this._store.isDisposed) {
				terminal.dispose();
				return terminal;
			}
			enableCursorLineReflow(terminal);
			this._resolvedTerminal = terminal;
			return this._register(terminal);
		});
	}

	/**
	 * The height in CSS pixels of one rendered row of this mirror, or undefined until the
	 * detached terminal exists. Reflects the renderer's actual cell metrics once it has
	 * rendered, so box-height math matches what xterm paints.
	 */
	public getRowHeightPx(): number | undefined {
		if (this._store.isDisposed) {
			return undefined;
		}
		return getMirrorRowHeightPx(this._resolvedTerminal);
	}

	private async _getTerminal(): Promise<IDetachedTerminalInstance> {
		if (!this._detachedTerminal) {
			throw new Error('Detached terminal not initialized');
		}
		return this._detachedTerminal;
	}

	public setOutput(output: IChatTerminalToolInvocationData['terminalCommandOutput'] | undefined): void {
		this._output = output;
		this._outputVersion++;
	}

	public async attach(container: HTMLElement): Promise<void> {
		const terminal = await this._getTerminal();
		if (this._store.isDisposed) {
			return;
		}
		container.classList.add('chat-terminal-output-terminal');
		const needsAttach = this._attachedContainer !== container || container.firstChild === null;
		if (needsAttach) {
			terminal.attachToElement(container, { enableGpu: false });
			this._attachedContainer = container;
		}
		if (!this._renderListenerInstalled) {
			this._renderListenerInstalled = true;
			// Renders can change the cell metrics: the first render replaces the measured font
			// estimate with the renderer's actual dimensions, and later ones can reflect DPR
			// changes (e.g. the window moving to a differently scaled monitor). Only the
			// changes are announced, so the per-frame cost is one number comparison.
			this._register(getMirrorRaw(terminal).onRender(() => {
				const rowHeight = this.getRowHeightPx();
				if (rowHeight !== undefined && rowHeight !== this._lastObservedRowHeight) {
					this._lastObservedRowHeight = rowHeight;
					this._onDidChangeRowHeightEmitter.fire();
				}
			}));
		}

		this._container = container;
		this._applyTheme(container);
	}

	public async render(): Promise<{ lineCount?: number; maxColumnWidth?: number } | undefined> {
		return this._renderSequencer.queue(() => this._render());
	}

	/**
	 * Resizes the mirror to fill the given width, relying on xterm's native resize reflow to
	 * re-wrap soft-wrapped lines. No-op when the resulting cols are unchanged. The column
	 * count derives from the mirror's own xterm font metrics, which reflect the actual
	 * renderer cell size rather than a configuration-based estimate.
	 */
	public async layout(widthPx: number): Promise<{ lineCount?: number; maxColumnWidth?: number } | undefined> {
		if (widthPx <= 0) {
			return undefined;
		}
		return this._renderSequencer.queue(async () => {
			const terminal = await this._getTerminal();
			if (this._store.isDisposed) {
				return undefined;
			}
			const cols = computeChatTerminalMirrorCols(widthPx, terminal.xterm.getFont(), getMirrorDevicePixelRatio(terminal), measureMirrorHorizontalChrome(terminal));
			if (terminal.xterm.cols === cols) {
				return undefined;
			}
			// Native resize reflow re-wraps the rendered content in place; rewriting the
			// snapshot here instead would flash a cleared frame on every resize
			terminal.xterm.resize(cols, ChatTerminalMirrorMetrics.MirrorRowCount);
			if (!this._lastRenderedText) {
				return undefined;
			}
			// Same rule as _render: a truncated snapshot's buffer under-represents the real
			// output, so its explicit lineCount must survive the resize
			const lineCount = computeSnapshotLineCount(terminal.xterm.buffer.active, this._output?.truncated ? this._output.lineCount : undefined);
			this._lastRenderedLineCount = lineCount;
			if (this._shouldComputeMaxColumnWidth(lineCount)) {
				this._lastRenderedMaxColumnWidth = this._computeMaxColumnWidth(terminal);
			}
			return { lineCount, maxColumnWidth: this._lastRenderedMaxColumnWidth };
		});
	}

	private async _render(): Promise<{ lineCount?: number; maxColumnWidth?: number } | undefined> {
		const output = this._output;
		const outputVersion = this._outputVersion;
		if (!output) {
			return undefined;
		}
		if (outputVersion === this._renderedVersion) {
			return { lineCount: this._lastRenderedLineCount ?? output.lineCount, maxColumnWidth: this._lastRenderedMaxColumnWidth };
		}
		const terminal = await this._getTerminal();
		if (this._store.isDisposed) {
			return undefined;
		}
		if (this._container) {
			this._applyTheme(this._container);
		}
		const text = output.text ?? '';
		if (!text) {
			if (this._lastRenderedText) {
				await new Promise<void>(resolve => terminal.xterm.write('\x1b[2J\x1b[3J\x1b[H', resolve));
			}
			const lineCount = output.lineCount ?? 0;
			this._renderedVersion = outputVersion;
			this._lastRenderedText = '';
			this._lastRenderedLineCount = lineCount;
			this._lastRenderedMaxColumnWidth = 0;
			return { lineCount, maxColumnWidth: 0 };
		}
		const write = text.startsWith(this._lastRenderedText)
			? text.slice(this._lastRenderedText.length)
			: `\x1b[2J\x1b[3J\x1b[H${text}`;
		if (write) {
			await new Promise<void>(resolve => terminal.xterm.write(write, resolve));
		}
		if (this._store.isDisposed) {
			return undefined;
		}
		// A persisted lineCount reflects the wrap width of the source terminal, which can differ
		// from this mirror's cols after a width layout. Only trust it for truncated output,
		// where the text under-represents the real row count.
		const lineCount = computeSnapshotLineCount(terminal.xterm.buffer.active, output.truncated ? output.lineCount : undefined);
		this._renderedVersion = outputVersion;
		this._lastRenderedText = text;
		this._lastRenderedLineCount = lineCount;
		// Only compute max column width for small outputs to avoid performance issues
		if (this._shouldComputeMaxColumnWidth(lineCount)) {
			this._lastRenderedMaxColumnWidth = this._computeMaxColumnWidth(terminal);
		}
		return { lineCount, maxColumnWidth: this._lastRenderedMaxColumnWidth };
	}

	private _computeMaxColumnWidth(terminal: IDetachedTerminalInstance): number {
		return computeMaxBufferColumnWidth(terminal.xterm.buffer.active, terminal.xterm.cols);
	}

	private _shouldComputeMaxColumnWidth(lineCount: number): boolean {
		return lineCount <= ChatTerminalMirrorMetrics.MaxLinesForColumnWidthComputation;
	}

	private _applyTheme(container: HTMLElement): void {
		const theme = this._getTheme();
		if (!theme) {
			container.style.removeProperty('background-color');
			container.style.removeProperty('color');
			return;
		}
		if (theme.background) {
			container.style.backgroundColor = theme.background;
		}
		if (theme.foreground) {
			container.style.color = theme.foreground;
		}
	}
}
