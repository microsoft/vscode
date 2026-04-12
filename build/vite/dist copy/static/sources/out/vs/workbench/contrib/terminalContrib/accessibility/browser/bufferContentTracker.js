/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ITerminalLogService } from '../../../../../platform/terminal/common/terminal.js';
let BufferContentTracker = class BufferContentTracker extends Disposable {
    get lines() { return this._lines; }
    constructor(_xterm, _configurationService, _logService) {
        super();
        this._xterm = _xterm;
        this._configurationService = _configurationService;
        this._logService = _logService;
        /**
         * The number of wrapped lines in the viewport when the last cached marker was set
         */
        this._priorEditorViewportLineCount = 0;
        this._lines = [];
        this.bufferToEditorLineMapping = new Map();
    }
    reset() {
        this._lines = [];
        this._lastCachedMarker = undefined;
        this.update();
    }
    update() {
        if (this._lastCachedMarker?.isDisposed) {
            // the terminal was cleared, reset the cache
            this._lines = [];
            this._lastCachedMarker = undefined;
        }
        this._removeViewportContent();
        this._updateCachedContent();
        this._updateViewportContent();
        this._lastCachedMarker = this._register(this._xterm.raw.registerMarker());
        this._logService.debug('Buffer content tracker: set ', this._lines.length, ' lines');
    }
    _updateCachedContent() {
        const buffer = this._xterm.raw.buffer.active;
        const start = this._lastCachedMarker?.line ? this._lastCachedMarker.line - this._xterm.raw.rows + 1 : 0;
        const end = buffer.baseY;
        if (start < 0 || start > end) {
            // in the viewport, no need to cache
            return;
        }
        // to keep the cache size down, remove any lines that are no longer in the scrollback
        const scrollback = this._configurationService.getValue("terminal.integrated.scrollback" /* TerminalSettingId.Scrollback */);
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
        let currentLine = '';
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
    _removeViewportContent() {
        if (!this._lines.length) {
            return;
        }
        // remove previous viewport content in case it has changed
        let linesToRemove = this._priorEditorViewportLineCount;
        let index = 1;
        while (linesToRemove) {
            this.bufferToEditorLineMapping.forEach((value, key) => { if (value === this._lines.length - index) {
                this.bufferToEditorLineMapping.delete(key);
            } });
            this._lines.pop();
            index++;
            linesToRemove--;
        }
        this._logService.debug('Buffer content tracker: removed lines from viewport, now ', this._lines.length, ' lines cached');
    }
    _updateViewportContent() {
        const buffer = this._xterm.raw.buffer.active;
        this._priorEditorViewportLineCount = 0;
        let currentLine = '';
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
};
BufferContentTracker = __decorate([
    __param(1, IConfigurationService),
    __param(2, ITerminalLogService)
], BufferContentTracker);
export { BufferContentTracker };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVmZmVyQ29udGVudFRyYWNrZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvYWNjZXNzaWJpbGl0eS9icm93c2VyL2J1ZmZlckNvbnRlbnRUcmFja2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsbUJBQW1CLEVBQXFCLE1BQU0scURBQXFELENBQUM7QUFJdEcsSUFBTSxvQkFBb0IsR0FBMUIsTUFBTSxvQkFBcUIsU0FBUSxVQUFVO0lBV25ELElBQUksS0FBSyxLQUFlLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7SUFJN0MsWUFDa0IsTUFBMkQsRUFDckQscUJBQTZELEVBQy9ELFdBQWlEO1FBRXRFLEtBQUssRUFBRSxDQUFDO1FBSlMsV0FBTSxHQUFOLE1BQU0sQ0FBcUQ7UUFDcEMsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQUM5QyxnQkFBVyxHQUFYLFdBQVcsQ0FBcUI7UUFidkU7O1dBRUc7UUFDSyxrQ0FBNkIsR0FBVyxDQUFDLENBQUM7UUFFMUMsV0FBTSxHQUFhLEVBQUUsQ0FBQztRQUc5Qiw4QkFBeUIsR0FBd0IsSUFBSSxHQUFHLEVBQUUsQ0FBQztJQVEzRCxDQUFDO0lBRUQsS0FBSztRQUNKLElBQUksQ0FBQyxNQUFNLEdBQUcsRUFBRSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxTQUFTLENBQUM7UUFDbkMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQ2YsQ0FBQztJQUVELE1BQU07UUFDTCxJQUFJLElBQUksQ0FBQyxp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