/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import type { IMarker as IXtermMarker, Terminal as RawXtermTerminal } from '@xterm/xterm';
import type { ITerminalCommand } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalService, type IDetachedTerminalInstance } from './terminal.js';
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
	onDidUpdate: Event<IDetachedTerminalCommandMirrorRenderResult>;
	onDidInput: Event<string>;
}

const enum ChatTerminalMirrorMetrics {
	MirrorRowCount = 10,
	MirrorColCountFallback = 80,
	/**
	 * Maximum number of lines for which we compute the max column width.
	 * Computing max column width iterates the entire buffer, so we skip it
	 * for large outputs to avoid performance issues.
	 */
	MaxLinesForColumnWidthComputation = 100
}

/**
 * Computes the line count for terminal output between start and end lines.
 * The end line is exclusive (points to the line after output ends).
 */
function computeOutputLineCount(startLine: number, endLine: number): number {
	return Math.max(endLine - startLine, 0);
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
				// Reset the terminal if we had previous content (can't append, need full rewrite)
				if (this._lastVT) {
					detached.xterm.reset();
				}
				if (vt.text) {
					detached.xterm.write(vt.text, resolve);
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
				// Reset the terminal if we had previous content (can't append, need full rewrite)
				if (this._lastVT) {
					detachedRaw.reset();
				}
				if (vt.text) {
					detachedRaw.write(vt.text, resolve);
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
	private _attachedContainer: HTMLElement | undefined;

	private _output: IChatTerminalToolInvocationData['terminalCommandOutput'] | undefined;
	private _container: HTMLElement | undefined;
	private _dirty = true;
	private _lastRenderedLineCount: number | undefined;
	private _lastRenderedMaxColumnWidth: number | undefined;

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
			return this._register(terminal);
		});
	}

	private async _getTerminal(): Promise<IDetachedTerminalInstance> {
		if (!this._detachedTerminal) {
			throw new Error('Detached terminal not initialized');
		}
		return this._detachedTerminal;
	}

	public setOutput(output: IChatTerminalToolInvocationData['terminalCommandOutput'] | undefined): void {
		this._output = output;
		this._dirty = true;
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

		this._container = container;
		this._applyTheme(container);
	}

	public async render(): Promise<{ lineCount?: number; maxColumnWidth?: number } | undefined> {
		const output = this._output;
		if (!output) {
			return undefined;
		}
		if (!this._dirty) {
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
		const lineCount = output.lineCount ?? this._estimateLineCount(text);
		if (!text) {
			this._dirty = false;
			this._lastRenderedLineCount = lineCount;
			this._lastRenderedMaxColumnWidth = 0;
			return { lineCount: 0, maxColumnWidth: 0 };
		}
		await new Promise<void>(resolve => terminal.xterm.write(text, resolve));
		if (this._store.isDisposed) {
			return undefined;
		}
		this._dirty = false;
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

	private _estimateLineCount(text: string): number {
		if (!text) {
			return 0;
		}
		const sanitized = text.replace(/\r/g, '');
		const segments = sanitized.split('\n');
		const count = sanitized.endsWith('\n') ? segments.length - 1 : segments.length;
		return Math.max(count, 1);
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
