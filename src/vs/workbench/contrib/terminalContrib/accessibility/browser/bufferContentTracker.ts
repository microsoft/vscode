/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IMarker, Terminal } from 'xterm';

export class BufferContentTracker {
	/**
	 * Marks the last part of the buffer that was cached
	 */
	private _lastCachedMarker: IMarker | undefined;
	/**
	 * The number of wrapped lines in the viewport when the last cached marker was set
	 */
	private _priorEditorViewportLineCount: number = 0;

	private _lines: string[] = [];
	get lines(): string[] { return this._lines; }

	bufferToEditorLineMapping: Map<number, number> = new Map();

	constructor(
		private readonly _xterm: Pick<IXtermTerminal, 'getFont'> & { raw: Terminal },
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService) {
	}

	reset(): void {
		this._lines = [];
		this._lastCachedMarker = undefined;
		this.update();
	}

	update(): void {
		if (this._lastCachedMarker?.isDisposed) {
			// the terminal was cleared, reset the cache
			this._lines = [];
			this._lastCachedMarker = undefined;
		}
		this._removeViewportContent();
		this._updateCachedContent();
		this._updateViewportContent();
		this._lastCachedMarker = this._xterm.raw.registerMarker();
		this._logService.debug('Buffer content tracker: set ', this._lines.length, ' lines');
	}

	private _updateCachedContent(): void {
		const buffer = this._xterm.raw.buffer.active;
		const start = this._lastCachedMarker?.line ? this._lastCachedMarker.line - this._xterm.raw.rows + 1 : 0;
		const end = buffer.baseY;
		if (start < 0 || start > end) {
			// in the viewport, no need to cache
			return;
		}

		// to keep the cache size down, remove any lines that are no longer in the scrollback
		const scrollback: number = this._configurationService.getValue(TerminalSettingId.Scrollback);
		const maxBufferSize = scrollback + this._xterm.raw.rows - 1;
		const linesToAdd = end - start;
		if (linesToAdd + this._lines.length > maxBufferSize) {
			const numToRemove = linesToAdd + this._lines.length - maxBufferSize;
			for (let i = 0; i < numToRemove; i++) {
				this._lines.shift();
			}
			this._logService.debug('Buffer content tracker: removed ', numToRemove, ' lines from top of cached lines, now ', this._lines.length, ' lines');
		}

		// iterate through the buffer lines and add them to the editor line cache
		const cachedLines = [];
		let currentLine: string = '';
		for (let i = start; i < end; i++) {
			const line = buffer.getLine(i);
			if (!line) {
				continue;
			}
			this.bufferToEditorLineMapping.set(i, this._lines.length + cachedLines.length);
			const isWrapped = buffer.getLine(i + 1)?.isWrapped;
			currentLine += line.translateToString(!isWrapped);
			if (currentLine && !isWrapped || i === (buffer.baseY + this._xterm.raw.rows - 1)) {
				if (line.length) {
					cachedLines.push(currentLine);
					currentLine = '';
				}
			}
		}
		this._logService.debug('Buffer content tracker:', cachedLines.length, ' lines cached');
		this._lines.push(...cachedLines);
	}

	private _removeViewportContent(): void {
		if (!this._lines.length) {
			return;
		}
		// remove previous viewport content in case it has changed
		let linesToRemove = this._priorEditorViewportLineCount;
		let index = 1;
		while (linesToRemove) {
			this.bufferToEditorLineMapping.forEach((value, key) => { if (value === this._lines.length - index) { this.bufferToEditorLineMapping.delete(key); } });
			this._lines.pop();
			index++;
			linesToRemove--;
		}
		this._logService.debug('Buffer content tracker: removed lines from viewport, now ', this._lines.length, ' lines cached');
	}

	private _updateViewportContent(): void {
		const buffer = this._xterm.raw.buffer.active;
		this._priorEditorViewportLineCount = 0;
		let currentLine: string = '';
		for (let i = buffer.baseY; i < buffer.baseY + this._xterm.raw.rows; i++) {
			const line = buffer.getLine(i);
			if (!line) {
				continue;
			}
			this.bufferToEditorLineMapping.set(i, this._lines.length);
			const isWrapped = buffer.getLine(i + 1)?.isWrapped;
			currentLine += line.translateToString(!isWrapped);
			if (currentLine && !isWrapped || i === (buffer.baseY + this._xterm.raw.rows - 1)) {
				if (currentLine.length) {
					this._priorEditorViewportLineCount++;
					this._lines.push(currentLine);
					currentLine = '';
				}
			}
		}
		this._logService.debug('Viewport content update complete, ', this._lines.length, ' lines in the viewport');
	}
}
