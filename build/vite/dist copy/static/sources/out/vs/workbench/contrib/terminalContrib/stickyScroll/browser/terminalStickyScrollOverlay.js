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
import { $, addDisposableListener, addStandardDisposableListener, getWindow } from '../../../../../base/browser/dom.js';
import { debounce, throttle } from '../../../../../base/common/decorators.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, MutableDisposable, combinedDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { removeAnsiEscapeCodes } from '../../../../../base/common/strings.js';
import './media/stickyScroll.css';
import { localize } from '../../../../../nls.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { isFullTerminalCommand } from '../../../../../platform/terminal/common/capabilities/commandDetection/terminalCommand.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { ITerminalConfigurationService } from '../../../terminal/browser/terminal.js';
import { openContextMenu } from '../../../terminal/browser/terminalContextMenu.js';
import { TERMINAL_CONFIG_SECTION } from '../../../terminal/common/terminal.js';
import { terminalStrings } from '../../../terminal/common/terminalStrings.js';
import { terminalStickyScrollBackground, terminalStickyScrollHoverBackground } from './terminalStickyScrollColorRegistry.js';
import { XtermAddonImporter } from '../../../terminal/browser/xterm/xtermAddonImporter.js';
var OverlayState;
(function (OverlayState) {
    /** Initial state/disabled by the alt buffer. */
    OverlayState[OverlayState["Off"] = 0] = "Off";
    OverlayState[OverlayState["On"] = 1] = "On";
})(OverlayState || (OverlayState = {}));
var CssClasses;
(function (CssClasses) {
    CssClasses["Visible"] = "visible";
})(CssClasses || (CssClasses = {}));
var Constants;
(function (Constants) {
    Constants[Constants["StickyScrollPercentageCap"] = 0.4] = "StickyScrollPercentageCap";
})(Constants || (Constants = {}));
let TerminalStickyScrollOverlay = class TerminalStickyScrollOverlay extends Disposable {
    constructor(_instance, _xterm, _xtermColorProvider, _commandDetection, xtermCtor, configurationService, contextKeyService, _contextMenuService, _keybindingService, menuService, _terminalConfigurationService, _themeService) {
        super();
        this._instance = _instance;
        this._xterm = _xterm;
        this._xtermColorProvider = _xtermColorProvider;
        this._commandDetection = _commandDetection;
        this._contextMenuService = _contextMenuService;
        this._keybindingService = _keybindingService;
        this._terminalConfigurationService = _terminalConfigurationService;
        this._themeService = _themeService;
        this._xtermAddonLoader = new XtermAddonImporter();
        this._webglAddon = this._register(new MutableDisposable());
        this._refreshListeners = this._register(new MutableDisposable());
        this._state = 0 /* OverlayState.Off */;
        this._isRefreshQueued = false;
        this._rawMaxLineCount = 5;
        this._ignoredCommands = [];
        this._pendingShowOperation = false;
        this._contextMenu = this._register(menuService.createMenu(MenuId.TerminalStickyScrollContext, contextKeyService));
        // Only show sticky scroll in the normal buffer
        this._register(Event.runAndSubscribe(this._xterm.raw.buffer.onBufferChange, buffer => {
            this._setState((buffer ?? this._xterm.raw.buffer.active).type === 'normal' ? 1 /* OverlayState.On */ : 0 /* OverlayState.Off */);
        }));
        // React to configuration changes
        this._register(Event.runAndSubscribe(configurationService.onDidChangeConfiguration, e => {
            if (!e || e.affectsConfiguration("terminal.integrated.stickyScroll.maxLineCount" /* TerminalStickyScrollSettingId.MaxLineCount */)) {
                this._rawMaxLineCount = configurationService.getValue("terminal.integrated.stickyScroll.maxLineCount" /* TerminalStickyScrollSettingId.MaxLineCount */);
            }
            if (!e || e.affectsConfiguration("terminal.integrated.stickyScroll.ignoredCommands" /* TerminalStickyScrollSettingId.IgnoredCommands */)) {
                this._ignoredCommands = configurationService.getValue("terminal.integrated.stickyScroll.ignoredCommands" /* TerminalStickyScrollSettingId.IgnoredCommands */);
            }
        }));
        // React to terminal location changes
        this._register(this._instance.onDidChangeTarget(() => this._syncOptions()));
        // Eagerly create the overlay
        xtermCtor.then(ctor => {
            if (this._store.isDisposed) {
                return;
            }
            this._stickyScrollOverlay = this._register(new ctor({
                rows: 1,
                cols: this._xterm.raw.cols,
                allowProposedApi: true,
                ...this._getOptions()
            }));
            this._refreshGpuAcceleration();
            this._register(configurationService.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration(TERMINAL_CONFIG_SECTION)) {
                    this._syncOptions();
                }
            }));
            this._register(this._themeService.onDidColorThemeChange(() => {
                this._syncOptions();
            }));
            this._register(this._xterm.raw.onResize(() => {
                this._syncOptions();
                this._refresh();
            }));
            this._register(this._instance.onDidChangeVisibility(isVisible => {
                if (isVisible) {
                    this._refresh();
                }
            }));
            this._xtermAddonLoader.importAddon('serialize').then(SerializeAddon => {
                if (this._store.isDisposed) {
                    return;
                }
                this._serializeAddon = this._register(new SerializeAddon());
                this._xterm.raw.loadAddon(this._serializeAddon);
                // Trigger a render as the serialize addon is required to render
                this._refresh();
            });
        });
    }
    lockHide() {
        this._element?.classList.add('lock-hide');
    }
    unlockHide() {
        this._element?.classList.remove('lock-hide');
    }
    _setState(state) {
        if (this._state === state) {
            return;
        }
        switch (state) {
            case 0 /* OverlayState.Off */: {
                this._setVisible(false);
                this._uninstallRefreshListeners();
                break;
            }
            case 1 /* OverlayState.On */: {
                this._refresh();
                this._installRefreshListeners();
                break;
            }
        }
    }
    _installRefreshListeners() {
        if (!this._refreshListeners.value) {
            this._refreshListeners.value = combinedDisposable(Event.any(this._xterm.raw.onScroll, this._xterm.raw.onLineFeed, 
            // Rarely an update may be required after just a cursor move, like when
            // scrolling horizontally in a pager
            this._xterm.raw.onCursorMove)(() => this._refresh()), 
            // eslint-disable-next-line no-restricted-syntax
            addStandardDisposableListener(this._xterm.raw.element.querySelector('.xterm-viewport'), 'scroll', () => this._refresh()));
        }
    }
    _uninstallRefreshListeners() {
        this._refreshListeners.clear();
    }
    _setVisible(isVisible) {
        if (isVisible) {
            this._pendingShowOperation = true;
            this._show();
        }
        else {
            this._hide();
        }
    }
    _show() {
        if (this._pendingShowOperation) {
            this._ensureElement();
            this._element?.classList.toggle("visible" /* CssClasses.Visible */, true);
        }
        this._pendingShowOperation = false;
    }
    _hide() {
        this._pendingShowOperation = false;
        this._element?.classList.toggle("visible" /* CssClasses.Visible */, false);
    }
    _refresh() {
        if (this._isRefreshQueued) {
            return;
        }
        this._isRefreshQueued = true;
        queueMicrotask(() => {
            this._refreshNow();
            this._isRefreshQueued = false;
        });
    }
    _refreshNow() {
        const command = this._commandDetection.getCommandForLine(this._xterm.raw.buffer.active.viewportY);
        // The command from viewportY + 1 is used because this one will not be obscured by sticky
        // scroll.
        this._currentStickyCommand = undefined;
        // No command or ignored command
        if (!command || this._isIgnoredCommand(command)) {
            this._setVisible(false);
            return;
        }
        // Partial command
        if (!isFullTerminalCommand(command)) {
            const partialCommand = this._commandDetection.currentCommand;
            if (partialCommand?.commandStartMarker && partialCommand.commandExecutedMarker) {
                this._updateContent(partialCommand, partialCommand.commandStartMarker);
                return;
            }
            this._setVisible(false);
            return;
        }
        // If the marker doesn't exist or it was trimmed from scrollback
        const marker = command.marker;
        if (!marker || marker.line === -1) {
            // TODO: It would be nice if we kept the cached command around even if it was trimmed
            // from scrollback
            this._setVisible(false);
            return;
        }
        this._updateContent(command, marker);
    }
    _updateContent(command, startMarker) {
        const xterm = this._xterm.raw;
        if (!xterm.element?.parentElement || !this._stickyScrollOverlay || !this._serializeAddon) {
            return;
        }
        // Hide sticky scroll if the prompt has been trimmed from the buffer
        if (command.promptStartMarker?.line === -1) {
            this._setVisible(false);
            return;
        }
        // Determine sticky scroll line count
        const buffer = xterm.buffer.active;
        const promptRowCount = command.getPromptRowCount();
        const commandRowCount = command.getCommandRowCount();
        const stickyScrollLineStart = startMarker.line - (promptRowCount - 1);
        // Calculate the row offset, this is the number of rows that will be clipped from the top
        // of the sticky overlay because we do not want to show any content above the bounds of the
        // original terminal. This is done because it seems like scrolling flickers more when a
        // partial line can be drawn on the top.
        const isPartialCommand = !isFullTerminalCommand(command);
        const rowOffset = !isPartialCommand && command.endMarker ? Math.max(buffer.viewportY - command.endMarker.line + 1, 0) : 0;
        const maxLineCount = Math.min(this._rawMaxLineCount, Math.floor(xterm.rows * 0.4 /* Constants.StickyScrollPercentageCap */));
        const stickyScrollLineCount = Math.min(promptRowCount + commandRowCount - 1, maxLineCount) - rowOffset;
        const isTruncated = stickyScrollLineCount < promptRowCount + commandRowCount - 1;
        // Hide sticky scroll if it's currently on a line that contains it
        if (buffer.viewportY <= stickyScrollLineStart) {
            this._setVisible(false);
            return;
        }
        // Hide sticky scroll for the partial command if it looks like there is a pager like `less`
        // or `git log` active. This is done by checking if the bottom left cell contains the :
        // character and the cursor is immediately to its right. This improves the behavior of a
        // common case where the top of the text being viewport would otherwise be obscured.
        if (isPartialCommand && buffer.viewportY === buffer.baseY && buffer.cursorY === xterm.rows - 1) {
            const line = buffer.getLine(buffer.baseY + xterm.rows - 1);
            if ((buffer.cursorX === 1 && lineStartsWith(line, ':')) ||
                (buffer.cursorX === 5 && lineStartsWith(line, '(END)'))) {
                this._setVisible(false);
                return;
            }
        }
        // Get the line content of the command from the terminal
        const content = this._serializeAddon.serialize({
            range: {
                start: stickyScrollLineStart + rowOffset,
                end: stickyScrollLineStart + rowOffset + Math.max(stickyScrollLineCount - 1, 0)
            }
        }) + (isTruncated ? '\x1b[0m …' : '');
        // If a partial command's sticky scroll would show nothing, just hide it. This is another
        // edge case when using a pager or interactive editor.
        if (isPartialCommand && removeAnsiEscapeCodes(content).length === 0) {
            this._setVisible(false);
            return;
        }
        // Write content if it differs
        if (content && this._currentContent !== content ||
            this._stickyScrollOverlay.cols !== xterm.cols ||
            this._stickyScrollOverlay.rows !== stickyScrollLineCount) {
            this._stickyScrollOverlay.resize(this._stickyScrollOverlay.cols, stickyScrollLineCount);
            // Clear attrs, reset cursor position, clear right
            this._stickyScrollOverlay.write('\x1b[0m\x1b[H\x1b[2J');
            this._stickyScrollOverlay.write(content);
            this._currentContent = content;
            // DEBUG: Log to show the command line we know
            // this._stickyScrollOverlay.write(` [${command?.command}]`);
        }
        if (content) {
            this._currentStickyCommand = command;
            this._setVisible(true);
            // Position the sticky scroll such that it never overlaps the prompt/output of the
            // following command. This must happen after setVisible to ensure the element is
            // initialized.
            if (this._element) {
                const termBox = xterm.element.getBoundingClientRect();
                // Only try reposition if the element is visible, if not a refresh will occur when
                // it becomes visible
                if (termBox.height > 0) {
                    const rowHeight = termBox.height / xterm.rows;
                    const overlayHeight = stickyScrollLineCount * rowHeight;
                    // Adjust sticky scroll content if it would below the end of the command, obscuring the
                    // following command.
                    let endMarkerOffset = 0;
                    if (!isPartialCommand && command.endMarker && command.endMarker.line !== -1) {
                        const lastLine = Math.min(command.endMarker.line, buffer.baseY + buffer.cursorY);
                        if (buffer.viewportY + stickyScrollLineCount > lastLine) {
                            const diff = buffer.viewportY + stickyScrollLineCount - lastLine;
                            endMarkerOffset = diff * rowHeight;
                        }
                    }
                    this._element.style.bottom = `${termBox.height - overlayHeight + 1 + endMarkerOffset}px`;
                }
            }
        }
        else {
            this._setVisible(false);
        }
    }
    _ensureElement() {
        if (
        // The element is already created
        this._element ||
            // If the overlay is yet to be created, the terminal cannot be opened so defer to next call
            !this._stickyScrollOverlay ||
            // The xterm.js instance isn't opened yet
            !this._xterm?.raw.element?.parentElement) {
            return;
        }
        const overlay = this._stickyScrollOverlay;
        const hoverOverlay = $('.hover-overlay');
        this._element = $('.terminal-sticky-scroll', undefined, hoverOverlay);
        this._xterm.raw.element.parentElement.append(this._element);
        this._register(toDisposable(() => this._element?.remove()));
        // Fill tooltip
        let hoverTitle = localize('stickyScrollHoverTitle', 'Navigate to Command');
        const scrollToPreviousCommandKeybinding = this._keybindingService.lookupKeybinding("workbench.action.terminal.scrollToPreviousCommand" /* TerminalCommandId.ScrollToPreviousCommand */);
        if (scrollToPreviousCommandKeybinding) {
            const label = scrollToPreviousCommandKeybinding.getLabel();
            if (label) {
                hoverTitle += '\n' + localize('labelWithKeybinding', "{0} ({1})", terminalStrings.scrollToPreviousCommand.value, label);
            }
        }
        const scrollToNextCommandKeybinding = this._keybindingService.lookupKeybinding("workbench.action.terminal.scrollToNextCommand" /* TerminalCommandId.ScrollToNextCommand */);
        if (scrollToNextCommandKeybinding) {
            const label = scrollToNextCommandKeybinding.getLabel();
            if (label) {
                hoverTitle += '\n' + localize('labelWithKeybinding', "{0} ({1})", terminalStrings.scrollToNextCommand.value, label);
            }
        }
        hoverOverlay.title = hoverTitle;
        const scrollBarWidth = this._xterm.raw._core.viewport?.scrollBarWidth;
        if (scrollBarWidth !== undefined) {
            this._element.style.right = `${scrollBarWidth}px`;
        }
        this._stickyScrollOverlay.open(this._element);
        // Prevent tab key from being handled by the xterm overlay to allow natural tab navigation
        this._stickyScrollOverlay.attachCustomKeyEventHandler((event) => {
            if (event.key === 'Tab') {
                return false;
            }
            return true;
        });
        this._xtermAddonLoader.importAddon('ligatures').then(LigaturesAddon => {
            if (this._store.isDisposed || !this._stickyScrollOverlay) {
                return;
            }
            this._ligaturesAddon = new LigaturesAddon();
            this._stickyScrollOverlay.loadAddon(this._ligaturesAddon);
        });
        // Scroll to the command on click
        this._register(addStandardDisposableListener(hoverOverlay, 'click', () => {
            if (this._xterm && this._currentStickyCommand) {
                this._xterm.markTracker.revealCommand(this._currentStickyCommand);
                this._instance.focus();
            }
        }));
        // Forward mouse events to the terminal
        this._register(addStandardDisposableListener(hoverOverlay, 'wheel', e => this._xterm?.raw.element?.dispatchEvent(new WheelEvent(e.type, e))));
        // Context menu - stop propagation on mousedown because rightClickBehavior listens on
        // mousedown, not contextmenu
        this._register(addDisposableListener(hoverOverlay, 'mousedown', e => {
            e.stopImmediatePropagation();
            e.preventDefault();
        }));
        this._register(addDisposableListener(hoverOverlay, 'contextmenu', e => {
            e.stopImmediatePropagation();
            e.preventDefault();
            openContextMenu(getWindow(hoverOverlay), e, this._instance, this._contextMenu, this._contextMenuService);
        }));
        // Instead of juggling decorations for hover styles, swap out the theme to indicate the
        // hover state. This comes with the benefit over other methods of working well with special
        // decorative characters like powerline symbols.
        this._register(addStandardDisposableListener(hoverOverlay, 'mouseover', () => overlay.options.theme = this._getTheme(true)));
        this._register(addStandardDisposableListener(hoverOverlay, 'mouseleave', () => overlay.options.theme = this._getTheme(false)));
    }
    _syncOptions() {
        if (!this._stickyScrollOverlay) {
            return;
        }
        this._stickyScrollOverlay.resize(this._xterm.raw.cols, this._stickyScrollOverlay.rows);
        this._stickyScrollOverlay.options = this._getOptions();
        this._refreshGpuAcceleration();
    }
    _getOptions() {
        const o = this._xterm.raw.options;
        return {
            cursorInactiveStyle: 'none',
            scrollback: 0,
            logLevel: 'off',
            theme: this._getTheme(false),
            documentOverride: o.documentOverride,
            fontFamily: o.fontFamily,
            fontWeight: o.fontWeight,
            fontWeightBold: o.fontWeightBold,
            fontSize: o.fontSize,
            letterSpacing: o.letterSpacing,
            lineHeight: o.lineHeight,
            drawBoldTextInBrightColors: o.drawBoldTextInBrightColors,
            minimumContrastRatio: o.minimumContrastRatio,
            tabStopWidth: o.tabStopWidth,
        };
    }
    async _refreshGpuAcceleration() {
        if (this._shouldLoadWebgl() && (!this._webglAddon.value || this._webglAddonCustomGlyphs !== this._terminalConfigurationService.config.customGlyphs)) {
            const WebglAddon = await this._xtermAddonLoader.importAddon('webgl');
            if (this._store.isDisposed) {
                return;
            }
            // Dispose of existing addon before creating a new one to avoid leaking WebGL contexts
            this._webglAddon.value = new WebglAddon({
                customGlyphs: this._terminalConfigurationService.config.customGlyphs
            });
            this._webglAddonCustomGlyphs = this._terminalConfigurationService.config.customGlyphs;
            this._stickyScrollOverlay?.loadAddon(this._webglAddon.value);
        }
        else if (!this._shouldLoadWebgl() && this._webglAddon.value) {
            this._webglAddon.clear();
        }
    }
    _shouldLoadWebgl() {
        return this._terminalConfigurationService.config.gpuAcceleration === 'auto' || this._terminalConfigurationService.config.gpuAcceleration === 'on';
    }
    _getTheme(isHovering) {
        const theme = this._themeService.getColorTheme();
        return {
            ...this._xterm.getXtermTheme(),
            background: isHovering
                ? theme.getColor(terminalStickyScrollHoverBackground)?.toString() ?? this._xtermColorProvider.getBackgroundColor(theme)?.toString()
                : theme.getColor(terminalStickyScrollBackground)?.toString() ?? this._xtermColorProvider.getBackgroundColor(theme)?.toString(),
            selectionBackground: undefined,
            selectionInactiveBackground: undefined
        };
    }
    _isIgnoredCommand(command) {
        if (!command.command) {
            return false;
        }
        const trimmedCommand = command.command.trim().toLowerCase();
        return this._ignoredCommands.some(cmd => cmd.toLowerCase() === trimmedCommand);
    }
};
__decorate([
    debounce(100)
], TerminalStickyScrollOverlay.prototype, "_show", null);
__decorate([
    throttle(0)
], TerminalStickyScrollOverlay.prototype, "_syncOptions", null);
__decorate([
    throttle(0)
], TerminalStickyScrollOverlay.prototype, "_refreshGpuAcceleration", null);
TerminalStickyScrollOverlay = __decorate([
    __param(5, IConfigurationService),
    __param(6, IContextKeyService),
    __param(7, IContextMenuService),
    __param(8, IKeybindingService),
    __param(9, IMenuService),
    __param(10, ITerminalConfigurationService),
    __param(11, IThemeService)
], TerminalStickyScrollOverlay);
export { TerminalStickyScrollOverlay };
function lineStartsWith(line, text) {
    if (!line) {
        return false;
    }
    for (let i = 0; i < text.length; i++) {
        if (line.getCell(i)?.getChars() !== text[i]) {
            return false;
        }
    }
    return true;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxTdGlja3lTY3JvbGxPdmVybGF5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL3N0aWNreVNjcm9sbC9icm93c2VyL3Rlcm1pbmFsU3RpY2t5U2Nyb2xsT3ZlcmxheS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQU1oRyxPQUFPLEVBQUUsQ0FBQyxFQUFFLHFCQUFxQixFQUFFLDZCQUE2QixFQUFFLFNBQVMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3hILE9BQU8sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDOUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsa0JBQWtCLEVBQUUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDOUUsT0FBTywwQkFBMEIsQ0FBQztBQUNsQyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFTLFlBQVksRUFBRSxNQUFNLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUU3RixPQUFPLEVBQTBCLHFCQUFxQixFQUFFLE1BQU0sMEZBQTBGLENBQUM7QUFD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