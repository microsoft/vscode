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
import { coalesce } from '../../../../../base/common/arrays.js';
import { Disposable, DisposableStore, MutableDisposable, dispose } from '../../../../../base/common/lifecycle.js';
import { timeout } from '../../../../../base/common/async.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TERMINAL_OVERVIEW_RULER_CURSOR_FOREGROUND_COLOR } from '../../common/terminalColorRegistry.js';
import { getWindow } from '../../../../../base/browser/dom.js';
import { isFullTerminalCommand } from '../../../../../platform/terminal/common/capabilities/commandDetection/terminalCommand.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
var Boundary;
(function (Boundary) {
    Boundary[Boundary["Top"] = 0] = "Top";
    Boundary[Boundary["Bottom"] = 1] = "Bottom";
})(Boundary || (Boundary = {}));
export var ScrollPosition;
(function (ScrollPosition) {
    ScrollPosition[ScrollPosition["Top"] = 0] = "Top";
    ScrollPosition[ScrollPosition["Middle"] = 1] = "Middle";
})(ScrollPosition || (ScrollPosition = {}));
let MarkNavigationAddon = class MarkNavigationAddon extends Disposable {
    activate(terminal) {
        this._terminal = terminal;
        this._register(this._terminal.onData(() => {
            this._currentMarker = Boundary.Bottom;
        }));
    }
    constructor(_capabilities, _configurationService, _themeService) {
        super();
        this._capabilities = _capabilities;
        this._configurationService = _configurationService;
        this._themeService = _themeService;
        this._currentMarker = Boundary.Bottom;
        this._selectionStart = null;
        this._isDisposable = false;
        this._commandGuideDecorations = this._register(new MutableDisposable());
    }
    _getMarkers(skipEmptyCommands) {
        const commandCapability = this._capabilities.get(2 /* TerminalCapability.CommandDetection */);
        const partialCommandCapability = this._capabilities.get(3 /* TerminalCapability.PartialCommandDetection */);
        const markCapability = this._capabilities.get(4 /* TerminalCapability.BufferMarkDetection */);
        let markers = [];
        if (commandCapability) {
            markers = coalesce(commandCapability.commands.filter(e => skipEmptyCommands ? e.exitCode !== undefined : true).map(e => e.promptStartMarker ?? e.marker));
            // Allow navigating to the current command iff it has been executed, this ignores the
            // skipEmptyCommands flag intenionally as chances are it's not going to be empty if an
            // executed marker exists when this is requested.
            if (commandCapability.currentCommand?.promptStartMarker && commandCapability.currentCommand.commandExecutedMarker) {
                markers.push(commandCapability.currentCommand?.promptStartMarker);
            }
        }
        else if (partialCommandCapability) {
            markers.push(...partialCommandCapability.commands);
        }
        if (markCapability && !skipEmptyCommands) {
            let next = markCapability.markers().next()?.value;
            const arr = [];
            while (next) {
                arr.push(next);
                next = markCapability.markers().next()?.value;
            }
            markers = arr;
        }
        return markers;
    }
    _findCommand(marker) {
        const commandCapability = this._capabilities.get(2 /* TerminalCapability.CommandDetection */);
        if (commandCapability) {
            const command = commandCapability.commands.find(e => e.marker?.line === marker.line || e.promptStartMarker?.line === marker.line);
            if (command) {
                return command;
            }
            if (commandCapability.currentCommand) {
                return commandCapability.currentCommand;
            }
        }
        return undefined;
    }
    clear() {
        // Clear the current marker so successive focus/selection actions are performed from the
        // bottom of the buffer
        this._currentMarker = Boundary.Bottom;
        this._resetNavigationDecorations();
        this._selectionStart = null;
    }
    _resetNavigationDecorations() {
        if (this._navigationDecorations) {
            dispose(this._navigationDecorations);
        }
        this._navigationDecorations = [];
    }
    _isEmptyCommand(marker) {
        if (marker === Boundary.Bottom) {
            return true;
        }
        if (marker === Boundary.Top) {
            return !this._getMarkers(true).map(e => e.line).includes(0);
        }
        return !this._getMarkers(true).includes(marker);
    }
    scrollToPreviousMark(scrollPosition = 1 /* ScrollPosition.Middle */, retainSelection = false, skipEmptyCommands = true) {
        if (!this._terminal) {
            return;
        }
        if (!retainSelection) {
            this._selectionStart = null;
        }
        let markerIndex;
        const currentLineY = typeof this._currentMarker === 'object'
            ? this.getTargetScrollLine(this._currentMarker.line, scrollPosition)
            : Math.min(getLine(this._terminal, this._currentMarker), this._terminal.buffer.active.baseY);
        const viewportY = this._terminal.buffer.active.viewportY;
        if (typeof this._currentMarker === 'object' ? !this._isMarkerInViewport(this._terminal, this._currentMarker) : currentLineY !== viewportY) {
            // The user has scrolled, find the line based on the current scroll position. This only
            // works when not retaining selection
            const markersBelowViewport = this._getMarkers(skipEmptyCommands).filter(e => e.line >= viewportY).length;
            // -1 will scroll to the top
            markerIndex = this._getMarkers(skipEmptyCommands).length - markersBelowViewport - 1;
        }
        else if (this._currentMarker === Boundary.Bottom) {
            markerIndex = this._getMarkers(skipEmptyCommands).length - 1;
        }
        else if (this._currentMarker === Boundary.Top) {
            markerIndex = -1;
        }
        else if (this._isDisposable) {
            markerIndex = this._findPreviousMarker(skipEmptyCommands);
            this._currentMarker.dispose();
            this._isDisposable = false;
        }
        else {
            if (skipEmptyCommands && this._isEmptyCommand(this._currentMarker)) {
                markerIndex = this._findPreviousMarker(true);
            }
            else {
                markerIndex = this._getMarkers(skipEmptyCommands).indexOf(this._currentMarker) - 1;
            }
        }
        if (markerIndex < 0) {
            this._currentMarker = Boundary.Top;
            this._terminal.scrollToTop();
            this._resetNavigationDecorations();
            return;
        }
        this._currentMarker = this._getMarkers(skipEmptyCommands)[markerIndex];
        this._scrollToCommand(this._currentMarker, scrollPosition);
    }
    scrollToNextMark(scrollPosition = 1 /* ScrollPosition.Middle */, retainSelection = false, skipEmptyCommands = true) {
        if (!this._terminal) {
            return;
        }
        if (!retainSelection) {
            this._selectionStart = null;
        }
        let markerIndex;
        const currentLineY = typeof this._currentMarker === 'object'
            ? this.getTargetScrollLine(this._currentMarker.line, scrollPosition)
            : Math.min(getLine(this._terminal, this._currentMarker), this._terminal.buffer.active.baseY);
        const viewportY = this._terminal.buffer.active.viewportY;
        if (typeof this._currentMarker === 'object' ? !this._isMarkerInViewport(this._terminal, this._currentMarker) : currentLineY !== viewportY) {
            // The user has scrolled, find the line based on the current scroll position. This only
            // works when not retaining selection
            const markersAboveViewport = this._getMarkers(skipEmptyCommands).filter(e => e.line <= viewportY).length;
            // markers.length will scroll to the bottom
            markerIndex = markersAboveViewport;
        }
        else if (this._currentMarker === Boundary.Bottom) {
            markerIndex = this._getMarkers(skipEmptyCommands).length;
        }
        else if (this._currentMarker === Boundary.Top) {
            markerIndex = 0;
        }
        else if (this._isDisposable) {
            markerIndex = this._findNextMarker(skipEmptyCommands);
            this._currentMarker.dispose();
            this._isDisposable = false;
        }
        else {
            if (skipEmptyCommands && this._isEmptyCommand(this._currentMarker)) {
                markerIndex = this._findNextMarker(true);
            }
            else {
                markerIndex = this._getMarkers(skipEmptyCommands).indexOf(this._currentMarker) + 1;
            }
        }
        if (markerIndex >= this._getMarkers(skipEmptyCommands).length) {
            this._currentMarker = Boundary.Bottom;
            this._terminal.scrollToBottom();
            this._resetNavigationDecorations();
            return;
        }
        this._currentMarker = this._getMarkers(skipEmptyCommands)[markerIndex];
        this._scrollToCommand(this._currentMarker, scrollPosition);
    }
    _scrollToCommand(marker, position) {
        const command = this._findCommand(marker);
        if (command) {
            this.revealCommand(command, position);
        }
        else {
            this._scrollToMarker(marker, position);
        }
    }
    _scrollToMarker(start, position, end, options) {
        if (!this._terminal) {
            return;
        }
        if (!this._isMarkerInViewport(this._terminal, start) || options?.forceScroll) {
            const line = this.getTargetScrollLine(toLineIndex(start), position);
            this._terminal.scrollToLine(line);
        }
        if (!options?.hideDecoration) {
            if (options?.bufferRange) {
                this._highlightBufferRange(options.bufferRange);
            }
            else {
                this.registerTemporaryDecoration(start, end, true);
            }
        }
    }
    _createMarkerForOffset(marker, offset) {
        if (offset === 0 && isMarker(marker)) {
            return marker;
        }
        else {
            const offsetMarker = this._terminal?.registerMarker(-this._terminal.buffer.active.cursorY + toLineIndex(marker) - this._terminal.buffer.active.baseY + offset);
            if (offsetMarker) {
                return offsetMarker;
            }
            else {
                throw new Error(`Could not register marker with offset ${toLineIndex(marker)}, ${offset}`);
            }
        }
    }
    revealCommand(command, position = 1 /* ScrollPosition.Middle */) {
        const marker = isFullTerminalCommand(command) ? command.marker : command.commandStartMarker;
        if (!this._terminal || !marker) {
            return;
        }
        const line = toLineIndex(marker);
        const promptRowCount = command.getPromptRowCount();
        const commandRowCount = command.getCommandRowCount();
        this._scrollToMarker(line - (promptRowCount - 1), position, line + (commandRowCount - 1));
    }
    revealRange(range) {
        this._scrollToMarker(range.start.y - 1, 1 /* ScrollPosition.Middle */, range.end.y - 1, {
            bufferRange: range,
            // Ensure scroll shows the line when sticky scroll is enabled
            forceScroll: !!this._configurationService.getValue("terminal.integrated.stickyScroll.enabled" /* TerminalContribSettingId.StickyScrollEnabled */)
        });
    }
    showCommandGuide(command) {
        if (!this._terminal) {
            return;
        }
        if (!command) {
            this._commandGuideDecorations.clear();
            this._activeCommandGuide = undefined;
            return;
        }
        if (this._activeCommandGuide === command) {
            return;
        }
        if (command.marker) {
            this._activeCommandGuide = command;
            // Highlight output
            const store = this._commandGuideDecorations.value = new DisposableStore();
            if (!command.executedMarker || !command.endMarker) {
                return;
            }
            const startLine = command.marker.line - (command.getPromptRowCount() - 1);
            const decorationCount = toLineIndex(command.endMarker) - startLine;
            // Abort if the command is excessively long to avoid performance on hover/leave
            if (decorationCount > 200) {
                return;
            }
            for (let i = 0; i < decorationCount; i++) {
                const decoration = this._terminal.registerDecoration({
                    marker: this._createMarkerForOffset(startLine, i)
                });
                if (decoration) {
                    store.add(decoration);
                    let renderedElement;
                    store.add(decoration.onRender(element => {
                        if (!renderedElement) {
                            renderedElement = element;
                            element.classList.add('terminal-command-guide');
                            if (i === 0) {
                                element.classList.add('top');
                            }
                            if (i === decorationCount - 1) {
                                element.classList.add('bottom');
                            }
                        }
                    }));
                }
            }
        }
    }
    saveScrollState() {
        this._scrollState = { viewportY: this._terminal?.buffer.active.viewportY ?? 0 };
    }
    restoreScrollState() {
        if (this._scrollState && this._terminal) {
            this._terminal.scrollToLine(this._scrollState.viewportY);
            this._scrollState = undefined;
        }
    }
    _highlightBufferRange(range) {
        if (!this._terminal) {
            return;
        }
        this._resetNavigationDecorations();
        const startLine = range.start.y;
        const decorationCount = range.end.y - range.start.y + 1;
        for (let i = 0; i < decorationCount; i++) {
            const decoration = this._terminal.registerDecoration({
                marker: this._createMarkerForOffset(startLine - 1, i),
                x: range.start.x - 1,
                width: (range.end.x - 1) - (range.start.x - 1) + 1,
                overviewRulerOptions: undefined
            });
            if (decoration) {
                this._navigationDecorations?.push(decoration);
                let renderedElement;
                decoration.onRender(element => {
                    if (!renderedElement) {
                        renderedElement = element;
                        element.classList.add('terminal-range-highlight');
                    }
                });
                decoration.onDispose(() => { this._navigationDecorations = this._navigationDecorations?.filter(d => d !== decoration); });
            }
        }
    }
    registerTemporaryDecoration(marker, endMarker, showOutline) {
        if (!this._terminal) {
            return;
        }
        this._resetNavigationDecorations();
        const color = this._themeService.getColorTheme().getColor(TERMINAL_OVERVIEW_RULER_CURSOR_FOREGROUND_COLOR);
        const startLine = toLineIndex(marker);
        const decorationCount = endMarker ? toLineIndex(endMarker) - startLine + 1 : 1;
        for (let i = 0; i < decorationCount; i++) {
            const decoration = this._terminal.registerDecoration({
                marker: this._createMarkerForOffset(marker, i),
                width: this._terminal.cols,
                overviewRulerOptions: i === 0 ? {
                    color: color?.toString() || '#a0a0a0cc'
                } : undefined
            });
            if (decoration) {
                this._navigationDecorations?.push(decoration);
                let renderedElement;
                decoration.onRender(element => {
                    if (!renderedElement) {
                        renderedElement = element;
                        element.classList.add('terminal-scroll-highlight');
                        if (showOutline) {
                            element.classList.add('terminal-scroll-highlight-outline');
                        }
                        if (i === 0) {
                            element.classList.add('top');
                        }
                        if (i === decorationCount - 1) {
                            element.classList.add('bottom');
                        }
                    }
                    else {
                        element.classList.add('terminal-scroll-highlight');
                    }
                    if (this._terminal?.element) {
                        element.style.marginLeft = `-${getWindow(this._terminal.element).getComputedStyle(this._terminal.element).paddingLeft}`;
                    }
                });
                // TODO: This is not efficient for a large decorationCount
                decoration.onDispose(() => { this._navigationDecorations = this._navigationDecorations?.filter(d => d !== decoration); });
                // Number picked to align with symbol highlight in the editor
                if (showOutline) {
                    timeout(350).then(() => {
                        if (renderedElement) {
                            renderedElement.classList.remove('terminal-scroll-highlight-outline');
                        }
                    });
                }
            }
        }
    }
    scrollToLine(line, position) {
        this._terminal?.scrollToLine(this.getTargetScrollLine(line, position));
    }
    getTargetScrollLine(line, position) {
        // Middle is treated as 1/4 of the viewport's size because context below is almost always
        // more important than context above in the terminal.
        if (this._terminal && position === 1 /* ScrollPosition.Middle */) {
            return Math.max(line - Math.floor(this._terminal.rows / 4), 0);
        }
        return line;
    }
    _isMarkerInViewport(terminal, marker) {
        const viewportY = terminal.buffer.active.viewportY;
        const line = toLineIndex(marker);
        return line >= viewportY && line < viewportY + terminal.rows;
    }
    scrollToClosestMarker(startMarkerId, endMarkerId, highlight) {
        const detectionCapability = this._capabilities.get(4 /* TerminalCapability.BufferMarkDetection */);
        if (!detectionCapability) {
            return;
        }
        const startMarker = detectionCapability.getMark(startMarkerId);
        if (!startMarker) {
            return;
        }
        const endMarker = endMarkerId ? detectionCapability.getMark(endMarkerId) : startMarker;
        this._scrollToMarker(startMarker, 0 /* ScrollPosition.Top */, endMarker, { hideDecoration: !highlight });
    }
    selectToPreviousMark() {
        if (!this._terminal) {
            return;
        }
        if (this._selectionStart === null) {
            this._selectionStart = this._currentMarker;
        }
        if (this._capabilities.has(2 /* TerminalCapability.CommandDetection */)) {
            this.scrollToPreviousMark(1 /* ScrollPosition.Middle */, true, true);
        }
        else {
            this.scrollToPreviousMark(1 /* ScrollPosition.Middle */, true, false);
        }
        selectLines(this._terminal, this._currentMarker, this._selectionStart);
    }
    selectToNextMark() {
        if (!this._terminal) {
            return;
        }
        if (this._selectionStart === null) {
            this._selectionStart = this._currentMarker;
        }
        if (this._capabilities.has(2 /* TerminalCapability.CommandDetection */)) {
            this.scrollToNextMark(1 /* ScrollPosition.Middle */, true, true);
        }
        else {
            this.scrollToNextMark(1 /* ScrollPosition.Middle */, true, false);
        }
        selectLines(this._terminal, this._currentMarker, this._selectionStart);
    }
    selectToPreviousLine() {
        if (!this._terminal) {
            return;
        }
        if (this._selectionStart === null) {
            this._selectionStart = this._currentMarker;
        }
        this.scrollToPreviousLine(this._terminal, 1 /* ScrollPosition.Middle */, true);
        selectLines(this._terminal, this._currentMarker, this._selectionStart);
    }
    selectToNextLine() {
        if (!this._terminal) {
            return;
        }
        if (this._selectionStart === null) {
            this._selectionStart = this._currentMarker;
        }
        this.scrollToNextLine(this._terminal, 1 /* ScrollPosition.Middle */, true);
        selectLines(this._terminal, this._currentMarker, this._selectionStart);
    }
    scrollToPreviousLine(xterm, scrollPosition = 1 /* ScrollPosition.Middle */, retainSelection = false) {
        if (!retainSelection) {
            this._selectionStart = null;
        }
        if (this._currentMarker === Boundary.Top) {
            xterm.scrollToTop();
            return;
        }
        if (this._currentMarker === Boundary.Bottom) {
            this._currentMarker = this._registerMarkerOrThrow(xterm, this._getOffset(xterm) - 1);
        }
        else {
            const offset = this._getOffset(xterm);
            if (this._isDisposable) {
                this._currentMarker.dispose();
            }
            this._currentMarker = this._registerMarkerOrThrow(xterm, offset - 1);
        }
        this._isDisposable = true;
        this._scrollToMarker(this._currentMarker, scrollPosition);
    }
    scrollToNextLine(xterm, scrollPosition = 1 /* ScrollPosition.Middle */, retainSelection = false) {
        if (!retainSelection) {
            this._selectionStart = null;
        }
        if (this._currentMarker === Boundary.Bottom) {
            xterm.scrollToBottom();
            return;
        }
        if (this._currentMarker === Boundary.Top) {
            this._currentMarker = this._registerMarkerOrThrow(xterm, this._getOffset(xterm) + 1);
        }
        else {
            const offset = this._getOffset(xterm);
            if (this._isDisposable) {
                this._currentMarker.dispose();
            }
            this._currentMarker = this._registerMarkerOrThrow(xterm, offset + 1);
        }
        this._isDisposable = true;
        this._scrollToMarker(this._currentMarker, scrollPosition);
    }
    _registerMarkerOrThrow(xterm, cursorYOffset) {
        const marker = xterm.registerMarker(cursorYOffset);
        if (!marker) {
            throw new Error(`Could not create marker for ${cursorYOffset}`);
        }
        return marker;
    }
    _getOffset(xterm) {
        if (this._currentMarker === Boundary.Bottom) {
            return 0;
        }
        else if (this._currentMarker === Boundary.Top) {
            return 0 - (xterm.buffer.active.baseY + xterm.buffer.active.cursorY);
        }
        else {
            let offset = getLine(xterm, this._currentMarker);
            offset -= xterm.buffer.active.baseY + xterm.buffer.active.cursorY;
            return offset;
        }
    }
    _findPreviousMarker(skipEmptyCommands = false) {
        if (this._currentMarker === Boundary.Top) {
            return 0;
        }
        else if (this._currentMarker === Boundary.Bottom) {
            return this._getMarkers(skipEmptyCommands).length - 1;
        }
        let i;
        for (i = this._getMarkers(skipEmptyCommands).length - 1; i >= 0; i--) {
            if (this._getMarkers(skipEmptyCommands)[i].line < this._currentMarker.line) {
                return i;
            }
        }
        return -1;
    }
    _findNextMarker(skipEmptyCommands = false) {
        if (this._currentMarker === Boundary.Top) {
            return 0;
        }
        else if (this._currentMarker === Boundary.Bottom) {
            return this._getMarkers(skipEmptyCommands).length - 1;
        }
        let i;
        for (i = 0; i < this._getMarkers(skipEmptyCommands).length; i++) {
            if (this._getMarkers(skipEmptyCommands)[i].line > this._currentMarker.line) {
                return i;
            }
        }
        return this._getMarkers(skipEmptyCommands).length;
    }
};
MarkNavigationAddon = __decorate([
    __param(1, IConfigurationService),
    __param(2, IThemeService)
], MarkNavigationAddon);
export { MarkNavigationAddon };
export function getLine(xterm, marker) {
    // Use the _second last_ row as the last row is likely the prompt
    if (marker === Boundary.Bottom) {
        return xterm.buffer.active.baseY + xterm.rows - 1;
    }
    if (marker === Boundary.Top) {
        return 0;
    }
    return marker.line;
}
export function selectLines(xterm, start, end) {
    if (end === null) {
        end = Boundary.Bottom;
    }
    let startLine = getLine(xterm, start);
    let endLine = getLine(xterm, end);
    if (startLine > endLine) {
        const temp = startLine;
        startLine = endLine;
        endLine = temp;
    }
    // Subtract a line as the marker is on the line the command run, we do not want the next
    // command in the selection for the current command
    endLine -= 1;
    xterm.selectLines(startLine, endLine);
}
function isMarker(value) {
    return typeof value !== 'number';
}
function toLineIndex(line) {
    return isMarker(line) ? line.line : line;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya05hdmlnYXRpb25BZGRvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIveHRlcm0vbWFya05hdmlnYXRpb25BZGRvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsT0FBTyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFJbEgsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNyRixPQUFPLEVBQUUsK0NBQStDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN4RyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDL0QsT0FBTyxFQUEwQixxQkFBcUIsRUFBRSxNQUFNLDBGQUEwRixDQUFDO0FBQ3pKLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBR3RHLElBQUssUUFHSjtBQUhELFdBQUssUUFBUTtJQUNaLHFDQUFHLENBQUE7SUFDSCwyQ0FBTSxDQUFBO0FBQ1AsQ0FBQyxFQUhJLFFBQVEsS0FBUixRQUFRLFFBR1o7QUFFRCxNQUFNLENBQU4sSUFBa0IsY0FHakI7QUFIRCxXQUFrQixjQUFjO0lBQy9CLGlEQUFHLENBQUE7SUFDSCx1REFBTSxDQUFBO0FBQ1AsQ0FBQyxFQUhpQixjQUFjLEtBQWQsY0FBYyxRQUcvQjtBQVNNLElBQU0sbUJBQW1CLEdBQXpCLE1BQU0sbUJBQW9CLFNBQVEsVUFBVTtJQVVsRCxRQUFRLENBQUMsUUFBa0I7UUFDMUIsSUFBSSxDQUFDLFNBQVMsR0FBRyxRQUFRLENBQUM7UUFDMUIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUU7WUFDekMsSUFBSSxDQUFDLGNBQWMsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDO1FBQ3ZDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsWUFDa0IsYUFBdUMsRUFDakMscUJBQTZELEVBQ3JFLGFBQTZDO1FBRTVELEtBQUssRUFBRSxDQUFDO1FBSlMsa0JBQWEsR0FBYixhQUFhLENBQTBCO1FBQ2hCLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7UUFDcEQsa0JBQWEsR0FBYixhQUFhLENBQWU7UUFuQnJELG1CQUFjLEdBQXVCLFFBQVEsQ0FBQyxNQUFNLENBQUM7UUFDckQsb0JBQWUsR0FBOEIsSUFBSSxDQUFDO1FBQ2xELGtCQUFhLEdBQVksS0FBSyxDQUFDO1FBS3RCLDZCQUF3QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxpQkFBaUIsRUFBbUIsQ0FBQyxDQUFDO0lBZXJHLENBQUM7SUFFTyxXQUFXLENBQUMsaUJBQTJCO1FBQzlDLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLDZDQUFxQyxDQUFDO1FBQ3RGLE1BQU0sd0JBQXdCLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLG9EQUE0QyxDQUFDO1FBQ3BHLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxnREFBd0MsQ0FBQztRQUN0RixJQUFJLE9BQU8sR0FBYyxFQUFFLENBQUM7UUFDNUIsSUFBSSxpQkFBaUIsRUFBRSxDQUFDO1lBQ3ZCLE9BQU8sR0FBRyxRQUFRLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQzFKLHFGQUFxRjtZQUNyRixzRkFBc0Y7WUFDdEYsaURBQWlEO1lBQ2pELElBQUksaUJBQWlCLENBQUMsY0FBYyxFQUFFLGlCQUFpQixJQUFJLGlCQUFpQixDQUFDLGNBQWMsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO2dCQUNuSCxPQUFPLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGNBQWMsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1lBQ25FLENBQUM7UUFDRixDQUFDO2FBQU0sSUFBSSx3QkFBd0IsRUFBRSxDQUFDO1lBQ3JDLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyx3QkFBd0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNwRCxDQUFDO1FBRUQsSUFBSSxjQUFjLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQzFDLElBQUksSUFBSSxHQUFHLGNBQWMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRSxLQUFLLENBQUM7WUFDbEQsTUFBTSxHQUFHLEdBQWMsRUFBRSxDQUFDO1lBQzFCLE9BQU8sSUFBSSxFQUFFLENBQUM7Z0JBQ2IsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDZixJQUFJLEdBQUcsY0FBYyxDQUFDLE9BQU8sRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFLEtBQUssQ0FBQztZQUMvQyxDQUFDO1lBQ0QsT0FBTyxHQUFHLEdBQUcsQ0FBQztRQUNmLENBQUM7UUFDRCxPQUFPLE9BQU8sQ0FBQztJQUNoQixDQUFDO0lBRU8sWUFBWSxDQUFDLE1BQWU7UUFDbkMsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsNkNBQXFDLENBQUM7UUFDdEYsSUFBSSxpQkFBaUIsRUFBRSxDQUFDO1lBQ3ZCLE1BQU0sT0FBTyxHQUFHLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxFQUFFLElBQUksS0FBSyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLEtBQUssTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2xJLElBQUksT0FBTyxFQUFFLENBQUM7Z0JBQ2IsT0FBTyxPQUFPLENBQUM7WUFDaEIsQ0FBQztZQUNELElBQUksaUJBQWlCLENBQUMsY0FBYyxFQUFFLENBQUM7Z0JBQ3RDLE9BQU8saUJBQWlCLENBQUMsY0FBYyxDQUFDO1lBQ3pDLENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVELEtBQUs7UUFDSix3RkFBd0Y7UUFDeEYsdUJBQXVCO1FBQ3ZCLElBQUksQ0FBQyxjQUFjLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQztRQUN0QyxJQUFJLENBQUMsMkJBQTJCLEVBQUUsQ0FBQztRQUNuQyxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQztJQUM3QixDQUFDO0lBRU8sMkJBQTJCO1FBQ2xDLElBQUksSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7WUFDakMsT0FBTyxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBQ3RDLENBQUM7UUFDRCxJQUFJLENBQUMsc0JBQXNCLEdBQUcsRUFBRSxDQUFDO0lBQ2xDLENBQUM7SUFFTyxlQUFlLENBQUMsTUFBMEI7UUFDakQsSUFBSSxNQUFNLEtBQUssUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2hDLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUVELElBQUksTUFBTSxLQUFLLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUM3QixPQUFPLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzdELENBQUM7UUFFRCxPQUFPLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDakQsQ0FBQztJQUVELG9CQUFvQixDQUFDLDhDQUFzRCxFQUFFLGtCQUEyQixLQUFLLEVBQUUsb0JBQTZCLElBQUk7UUFDL0ksSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNyQixPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUN0QixJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQztRQUM3QixDQUFDO1FBRUQsSUFBSSxXQUFXLENBQUM7UUFDaEIsTUFBTSxZQUFZLEdBQUcsT0FBTyxJQUFJLENBQUMsY0FBYyxLQUFLLFFBQVE7WUFDM0QsQ0FBQyxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxjQUFjLENBQUM7WUFDcEUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM5RixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDO1FBQ3pELElBQUksT0FBTyxJQUFJLENBQUMsY0FBYyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLFlBQVksS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUMzSSx1RkFBdUY7WUFDdkYscUNBQXFDO1lBQ3JDLE1BQU0sb0JBQW9CLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksU0FBUyxDQUFDLENBQUMsTUFBTSxDQUFDO1lBQ3pHLDRCQUE0QjtZQUM1QixXQUFXLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLE1BQU0sR0FBRyxvQkFBb0IsR0FBRyxDQUFDLENBQUM7UUFDckYsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLGNBQWMsS0FBSyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDcEQsV0FBVyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBQzlELENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyxjQUFjLEtBQUssUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ2pELFdBQVcsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNsQixDQUFDO2FBQU0sSUFBSSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDL0IsV0FBVyxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1lBQzFELElBQUksQ0FBQyxjQUFjLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDOUIsSUFBSSxDQUFDLGFBQWEsR0FBRyxLQUFLLENBQUM7UUFDNUIsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLGlCQUFpQixJQUFJLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUM7Z0JBQ3BFLFdBQVcsR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDOUMsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLFdBQVcsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEYsQ0FBQztRQUNGLENBQUM7UUFFRCxJQUFJLFdBQVcsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNyQixJQUFJLENBQUMsY0FBYyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUM7WUFDbkMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUM3QixJQUFJLENBQUMsMkJBQTJCLEVBQUUsQ0FBQztZQUNuQyxPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ3ZFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLGNBQWMsQ0FBQyxDQUFDO0lBQzVELENBQUM7SUFFRCxnQkFBZ0IsQ0FBQyw4Q0FBc0QsRUFBRSxrQkFBMkIsS0FBSyxFQUFFLG9CQUE2QixJQUFJO1FBQzNJLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDckIsT0FBTztRQUNSLENBQUM7UUFDRCxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDdEIsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUM7UUFDN0IsQ0FBQztRQUVELElBQUksV0FBVyxDQUFDO1FBQ2hCLE1BQU0sWUFBWSxHQUFHLE9BQU8sSUFBSSxDQUFDLGNBQWMsS0FBSyxRQUFRO1lBQzNELENBQUMsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsY0FBYyxDQUFDO1lBQ3BFLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDOUYsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQztRQUN6RCxJQUFJLE9BQU8sSUFBSSxDQUFDLGNBQWMsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxZQUFZLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDM0ksdUZBQXVGO1lBQ3ZGLHFDQUFxQztZQUNyQyxNQUFNLG9CQUFvQixHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLFNBQVMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztZQUN6RywyQ0FBMkM7WUFDM0MsV0FBVyxHQUFHLG9CQUFvQixDQUFDO1FBQ3BDLENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyxjQUFjLEtBQUssUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ3BELFdBQVcsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUMsTUFBTSxDQUFDO1FBQzFELENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyxjQUFjLEtBQUssUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ2pELFdBQVcsR0FBRyxDQUFDLENBQUM7UUFDakIsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQy9CLFdBQVcsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLGlCQUFpQixDQUFDLENBQUM7WUFDdEQsSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUM5QixJQUFJLENBQUMsYUFBYSxHQUFHLEtBQUssQ0FBQztRQUM1QixDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksaUJBQWlCLElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQztnQkFDcEUsV0FBVyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDMUMsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLFdBQVcsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEYsQ0FBQztRQUNGLENBQUM7UUFFRCxJQUFJLFdBQVcsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDL0QsSUFBSSxDQUFDLGNBQWMsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDO1lBQ3RDLElBQUksQ0FBQyxTQUFTLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDaEMsSUFBSSxDQUFDLDJCQUEyQixFQUFFLENBQUM7WUFDbkMsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUN2RSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxjQUFjLENBQUMsQ0FBQztJQUM1RCxDQUFDO0lBRU8sZ0JBQWdCLENBQUMsTUFBZSxFQUFFLFFBQXdCO1FBQ2pFLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDMUMsSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUNiLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ3ZDLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDeEMsQ0FBQztJQUNGLENBQUM7SUFFTyxlQUFlLENBQUMsS0FBdUIsRUFBRSxRQUF3QixFQUFFLEdBQXNCLEVBQUUsT0FBZ0M7UUFDbEksSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNyQixPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsSUFBSSxPQUFPLEVBQUUsV0FBVyxFQUFFLENBQUM7WUFDOUUsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQztZQUNwRSxJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNuQyxDQUFDO1FBQ0QsSUFBSSxDQUFDLE9BQU8sRUFBRSxjQUFjLEVBQUUsQ0FBQztZQUM5QixJQUFJLE9BQU8sRUFBRSxXQUFXLEVBQUUsQ0FBQztnQkFDMUIsSUFBSSxDQUFDLHFCQUFxQixDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUNqRCxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsSUFBSSxDQUFDLDJCQUEyQixDQUFDLEtBQUssRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDcEQsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRU8sc0JBQXNCLENBQUMsTUFBd0IsRUFBRSxNQUFjO1FBQ3RFLElBQUksTUFBTSxLQUFLLENBQUMsSUFBSSxRQUFRLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUN0QyxPQUFPLE1BQU0sQ0FBQztRQUNmLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLFNBQVMsRUFBRSxjQUFjLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsT0FBTyxHQUFHLFdBQVcsQ0FBQyxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFHLE1BQU0sQ0FBQyxDQUFDO1lBQy9KLElBQUksWUFBWSxFQUFFLENBQUM7Z0JBQ2xCLE9BQU8sWUFBWSxDQUFDO1lBQ3JCLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxNQUFNLElBQUksS0FBSyxDQUFDLHlDQUF5QyxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssTUFBTSxFQUFFLENBQUMsQ0FBQztZQUM1RixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxhQUFhLENBQUMsT0FBa0QsRUFBRSx3Q0FBZ0Q7UUFDakgsTUFBTSxNQUFNLEdBQUcscUJBQXFCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQztRQUM1RixJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2hDLE9BQU87UUFDUixDQUFDO1FBQ0QsTUFBTSxJQUFJLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2pDLE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQ25ELE1BQU0sZUFBZSxHQUFHLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBQ3JELElBQUksQ0FBQyxlQUFlLENBQ25CLElBQUksR0FBRyxDQUFDLGNBQWMsR0FBRyxDQUFDLENBQUMsRUFDM0IsUUFBUSxFQUNSLElBQUksR0FBRyxDQUFDLGVBQWUsR0FBRyxDQUFDLENBQUMsQ0FDNUIsQ0FBQztJQUNILENBQUM7SUFFRCxXQUFXLENBQUMsS0FBbUI7UUFDOUIsSUFBSSxDQUFDLGVBQWUsQ0FDbkIsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxpQ0FFakIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUNmO1lBQ0MsV0FBVyxFQUFFLEtBQUs7WUFDbEIsNkRBQTZEO1lBQzdELFdBQVcsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFFBQVEsK0ZBQThDO1NBQ2hHLENBQ0QsQ0FBQztJQUNILENBQUM7SUFFRCxnQkFBZ0IsQ0FBQyxPQUFxQztRQUNyRCxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ3JCLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2QsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ3RDLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxTQUFTLENBQUM7WUFDckMsT0FBTztRQUNSLENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxtQkFBbUIsS0FBSyxPQUFPLEVBQUUsQ0FBQztZQUMxQyxPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ3BCLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxPQUFPLENBQUM7WUFFbkMsbUJBQW1CO1lBQ25CLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxLQUFLLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztZQUMxRSxJQUFJLENBQUMsT0FBTyxDQUFDLGNBQWMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFDbkQsT0FBTztZQUNSLENBQUM7WUFDRCxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksR0FBRyxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQzFFLE1BQU0sZUFBZSxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsU0FBUyxDQUFDO1lBQ25FLCtFQUErRTtZQUMvRSxJQUFJLGVBQWUsR0FBRyxHQUFHLEVBQUUsQ0FBQztnQkFDM0IsT0FBTztZQUNSLENBQUM7WUFDRCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsZUFBZSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQzFDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsa0JBQWtCLENBQUM7b0JBQ3BELE1BQU0sRUFBRSxJQUFJLENBQUMsc0JBQXNCLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztpQkFDakQsQ0FBQyxDQUFDO2dCQUNILElBQUksVUFBVSxFQUFFLENBQUM7b0JBQ2hCLEtBQUssQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7b0JBQ3RCLElBQUksZUFBd0MsQ0FBQztvQkFDN0MsS0FBSyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFO3dCQUN2QyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7NEJBQ3RCLGVBQWUsR0FBRyxPQUFPLENBQUM7NEJBQzFCLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLHdCQUF3QixDQUFDLENBQUM7NEJBQ2hELElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO2dDQUNiLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDOzRCQUM5QixDQUFDOzRCQUNELElBQUksQ0FBQyxLQUFLLGVBQWUsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQ0FDL0IsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7NEJBQ2pDLENBQUM7d0JBQ0YsQ0FBQztvQkFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNMLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFLRCxlQUFlO1FBQ2QsSUFBSSxDQUFDLFlBQVksR0FBRyxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUyxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsU0FBUyxJQUFJLENBQUMsRUFBRSxDQUFDO0lBQ2pGLENBQUM7SUFFRCxrQkFBa0I7UUFDakIsSUFBSSxJQUFJLENBQUMsWUFBWSxJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUN6QyxJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3pELElBQUksQ0FBQyxZQUFZLEdBQUcsU0FBUyxDQUFDO1FBQy9CLENBQUM7SUFDRixDQUFDO0lBRU8scUJBQXFCLENBQUMsS0FBbUI7UUFDaEQsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNyQixPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQywyQkFBMkIsRUFBRSxDQUFDO1FBQ25DLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ2hDLE1BQU0sZUFBZSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN4RCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsZUFBZSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDMUMsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxrQkFBa0IsQ0FBQztnQkFDcEQsTUFBTSxFQUFFLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDckQsQ0FBQyxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUM7Z0JBQ3BCLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQztnQkFDbEQsb0JBQW9CLEVBQUUsU0FBUzthQUMvQixDQUFDLENBQUM7WUFDSCxJQUFJLFVBQVUsRUFBRSxDQUFDO2dCQUNoQixJQUFJLENBQUMsc0JBQXNCLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO2dCQUM5QyxJQUFJLGVBQXdDLENBQUM7Z0JBRTdDLFVBQVUsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUU7b0JBQzdCLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQzt3QkFDdEIsZUFBZSxHQUFHLE9BQU8sQ0FBQzt3QkFDMUIsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsMEJBQTBCLENBQUMsQ0FBQztvQkFDbkQsQ0FBQztnQkFDRixDQUFDLENBQUMsQ0FBQztnQkFDSCxVQUFVLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxzQkFBc0IsR0FBRyxJQUFJLENBQUMsc0JBQXNCLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDM0gsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRUQsMkJBQTJCLENBQUMsTUFBd0IsRUFBRSxTQUF1QyxFQUFFLFdBQW9CO1FBQ2xILElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDckIsT0FBTztRQUNSLENBQUM7UUFDRCxJQUFJLENBQUMsMkJBQTJCLEVBQUUsQ0FBQztRQUNuQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLGFBQWEsRUFBRSxDQUFDLFFBQVEsQ0FBQywrQ0FBK0MsQ0FBQyxDQUFDO1FBQzNHLE1BQU0sU0FBUyxHQUFHLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN0QyxNQUFNLGVBQWUsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsR0FBRyxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDL0UsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLGVBQWUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQzFDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsa0JBQWtCLENBQUM7Z0JBQ3BELE1BQU0sRUFBRSxJQUFJLENBQUMsc0JBQXNCLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztnQkFDOUMsS0FBSyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSTtnQkFDMUIsb0JBQW9CLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQy9CLEtBQUssRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLElBQUksV0FBVztpQkFDdkMsQ0FBQyxDQUFDLENBQUMsU0FBUzthQUNiLENBQUMsQ0FBQztZQUNILElBQUksVUFBVSxFQUFFLENBQUM7Z0JBQ2hCLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQzlDLElBQUksZUFBd0MsQ0FBQztnQkFFN0MsVUFBVSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRTtvQkFDN0IsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO3dCQUN0QixlQUFlLEdBQUcsT0FBTyxDQUFDO3dCQUMxQixPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO3dCQUNuRCxJQUFJLFdBQVcsRUFBRSxDQUFDOzRCQUNqQixPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO3dCQUM1RCxDQUFDO3dCQUNELElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDOzRCQUNiLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO3dCQUM5QixDQUFDO3dCQUNELElBQUksQ0FBQyxLQUFLLGVBQWUsR0FBRyxDQUFDLEVBQUUsQ0FBQzs0QkFDL0IsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7d0JBQ2pDLENBQUM7b0JBQ0YsQ0FBQzt5QkFBTSxDQUFDO3dCQUNQLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDLENBQUM7b0JBQ3BELENBQUM7b0JBQ0QsSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFFLE9BQU8sRUFBRSxDQUFDO3dCQUM3QixPQUFPLENBQUMsS0FBSyxDQUFDLFVBQVUsR0FBRyxJQUFJLFNBQVMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7b0JBQ3pILENBQUM7Z0JBQ0YsQ0FBQyxDQUFDLENBQUM7Z0JBQ0gsMERBQTBEO2dCQUMxRCxVQUFVLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxzQkFBc0IsR0FBRyxJQUFJLENBQUMsc0JBQXNCLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzFILDZEQUE2RDtnQkFDN0QsSUFBSSxXQUFXLEVBQUUsQ0FBQztvQkFDakIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7d0JBQ3RCLElBQUksZUFBZSxFQUFFLENBQUM7NEJBQ3JCLGVBQWUsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLG1DQUFtQyxDQUFDLENBQUM7d0JBQ3ZFLENBQUM7b0JBQ0YsQ0FBQyxDQUFDLENBQUM7Z0JBQ0osQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVELFlBQVksQ0FBQyxJQUFZLEVBQUUsUUFBd0I7UUFDbEQsSUFBSSxDQUFDLFNBQVMsRUFBRSxZQUFZLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBQ3hFLENBQUM7SUFFRCxtQkFBbUIsQ0FBQyxJQUFZLEVBQUUsUUFBd0I7UUFDekQseUZBQXlGO1FBQ3pGLHFEQUFxRDtRQUNyRCxJQUFJLElBQUksQ0FBQyxTQUFTLElBQUksUUFBUSxrQ0FBMEIsRUFBRSxDQUFDO1lBQzFELE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNoRSxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRU8sbUJBQW1CLENBQUMsUUFBa0IsRUFBRSxNQUF3QjtRQUN2RSxNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUM7UUFDbkQsTUFBTSxJQUFJLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2pDLE9BQU8sSUFBSSxJQUFJLFNBQVMsSUFBSSxJQUFJLEdBQUcsU0FBUyxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUM7SUFDOUQsQ0FBQztJQUVELHFCQUFxQixDQUFDLGFBQXFCLEVBQUUsV0FBb0IsRUFBRSxTQUErQjtRQUNqRyxNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxnREFBd0MsQ0FBQztRQUMzRixJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztZQUMxQixPQUFPO1FBQ1IsQ0FBQztRQUNELE1BQU0sV0FBVyxHQUFHLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUMvRCxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDbEIsT0FBTztRQUNSLENBQUM7UUFDRCxNQUFNLFNBQVMsR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDO1FBQ3ZGLElBQUksQ0FBQyxlQUFlLENBQUMsV0FBVyw4QkFBc0IsU0FBUyxFQUFFLEVBQUUsY0FBYyxFQUFFLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztJQUNsRyxDQUFDO0lBRUQsb0JBQW9CO1FBQ25CLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDckIsT0FBTztRQUNSLENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxlQUFlLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDbkMsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDO1FBQzVDLENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyw2Q0FBcUMsRUFBRSxDQUFDO1lBQ2pFLElBQUksQ0FBQyxvQkFBb0IsZ0NBQXdCLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM5RCxDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxvQkFBb0IsZ0NBQXdCLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMvRCxDQUFDO1FBQ0QsV0FBVyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDeEUsQ0FBQztJQUVELGdCQUFnQjtRQUNmLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDckIsT0FBTztRQUNSLENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxlQUFlLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDbkMsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDO1FBQzVDLENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyw2Q0FBcUMsRUFBRSxDQUFDO1lBQ2pFLElBQUksQ0FBQyxnQkFBZ0IsZ0NBQXdCLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMxRCxDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxnQkFBZ0IsZ0NBQXdCLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMzRCxDQUFDO1FBQ0QsV0FBVyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDeEUsQ0FBQztJQUVELG9CQUFvQjtRQUNuQixJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ3JCLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsZUFBZSxLQUFLLElBQUksRUFBRSxDQUFDO1lBQ25DLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQztRQUM1QyxDQUFDO1FBQ0QsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxTQUFTLGlDQUF5QixJQUFJLENBQUMsQ0FBQztRQUN2RSxXQUFXLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztJQUN4RSxDQUFDO0lBRUQsZ0JBQWdCO1FBQ2YsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNyQixPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLGVBQWUsS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUNuQyxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUM7UUFDNUMsQ0FBQztRQUNELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsU0FBUyxpQ0FBeUIsSUFBSSxDQUFDLENBQUM7UUFDbkUsV0FBVyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDeEUsQ0FBQztJQUVELG9CQUFvQixDQUFDLEtBQWUsRUFBRSw4Q0FBc0QsRUFBRSxrQkFBMkIsS0FBSztRQUM3SCxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDdEIsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUM7UUFDN0IsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLGNBQWMsS0FBSyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDMUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ3BCLE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxJQUFJLENBQUMsY0FBYyxLQUFLLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUM3QyxJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN0RixDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDdEMsSUFBSSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQ3hCLElBQUksQ0FBQyxjQUFjLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDL0IsQ0FBQztZQUNELElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixDQUFDLEtBQUssRUFBRSxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDdEUsQ0FBQztRQUNELElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDO1FBQzFCLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxjQUFjLENBQUMsQ0FBQztJQUMzRCxDQUFDO0lBRUQsZ0JBQWdCLENBQUMsS0FBZSxFQUFFLDhDQUFzRCxFQUFFLGtCQUEyQixLQUFLO1FBQ3pILElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUN0QixJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQztRQUM3QixDQUFDO1FBRUQsSUFBSSxJQUFJLENBQUMsY0FBYyxLQUFLLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUM3QyxLQUFLLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDdkIsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxjQUFjLEtBQUssUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQzFDLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3RGLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN0QyxJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFDeEIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUMvQixDQUFDO1lBQ0QsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsS0FBSyxFQUFFLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN0RSxDQUFDO1FBQ0QsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7UUFDMUIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLGNBQWMsQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFFTyxzQkFBc0IsQ0FBQyxLQUFlLEVBQUUsYUFBcUI7UUFDcEUsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNuRCxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDYixNQUFNLElBQUksS0FBSyxDQUFDLCtCQUErQixhQUFhLEVBQUUsQ0FBQyxDQUFDO1FBQ2pFLENBQUM7UUFDRCxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFFTyxVQUFVLENBQUMsS0FBZTtRQUNqQyxJQUFJLElBQUksQ0FBQyxjQUFjLEtBQUssUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQzdDLE9BQU8sQ0FBQyxDQUFDO1FBQ1YsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLGNBQWMsS0FBSyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDakQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDdEUsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLE1BQU0sR0FBRyxPQUFPLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUNqRCxNQUFNLElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQztZQUNsRSxPQUFPLE1BQU0sQ0FBQztRQUNmLENBQUM7SUFDRixDQUFDO0lBRU8sbUJBQW1CLENBQUMsb0JBQTZCLEtBQUs7UUFDN0QsSUFBSSxJQUFJLENBQUMsY0FBYyxLQUFLLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUMxQyxPQUFPLENBQUMsQ0FBQztRQUNWLENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyxjQUFjLEtBQUssUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ3BELE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7UUFDdkQsQ0FBQztRQUVELElBQUksQ0FBQyxDQUFDO1FBQ04sS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3RFLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUM1RSxPQUFPLENBQUMsQ0FBQztZQUNWLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUNYLENBQUM7SUFFTyxlQUFlLENBQUMsb0JBQTZCLEtBQUs7UUFDekQsSUFBSSxJQUFJLENBQUMsY0FBYyxLQUFLLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUMxQyxPQUFPLENBQUMsQ0FBQztRQUNWLENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyxjQUFjLEtBQUssUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ3BELE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7UUFDdkQsQ0FBQztRQUVELElBQUksQ0FBQyxDQUFDO1FBQ04sS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDakUsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQzVFLE9BQU8sQ0FBQyxDQUFDO1lBQ1YsQ0FBQztRQUNGLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxNQUFNLENBQUM7SUFDbkQsQ0FBQztDQUNELENBQUE7QUF6a0JZLG1CQUFtQjtJQW1CN0IsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLGFBQWEsQ0FBQTtHQXBCSCxtQkFBbUIsQ0F5a0IvQjs7QUFFRCxNQUFNLFVBQVUsT0FBTyxDQUFDLEtBQWUsRUFBRSxNQUEwQjtJQUNsRSxpRUFBaUU7SUFDakUsSUFBSSxNQUFNLEtBQUssUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2hDLE9BQU8sS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDO0lBQ25ELENBQUM7SUFFRCxJQUFJLE1BQU0sS0FBSyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDN0IsT0FBTyxDQUFDLENBQUM7SUFDVixDQUFDO0lBRUQsT0FBTyxNQUFNLENBQUMsSUFBSSxDQUFDO0FBQ3BCLENBQUM7QUFFRCxNQUFNLFVBQVUsV0FBVyxDQUFDLEtBQWUsRUFBRSxLQUF5QixFQUFFLEdBQThCO0lBQ3JHLElBQUksR0FBRyxLQUFLLElBQUksRUFBRSxDQUFDO1FBQ2xCLEdBQUcsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDO0lBQ3ZCLENBQUM7SUFFRCxJQUFJLFNBQVMsR0FBRyxPQUFPLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3RDLElBQUksT0FBTyxHQUFHLE9BQU8sQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFFbEMsSUFBSSxTQUFTLEdBQUcsT0FBTyxFQUFFLENBQUM7UUFDekIsTUFBTSxJQUFJLEdBQUcsU0FBUyxDQUFDO1FBQ3ZCLFNBQVMsR0FBRyxPQUFPLENBQUM7UUFDcEIsT0FBTyxHQUFHLElBQUksQ0FBQztJQUNoQixDQUFDO0lBRUQsd0ZBQXdGO0lBQ3hGLG1EQUFtRDtJQUNuRCxPQUFPLElBQUksQ0FBQyxDQUFDO0lBRWIsS0FBSyxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFDdkMsQ0FBQztBQUVELFNBQVMsUUFBUSxDQUFDLEtBQXVCO0lBQ3hDLE9BQU8sT0FBTyxLQUFLLEtBQUssUUFBUSxDQUFDO0FBQ2xDLENBQUM7QUFFRCxTQUFTLFdBQVcsQ0FBQyxJQUFzQjtJQUMxQyxPQUFPLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO0FBQzFDLENBQUMifQ==