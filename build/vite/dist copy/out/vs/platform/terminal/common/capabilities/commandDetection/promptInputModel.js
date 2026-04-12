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
import { throttle } from '../../../../../base/common/decorators.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILogService, LogLevel } from '../../../../log/common/log.js';
export var PromptInputState;
(function (PromptInputState) {
    PromptInputState[PromptInputState["Unknown"] = 0] = "Unknown";
    PromptInputState[PromptInputState["Input"] = 1] = "Input";
    PromptInputState[PromptInputState["Execute"] = 2] = "Execute";
})(PromptInputState || (PromptInputState = {}));
let PromptInputModel = class PromptInputModel extends Disposable {
    get state() { return this._state; }
    get value() { return this._value; }
    get prefix() { return this._value.substring(0, this._cursorIndex); }
    get suffix() { return this._value.substring(this._cursorIndex, this._ghostTextIndex === -1 ? undefined : this._ghostTextIndex); }
    get cursorIndex() { return this._cursorIndex; }
    get ghostTextIndex() { return this._ghostTextIndex; }
    constructor(_xterm, onCommandStart, onCommandStartChanged, onCommandExecuted, onCommandFinished, _logService) {
        super();
        this._xterm = _xterm;
        this._logService = _logService;
        this._state = 0 /* PromptInputState.Unknown */;
        this._commandStartX = 0;
        this._lastUserInput = '';
        this._value = '';
        this._cursorIndex = 0;
        this._ghostTextIndex = -1;
        this._onDidStartInput = this._register(new Emitter());
        this.onDidStartInput = this._onDidStartInput.event;
        this._onDidChangeInput = this._register(new Emitter());
        this.onDidChangeInput = this._onDidChangeInput.event;
        this._onDidFinishInput = this._register(new Emitter());
        this.onDidFinishInput = this._onDidFinishInput.event;
        this._onDidInterrupt = this._register(new Emitter());
        this.onDidInterrupt = this._onDidInterrupt.event;
        this._register(Event.any(this._xterm.onCursorMove, this._xterm.onData, this._xterm.onWriteParsed)(() => this._sync()));
        this._register(this._xterm.onData(e => this._handleUserInput(e)));
        this._register(onCommandStart(e => this._handleCommandStart(e)));
        this._register(onCommandStartChanged(() => this._handleCommandStartChanged()));
        this._register(onCommandExecuted(() => this._handleCommandExecuted()));
        this._register(onCommandFinished(() => this._handleCommandFinished()));
        this._register(this.onDidStartInput(() => this._logCombinedStringIfTrace('PromptInputModel#onDidStartInput')));
        this._register(this.onDidChangeInput(() => this._logCombinedStringIfTrace('PromptInputModel#onDidChangeInput')));
        this._register(this.onDidFinishInput(() => this._logCombinedStringIfTrace('PromptInputModel#onDidFinishInput')));
        this._register(this.onDidInterrupt(() => this._logCombinedStringIfTrace('PromptInputModel#onDidInterrupt')));
    }
    _logCombinedStringIfTrace(message) {
        // Only generate the combined string if trace
        if (this._logService.getLevel() === LogLevel.Trace) {
            this._logService.trace(message, this.getCombinedString());
        }
    }
    setShellType(shellType) {
        this._shellType = shellType;
    }
    setContinuationPrompt(value) {
        this._continuationPrompt = value;
        this._sync();
    }
    setLastPromptLine(value) {
        this._lastPromptLine = value;
        this._sync();
    }
    setConfidentCommandLine(value) {
        if (this._value !== value) {
            this._value = value;
            this._cursorIndex = -1;
            this._ghostTextIndex = -1;
            this._onDidChangeInput.fire(this._createStateObject());
        }
    }
    getCombinedString(emptyStringWhenEmpty) {
        const value = this._value.replaceAll('\n', '\u23CE');
        if (this._cursorIndex === -1) {
            return value;
        }
        let result = `${value.substring(0, this.cursorIndex)}|`;
        if (this.ghostTextIndex !== -1) {
            result += `${value.substring(this.cursorIndex, this.ghostTextIndex)}[`;
            result += `${value.substring(this.ghostTextIndex)}]`;
        }
        else {
            result += value.substring(this.cursorIndex);
        }
        if (result === '|' && emptyStringWhenEmpty) {
            return '';
        }
        return result;
    }
    serialize() {
        return {
            modelState: this._createStateObject(),
            commandStartX: this._commandStartX,
            lastPromptLine: this._lastPromptLine,
            continuationPrompt: this._continuationPrompt,
            lastUserInput: this._lastUserInput
        };
    }
    deserialize(serialized) {
        this._value = serialized.modelState.value;
        this._cursorIndex = serialized.modelState.cursorIndex;
        this._ghostTextIndex = serialized.modelState.ghostTextIndex;
        this._commandStartX = serialized.commandStartX;
        this._lastPromptLine = serialized.lastPromptLine;
        this._continuationPrompt = serialized.continuationPrompt;
        this._lastUserInput = serialized.lastUserInput;
    }
    _handleCommandStart(command) {
        if (this._state === 1 /* PromptInputState.Input */) {
            return;
        }
        this._state = 1 /* PromptInputState.Input */;
        this._commandStartMarker = command.marker;
        this._commandStartX = this._xterm.buffer.active.cursorX;
        this._value = '';
        this._cursorIndex = 0;
        this._onDidStartInput.fire(this._createStateObject());
        this._onDidChangeInput.fire(this._createStateObject());
        // Trigger a sync if prompt terminator is set as that could adjust the command start X
        if (this._lastPromptLine) {
            if (this._commandStartX !== this._lastPromptLine.length) {
                const line = this._xterm.buffer.active.getLine(this._commandStartMarker.line);
                if (line?.translateToString(true).startsWith(this._lastPromptLine)) {
                    this._commandStartX = this._lastPromptLine.length;
                    this._sync();
                }
            }
        }
    }
    _handleCommandStartChanged() {
        if (this._state !== 1 /* PromptInputState.Input */) {
            return;
        }
        this._commandStartX = this._xterm.buffer.active.cursorX;
        this._onDidChangeInput.fire(this._createStateObject());
        this._sync();
    }
    _handleCommandExecuted() {
        if (this._state === 2 /* PromptInputState.Execute */) {
            return;
        }
        this._cursorIndex = -1;
        // Remove any ghost text from the input if it exists on execute
        if (this._ghostTextIndex !== -1) {
            this._value = this._value.substring(0, this._ghostTextIndex);
            this._ghostTextIndex = -1;
        }
        const event = this._createStateObject();
        if (this._lastUserInput === '\u0003') {
            this._lastUserInput = '';
            this._onDidInterrupt.fire(event);
        }
        this._state = 2 /* PromptInputState.Execute */;
        this._onDidFinishInput.fire(event);
        this._onDidChangeInput.fire(event);
    }
    _handleCommandFinished() {
        // Clear the prompt input value when command finishes to prepare for the next command
        // This prevents runCommand from detecting leftover text and sending ^C unnecessarily
        this._value = '';
        this._onDidChangeInput.fire(this._createStateObject());
    }
    _sync() {
        try {
            this._doSync();
        }
        catch (e) {
            this._logService.error('Error while syncing prompt input model', e);
        }
    }
    _doSync() {
        if (this._state !== 1 /* PromptInputState.Input */) {
            return;
        }
        let commandStartY = this._commandStartMarker?.line;
        if (commandStartY === undefined) {
            return;
        }
        const buffer = this._xterm.buffer.active;
        let line = buffer.getLine(commandStartY);
        const absoluteCursorY = buffer.baseY + buffer.cursorY;
        let cursorIndex;
        let commandLine = line?.translateToString(true, this._commandStartX);
        if (this._shellType === "fish" /* PosixShellType.Fish */ && (!line || !commandLine)) {
            commandStartY += 1;
            line = buffer.getLine(commandStartY);
            if (line) {
                commandLine = line.translateToString(true);
                cursorIndex = absoluteCursorY === commandStartY ? buffer.cursorX : commandLine?.trimEnd().length;
            }
        }
        if (line === undefined || commandLine === undefined) {
            this._logService.trace(`PromptInputModel#_sync: no line`);
            return;
        }
        let value = commandLine;
        let ghostTextIndex = -1;
        if (cursorIndex === undefined) {
            if (absoluteCursorY === commandStartY) {
                cursorIndex = Math.min(this._getRelativeCursorIndex(this._commandStartX, buffer, line), commandLine.length);
            }
            else {
                cursorIndex = commandLine.trimEnd().length;
            }
        }
        // From command start line to cursor line
        for (let y = commandStartY + 1; y <= absoluteCursorY; y++) {
            const nextLine = buffer.getLine(y);
            const lineText = nextLine?.translateToString(true);
            if (lineText && nextLine) {
                // Check if the line wrapped without a new line (continuation) or
                // we're on the last line and the continuation prompt is not present, so we need to add the value
                if (nextLine.isWrapped || (absoluteCursorY === y && this._continuationPrompt && !this._lineContainsContinuationPrompt(lineText))) {
                    value += `${lineText}`;
                    const relativeCursorIndex = this._getRelativeCursorIndex(0, buffer, nextLine);
                    if (absoluteCursorY === y) {
                        cursorIndex += relativeCursorIndex;
                    }
                    else {
                        cursorIndex += lineText.length;
                    }
                }
                else if (this._shellType === "fish" /* PosixShellType.Fish */) {
                    if (value.endsWith('\\')) {
                        // Trim off the trailing backslash
                        value = value.substring(0, value.length - 1);
                        value += `${lineText.trim()}`;
                        cursorIndex += lineText.trim().length - 1;
                    }
                    else {
                        if (/^ {6,}/.test(lineText)) {
                            // Was likely a new line
                            value += `\n${lineText.trim()}`;
                            cursorIndex += lineText.trim().length + 1;
                        }
                        else {
                            value += lineText;
                            cursorIndex += lineText.length;
                        }
                    }
                }
                // Verify continuation prompt if we have it, if this line doesn't have it then the
                // user likely just pressed enter.
                else if (this._continuationPrompt === undefined || this._lineContainsContinuationPrompt(lineText)) {
                    const trimmedLineText = this._trimContinuationPrompt(lineText);
                    value += `\n${trimmedLineText}`;
                    if (absoluteCursorY === y) {
                        const continuationCellWidth = this._getContinuationPromptCellWidth(nextLine, lineText);
                        const relativeCursorIndex = this._getRelativeCursorIndex(continuationCellWidth, buffer, nextLine);
                        cursorIndex += relativeCursorIndex + 1;
                    }
                    else {
                        cursorIndex += trimmedLineText.length + 1;
                    }
                }
            }
        }
        // Below cursor line
        for (let y = absoluteCursorY + 1; y < buffer.baseY + this._xterm.rows; y++) {
            const belowCursorLine = buffer.getLine(y);
            const lineText = belowCursorLine?.translateToString(true);
            if (lineText && belowCursorLine) {
                if (this._shellType === "fish" /* PosixShellType.Fish */) {
                    value += `${lineText}`;
                }
                else if (this._continuationPrompt === undefined || this._lineContainsContinuationPrompt(lineText)) {
                    value += `\n${this._trimContinuationPrompt(lineText)}`;
                }
                else {
                    value += lineText;
                }
            }
            else {
                break;
            }
        }
        if (this._logService.getLevel() === LogLevel.Trace) {
            this._logService.trace(`PromptInputModel#_sync: ${this.getCombinedString()}`);
        }
        // Adjust trailing whitespace
        {
            let trailingWhitespace = this._value.length - this._value.trimEnd().length;
            // Handle backspace key
            if (this._lastUserInput === '\x7F') {
                this._lastUserInput = '';
                if (cursorIndex === this._cursorIndex - 1) {
                    // If trailing whitespace is being increased by removing a non-whitespace character
                    if (this._value.trimEnd().length > value.trimEnd().length && value.trimEnd().length <= cursorIndex) {
                        trailingWhitespace = Math.max((this._value.length - 1) - value.trimEnd().length, 0);
                    }
                    // Standard case; subtract from trailing whitespace
                    else {
                        trailingWhitespace = Math.max(trailingWhitespace - 1, 0);
                    }
                }
            }
            // Handle delete key
            if (this._lastUserInput === '\x1b[3~') {
                this._lastUserInput = '';
                if (cursorIndex === this._cursorIndex) {
                    trailingWhitespace = Math.max(trailingWhitespace - 1, 0);
                }
            }
            const valueLines = value.split('\n');
            const isMultiLine = valueLines.length > 1;
            const valueEndTrimmed = value.trimEnd();
            if (!isMultiLine) {
                // Adjust trimmed whitespace value based on cursor position
                if (valueEndTrimmed.length < value.length) {
                    // Handle space key
                    if (this._lastUserInput === ' ') {
                        this._lastUserInput = '';
                        if (cursorIndex > valueEndTrimmed.length && cursorIndex > this._cursorIndex) {
                            trailingWhitespace++;
                        }
                    }
                    trailingWhitespace = Math.max(cursorIndex - valueEndTrimmed.length, trailingWhitespace, 0);
                }
                // Handle case where a non-space character is inserted in the middle of trailing whitespace
                const charBeforeCursor = cursorIndex === 0 ? '' : value[cursorIndex - 1];
                if (trailingWhitespace > 0 && cursorIndex === this._cursorIndex + 1 && this._lastUserInput !== '' && charBeforeCursor !== ' ') {
                    trailingWhitespace = this._value.length - this._cursorIndex;
                }
            }
            if (isMultiLine) {
                valueLines[valueLines.length - 1] = valueLines.at(-1)?.trimEnd() ?? '';
                const continuationOffset = (valueLines.length - 1) * (this._continuationPrompt?.length ?? 0);
                trailingWhitespace = Math.max(0, cursorIndex - value.length - continuationOffset);
            }
            value = valueLines.map(e => e.trimEnd()).join('\n') + ' '.repeat(trailingWhitespace);
        }
        ghostTextIndex = this._scanForGhostText(buffer, line, cursorIndex);
        if (this._value !== value || this._cursorIndex !== cursorIndex || this._ghostTextIndex !== ghostTextIndex) {
            this._value = value;
            this._cursorIndex = cursorIndex;
            this._ghostTextIndex = ghostTextIndex;
            this._onDidChangeInput.fire(this._createStateObject());
        }
    }
    _handleUserInput(e) {
        this._lastUserInput = e;
    }
    /**
     * Detect ghost text by looking for italic or dim text in or after the cursor and
     * non-italic/dim text in the first non-whitespace cell following command start and before the cursor.
     */
    _scanForGhostText(buffer, line, cursorIndex) {
        if (!this.value.trim().length) {
            return -1;
        }
        // Check last non-whitespace character has non-ghost text styles
        let ghostTextIndex = -1;
        let proceedWithGhostTextCheck = false;
        let x = buffer.cursorX;
        while (x > 0) {
            const cell = line.getCell(--x);
            if (!cell) {
                break;
            }
            if (cell.getChars().trim().length > 0) {
                proceedWithGhostTextCheck = !this._isCellStyledLikeGhostText(cell);
                break;
            }
        }
        // Check to the end of the line for possible ghost text. For example pwsh's ghost text
        // can look like this `Get-|Ch[ildItem]`
        if (proceedWithGhostTextCheck) {
            let potentialGhostIndexOffset = 0;
            let x = buffer.cursorX;
            while (x < line.length) {
                const cell = line.getCell(x++);
                if (!cell || cell.getCode() === 0) {
                    break;
                }
                if (this._isCellStyledLikeGhostText(cell)) {
                    ghostTextIndex = cursorIndex + potentialGhostIndexOffset;
                    break;
                }
                potentialGhostIndexOffset += cell.getChars().length;
            }
        }
        // Ghost text may not be italic or dimmed, but will have a different style than the
        // rest of the line that precedes it.
        if (ghostTextIndex === -1) {
            ghostTextIndex = this._scanForGhostTextAdvanced(buffer, line, cursorIndex);
        }
        if (ghostTextIndex > -1 && this.value.substring(ghostTextIndex).endsWith(' ')) {
            this._value = this.value.trim();
            if (!this.value.substring(ghostTextIndex)) {
                ghostTextIndex = -1;
            }
        }
        return ghostTextIndex;
    }
    _scanForGhostTextAdvanced(buffer, line, cursorIndex) {
        let ghostTextIndex = -1;
        let currentPos = buffer.cursorX; // Start scanning from the cursor position
        // Map to store styles and their corresponding positions
        const styleMap = new Map();
        // Identify the last non-whitespace character in the line
        let lastNonWhitespaceCell = line.getCell(currentPos);
        let nextCell = lastNonWhitespaceCell;
        // Scan from the cursor position to the end of the line
        while (nextCell && currentPos < line.length) {
            const styleKey = this._getCellStyleAsString(nextCell);
            // Track all occurrences of each unique style in the line
            styleMap.set(styleKey, [...(styleMap.get(styleKey) ?? []), currentPos]);
            // Move to the next cell
            nextCell = line.getCell(++currentPos);
            // Update `lastNonWhitespaceCell` only if the new cell contains visible characters
            if (nextCell?.getChars().trim().length) {
                lastNonWhitespaceCell = nextCell;
            }
        }
        // If there's no valid last non-whitespace cell OR the first and last styles match (indicating no ghost text)
        if (!lastNonWhitespaceCell?.getChars().trim().length ||
            this._cellStylesMatch(line.getCell(this._commandStartX), lastNonWhitespaceCell)) {
            return -1;
        }
        // Retrieve the positions of all cells with the same style as `lastNonWhitespaceCell`
        const positionsWithGhostStyle = styleMap.get(this._getCellStyleAsString(lastNonWhitespaceCell));
        if (positionsWithGhostStyle) {
            // Ghost text must start at the cursor or one char after (e.g. a space)
            // To account for cursor movement, we also ensure there are not 5+ spaces preceding the ghost text position
            if (positionsWithGhostStyle[0] > buffer.cursorX + 1 && this._isPositionRightPrompt(line, positionsWithGhostStyle[0])) {
                return -1;
            }
            // Ensure these positions are contiguous
            for (let i = 1; i < positionsWithGhostStyle.length; i++) {
                if (positionsWithGhostStyle[i] !== positionsWithGhostStyle[i - 1] + 1) {
                    // Discontinuous styles, so may be syntax highlighting vs ghost text
                    return -1;
                }
            }
            // Calculate the ghost text start index
            if (buffer.baseY + buffer.cursorY === this._commandStartMarker?.line) {
                ghostTextIndex = positionsWithGhostStyle[0] - this._commandStartX;
            }
            else {
                ghostTextIndex = positionsWithGhostStyle[0];
            }
        }
        // Ensure no earlier cells in the line match `lastNonWhitespaceCell`'s style,
        // which would indicate the text is not ghost text.
        if (ghostTextIndex !== -1) {
            for (let checkPos = buffer.cursorX; checkPos >= this._commandStartX; checkPos--) {
                const checkCell = line.getCell(checkPos);
                if (!checkCell?.getChars.length) {
                    continue;
                }
                if (checkCell && checkCell.getCode() !== 0 && this._cellStylesMatch(lastNonWhitespaceCell, checkCell)) {
                    return -1;
                }
            }
        }
        return ghostTextIndex >= cursorIndex ? ghostTextIndex : -1;
    }
    /**
     * 5+ spaces preceding the position, following the command start,
     * indicates that we're likely in a right prompt at the current position
     */
    _isPositionRightPrompt(line, position) {
        let count = 0;
        for (let i = position - 1; i >= this._commandStartX; i--) {
            const cell = line.getCell(i);
            // treat missing cell or whitespace-only cell as empty; reset count on first non-empty
            if (!cell || cell.getChars().trim().length === 0) {
                count++;
                // If we've already found 5 consecutive empties we can early-return
                if (count >= 5) {
                    return true;
                }
            }
            else {
                // consecutive sequence broken
                count = 0;
            }
        }
        return false;
    }
    _getCellStyleAsString(cell) {
        return `${cell.getFgColor()}${cell.getBgColor()}${cell.isBold()}${cell.isItalic()}${cell.isDim()}${cell.isUnderline()}${cell.isBlink()}${cell.isInverse()}${cell.isInvisible()}${cell.isStrikethrough()}${cell.isOverline()}${cell.getFgColorMode()}${cell.getBgColorMode()}`;
    }
    _cellStylesMatch(a, b) {
        if (!a || !b) {
            return false;
        }
        return a.getFgColor() === b.getFgColor()
            && a.getBgColor() === b.getBgColor()
            && a.isBold() === b.isBold()
            && a.isItalic() === b.isItalic()
            && a.isDim() === b.isDim()
            && a.isUnderline() === b.isUnderline()
            && a.isBlink() === b.isBlink()
            && a.isInverse() === b.isInverse()
            && a.isInvisible() === b.isInvisible()
            && a.isStrikethrough() === b.isStrikethrough()
            && a.isOverline() === b.isOverline()
            && a?.getBgColorMode() === b?.getBgColorMode()
            && a?.getFgColorMode() === b?.getFgColorMode();
    }
    _trimContinuationPrompt(lineText) {
        if (this._lineContainsContinuationPrompt(lineText)) {
            lineText = lineText.substring(this._continuationPrompt.length);
        }
        return lineText;
    }
    _lineContainsContinuationPrompt(lineText) {
        return !!(this._continuationPrompt && lineText.startsWith(this._continuationPrompt.trimEnd()));
    }
    _getContinuationPromptCellWidth(line, lineText) {
        if (!this._continuationPrompt || !lineText.startsWith(this._continuationPrompt.trimEnd())) {
            return 0;
        }
        let buffer = '';
        let x = 0;
        let cell;
        while (buffer !== this._continuationPrompt) {
            cell = line.getCell(x++);
            if (!cell) {
                break;
            }
            buffer += cell.getChars();
        }
        return x;
    }
    _getRelativeCursorIndex(startCellX, buffer, line) {
        return line?.translateToString(false, startCellX, buffer.cursorX).length ?? 0;
    }
    _isCellStyledLikeGhostText(cell) {
        return !!(cell.isItalic() || cell.isDim());
    }
    _createStateObject() {
        return Object.freeze({
            value: this._value,
            prefix: this.prefix,
            suffix: this.suffix,
            cursorIndex: this._cursorIndex,
            ghostTextIndex: this._ghostTextIndex
        });
    }
};
__decorate([
    throttle(0)
], PromptInputModel.prototype, "_sync", null);
PromptInputModel = __decorate([
    __param(5, ILogService)
], PromptInputModel);
export { PromptInputModel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0SW5wdXRNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY29tbWFuZERldGVjdGlvbi9wcm9tcHRJbnB1dE1vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBSXRFLE1BQU0sQ0FBTixJQUFrQixnQkFJakI7QUFKRCxXQUFrQixnQkFBZ0I7SUFDakMsNkRBQVcsQ0FBQTtJQUNYLHlEQUFTLENBQUE7SUFDVCw2REFBVyxDQUFBO0FBQ1osQ0FBQyxFQUppQixnQkFBZ0IsS0FBaEIsZ0JBQWdCLFFBSWpDO0FBNkRNLElBQU0sZ0JBQWdCLEdBQXRCLE1BQU0sZ0JBQWlCLFNBQVEsVUFBVTtJQUUvQyxJQUFJLEtBQUssS0FBSyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBV25DLElBQUksS0FBSyxLQUFLLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7SUFDbkMsSUFBSSxNQUFNLEtBQUssT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNwRSxJQUFJLE1BQU0sS0FBSyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUs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