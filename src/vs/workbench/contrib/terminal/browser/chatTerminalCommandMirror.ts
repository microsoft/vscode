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

interface IDetachedTerminalCommandMirror {
	attach(container: HTMLElement): Promise<void>;
	renderCommand(): Promise<{ lineCount?: number } | undefined>;
	onDidUpdate: Event<number>;
}

const enum ChatTerminalMirrorMetrics {
	MirrorRowCount = 10,
	MirrorColCountFallback = 80
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
		const endLine = endMarker.line - 1;
		const lineCount = Math.max(endLine - startLine + 1, 0);
		return { text, lineCount };
	}

	const startLine = executedMarker.line;
	const endLine = endMarker.line - 1;
	const lineCount = Math.max(endLine - startLine + 1, 0);

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
 * Used in the chat terminal tool progress part to show command output for example.
 *
 * Streaming approach
 * ------------------
 * The mirror maintains a VT snapshot of the command's output and incrementally updates a
 * detached xterm instance instead of re-rendering the whole range on every change.
 *
 * - A *dirty range* is the set of buffer rows that may have diverged between the source
 *   terminal and the detached mirror. It is tracked by:
 *     - `_lastUpToDateCursorY`: the last cursor row in the source buffer for which the
 *       mirror is known to be fully up to date.
 *     - `_lowestDirtyCursorY`: the smallest (top-most) cursor row that has been affected
 *       by new data or cursor movement since the last flush.
 *
 * - When new data arrives or the cursor moves, xterm events and `onData` callbacks are
 *   used to update `_lowestDirtyCursorY`. This effectively marks everything from that row
 *   downwards as potentially stale.
 *
 * - If the dirty range starts exactly at the previous end of the mirrored output (that is,
 *   `_lowestDirtyCursorY` is at or after `_lastUpToDateCursorY` and no earlier rows have
 *   changed), the mirror can *append* VT that corresponds only to the new rows.
 *
 * - If the cursor moves or data is written above the previously mirrored end (for example,
 *   when the command rewrites lines, uses carriage returns, or modifies earlier rows),
 *   `_lowestDirtyCursorY` will be before `_lastUpToDateCursorY`. In that case the mirror
 *   cannot safely append and instead falls back to taking a fresh VT snapshot of the
 *   entire command range and *rewrites* the detached terminal content.
 */
export class DetachedTerminalCommandMirror extends Disposable implements IDetachedTerminalCommandMirror {
	private _detachedTerminal: IDetachedTerminalInstance | undefined;
	private _detachedTerminalPromise: Promise<IDetachedTerminalInstance> | undefined;
	private _attachedContainer: HTMLElement | undefined;
	private readonly _streamingDisposables = this._register(new DisposableStore());
	private readonly _onDidUpdateEmitter = this._register(new Emitter<number>());
	public readonly onDidUpdate: Event<number> = this._onDidUpdateEmitter.event;

	private _lastVT = '';
	private _lineCount = 0;
	private _lastUpToDateCursorY: number | undefined;
	private _lowestDirtyCursorY: number | undefined;
	private _flushPromise: Promise<void> | undefined;
	private _dirtyScheduled = false;
	private _isStreaming = false;
	private _sourceRaw: RawXtermTerminal | undefined;
	private _isDisposed = false;

	constructor(
		private readonly _xtermTerminal: XtermTerminal,
		private readonly _command: ITerminalCommand,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		super();
		this._register(toDisposable(() => {
			this._isDisposed = true;
			this._stopStreaming();
		}));
	}

	async attach(container: HTMLElement): Promise<void> {
		if (this._isDisposed) {
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
		if (this._isDisposed) {
			return;
		}
		if (this._attachedContainer !== container) {
			container.classList.add('chat-terminal-output-terminal');
			terminal.attachToElement(container, { enableGpu: false });
			this._attachedContainer = container;
		}
	}

	async renderCommand(): Promise<{ lineCount?: number } | undefined> {
		if (this._isDisposed) {
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
		if (this._isDisposed) {
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
		if (this._isDisposed) {
			return undefined;
		}

		await new Promise<void>(resolve => {
			if (!this._lastVT) {
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
		this._lineCount = this._getRenderedLineCount();

		const sourceRaw = this._xtermTerminal.raw;
		if (sourceRaw) {
			this._sourceRaw = sourceRaw;
			this._lastUpToDateCursorY = this._getAbsoluteCursorY(sourceRaw);
			if (!this._isStreaming && (!this._command.endMarker || this._command.endMarker.isDisposed)) {
				this._startStreaming(sourceRaw);
			}
		}

		return { lineCount: this._lineCount };
	}

	private async _getCommandOutputAsVT(source: XtermTerminal): Promise<{ text: string } | undefined> {
		if (this._isDisposed) {
			return undefined;
		}
		const executedMarker = this._command.executedMarker ?? (this._command as unknown as ICurrentPartialCommand).commandExecutedMarker;
		if (!executedMarker) {
			return undefined;
		}

		const endMarker = this._command.endMarker;
		const text = await source.getRangeAsVT(executedMarker, endMarker, endMarker?.line !== executedMarker.line);
		if (this._isDisposed) {
			return undefined;
		}
		if (!text) {
			return { text: '' };
		}

		return { text };
	}

	private _getRenderedLineCount(): number {
		if (!this._detachedTerminal) {
			return this._lineCount;
		}
		const buffer = this._detachedTerminal.xterm.buffer.active;
		const baseY = buffer.baseY;
		const cursorY = buffer.cursorY;
		const cursorX = buffer.cursorX;

		// Total lines is baseY (scrollback) + cursorY (visible position) + 1
		// But if cursor is at column 0 on the current line, it means the previous
		// line ended with a newline and the cursor moved to an empty line.
		// In that case, don't count the empty line.
		let totalLines = baseY + cursorY + 1;
		if (cursorX === 0 && totalLines > 1) {
			// Check if the current line is empty (cursor at start of an empty line)
			const line = buffer.getLine(baseY + cursorY);
			if (line && line.translateToString(true).length === 0) {
				totalLines = totalLines - 1;
			}
		}

		// Also calculate minimum expected lines from the VT text as a sanity check.
		// This handles cases where the buffer cursor position hasn't fully updated yet.
		const textLineCount = this._lastVT ? this._countLinesFromText(this._lastVT) : 0;
		return Math.max(totalLines, textLineCount);
	}

	private _countLinesFromText(text: string): number {
		if (!text) {
			return 0;
		}
		// Count line breaks in the text. VT sequences use \r\n for newlines.
		const lines = text.split(/\r\n|\n|\r/);
		// If text ends with a newline, don't count the empty trailing element
		if (lines.length > 0 && lines[lines.length - 1] === '') {
			return lines.length - 1;
		}
		return lines.length;
	}

	private async _getOrCreateTerminal(): Promise<IDetachedTerminalInstance> {
		if (this._detachedTerminal) {
			return this._detachedTerminal;
		}
		if (this._detachedTerminalPromise) {
			return this._detachedTerminalPromise;
		}
		if (this._isDisposed) {
			throw new CancellationError();
		}
		const createPromise = (async () => {
			const colorProvider = {
				getBackgroundColor: (theme: IColorTheme) => getChatTerminalBackgroundColor(theme, this._contextKeyService)
			};
			const detached = await this._terminalService.createDetachedTerminal({
				cols: this._xtermTerminal.raw.cols ?? ChatTerminalMirrorMetrics.MirrorColCountFallback,
				rows: ChatTerminalMirrorMetrics.MirrorRowCount,
				readonly: true,
				processInfo: new DetachedProcessInfo({ initialCwd: '' }),
				disableOverviewRuler: true,
				colorProvider
			});
			if (this._isDisposed) {
				detached.dispose();
				throw new CancellationError();
			}
			this._detachedTerminal = detached;
			this._register(detached);
			return detached;
		})();
		this._detachedTerminalPromise = createPromise;
		return createPromise;
	}

	private _startStreaming(raw: RawXtermTerminal): void {
		if (this._isDisposed || this._isStreaming) {
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
		if (this._isDisposed || !this._sourceRaw) {
			return;
		}
		const cursorY = this._getAbsoluteCursorY(this._sourceRaw);
		this._lowestDirtyCursorY = this._lowestDirtyCursorY === undefined ? cursorY : Math.min(this._lowestDirtyCursorY, cursorY);
		this._scheduleFlush();
	}

	private _scheduleFlush(): void {
		if (this._dirtyScheduled || this._isDisposed) {
			return;
		}
		this._dirtyScheduled = true;
		Promise.resolve().then(() => {
			this._dirtyScheduled = false;
			if (this._isDisposed) {
				return;
			}
			this._flushDirtyRange();
		});
	}

	private _flushDirtyRange(): void {
		if (this._isDisposed || this._flushPromise) {
			return;
		}
		this._flushPromise = this._doFlushDirtyRange().finally(() => {
			this._flushPromise = undefined;
		});
	}

	private async _doFlushDirtyRange(): Promise<void> {
		if (this._isDisposed) {
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
		if (this._isDisposed) {
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
		if (this._isDisposed) {
			return;
		}

		if (vt.text === this._lastVT) {
			this._lastUpToDateCursorY = currentCursor;
			if (this._command.endMarker && !this._command.endMarker.isDisposed) {
				this._stopStreaming();
			}
			return;
		}

		const canAppend = !!this._lastVT && startLine >= previousCursor;
		await new Promise<void>(resolve => {
			if (!this._lastVT || !canAppend) {
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
		this._onDidUpdateEmitter.fire(this._lineCount);

		if (this._command.endMarker && !this._command.endMarker.isDisposed) {
			this._stopStreaming();
		}
	}

	private _getAbsoluteCursorY(raw: RawXtermTerminal): number {
		return raw.buffer.active.baseY + raw.buffer.active.cursorY;
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
		}).then(terminal => this._register(terminal));
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
		container.classList.add('chat-terminal-output-terminal');
		const needsAttach = this._attachedContainer !== container || container.firstChild === null;
		if (needsAttach) {
			terminal.attachToElement(container, { enableGpu: false });
			this._attachedContainer = container;
		}

		this._container = container;
		this._applyTheme(container);
	}

	public async render(): Promise<{ lineCount?: number } | undefined> {
		const output = this._output;
		if (!output) {
			return undefined;
		}
		if (!this._dirty) {
			return { lineCount: this._lastRenderedLineCount ?? output.lineCount };
		}
		const terminal = await this._getTerminal();
		if (this._container) {
			this._applyTheme(this._container);
		}
		const text = output.text ?? '';
		const lineCount = output.lineCount ?? this._estimateLineCount(text);
		if (!text) {
			this._dirty = false;
			this._lastRenderedLineCount = lineCount;
			return { lineCount: 0 };
		}
		await new Promise<void>(resolve => terminal.xterm.write(text, resolve));
		this._dirty = false;
		this._lastRenderedLineCount = lineCount;
		return { lineCount };
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
