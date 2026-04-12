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
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ITerminalService } from './terminal.js';
import { DetachedProcessInfo } from './detachedTerminal.js';
import { TERMINAL_BACKGROUND_COLOR } from '../common/terminalColorRegistry.js';
import { PANEL_BACKGROUND } from '../../../common/theme.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { Color } from '../../../../base/common/color.js';
function getChatTerminalBackgroundColor(theme, contextKeyService, storedBackground) {
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
export function computeMaxBufferColumnWidth(buffer, cols) {
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
export function vtBoundaryMatches(newVT, oldVT, slicePoint, windowSize = 50) {
    const start = Math.max(0, slicePoint - windowSize);
    const end = slicePoint;
    for (let i = start; i < end; i++) {
        if (newVT.charCodeAt(i) !== oldVT.charCodeAt(i)) {
            return false;
        }
    }
    return true;
}
var ChatTerminalMirrorMetrics;
(function (ChatTerminalMirrorMetrics) {
    ChatTerminalMirrorMetrics[ChatTerminalMirrorMetrics["MirrorRowCount"] = 10] = "MirrorRowCount";
    ChatTerminalMirrorMetrics[ChatTerminalMirrorMetrics["MirrorColCountFallback"] = 80] = "MirrorColCountFallback";
    /**
     * Maximum number of lines for which we compute the max column width.
     * Computing max column width iterates the entire buffer, so we skip it
     * for large outputs to avoid performance issues.
     */
    ChatTerminalMirrorMetrics[ChatTerminalMirrorMetrics["MaxLinesForColumnWidthComputation"] = 100] = "MaxLinesForColumnWidthComputation";
})(ChatTerminalMirrorMetrics || (ChatTerminalMirrorMetrics = {}));
/**
 * Computes the line count for terminal output between start and end lines.
 * The end line is exclusive (points to the line after output ends).
 */
function computeOutputLineCount(startLine, endLine) {
    return Math.max(endLine - startLine, 0);
}
export async function getCommandOutputSnapshot(xtermTerminal, command, log) {
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
        let startMarker;
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
        let text;
        try {
            text = await xtermTerminal.getRangeAsVT(startMarker, endMarker, true);
        }
        catch (error) {
            log?.('fallback', error);
            return undefined;
        }
        finally {
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
    let text;
    try {
        text = await xtermTerminal.getRangeAsVT(executedMarker, endMarker, true);
    }
    catch (error) {
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
let DetachedTerminalCommandMirror = class DetachedTerminalCommandMirror extends Disposable {
    constructor(_xtermTerminal, _command, _terminalService, _contextKeyService) {
        super();
        this._xtermTerminal = _xtermTerminal;
        this._command = _command;
        this._terminalService = _terminalService;
        this._contextKeyService = _contextKeyService;
        this._streamingDisposables = this._register(new DisposableStore());
        this._onDidUpdateEmitter = this._register(new Emitter());
        this.onDidUpdate = this._onDidUpdateEmitter.event;
        this._onDidInputEmitter = this._register(new Emitter());
        this.onDidInput = this._onDidInputEmitter.event;
        this._lastVT = '';
        this._lineCount = 0;
        this._maxColumnWidth = 0;
        this._dirtyScheduled = false;
        this._isStreaming = false;
        this._register(toDisposable(() => {
            this._stopStreaming();
        }));
    }
    async attach(container) {
        if (this._store.isDisposed) {
            return;
        }
        let terminal;
        try {
            terminal = await this._getOrCreateTerminal();
        }
        catch (error) {
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
    async renderCommand() {
        if (this._store.isDisposed) {
            return undefined;
        }
        let detached;
        try {
            detached = await this._getOrCreateTerminal();
        }
        catch (error) {
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
        }
        catch {
            // ignore and treat as no output
        }
        if (!vt) {
            return undefined;
        }
        if (this._store.isDisposed) {
            return undefined;
        }
        await new Promise(resolve => {
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
                }
                else {
                    resolve();
                }
            }
            else {
                const appended = vt.text.slice(this._lastVT.length);
                if (appended) {
                    detached.xterm.write(appended, resolve);
                }
                else {
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
        if (commandFinished && this._lineCount <= 100 /* ChatTerminalMirrorMetrics.MaxLinesForColumnWidthComputation */) {
            this._maxColumnWidth = this._computeMaxColumnWidth();
        }
        return { lineCount: this._lineCount, maxColumnWidth: this._maxColumnWidth };
    }
    async _getCommandOutputAsVT(source) {
        if (this._store.isDisposed) {
            return undefined;
        }
        const executedMarker = this._command.executedMarker ?? this._command.commandExecutedMarker;
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
    _getRenderedLineCount() {
        // Calculate line count from the command's markers when available
        const endMarker = this._command.endMarker;
        if (this._command.executedMarker && endMarker && !endMarker.isDisposed) {
            const startLine = this._command.executedMarker.line;
            const endLine = endMarker.line;
            return computeOutputLineCount(startLine, endLine);
        }
        // During streaming (no end marker), calculate from the source terminal buffer
        const executedMarker = this._command.executedMarker ?? this._command.commandExecutedMarker;
        if (executedMarker && this._sourceRaw) {
            const buffer = this._sourceRaw.buffer.active;
            const currentLine = buffer.baseY + buffer.cursorY;
            return computeOutputLineCount(executedMarker.line, currentLine);
        }
        return this._lineCount;
    }
    _computeMaxColumnWidth() {
        const detached = this._detachedTerminal;
        if (!detached) {
            return 0;
        }
        return computeMaxBufferColumnWidth(detached.xterm.buffer.active, detached.xterm.cols);
    }
    async _getOrCreateTerminal() {
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
                getBackgroundColor: (theme) => getChatTerminalBackgroundColor(theme, this._contextKeyService)
            };
            const processInfo = new DetachedProcessInfo({ initialCwd: '' });
            const detached = await this._terminalService.createDetachedTerminal({
                cols: this._xtermTerminal.raw.cols ?? 80 /* ChatTerminalMirrorMetrics.MirrorColCountFallback */,
                rows: 10 /* ChatTerminalMirrorMetrics.MirrorRowCount */,
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
    _startStreaming(raw) {
        if (this._store.isDisposed || this._isStreaming) {
            return;
        }
        this._isStreaming = true;
        this._streamingDisposables.add(Event.any(raw.onCursorMove, raw.onLineFeed, raw.onWriteParsed)(() => this._handleCursorEvent()));
        this._streamingDisposables.add(raw.onData(() => this._handleCursorEvent()));
    }
    _stopStreaming() {
        if (!this._isStreaming) {
            return;
        }
        this._streamingDisposables.clear();
        this._isStreaming = false;
        this._lowestDirtyCursorY = undefined;
        this._sourceRaw = undefined;
    }
    _handleCursorEvent() {
        if (this._store.isDisposed || !this._sourceRaw) {
            return;
        }
        const cursorY = this._getAbsoluteCursorY(this._sourceRaw);
        this._lowestDirtyCursorY = this._lowestDirtyCursorY === undefined ? cursorY : Math.min(this._lowestDirtyCursorY, cursorY);
        this._scheduleFlush();
    }
    _scheduleFlush() {
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
    _flushDirtyRange() {
        if (this._store.isDisposed || this._flushPromise) {
            return;
        }
        this._flushPromise = this._doFlushDirtyRange().finally(() => {
            this._flushPromise = undefined;
        });
    }
    async _doFlushDirtyRange() {
        if (this._store.isDisposed) {
            return;
        }
        const sourceRaw = this._xtermTerminal.raw;
        let detached = this._detachedTerminal;
        if (!detached) {
            try {
                detached = await this._getOrCreateTerminal();
            }
            catch (error) {
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
        await new Promise(resolve => {
            if (!canAppend) {
                // Use \x1bc (RIS) + new content in one write to avoid a blank frame
                const payload = this._lastVT ? `\x1bc${vt.text}` : vt.text;
                if (payload) {
                    detachedRaw.write(payload, resolve);
                }
                else {
                    resolve();
                }
            }
            else {
                const appended = vt.text.slice(this._lastVT.length);
                if (appended) {
                    detachedRaw.write(appended, resolve);
                }
                else {
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
            if (this._lineCount <= 100 /* ChatTerminalMirrorMetrics.MaxLinesForColumnWidthComputation */) {
                this._maxColumnWidth = this._computeMaxColumnWidth();
            }
            this._stopStreaming();
        }
        this._onDidUpdateEmitter.fire({ lineCount: this._lineCount, maxColumnWidth: this._maxColumnWidth });
    }
    _getAbsoluteCursorY(raw) {
        return raw.buffer.active.baseY + raw.buffer.active.cursorY;
    }
    /**
     * Checks if the new VT text matches the old VT around the boundary where we would slice.
     */
    _vtBoundaryMatches(newVT, slicePoint) {
        return vtBoundaryMatches(newVT, this._lastVT, slicePoint);
    }
};
DetachedTerminalCommandMirror = __decorate([
    __param(2, ITerminalService),
    __param(3, IContextKeyService)
], DetachedTerminalCommandMirror);
export { DetachedTerminalCommandMirror };
/**
 * Mirrors a terminal output snapshot into a detached terminal instance.
 * Used when the terminal has been disposed of but we still want to show the output.
 */
let DetachedTerminalSnapshotMirror = class DetachedTerminalSnapshotMirror extends Disposable {
    constructor(output, _getTheme, _terminalService, _contextKeyService) {
        super();
        this._getTheme = _getTheme;
        this._terminalService = _terminalService;
        this._contextKeyService = _contextKeyService;
        this._dirty = true;
        this._output = output;
        const processInfo = this._register(new DetachedProcessInfo({ initialCwd: '' }));
        this._detachedTerminal = this._terminalService.createDetachedTerminal({
            cols: 80 /* ChatTerminalMirrorMetrics.MirrorColCountFallback */,
            rows: 10 /* ChatTerminalMirrorMetrics.MirrorRowCount */,
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
    async _getTerminal() {
        if (!this._detachedTerminal) {
            throw new Error('Detached terminal not initialized');
        }
        return this._detachedTerminal;
    }
    setOutput(output) {
        this._output = output;
        this._dirty = true;
    }
    async attach(container) {
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
    async render() {
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
        await new Promise(resolve => terminal.xterm.write(text, resolve));
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
    _computeMaxColumnWidth(terminal) {
        return computeMaxBufferColumnWidth(terminal.xterm.buffer.active, terminal.xterm.cols);
    }
    _estimateLineCount(text) {
        if (!text) {
            return 0;
        }
        const sanitized = text.replace(/\r/g, '');
        const segments = sanitized.split('\n');
        const count = sanitized.endsWith('\n') ? segments.length - 1 : segments.length;
        return Math.max(count, 1);
    }
    _shouldComputeMaxColumnWidth(lineCount) {
        return lineCount <= 100 /* ChatTerminalMirrorMetrics.MaxLinesForColumnWidthComputation */;
    }
    _applyTheme(container) {
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
};
DetachedTerminalSnapshotMirror = __decorate([
    __param(2, ITerminalService),
    __param(3, IContextKeyService)
], DetachedTerminalSnapshotMirror);
export { DetachedTerminalSnapshotMirror };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRlcm1pbmFsQ29tbWFuZE1pcnJvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvY2hhdFRlcm1pbmFsQ29tbWFuZE1pcnJvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBR2xFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBa0MsTUFBTSxlQUFlLENBQUM7QUFDakYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFFNUQsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDL0UsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDNUQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUt6RCxTQUFTLDhCQUE4QixDQUFDLEtBQWtCLEVBQUUsaUJBQXFDLEVBQUUsZ0JBQXlCO0lBQzNILElBQUksZ0JBQWdCLEVBQUUsQ0FBQztRQUN0QixNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDOUMsSUFBSSxL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