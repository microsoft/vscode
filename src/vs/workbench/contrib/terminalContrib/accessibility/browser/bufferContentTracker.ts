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
	private _lastMarker: IMarker | undefined;
	private _lastLinesInViewport: number = 0;
	private _lines: string[] = [];
	get lines(): string[] { return this._lines; }
	constructor(
		private readonly _xterm: Pick<IXtermTerminal, 'getFont'> & { raw: Terminal },
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService) {
	}

	update(): void {
		if (this._lastMarker?.isDisposed) {
			this._clear();
		}
		this._removeViewportContent();
		this._updateScrollbackContent();
		this._updateViewportContent();
	}

	registerMarker(): void {
		this._lastMarker = this._xterm.raw.registerMarker();
	}

	private _clear(): void {
		this._lines = [];
	}

	private _removeViewportContent(): void {
		if (this._lines.length && this._lastMarker?.line) {
			// remove previous viewport content in case it has changed
			let i = 0;
			while (i < this._lastLinesInViewport) {
				this._lines.pop();
				i++;
			}
			this._logService.debug('Removed ', this._lastLinesInViewport, ' lines from cached lines, now ', this._lines.length, ' lines');
		}
	}

	private _updateViewportContent(): void {
		const buffer = this._xterm.raw.buffer.active;
		if (!buffer) {
			return;
		}
		let linesInViewport = 0;
		let currentLine: string = '';
		for (let i = buffer.baseY; i < buffer.baseY + this._xterm.raw.rows - 1; i++) {
			const line = buffer.getLine(i);
			if (!line) {
				continue;
			}
			const isWrapped = buffer.getLine(i + 1)?.isWrapped;
			currentLine += line.translateToString(!isWrapped);
			if (currentLine && !isWrapped || i === (buffer.baseY + this._xterm.raw.rows - 1)) {
				const line = currentLine.replace(new RegExp(' ', 'g'), '\xA0');
				if (line.length) {
					this._lines.push(line);
					linesInViewport++;
					currentLine = '';
				}
			}
		}
		this._lastLinesInViewport = linesInViewport;
		this._logService.debug('Viewport content update complete, ', this._lines.length, ' lines');
	}

	private _updateScrollbackContent(): void {
		const buffer = this._xterm.raw.buffer.active;
		if (!buffer) {
			return;
		}
		const scrollback: number = this._configurationService.getValue(TerminalSettingId.Scrollback);
		const maxBufferSize = scrollback + this._xterm.raw.rows - 1;
		const end = Math.min(maxBufferSize, buffer.baseY);
		const start = this._lastMarker?.line ? this._lastMarker.line - this._lastLinesInViewport : 0;
		this._logService.debug('Updating scrollback content, start: ', start, ' end: ', end, ' buffer size: ', buffer.length);
		const lines: string[] = [];
		let currentLine: string = '';
		for (let i = start; i < end; i++) {
			const line = buffer.getLine(i);
			if (!line) {
				continue;
			}
			const isWrapped = buffer.getLine(i + 1)?.isWrapped;
			currentLine += line.translateToString(!isWrapped);
			if (currentLine && !isWrapped || i === end - 1) {
				lines.push(currentLine.replace(new RegExp(' ', 'g'), '\xA0'));
				currentLine = '';
			}
		}
		this._lines.push(...lines);
		this._logService.debug('Updated scrollback content, now ', this._lines.length, ' lines');
	}
}
