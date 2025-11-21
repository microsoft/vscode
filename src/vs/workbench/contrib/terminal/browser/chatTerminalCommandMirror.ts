/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, ImmortalReference } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import type { ITerminalCommand } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalInstance, ITerminalService, type IDetachedTerminalInstance } from './terminal.js';
import { DetachedProcessInfo } from './detachedTerminal.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { TerminalInstanceColorProvider } from './terminalInstance.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { ICurrentPartialCommand } from '../../../../platform/terminal/common/capabilities/commandDetection/terminalCommand.js';

interface IDetachedTerminalCommandMirror {
	attach(container: HTMLElement): Promise<void>;
	renderCommand(): Promise<{ lineCount?: number } | undefined>;
}

/**
 * Mirrors a terminal command's output into a detached terminal instance.
 * Used in the chat terminal tool progress part to show command output for example.
 */
export class DetachedTerminalCommandMirror extends Disposable implements IDetachedTerminalCommandMirror {
	private _detachedTerminal?: IDetachedTerminalInstance;
	private _attachedContainer?: HTMLElement;
	private readonly _streamingDisposables = this._register(new DisposableStore());
	private readonly _onDidUpdateEmitter = this._register(new Emitter<number>());
	public readonly onDidUpdate: Event<number> = this._onDidUpdateEmitter.event;

	private _lastVT = '';
	private _lineCount = 0;
	private _lastUpToDateCursorY: number | undefined;
	private _lowestDirtyCursorY: number | undefined;
	private _highestDirtyCursorY: number | undefined;
	private _flushPromise: Promise<void> | undefined;
	private _dirtyScheduled = false;
	private _hasInitialized = false;
	private _isStreaming = false;
	private _sourceRaw: RawXtermTerminal | undefined;

	constructor(
		private readonly _terminalInstance: ITerminalInstance,
		private readonly _command: ITerminalCommand,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IInstantiationService private readonly _instantationService: IInstantiationService
	) {
		super();
	}

	override dispose(): void {
		this._stopStreaming();
		super.dispose();
	}

	async attach(container: HTMLElement): Promise<void> {
		const terminal = await this._getOrCreateTerminal();
		if (this._attachedContainer !== container) {
			container.classList.add('chat-terminal-output-terminal');
			terminal.attachToElement(container);
			this._attachedContainer = container;
		}
	}

	async renderCommand(): Promise<{ lineCount?: number } | undefined> {
		const detached = await this._getOrCreateTerminal();
		const detachedRaw = detached.xterm.raw;
		if (!detachedRaw) {
			return undefined;
		}
		let vt;
		try {
			vt = await this._getCommandOutputAsVT();
		} catch {

		}
		if (!vt) {
			return undefined;
		}

		if (!this._hasInitialized) {
			detachedRaw.reset();
			this._hasInitialized = true;
		}

		const shouldRewrite = !this._lastVT || !vt.text.startsWith(this._lastVT);
		if (shouldRewrite) {
			detachedRaw.reset();
			if (vt.text) {
				detachedRaw.write(vt.text);
			}
		} else {
			const appended = vt.text.slice(this._lastVT.length);
			if (appended) {
				detachedRaw.write(appended);
			}
		}

		detachedRaw.scrollToBottom();
		detachedRaw.refresh(0, detachedRaw.rows - 1);

		this._lastVT = vt.text;
		this._lineCount = vt.lineCount;

		const xterm = await this._terminalInstance.xtermReadyPromise;
		const sourceRaw = xterm?.raw;
		if (sourceRaw) {
			this._sourceRaw = sourceRaw;
			this._lastUpToDateCursorY = this._getAbsoluteCursorY(sourceRaw);
			if (!this._isStreaming && (!this._command.endMarker || this._command.endMarker.isDisposed)) {
				this._startStreaming(sourceRaw);
			}
		}

		return { lineCount: vt.lineCount };
	}

	private async _getCommandOutputAsVT(): Promise<{ text: string; lineCount: number } | undefined> {
		const executedMarker = this._command.executedMarker ?? (this._command as unknown as ICurrentPartialCommand).commandExecutedMarker;
		if (!executedMarker || executedMarker.isDisposed) {
			return undefined;
		}

		const xterm = await this._terminalInstance.xtermReadyPromise;
		if (!xterm) {
			return undefined;
		}

		const endMarker = this._command.endMarker;
		const text = await xterm.getRangeAsVT(executedMarker, endMarker, endMarker?.line !== executedMarker.line);
		if (!text) {
			return { text: '', lineCount: 0 };
		}

		return { text, lineCount: text.split('\r\n').length };
	}

	private async _getOrCreateTerminal(): Promise<IDetachedTerminalInstance> {
		if (this._detachedTerminal) {
			return this._detachedTerminal;
		}
		const targetRef = this._terminalInstance?.targetRef ?? new ImmortalReference<TerminalLocation | undefined>(undefined);
		const colorProvider = this._instantationService.createInstance(TerminalInstanceColorProvider, targetRef);
		const detached = await this._terminalService.createDetachedTerminal({
			cols: this._terminalInstance?.cols ?? 80,
			rows: 10,
			readonly: true,
			processInfo: new DetachedProcessInfo({ initialCwd: '' }),
			colorProvider
		});
		this._detachedTerminal = detached;
		this._register(detached);
		return detached;
	}

	private _startStreaming(raw: RawXtermTerminal): void {
		if (this._isStreaming) {
			return;
		}
		this._isStreaming = true;
		this._streamingDisposables.add(Event.any(raw.onCursorMove, raw.onLineFeed, raw.onWriteParsed)(() => this._handleCursorEvent()));
		this._streamingDisposables.add(this._terminalInstance.onData(() => this._handleCursorEvent()));
	}

	private _stopStreaming(): void {
		if (!this._isStreaming) {
			return;
		}
		this._streamingDisposables.clear();
		this._isStreaming = false;
		this._lowestDirtyCursorY = undefined;
		this._highestDirtyCursorY = undefined;
	}

	private _handleCursorEvent(): void {
		if (!this._sourceRaw) {
			return;
		}
		const cursorY = this._getAbsoluteCursorY(this._sourceRaw);
		this._lowestDirtyCursorY = this._lowestDirtyCursorY === undefined ? cursorY : Math.min(this._lowestDirtyCursorY, cursorY);
		this._highestDirtyCursorY = this._highestDirtyCursorY === undefined ? cursorY : Math.max(this._highestDirtyCursorY, cursorY);
		this._scheduleFlush();
	}

	private _scheduleFlush(): void {
		if (this._dirtyScheduled) {
			return;
		}
		this._dirtyScheduled = true;
		Promise.resolve().then(() => {
			this._dirtyScheduled = false;
			this._flushDirtyRange();
		});
	}

	private _flushDirtyRange(): void {
		if (this._flushPromise) {
			return;
		}
		this._flushPromise = this._doFlushDirtyRange().finally(() => {
			this._flushPromise = undefined;
		});
	}

	private async _doFlushDirtyRange(): Promise<void> {
		const xterm = await this._terminalInstance.xtermReadyPromise;
		const sourceRaw = xterm?.raw;
		const detached = this._detachedTerminal ?? await this._getOrCreateTerminal();
		const detachedRaw = detached.xterm.raw;
		if (!sourceRaw || !detachedRaw) {
			return;
		}

		this._sourceRaw = sourceRaw;
		const currentCursor = this._getAbsoluteCursorY(sourceRaw);
		const previousCursor = this._lastUpToDateCursorY ?? currentCursor;
		const startCandidate = this._lowestDirtyCursorY ?? currentCursor;
		this._lowestDirtyCursorY = undefined;
		this._highestDirtyCursorY = undefined;

		const startLine = Math.min(previousCursor, startCandidate);
		// Ensure we resolve any pending flush even when no actual new output is available.
		const vt = await this._getCommandOutputAsVT();
		if (!vt) {
			return;
		}

		if (vt.text === this._lastVT) {
			this._lineCount = vt.lineCount;
			this._lastUpToDateCursorY = currentCursor;
			if (this._command.endMarker && !this._command.endMarker.isDisposed) {
				this._stopStreaming();
			}
			return;
		}

		const canAppend = !!this._lastVT && startLine >= previousCursor && vt.text.startsWith(this._lastVT);
		if (!this._lastVT || !canAppend) {
			detachedRaw.reset();
			if (vt.text) {
				detachedRaw.write(vt.text);
			}
		} else {
			const appended = vt.text.slice(this._lastVT.length);
			if (appended) {
				detachedRaw.write(appended);
			}
		}

		detachedRaw.scrollToBottom();
		detachedRaw.refresh(0, detachedRaw.rows - 1);

		this._lastVT = vt.text;
		this._lineCount = vt.lineCount;
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
