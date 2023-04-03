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

	private _lastCachedMarker: IMarker | undefined;
	private _priorViewportLineCount: number = 0;

	private _lines: string[] = [];
	get lines(): string[] { return this._lines; }

	constructor(
		private readonly _xterm: Pick<IXtermTerminal, 'getFont'> & { raw: Terminal },
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService) {
	}

	update(): void {
		if (this._lastCachedMarker?.isDisposed) {
			// the terminal was cleared, reset the cache
			this._lines = [];
			this._lastCachedMarker = undefined;
		}
		this._removeViewportContent();
		const cached = this._getCachedContent();
		const viewport = this._updateViewportContent();
		this._lastCachedMarker = this._xterm.raw.registerMarker();
		this._lines = cached ? [...cached, ...viewport] : [...viewport];
		this._logService.debug('Cached lines', this._lines);
	}

	private _getCachedContent(): string[] | undefined {
		if (!this._lastCachedMarker?.line) {
			return undefined;
		}
		const cached = this._lines;
		let currentLine: string = '';
		const buffer = this._xterm.raw.buffer.active;
		const scrollback: number = this._configurationService.getValue(TerminalSettingId.Scrollback);
		const maxBufferSize = scrollback + this._xterm.raw.rows - 1;
		const numToAdd = this._xterm.raw.buffer.active.baseY - this._lastCachedMarker?.line + this._priorViewportLineCount;
		if (numToAdd + cached.length > maxBufferSize) {
			// remove lines from the top of the cache if it will exceed the max buffer size
			const numToRemove = numToAdd + cached.length - maxBufferSize;
			for (let i = 0; i < numToRemove; i++) {
				cached.shift();
			}
			this._logService.debug('Removed ', numToRemove, ' lines from top of cached lines, now ', cached.length, ' lines');
		}
		for (let i = this._lastCachedMarker?.line - this._priorViewportLineCount; i < this._xterm.raw.buffer.active.baseY; i++) {
			const line = buffer.getLine(i);
			if (!line) {
				continue;
			}
			const isWrapped = buffer.getLine(i + 1)?.isWrapped;
			currentLine += line.translateToString(!isWrapped);
			if (currentLine && !isWrapped || i === (buffer.baseY + this._xterm.raw.rows - 1)) {
				const line = currentLine.replace(new RegExp(' ', 'g'), '\xA0');
				if (line.length) {
					this._logService.debug('cached ', line);
					cached.push(line);
					currentLine = '';
				}
			}
		}
		return cached;
	}

	private _removeViewportContent(): void {
		if (this._lines.length && this._lastCachedMarker) {
			// remove previous viewport content in case it has changed
			let i = 0;
			while (i < (this._priorViewportLineCount < this._xterm.raw.rows ? this._priorViewportLineCount - 1 : this._priorViewportLineCount)) {
				this._lines.pop();
				i++;
			}
			this._logService.debug('Removed ', this._priorViewportLineCount, ' lines from cached lines, now ', this._lines.length, ' lines');
		}
	}

	private _updateViewportContent(): string[] {
		const buffer = this._xterm.raw.buffer.active;
		if (!buffer) {
			throw new Error('No buffer');
		}
		const viewport = [];
		let linesInViewport = 0;
		let currentLine: string = '';
		for (let i = buffer.baseY; i < buffer.baseY + this._xterm.raw.rows; i++) {
			const line = buffer.getLine(i);
			if (!line) {
				continue;
			}
			const isWrapped = buffer.getLine(i + 1)?.isWrapped;
			currentLine += line.translateToString(!isWrapped);
			if (currentLine && !isWrapped || i === (buffer.baseY + this._xterm.raw.rows - 1)) {
				const line = currentLine.replace(new RegExp(' ', 'g'), '\xA0');
				linesInViewport++;
				if (line.length) {
					viewport.push(line);
					currentLine = '';
				}
			}
		}
		this._priorViewportLineCount = linesInViewport;
		this._logService.debug('Viewport content update complete, ', viewport.length, ' lines');
		return viewport;
	}
}
