/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IBufferLine, IMarker, ITerminalAddon, Terminal } from '@xterm/xterm';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import type { IXtermCore } from '../../../terminal/browser/xterm-private.js';
import { TERMINAL_CONFIG_SECTION, type ITerminalProcessManager } from '../../../terminal/common/terminal.js';
import type { ITerminalTypeAheadConfiguration } from '../common/terminalTypeAheadConfiguration.js';
import { compileExcludeRegexp, getTypeAheadEnabled, PredictionStats, sendLatencyStats } from './terminalTypeAheadAddon.js';
import { TypeAheadOverlay, type IPredictedRow, type PredictedCell } from './terminalTypeAheadOverlay.js';

const MAX_PENDING_EDITS = 256;

type Edit = { readonly kind: 'insert'; readonly char: string; readonly time: number } | { readonly kind: 'backspace' | 'left' | 'right'; readonly time: number };
interface IRowState<T = string> {
	chars: T[];
	cursorX: number;
	endingX: number;
}
interface IInputRow {
	startingX: number;
	endingX: number;
	validated: boolean;
}

/** Reconciles a line editor against parsed PTY output; predictions exist only in the renderer. */
export class OverlayTypeAheadAddon extends Disposable implements ITerminalAddon {
	private _terminal?: Terminal;
	private _overlay?: TypeAheadOverlay;
	protected _predictedRow?: IPredictedRow;
	private _visibleChars?: string[];
	private readonly _marker = this._register(new MutableDisposable<IMarker>());
	private _row?: IInputRow;
	private _baseline?: IRowState;
	private readonly _edits: Edit[] = [];
	private _barrier = false;
	private _resetRowAfterBarrier = false;
	private _inputSequence = '';
	private _title = '';
	private _excludeProgramRe = compileExcludeRegexp();
	private _enabled = false;
	private _unmatched = false;
	private _outputPending = false;
	private readonly _added = this._register(new Emitter<Edit>());
	private readonly _succeeded = this._register(new Emitter<Edit>());
	private readonly _failed = this._register(new Emitter<Edit>());
	readonly stats = this._register(new PredictionStats({ onPredictionAdded: this._added.event, onPredictionSucceeded: this._succeeded.event, onPredictionFailed: this._failed.event }));
	private readonly _clear = this._register(new RunOnceScheduler(() => this._discard(), 500));
	private readonly _reevaluate = this._register(new RunOnceScheduler(() => this._reevaluateNow(), 100));
	private readonly _nextStatsSend = this._register(new RunOnceScheduler(() => sendLatencyStats(this.stats, this._telemetryService), 1000 * 60 * 5));

	constructor(
		processManager: ITerminalProcessManager,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
		this._register(processManager.onBeforeProcessData(() => this._outputPending = true));
		this._register(this.stats.onChange(() => {
			this._reevaluate.schedule();
			if (!this._nextStatsSend.isScheduled()) {
				this._nextStatsSend.schedule();
			}
		}));
	}

	activate(terminal: Terminal): void {
		this._terminal = terminal;
		this._overlay = this._register(new TypeAheadOverlay(terminal, this._config.localEchoStyle));
		this._reevaluateNow();
		this._register(terminal.onData(data => this._onData(data)));
		this._register(terminal.onWriteParsed(() => {
			if (!this._hasPendingWrites) {
				if (!this._parserIdle) {
					this._unmatched = !!this._edits.length;
					this._render();
					return;
				}
				this._outputPending = false;
				const buffer = terminal.buffer.active;
				const marker = this._marker.value;
				if (this._row && marker && !marker.isDisposed && buffer.type === 'normal' && marker.line === buffer.baseY + buffer.cursorY) {
					this._row.endingX = Math.max(this._row.endingX, buffer.cursorX);
				}
				this._reconcile();
			}
		}));
		this._register(terminal.onResize(() => this.reset()));
		this._register(terminal.buffer.onBufferChange(() => this.reset()));
		this._register(terminal.onTitleChange(title => {
			this._title = title;
			this._reevaluateNow();
		}));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TERMINAL_CONFIG_SECTION)) {
				this._overlay?.setStyle(this._config.localEchoStyle);
				this._reevaluateNow();
			}
		}));
	}

	reset(): void {
		this._discard();
		this._row = undefined;
		this._marker.clear();
		this._barrier = false;
		this._resetRowAfterBarrier = false;
		this._outputPending = false;
		this._inputSequence = '';
	}

	override dispose(): void {
		this._setOverlay(undefined);
		super.dispose();
	}

	private get _config(): ITerminalTypeAheadConfiguration {
		return this._configurationService.getValue<ITerminalTypeAheadConfiguration>(TERMINAL_CONFIG_SECTION);
	}

	private get _hasPendingWrites(): boolean {
		return !!this._terminal && (this._terminal as Terminal & { _core: IXtermCore })._core._writeBuffer._pendingData > 0;
	}

	private get _parserIdle(): boolean {
		return !!this._terminal && !this._hasPendingWrites && (this._terminal as Terminal & { _core: IXtermCore })._core._inputHandler._parser.currentState === 0;
	}

	private _reevaluateNow(): void {
		const config = this._config;
		this._excludeProgramRe = config.localEchoExcludePrograms.length ? compileExcludeRegexp(config.localEchoExcludePrograms) : /$^/;
		const excluded = this._excludeProgramRe.test(this._title);
		this._enabled = getTypeAheadEnabled(this.stats, config.localEchoLatencyThreshold, excluded) ?? this._enabled;
		if (excluded || config.localEchoLatencyThreshold < 0) {
			this._discard();
		} else {
			this._render();
		}
	}

	private _snapshot(): IRowState {
		const terminal = this._terminal!;
		const buffer = terminal.buffer.active;
		const line = buffer.getLine(buffer.baseY + buffer.cursorY);
		const pendingDelta = this._edits.reduce((delta, edit) => delta + (edit.kind === 'insert' ? 1 : edit.kind === 'backspace' ? -1 : 0), 0);
		return { cursorX: buffer.cursorX, endingX: Math.max(buffer.cursorX, (this._row?.endingX ?? buffer.cursorX) - pendingDelta), chars: Array.from({ length: terminal.cols }, (_, x) => line?.getCell(x)?.getChars() || ' ') };
	}

	private _onData(data: string): void {
		for (const char of data) {
			if (this._inputSequence) {
				this._inputSequence += char;
				const sequence = this._inputSequence;
				if (sequence.length > 4096) {
					this._inputSequence = '';
					this._barrier = true;
				} else if (sequence === '\x1b[' || sequence === '\x1bO' || sequence === '\x1b]' || sequence === '\x1bP') {
					continue;
				} else if (sequence.startsWith('\x1b]') || sequence.startsWith('\x1bP')) {
					if (sequence.endsWith('\x1b\\') || sequence.endsWith('\x07')) {
						this._inputSequence = '';
					}
				} else if (sequence.startsWith('\x1b[') && char >= '@' && char <= '~' || sequence.startsWith('\x1bO') && sequence.length === 3 || sequence.length === 2) {
					this._inputSequence = '';
					if (/^\x1b\[(?:\??\d+;\d+R|[?>=]?[\d;]*c|\??[\d;]*n)$/.test(sequence)) {
						continue;
					}
					if (/^\x1b(?:\[(?:1)?|O)[DC]$/.test(sequence)) {
						this._queue(sequence.endsWith('D') ? 'left' : 'right');
					} else {
						this._barrier = true;
					}
				}
			} else if (char === '\x1b') {
				this._inputSequence = char;
			} else if (char >= ' ' && char <= '~') {
				this._queue('insert', char);
			} else if (char === '\x7f') {
				this._queue('backspace');
			} else {
				this._barrier = true;
			}
		}
		if (this._parserIdle && !this._outputPending) {
			this._render();
		}
	}

	private _queue(kind: Edit['kind'], char = ''): void {
		const terminal = this._terminal!;
		const buffer = terminal.buffer.active;
		if (buffer.type !== 'normal' || this._config.localEchoLatencyThreshold < 0 || this._excludeProgramRe.test(this._title)) {
			return;
		}
		// Later edits can't be placed until the authoritative state includes this one.
		if (this._barrier || this._unmatched || this._outputPending || !this._parserIdle) {
			this._resetRowAfterBarrier ||= !this._barrier;
			this._barrier = true;
			return;
		}
		if (this._edits.length >= MAX_PENDING_EDITS) {
			this._barrier = true;
			return;
		}
		const y = buffer.baseY + buffer.cursorY;
		if (!this._marker.value || this._marker.value.isDisposed || this._marker.value.line !== y) {
			this._discard();
			this._marker.value = terminal.registerMarker(0);
			if (!this._marker.value) {
				return;
			}
			this._row = { startingX: buffer.cursorX, endingX: buffer.cursorX, validated: false };
		}
		const row = this._row!;
		if (!this._edits.length) {
			row.endingX = Math.max(row.endingX, buffer.cursorX);
		}
		const state = this._simulate(this._baseline ?? this._snapshot());
		if (state.cursorX >= terminal.cols - 1 || kind !== 'insert' && kind !== 'right' && state.cursorX <= row.startingX || kind === 'right' && state.cursorX >= row.endingX) {
			this._barrier = true;
			return;
		}
		const line = buffer.getLine(y)!;
		const startX = kind === 'insert' || kind === 'right' ? state.cursorX : state.cursorX - 1;
		for (let x = Math.min(startX, buffer.cursorX); x < terminal.cols; x++) {
			const cell = line.getCell(x);
			if (!cell || cell.getWidth() !== 1 || cell.getChars().length > 1) {
				this._barrier = true;
				return;
			}
		}
		this._baseline ??= this._snapshot();
		const edit: Edit = kind === 'insert' ? { kind, char, time: Date.now() } : { kind, time: Date.now() };
		this._edits.push(edit);
		this._added.fire(edit);
		if (kind === 'insert') {
			row.endingX++;
		} else if (kind === 'backspace') {
			row.endingX--;
		}
		this._scheduleTimeout();
	}

	private _simulate(baseline: IRowState): IRowState {
		const state = { ...baseline, chars: baseline.chars.slice() };
		for (const edit of this._edits) {
			applyEdit(state, edit, char => char ?? ' ');
		}
		return state;
	}

	private _reconcile(): void {
		const terminal = this._terminal!;
		const marker = this._marker.value;
		if (!this._baseline || !this._row || !marker || marker.isDisposed || terminal.buffer.active.type !== 'normal') {
			this._discard();
			return;
		}
		const buffer = terminal.buffer.active;
		const sameRow = buffer.baseY + buffer.cursorY === marker.line;
		if (sameRow && (terminal as Terminal & { _core: IXtermCore })._core.coreService.isCursorHidden) {
			this._unmatched = true;
			this._render();
			return;
		}
		const line = buffer.getLine(marker.line);
		const state = { ...this._baseline, chars: this._baseline.chars.slice() };
		const isEchoed = () => state.chars.slice(this._row!.startingX, state.cursorX).every((char, i) => char === (line?.getCell(this._row!.startingX + i)?.getChars() || ' '));
		let confirmed = -1;
		let confirmedCursorX = state.cursorX;
		for (let k = 0; k <= this._edits.length; k++) {
			if ((sameRow ? state.cursorX === buffer.cursorX : this._barrier) && isEchoed()) {
				confirmed = k;
				confirmedCursorX = state.cursorX;
			}
			if (k < this._edits.length) {
				applyEdit(state, this._edits[k], char => char ?? ' ');
			}
		}
		// Unmodeled keys after a barrier move the cursor, so accept every edit once all are echoed.
		if (confirmed < 0 && this._barrier && sameRow && isEchoed()) {
			confirmed = this._edits.length;
			confirmedCursorX = state.cursorX;
		}
		if (confirmed >= 0) {
			for (const edit of this._edits.splice(0, confirmed)) {
				if (edit.kind === 'insert' && confirmedCursorX > this._row.startingX) {
					this._row.validated = true;
				}
				this._succeeded.fire(edit);
			}
			this._unmatched = false;
			this._baseline = this._edits.length && sameRow ? this._snapshot() : undefined;
			this._scheduleTimeout();
		} else {
			this._unmatched = true;
		}
		if (!sameRow) {
			this.reset();
			return;
		}
		this._render();
	}

	private _scheduleTimeout(): void {
		this._clear.cancel();
		// Hidden edits on an unvalidated row wait for their echo so latency above the timeout can be learned.
		if (this._edits.length && this._row?.validated) {
			this._clear.schedule(Math.max(0, this._edits[0].time + Math.max(500, this.stats.maxLatency * 1.5) - Date.now()));
		}
	}

	private _discard(): void {
		for (const edit of this._edits.splice(0)) {
			if (this._row) {
				this._row.endingX += edit.kind === 'insert' ? -1 : edit.kind === 'backspace' ? 1 : 0;
			}
			this._failed.fire(edit);
		}
		this._clear.cancel();
		this._baseline = undefined;
		this._unmatched = false;
		this._setOverlay(undefined);
		if (this._parserIdle && !this._outputPending) {
			// A drained repaint can still have an intermediate cursor; require a fresh echo probe.
			if (this._resetRowAfterBarrier) {
				this._row = undefined;
				this._marker.clear();
				this._resetRowAfterBarrier = false;
			}
			this._barrier = false;
		}
	}

	private _render(): void {
		const terminal = this._terminal;
		const marker = this._marker.value;
		if (!terminal || !this._enabled || !this._row?.validated || !this._edits.length || !marker || marker.isDisposed || terminal.buffer.active.type !== 'normal') {
			this._setOverlay(undefined);
			return;
		}
		if (this._unmatched) {
			// Preserve the last coherent display while a fragmented shell repaint is in flight.
			if (this._predictedRow && this._visibleChars) {
				const startX = this._row.startingX;
				this._setOverlay({ y: marker.line, startX, cells: this._visibleChars.slice(startX).map<PredictedCell>(char => char === ' ' ? { kind: 'blank' } : { kind: 'char', char }), cursorX: this._predictedRow.cursorX });
			}
			return;
		}
		const authoritative = this._snapshot();
		const line = terminal.buffer.active.getLine(marker.line)!;
		for (let x = this._row.startingX; x < terminal.cols; x++) {
			const cell = line?.getCell(x);
			if (!cell || cell.getWidth() !== 1 || cell.getChars().length > 1) {
				this._discard();
				return;
			}
		}
		const predicted: IRowState<PredictedCell> = { ...authoritative, chars: authoritative.chars.map<PredictedCell>((_, x) => ({ kind: 'copy', x })) };
		for (const edit of this._edits) {
			applyEdit(predicted, edit, (char): PredictedCell => char === undefined ? { kind: 'blank' } : { kind: 'char', char });
		}
		const cells = predicted.chars;
		const state = { ...predicted, chars: cells.map(cell => cell.kind === 'char' ? cell.char : cell.kind === 'copy' ? authoritative.chars[cell.x] : ' ') };
		let startX = 0;
		let endX = cells.length;
		while (startX < endX && isUnchanged(cells[startX], startX, state, authoritative, line)) {
			startX++;
		}
		while (endX > startX && isUnchanged(cells[endX - 1], endX - 1, state, authoritative, line)) {
			endX--;
		}
		this._visibleChars = state.chars;
		this._setOverlay(startX === endX && state.cursorX === authoritative.cursorX ? undefined : { y: marker.line, startX, cells: cells.slice(startX, endX), cursorX: state.cursorX });
	}

	private _setOverlay(row: IPredictedRow | undefined): void {
		if (JSON.stringify(this._predictedRow) !== JSON.stringify(row)) {
			this._predictedRow = row;
			this._overlay?.set(row);
		}
		if (!row) {
			this._visibleChars = undefined;
		}
	}
}

function applyEdit<T>(state: IRowState<T>, edit: Edit, createCell: (char?: string) => T): void {
	const endingX = Math.max(state.endingX, state.cursorX);
	switch (edit.kind) {
		case 'insert':
			state.chars.copyWithin(state.cursorX + 1, state.cursorX, endingX);
			if (state.cursorX < state.chars.length) {
				state.chars[state.cursorX] = createCell(edit.char);
			}
			state.cursorX++;
			state.endingX = endingX + 1;
			break;
		case 'backspace':
			state.chars.copyWithin(state.cursorX - 1, state.cursorX, endingX);
			state.cursorX--;
			state.endingX = endingX - 1;
			if (state.endingX < state.chars.length) {
				state.chars[state.endingX] = createCell();
			}
			break;
		case 'left':
			state.cursorX--;
			break;
		case 'right':
			state.cursorX++;
			break;
	}
}

function isUnchanged(cell: PredictedCell, x: number, state: IRowState, authoritative: IRowState, line: IBufferLine): boolean {
	if (cell.kind === 'copy') {
		return cell.x === x || state.chars[x] === authoritative.chars[x] && !!line.getCell(cell.x)?.attributesEquals(line.getCell(x)!);
	}
	return cell.kind === 'blank' && authoritative.chars[x] === ' ' && !!line.getCell(x)?.isAttributeDefault();
}
