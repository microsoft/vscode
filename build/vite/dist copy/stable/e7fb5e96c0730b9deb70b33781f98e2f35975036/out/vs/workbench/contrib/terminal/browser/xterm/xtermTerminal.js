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
var XtermTerminal_1;
import * as dom from '../../../../../base/browser/dom.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ITerminalLogService } from '../../../../../platform/terminal/common/terminal.js';
import { ITerminalConfigurationService } from '../terminal.js';
import { LogLevel } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { MarkNavigationAddon } from './markNavigationAddon.js';
import { localize } from '../../../../../nls.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { PANEL_BACKGROUND } from '../../../../common/theme.js';
import { TERMINAL_FOREGROUND_COLOR, TERMINAL_BACKGROUND_COLOR, TERMINAL_CURSOR_FOREGROUND_COLOR, TERMINAL_CURSOR_BACKGROUND_COLOR, ansiColorIdentifiers, TERMINAL_SELECTION_BACKGROUND_COLOR, TERMINAL_FIND_MATCH_BACKGROUND_COLOR, TERMINAL_FIND_MATCH_HIGHLIGHT_BACKGROUND_COLOR, TERMINAL_FIND_MATCH_BORDER_COLOR, TERMINAL_OVERVIEW_RULER_FIND_MATCH_FOREGROUND_COLOR, TERMINAL_FIND_MATCH_HIGHLIGHT_BORDER_COLOR, TERMINAL_OVERVIEW_RULER_CURSOR_FOREGROUND_COLOR, TERMINAL_SELECTION_FOREGROUND_COLOR, TERMINAL_INACTIVE_SELECTION_BACKGROUND_COLOR, TERMINAL_OVERVIEW_RULER_BORDER_COLOR } from '../../common/terminalColorRegistry.js';
import { ShellIntegrationAddon } from '../../../../../platform/terminal/common/xterm/shellIntegrationAddon.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { DecorationAddon } from './decorationAddon.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TerminalContextKeys } from '../../common/terminalContextKey.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { debounce } from '../../../../../base/common/decorators.js';
import { MouseWheelClassifier } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { StandardWheelEvent } from '../../../../../base/browser/mouseEvent.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground } from '../../../../../platform/theme/common/colorRegistry.js';
import { XtermAddonImporter } from './xtermAddonImporter.js';
import { equals } from '../../../../../base/common/objects.js';
import { isNumber } from '../../../../../base/common/types.js';
import { clamp } from '../../../../../base/common/numbers.js';
var RenderConstants;
(function (RenderConstants) {
    RenderConstants[RenderConstants["SmoothScrollDuration"] = 125] = "SmoothScrollDuration";
})(RenderConstants || (RenderConstants = {}));
var TextBlinkConstants;
(function (TextBlinkConstants) {
    TextBlinkConstants[TextBlinkConstants["IntervalDuration"] = 600] = "IntervalDuration";
})(TextBlinkConstants || (TextBlinkConstants = {}));
function getFullBufferLineAsString(lineIndex, buffer) {
    let line = buffer.getLine(lineIndex);
    if (!line) {
        return { lineData: undefined, lineIndex };
    }
    let lineData = line.translateToString(true);
    while (lineIndex > 0 && line.isWrapped) {
        line = buffer.getLine(--lineIndex);
        if (!line) {
            break;
        }
        lineData = line.translateToString(false) + lineData;
    }
    return { lineData, lineIndex };
}
/**
 * Wraps the xterm object with additional functionality. Interaction with the backing process is out
 * of the scope of this class.
 */
let XtermTerminal = class XtermTerminal extends Disposable {
    static { XtermTerminal_1 = this; }
    static { this._suggestedRendererType = undefined; }
    get lastInputEvent() { return this._lastInputEvent; }
    get progressState() { return this._progressState; }
    get buffer() { return this.raw.buffer; }
    get cols() { return this.raw.cols; }
    get findResult() { return this._lastFindResult; }
    get isStdinDisabled() { return !!this.raw.options.disableStdin; }
    get isGpuAccelerated() { return !!this._webglAddon; }
    get isImageAddonLoaded() { return !!this._imageAddon; }
    get markTracker() { return this._markNavigationAddon; }
    get shellIntegration() { return this._shellIntegrationAddon; }
    get decorationAddon() { return this._decorationAddon; }
    get textureAtlas() {
        const canvas = this._webglAddon?.textureAtlas;
        if (!canvas) {
            return undefined;
        }
        return createImageBitmap(canvas);
    }
    get isFocused() {
        if (!this.raw.element) {
            return false;
        }
        return dom.isAncestorOfActiveElement(this.raw.element);
    }
    /**
     * @param xtermCtor The xterm.js constructor, this is passed in so it can be fetched lazily
     * outside of this class such that {@link raw} is not nullable.
     */
    constructor(resource, xtermCtor, options, _onDidExecuteText, _configurationService, _instantiationService, _logService, _notificationService, _themeService, _telemetryService, _terminalConfigurationService, _clipboardService, contextKeyService, _accessibilitySignalService, layoutService) {
        super();
        this._onDidExecuteText = _onDidExecuteText;
        this._configurationService = _configurationService;
        this._instantiationService = _instantiationService;
        this._logService = _logService;
        this._notificationService = _notificationService;
        this._themeService = _themeService;
        this._telemetryService = _telemetryService;
        this._terminalConfigurationService = _terminalConfigurationService;
        this._clipboardService = _clipboardService;
        this._accessibilitySignalService = _accessibilitySignalService;
        this._isPhysicalMouseWheel = MouseWheelClassifier.INSTANCE.isPhysicalMouseWheel();
        this._progressState = { state: 0, value: 0 };
        this._webglAddonCustomGlyphs = false;
        this._ligaturesAddon = this._register(new MutableDisposable());
        this._attachedDisposables = this._register(new DisposableStore());
        this._onDidRequestRunCommand = this._register(new Emitter());
        this.onDidRequestRunCommand = this._onDidRequestRunCommand.event;
        this._onDidRequestCopyAsHtml = this._register(new Emitter());
        this.onDidRequestCopyAsHtml = this._onDidRequestCopyAsHtml.event;
        this._onDidRequestRefreshDimensions = this._register(new Emitter());
        this.onDidRequestRefreshDimensions = this._onDidRequestRefreshDimensions.event;
        this._onDidChangeFindResults = this._register(new Emitter());
        this.onDidChangeFindResults = this._onDidChangeFindResults.event;
        this._onBeforeSearch = this._register(new Emitter());
        this.onBeforeSearch = this._onBeforeSearch.event;
        this._onAfterSearch = this._register(new Emitter());
        this.onAfterSearch = this._onAfterSearch.event;
        this._onDidChangeSelection = this._register(new Emitter());
        this.onDidChangeSelection = this._onDidChangeSelection.event;
        this._onDidChangeFocus = this._register(new Emitter());
        this.onDidChangeFocus = this._onDidChangeFocus.event;
        this._onDidDispose = this._register(new Emitter());
        this.onDidDispose = this._onDidDispose.event;
        this._onDidChangeProgress = this._register(new Emitter());
        this.onDidChangeProgress = this._onDidChangeProgress.event;
        this._xtermAddonLoader = options.xtermAddonImporter ?? new XtermAddonImporter();
        this._xtermColorProvider = options.xtermColorProvider;
        this._capabilities = options.capabilities;
        const font = this._terminalConfigurationService.getFont(dom.getActiveWindow(), undefined, true);
        const config = this._terminalConfigurationService.config;
        const editorOptions = this._configurationService.getValue('editor');
        this.raw = this._register(new xtermCtor({
            allowProposedApi: true,
            cols: options.cols,
            rows: options.rows,
            documentOverride: layoutService.mainContainer.ownerDocument,
            altClickMovesCursor: config.altClickMovesCursor && editorOptions.multiCursorModifier === 'alt',
            scrollback: config.scrollback,
            theme: this.getXtermTheme(),
            drawBoldTextInBrightColors: config.drawBoldTextInBrightColors,
            fontFamily: font.fontFamily,
            fontWeight: config.fontWeight,
            fontWeightBold: config.fontWeightBold,
            fontSize: font.fontSize,
            letterSpacing: font.letterSpacing,
            lineHeight: font.lineHeight,
            logLevel: vscodeToXtermLogLevel(this._logService.getLevel()),
            logger: this._logService,
            minimumContrastRatio: config.minimumContrastRatio,
            tabStopWidth: config.tabStopWidth,
            cursorBlink: config.cursorBlinking,
            blinkIntervalDuration: config.textBlinking ? 600 /* TextBlinkConstants.IntervalDuration */ : 0,
            cursorStyle: vscodeToXtermCursorStyle(config.cursorStyle),
            cursorInactiveStyle: vscodeToXtermCursorStyle(config.cursorStyleInactive),
            cursorWidth: config.cursorWidth,
            macOptionIsMeta: config.macOptionIsMeta,
            macOptionClickForcesSelection: config.macOptionClickForcesSelection,
            rightClickSelectsWord: config.rightClickBehavior === 'selectWord',
            fastScrollSensitivity: config.fastScrollSensitivity,
            scrollSensitivity: config.mouseWheelScrollSensitivity,
            scrollOnEraseInDisplay: true,
            wordSeparator: config.wordSeparators,
            scrollbar: options.disableOverviewRuler ? undefined : {
                width: 14,
                overviewRuler: {
                    showTopBorder: true,
                },
            },
            ignoreBracketedPasteMode: config.ignoreBracketedPasteMode,
            rescaleOverlappingGlyphs: config.rescaleOverlappingGlyphs,
            vtExtensions: {
                kittyKeyboard: config.enableKittyKeyboardProtocol,
                win32InputMode: config.enableWin32InputMode,
            },
            allowTransparency: config.enableImages,
            windowOptions: {
                getWinSizePixels: true,
                getCellSizePixels: true,
                getWinSizeChars: true,
            },
        }));
        this._updateSmoothScrolling();
        this._core = this.raw._core;
        this._register(this._configurationService.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration("terminal.integrated.gpuAcceleration" /* TerminalSettingId.GpuAcceleration */)) {
                XtermTerminal_1._suggestedRendererType = undefined;
            }
            if (e.affectsConfiguration('terminal.integrated') || e.affectsConfiguration('editor.fastScrollSensitivity') || e.affectsConfiguration('editor.mouseWheelScrollSensitivity') || e.affectsConfiguration('editor.multiCursorModifier')) {
                this.updateConfig();
            }
            if (e.affectsConfiguration("terminal.integrated.unicodeVersion" /* TerminalSettingId.UnicodeVersion */)) {
                this._updateUnicodeVersion();
            }
            if (e.affectsConfiguration("terminal.integrated.shellIntegration.decorationsEnabled" /* TerminalSettingId.ShellIntegrationDecorationsEnabled */)) {
                this._updateTheme();
            }
        }));
        this._register(this._themeService.onDidColorThemeChange(theme => this._updateTheme(theme)));
        this._register(this._logService.onDidChangeLogLevel(e => this.raw.options.logLevel = vscodeToXtermLogLevel(e)));
        // Refire events
        this._register(this.raw.onSelectionChange(() => {
            this._onDidChangeSelection.fire();
            if (this.isFocused) {
                this._anyFocusedTerminalHasSelection.set(this.raw.hasSelection());
            }
        }));
        this._register(this.raw.onData(e => this._lastInputEvent = e));
        // Load addons
        this._updateUnicodeVersion();
        this._markNavigationAddon = this._instantiationService.createInstance(MarkNavigationAddon, options.capabilities);
        this.raw.loadAddon(this._markNavigationAddon);
        this._decorationAddon = this._instantiationService.createInstance(DecorationAddon, resource, this._capabilities);
        this._register(this._decorationAddon.onDidRequestRunCommand(e => this._onDidRequestRunCommand.fire(e)));
        this._register(this._decorationAddon.onDidRequestCopyAsHtml(e => this._onDidRequestCopyAsHtml.fire(e)));
        this.raw.loadAddon(this._decorationAddon);
        this._shellIntegrationAddon = new ShellIntegrationAddon(options.shellIntegrationNonce ?? '', options.disableShellIntegrationReporting, this._onDidExecuteText, this._telemetryService, this._logService);
        this.raw.loadAddon(this._shellIntegrationAddon);
        this._xtermAddonLoader.importAddon('clipboard').then(ClipboardAddon => {
            if (this._store.isDisposed) {
                return;
            }
            this._clipboardAddon = this._instantiationService.createInstance(ClipboardAddon, undefined, {
                async readText(type) {
                    return _clipboardService.readText(type === 'p' ? 'selection' : 'clipboard');
                },
                async writeText(type, text) {
                    return _clipboardService.writeText(text, type === 'p' ? 'selection' : 'clipboard');
                }
            });
            this.raw.loadAddon(this._clipboardAddon);
        });
        this._xtermAddonLoader.importAddon('progress').then(ProgressAddon => {
            if (this._store.isDisposed) {
                return;
            }
            const progressAddon = this._instantiationService.createInstance(ProgressAddon);
            this.raw.loadAddon(progressAddon);
            const updateProgress = () => {
                if (!equals(this._progressState, progressAddon.progress)) {
                    this._progressState = progressAddon.progress;
                    this._onDidChangeProgress.fire(this._progressState);
                }
            };
            this._register(progressAddon.onChange(() => updateProgress()));
            updateProgress();
            const commandDetection = this._capabilities.get(2 /* TerminalCapability.CommandDetection */);
            if (commandDetection) {
                this._register(commandDetection.onCommandFinished(() => progressAddon.progress = { state: 0, value: 0 }));
            }
            else {
                const disposable = this._capabilities.onDidAddCapability(e => {
                    if (e.id === 2 /* TerminalCapability.CommandDetection */) {
                        this._register(e.capability.onCommandFinished(() => progressAddon.progress = { state: 0, value: 0 }));
                        this._store.delete(disposable);
                    }
                });
                this._store.add(disposable);
            }
        });
        this._anyTerminalFocusContextKey = TerminalContextKeys.focusInAny.bindTo(contextKeyService);
        this._anyFocusedTerminalHasSelection = TerminalContextKeys.textSelectedInFocused.bindTo(contextKeyService);
    }
    *getBufferReverseIterator() {
        for (let i = this.raw.buffer.active.length - 1; i >= 0; i--) {
            const { lineData, lineIndex } = getFullBufferLineAsString(i, this.raw.buffer.active);
            if (lineData) {
                i = lineIndex;
                yield lineData;
            }
        }
    }
    getContentsAsText(startMarker, endMarker) {
        const lines = [];
        const buffer = this.raw.buffer.active;
        if (startMarker?.line === -1) {
            throw new Error('Cannot get contents of a disposed startMarker');
        }
        if (endMarker?.line === -1) {
            throw new Error('Cannot get contents of a disposed endMarker');
        }
        const startLine = startMarker?.line ?? 0;
        const endLine = endMarker?.line ?? buffer.length - 1;
        for (let y = startLine; y <= endLine; y++) {
            lines.push(buffer.getLine(y)?.translateToString(true) ?? '');
        }
        return lines.join('\n');
    }
    async getContentsAsHtml() {
        if (!this._serializeAddon) {
            const Addon = await this._xtermAddonLoader.importAddon('serialize');
            this._serializeAddon = new Addon();
            this.raw.loadAddon(this._serializeAddon);
        }
        return this._serializeAddon.serializeAsHTML();
    }
    async getCommandOutputAsHtml(command, maxLines) {
        if (!this._serializeAddon) {
            const Addon = await this._xtermAddonLoader.importAddon('serialize');
            this._serializeAddon = new Addon();
            this.raw.loadAddon(this._serializeAddon);
        }
        let startLine;
        let startCol;
        if (command.executedMarker && command.executedMarker.line >= 0) {
            startLine = command.executedMarker.line;
            startCol = Math.max(command.executedX ?? 0, 0);
        }
        else {
            startLine = command.marker?.line !== undefined ? command.marker.line + 1 : 1;
            startCol = Math.max(command.startX ?? 0, 0);
        }
        let endLine = command.endMarker?.line !== undefined ? command.endMarker.line - 1 : this.raw.buffer.active.length - 1;
        if (endLine < startLine) {
            return { text: '', truncated: false };
        }
        // Trim empty lines from the end
        let emptyLinesFromEnd = 0;
        for (let i = endLine; i >= startLine; i--) {
            const line = this.raw.buffer.active.getLine(i);
            if (line && line.translateToString(true).trim() === '') {
                emptyLinesFromEnd++;
            }
            else {
                break;
            }
        }
        endLine = endLine - emptyLinesFromEnd;
        // Trim empty lines from the start
        let emptyLinesFromStart = 0;
        for (let i = startLine; i <= endLine; i++) {
            const line = this.raw.buffer.active.getLine(i);
            if (line && line.translateToString(true, i === startLine ? startCol : undefined).trim() === '') {
                if (i === startLine) {
                    startCol = 0;
                }
                emptyLinesFromStart++;
            }
            else {
                break;
            }
        }
        startLine = startLine + emptyLinesFromStart;
        if (maxLines && endLine - startLine > maxLines) {
            startLine = endLine - maxLines;
            startCol = 0;
        }
        const bufferLine = this.raw.buffer.active.getLine(startLine);
        if (bufferLine) {
            startCol = Math.min(startCol, bufferLine.length);
        }
        const range = { startLine, endLine, startCol };
        const result = this._serializeAddon.serializeAsHTML({ range });
        return { text: result, truncated: (endLine - startLine) >= maxLines };
    }
    async getSelectionAsHtml(command) {
        if (!this._serializeAddon) {
            const Addon = await this._xtermAddonLoader.importAddon('serialize');
            this._serializeAddon = new Addon();
            this.raw.loadAddon(this._serializeAddon);
        }
        if (command) {
            const length = command.getOutput()?.length;
            const row = command.marker?.line;
            if (!length || !row) {
                throw new Error(`No row ${row} or output length ${length} for command ${command}`);
            }
            this.raw.select(0, row + 1, length - Math.floor(length / this.raw.cols));
        }
        const result = this._serializeAddon.serializeAsHTML({ onlySelection: true });
        if (command) {
            this.raw.clearSelection();
        }
        return result;
    }
    attachToElement(container, partialOptions) {
        const options = { enableGpu: true, ...partialOptions };
        if (!this._attached) {
            this.raw.open(container);
        }
        // TODO: Move before open so the DOM renderer doesn't initialize
        if (options.enableGpu) {
            if (this._shouldLoadWebgl()) {
                this._enableWebglRenderer();
            }
        }
        if (!this.raw.element || !this.raw.textarea) {
            throw new Error('xterm elements not set after open');
        }
        const ad = this._attachedDisposables;
        ad.clear();
        ad.add(dom.addDisposableListener(this.raw.textarea, 'focus', () => this._setFocused(true)));
        ad.add(dom.addDisposableListener(this.raw.textarea, 'blur', () => this._setFocused(false)));
        ad.add(dom.addDisposableListener(this.raw.textarea, 'focusout', () => this._setFocused(false)));
        // Track wheel events in mouse wheel classifier and update smoothScrolling when it changes
        // as it must be disabled when a trackpad is used
        ad.add(dom.addDisposableListener(this.raw.element, dom.EventType.MOUSE_WHEEL, (e) => {
            const classifier = MouseWheelClassifier.INSTANCE;
            classifier.acceptStandardWheelEvent(new StandardWheelEvent(e));
            const value = classifier.isPhysicalMouseWheel();
            if (value !== this._isPhysicalMouseWheel) {
                this._isPhysicalMouseWheel = value;
                this._updateSmoothScrolling();
            }
        }, { passive: true }));
        this._refreshLigaturesAddon();
        this._attached = { container, options };
        // Screen must be created at this point as xterm.open is called
        // eslint-disable-next-line no-restricted-syntax
        return this._attached?.container.querySelector('.xterm-screen');
    }
    _setFocused(isFocused) {
        this._onDidChangeFocus.fire(isFocused);
        this._anyTerminalFocusContextKey.set(isFocused);
        this._anyFocusedTerminalHasSelection.set(isFocused && this.raw.hasSelection());
    }
    write(data, callback) {
        this.raw.write(data, callback);
    }
    resize(columns, rows) {
        this._logService.debug('resizing', columns, rows);
        this.raw.resize(columns, rows);
    }
    updateConfig() {
        const config = this._terminalConfigurationService.config;
        this.raw.options.altClickMovesCursor = config.altClickMovesCursor;
        this._setCursorBlink(config.cursorBlinking);
        this._setTextBlinking(config.textBlinking);
        this._setCursorStyle(config.cursorStyle);
        this._setCursorStyleInactive(config.cursorStyleInactive);
        this._setCursorWidth(config.cursorWidth);
        this.raw.options.scrollback = config.scrollback;
        this.raw.options.drawBoldTextInBrightColors = config.drawBoldTextInBrightColors;
        this.raw.options.minimumContrastRatio = config.minimumContrastRatio;
        this.raw.options.tabStopWidth = config.tabStopWidth;
        this.raw.options.fastScrollSensitivity = config.fastScrollSensitivity;
        this.raw.options.scrollSensitivity = config.mouseWheelScrollSensitivity;
        this.raw.options.macOptionIsMeta = config.macOptionIsMeta;
        const editorOptions = this._configurationService.getValue('editor');
        this.raw.options.altClickMovesCursor = config.altClickMovesCursor && editorOptions.multiCursorModifier === 'alt';
        this.raw.options.macOptionClickForcesSelection = config.macOptionClickForcesSelection;
        this.raw.options.rightClickSelectsWord = config.rightClickBehavior === 'selectWord';
        this.raw.options.wordSeparator = config.wordSeparators;
        this.raw.options.ignoreBracketedPasteMode = config.ignoreBracketedPasteMode;
        this.raw.options.rescaleOverlappingGlyphs = config.rescaleOverlappingGlyphs;
        this.raw.options.allowTransparency = config.enableImages;
        this.raw.options.vtExtensions = {
            kittyKeyboard: config.enableKittyKeyboardProtocol,
            win32InputMode: config.enableWin32InputMode,
        };
        this._updateSmoothScrolling();
        if (this._attached) {
            if (this._attached.options.enableGpu) {
                if (this._shouldLoadWebgl()) {
                    this._enableWebglRenderer();
                }
                else {
                    this._disposeOfWebglRenderer();
                }
            }
            this._refreshLigaturesAddon();
        }
    }
    _updateSmoothScrolling() {
        this.raw.options.smoothScrollDuration = this._terminalConfigurationService.config.smoothScrolling && this._isPhysicalMouseWheel ? 125 /* RenderConstants.SmoothScrollDuration */ : 0;
    }
    _shouldLoadWebgl() {
        return (this._terminalConfigurationService.config.gpuAcceleration === 'auto' && XtermTerminal_1._suggestedRendererType === undefined) || this._terminalConfigurationService.config.gpuAcceleration === 'on';
    }
    forceRedraw() {
        this.raw.clearTextureAtlas();
    }
    clearDecorations() {
        this._decorationAddon?.clearDecorations();
    }
    forceRefresh() {
        this._core.viewport?._innerRefresh();
    }
    async findNext(term, searchOptions) {
        this._updateFindColors(searchOptions);
        return (await this._getSearchAddon()).findNext(term, searchOptions);
    }
    async findPrevious(term, searchOptions) {
        this._updateFindColors(searchOptions);
        return (await this._getSearchAddon()).findPrevious(term, searchOptions);
    }
    _updateFindColors(searchOptions) {
        const theme = this._themeService.getColorTheme();
        // Theme color names align with monaco/vscode whereas xterm.js has some different naming.
        // The mapping is as follows:
        // - findMatch -> activeMatch
        // - findMatchHighlight -> match
        const terminalBackground = theme.getColor(TERMINAL_BACKGROUND_COLOR) || theme.getColor(PANEL_BACKGROUND);
        const findMatchBackground = theme.getColor(TERMINAL_FIND_MATCH_BACKGROUND_COLOR);
        const findMatchBorder = theme.getColor(TERMINAL_FIND_MATCH_BORDER_COLOR);
        const findMatchOverviewRuler = theme.getColor(TERMINAL_OVERVIEW_RULER_CURSOR_FOREGROUND_COLOR);
        const findMatchHighlightBackground = theme.getColor(TERMINAL_FIND_MATCH_HIGHLIGHT_BACKGROUND_COLOR);
        const findMatchHighlightBorder = theme.getColor(TERMINAL_FIND_MATCH_HIGHLIGHT_BORDER_COLOR);
        const findMatchHighlightOverviewRuler = theme.getColor(TERMINAL_OVERVIEW_RULER_FIND_MATCH_FOREGROUND_COLOR);
        searchOptions.decorations = {
            activeMatchBackground: findMatchBackground?.toString(),
            activeMatchBorder: findMatchBorder?.toString() || 'transparent',
            activeMatchColorOverviewRuler: findMatchOverviewRuler?.toString() || 'transparent',
            // decoration bgs don't support the alpha channel so blend it with the regular bg
            matchBackground: terminalBackground ? findMatchHighlightBackground?.blend(terminalBackground).toString() : undefined,
            matchBorder: findMatchHighlightBorder?.toString() || 'transparent',
            matchOverviewRuler: findMatchHighlightOverviewRuler?.toString() || 'transparent'
        };
    }
    _getSearchAddon() {
        if (!this._searchAddonPromise) {
            this._searchAddonPromise = this._xtermAddonLoader.importAddon('search').then((AddonCtor) => {
                if (this._store.isDisposed) {
                    return Promise.reject('Could not create search addon, terminal is disposed');
                }
                this._searchAddon = new AddonCtor({ highlightLimit: 20000 /* XtermTerminalConstants.SearchHighlightLimit */ });
                this.raw.loadAddon(this._searchAddon);
                this._store.add(this._searchAddon.onDidChangeResults((results) => {
                    this._lastFindResult = results;
                    this._onDidChangeFindResults.fire(results);
                }));
                this._store.add(this._searchAddon.onBeforeSearch(() => {
                    this._onBeforeSearch.fire();
                }));
                this._store.add(this._searchAddon.onAfterSearch(() => {
                    this._onAfterSearch.fire();
                }));
                return this._searchAddon;
            });
        }
        return this._searchAddonPromise;
    }
    clearSearchDecorations() {
        this._searchAddon?.clearDecorations();
    }
    clearActiveSearchDecoration() {
        this._searchAddon?.clearActiveDecoration();
    }
    getFont() {
        return this._terminalConfigurationService.getFont(dom.getWindow(this.raw.element), this._core);
    }
    getLongestViewportWrappedLineLength() {
        let maxLineLength = 0;
        for (let i = this.raw.buffer.active.length - 1; i >= this.raw.buffer.active.viewportY; i--) {
            const lineInfo = this._getWrappedLineCount(i, this.raw.buffer.active);
            maxLineLength = Math.max(maxLineLength, ((lineInfo.lineCount * this.raw.cols) - lineInfo.endSpaces) || 0);
            i = lineInfo.currentIndex;
        }
        return maxLineLength;
    }
    _getWrappedLineCount(index, buffer) {
        let line = buffer.getLine(index);
        if (!line) {
            throw new Error('Could not get line');
        }
        let currentIndex = index;
        let endSpaces = 0;
        // line.length may exceed cols as it doesn't necessarily trim the backing array on resize
        for (let i = Math.min(line.length, this.raw.cols) - 1; i >= 0; i--) {
            if (!line?.getCell(i)?.getChars()) {
                endSpaces++;
            }
            else {
                break;
            }
        }
        while (line?.isWrapped && currentIndex > 0) {
            currentIndex--;
            line = buffer.getLine(currentIndex);
        }
        return { lineCount: index - currentIndex + 1, currentIndex, endSpaces };
    }
    scrollDownLine() {
        this.raw.scrollLines(1);
    }
    scrollDownPage() {
        this.raw.scrollPages(1);
    }
    scrollToBottom() {
        this.raw.scrollToBottom();
    }
    scrollUpLine() {
        this.raw.scrollLines(-1);
    }
    scrollUpPage() {
        this.raw.scrollPages(-1);
    }
    scrollToTop() {
        this.raw.scrollToTop();
    }
    scrollToLine(line, position = 0 /* ScrollPosition.Top */) {
        this.markTracker.scrollToLine(line, position);
    }
    clearBuffer() {
        this.raw.clear();
        // xterm.js does not clear the first prompt, so trigger these to simulate
        // the prompt being written
        this._capabilities.get(2 /* TerminalCapability.CommandDetection */)?.handlePromptStart();
        this._capabilities.get(2 /* TerminalCapability.CommandDetection */)?.handleCommandStart();
        this._accessibilitySignalService.playSignal(AccessibilitySignal.clear);
    }
    reset() {
        this.raw.reset();
    }
    hasSelection() {
        return this.raw.hasSelection();
    }
    clearSelection() {
        this.raw.clearSelection();
    }
    selectMarkedRange(fromMarkerId, toMarkerId, scrollIntoView = false) {
        const detectionCapability = this.shellIntegration.capabilities.get(4 /* TerminalCapability.BufferMarkDetection */);
        if (!detectionCapability) {
            return;
        }
        const start = detectionCapability.getMark(fromMarkerId);
        const end = detectionCapability.getMark(toMarkerId);
        if (start === undefined || end === undefined) {
            return;
        }
        this.raw.selectLines(start.line, end.line);
        if (scrollIntoView) {
            this.raw.scrollToLine(start.line);
        }
    }
    selectAll() {
        this.raw.focus();
        this.raw.selectAll();
    }
    focus() {
        this.raw.focus();
    }
    async copySelection(asHtml, command) {
        if (this.hasSelection() || (asHtml && command)) {
            if (asHtml) {
                const textAsHtml = await this.getSelectionAsHtml(command);
                function listener(e) {
                    if (e.clipboardData) {
                        if (!e.clipboardData.types.includes('text/plain')) {
                            e.clipboardData.setData('text/plain', command?.getOutput() ?? '');
                        }
                        e.clipboardData.setData('text/html', textAsHtml);
                    }
                    e.preventDefault();
                }
                const doc = dom.getDocument(this.raw.element);
                doc.addEventListener('copy', listener);
                doc.execCommand('copy');
                doc.removeEventListener('copy', listener);
            }
            else {
                await this._clipboardService.writeText(this.raw.getSelection());
            }
        }
        else {
            this._notificationService.warn(localize('terminal.integrated.copySelection.noSelection', 'The terminal has no selection to copy'));
        }
    }
    _setCursorBlink(blink) {
        if (this.raw.options.cursorBlink !== blink) {
            this.raw.options.cursorBlink = blink;
            this.raw.refresh(0, this.raw.rows - 1);
        }
    }
    _setTextBlinking(enabled) {
        const blinkIntervalDuration = enabled ? 600 /* TextBlinkConstants.IntervalDuration */ : 0;
        const options = this.raw.options;
        if (options.blinkIntervalDuration !== blinkIntervalDuration) {
            options.blinkIntervalDuration = blinkIntervalDuration;
        }
    }
    _setCursorStyle(style) {
        const mapped = vscodeToXtermCursorStyle(style);
        if (this.raw.options.cursorStyle !== mapped) {
            this.raw.options.cursorStyle = mapped;
        }
    }
    _setCursorStyleInactive(style) {
        const mapped = vscodeToXtermCursorStyle(style);
        if (this.raw.options.cursorInactiveStyle !== mapped) {
            this.raw.options.cursorInactiveStyle = mapped;
        }
    }
    _setCursorWidth(width) {
        if (this.raw.options.cursorWidth !== width) {
            this.raw.options.cursorWidth = width;
        }
    }
    async _enableWebglRenderer() {
        // Currently webgl options can only be specified on addon creation
        if (!this.raw.element || this._webglAddon && this._webglAddonCustomGlyphs === this._terminalConfigurationService.config.customGlyphs) {
            return;
        }
        // Dispose of existing addon before creating a new one to avoid leaking WebGL contexts
        this._disposeOfWebglRenderer();
        this._webglAddonCustomGlyphs = this._terminalConfigurationService.config.customGlyphs;
        const Addon = await this._xtermAddonLoader.importAddon('webgl');
        this._webglAddon = new Addon({
            customGlyphs: this._terminalConfigurationService.config.customGlyphs
        });
        try {
            this.raw.loadAddon(this._webglAddon);
            this._logService.trace('Webgl was loaded');
            this._store.add(this._webglAddon.onContextLoss(() => {
                this._logService.info(`Webgl lost context, disposing of webgl renderer`);
                this._disposeOfWebglRenderer();
            }));
            this._refreshImageAddon();
            // WebGL renderer cell dimensions differ from the DOM renderer, make sure the terminal
            // gets resized after the webgl addon is loaded
            this._onDidRequestRefreshDimensions.fire();
            // Uncomment to add the texture atlas to the DOM
            // setTimeout(() => {
            // 	if (this._webglAddon?.textureAtlas) {
            // 		document.body.appendChild(this._webglAddon?.textureAtlas);
            // 	}
            // }, 5000);
        }
        catch (e) {
            this._logService.warn(`Webgl could not be loaded. Falling back to the DOM renderer`, e);
            XtermTerminal_1._suggestedRendererType = 'dom';
            this._disposeOfWebglRenderer();
        }
    }
    async _refreshLigaturesAddon() {
        if (!this.raw.element) {
            return;
        }
        const ligaturesConfig = this._terminalConfigurationService.config.fontLigatures;
        let shouldRecreateWebglRenderer = false;
        if (ligaturesConfig?.enabled) {
            if (this._ligaturesAddon.value && !equals(ligaturesConfig, this._ligaturesAddonConfig)) {
                this._ligaturesAddon.clear();
            }
            if (!this._ligaturesAddon.value) {
                const LigaturesAddon = await this._xtermAddonLoader.importAddon('ligatures');
                if (this._store.isDisposed) {
                    return;
                }
                this._ligaturesAddon.value = this._instantiationService.createInstance(LigaturesAddon, {
                    fontFeatureSettings: ligaturesConfig.featureSettings,
                    fallbackLigatures: ligaturesConfig.fallbackLigatures,
                });
                this.raw.loadAddon(this._ligaturesAddon.value);
                shouldRecreateWebglRenderer = true;
            }
        }
        else {
            if (!this._ligaturesAddon.value) {
                return;
            }
            this._ligaturesAddon.clear();
            shouldRecreateWebglRenderer = true;
        }
        if (shouldRecreateWebglRenderer && this._webglAddon) {
            // Re-create the webgl addon when ligatures state changes to so the texture atlas picks up
            // styles from the DOM.
            this._disposeOfWebglRenderer();
            await this._enableWebglRenderer();
        }
    }
    async _refreshImageAddon() {
        // Only allow the image addon when webgl is being used to avoid possible GPU issues
        if (this._terminalConfigurationService.config.enableImages && this._webglAddon) {
            if (!this._imageAddon) {
                const AddonCtor = await this._xtermAddonLoader.importAddon('image');
                this._imageAddon = new AddonCtor();
                this.raw.loadAddon(this._imageAddon);
                this._telemetryService.publicLog2('terminal/imageAddonActivated');
                this._register(this._imageAddon.onImageAdded(() => {
                    this._telemetryService.publicLog2('terminal/imageAdded');
                }));
            }
        }
        else {
            try {
                this._imageAddon?.dispose();
            }
            catch {
                // ignore
            }
            this._imageAddon = undefined;
        }
    }
    _disposeOfWebglRenderer() {
        if (!this._webglAddon) {
            return;
        }
        try {
            this._webglAddon?.dispose();
        }
        catch {
            // ignore
        }
        this._webglAddon = undefined;
        this._webglAddonCustomGlyphs = undefined;
        this._refreshImageAddon();
        // WebGL renderer cell dimensions differ from the DOM renderer, make sure the terminal
        // gets resized after the webgl addon is disposed
        this._onDidRequestRefreshDimensions.fire();
    }
    async getRangeAsVT(startMarker, endMarker, skipLastLine) {
        if (!this._serializeAddon) {
            const Addon = await this._xtermAddonLoader.importAddon('serialize');
            this._serializeAddon = new Addon();
            this.raw.loadAddon(this._serializeAddon);
        }
        const lastLine = this.raw.buffer.active.length - 1;
        if (lastLine < 0) {
            return '';
        }
        const hasValidEndMarker = isNumber(endMarker?.line);
        const start = clamp(isNumber(startMarker?.line) && startMarker.line > -1 ? startMarker.line : 0, 0, lastLine);
        let end = hasValidEndMarker ? endMarker.line : this.raw.buffer.active.length - 1;
        if (skipLastLine && hasValidEndMarker) {
            end = end - 1;
        }
        end = clamp(Math.max(end, start), start, lastLine);
        return this._serializeAddon.serialize({
            range: {
                start,
                end
            }
        });
    }
    getXtermTheme(theme) {
        if (!theme) {
            theme = this._themeService.getColorTheme();
        }
        const config = this._terminalConfigurationService.config;
        const hideOverviewRuler = ['never', 'gutter'].includes(config.shellIntegration?.decorationsEnabled ?? '');
        const foregroundColor = theme.getColor(TERMINAL_FOREGROUND_COLOR);
        const backgroundColor = this._xtermColorProvider.getBackgroundColor(theme);
        const cursorColor = theme.getColor(TERMINAL_CURSOR_FOREGROUND_COLOR) || foregroundColor;
        const cursorAccentColor = theme.getColor(TERMINAL_CURSOR_BACKGROUND_COLOR) || backgroundColor;
        const selectionBackgroundColor = theme.getColor(TERMINAL_SELECTION_BACKGROUND_COLOR);
        const selectionInactiveBackgroundColor = theme.getColor(TERMINAL_INACTIVE_SELECTION_BACKGROUND_COLOR);
        const selectionForegroundColor = theme.getColor(TERMINAL_SELECTION_FOREGROUND_COLOR) || undefined;
        return {
            background: backgroundColor?.toString(),
            foreground: foregroundColor?.toString(),
            cursor: cursorColor?.toString(),
            cursorAccent: cursorAccentColor?.toString(),
            selectionBackground: selectionBackgroundColor?.toString(),
            selectionInactiveBackground: selectionInactiveBackgroundColor?.toString(),
            selectionForeground: selectionForegroundColor?.toString(),
            overviewRulerBorder: hideOverviewRuler ? '#0000' : theme.getColor(TERMINAL_OVERVIEW_RULER_BORDER_COLOR)?.toString(),
            scrollbarSliderActiveBackground: theme.getColor(scrollbarSliderActiveBackground)?.toString(),
            scrollbarSliderBackground: theme.getColor(scrollbarSliderBackground)?.toString(),
            scrollbarSliderHoverBackground: theme.getColor(scrollbarSliderHoverBackground)?.toString(),
            black: theme.getColor(ansiColorIdentifiers[0])?.toString(),
            red: theme.getColor(ansiColorIdentifiers[1])?.toString(),
            green: theme.getColor(ansiColorIdentifiers[2])?.toString(),
            yellow: theme.getColor(ansiColorIdentifiers[3])?.toString(),
            blue: theme.getColor(ansiColorIdentifiers[4])?.toString(),
            magenta: theme.getColor(ansiColorIdentifiers[5])?.toString(),
            cyan: theme.getColor(ansiColorIdentifiers[6])?.toString(),
            white: theme.getColor(ansiColorIdentifiers[7])?.toString(),
            brightBlack: theme.getColor(ansiColorIdentifiers[8])?.toString(),
            brightRed: theme.getColor(ansiColorIdentifiers[9])?.toString(),
            brightGreen: theme.getColor(ansiColorIdentifiers[10])?.toString(),
            brightYellow: theme.getColor(ansiColorIdentifiers[11])?.toString(),
            brightBlue: theme.getColor(ansiColorIdentifiers[12])?.toString(),
            brightMagenta: theme.getColor(ansiColorIdentifiers[13])?.toString(),
            brightCyan: theme.getColor(ansiColorIdentifiers[14])?.toString(),
            brightWhite: theme.getColor(ansiColorIdentifiers[15])?.toString()
        };
    }
    _updateTheme(theme) {
        this.raw.options.theme = this.getXtermTheme(theme);
    }
    refresh() {
        this._updateTheme();
        this._decorationAddon.refreshLayouts();
    }
    async _updateUnicodeVersion() {
        if (!this._unicode11Addon && this._terminalConfigurationService.config.unicodeVersion === '11') {
            const Addon = await this._xtermAddonLoader.importAddon('unicode11');
            this._unicode11Addon = new Addon();
            this.raw.loadAddon(this._unicode11Addon);
        }
        if (this.raw.unicode.activeVersion !== this._terminalConfigurationService.config.unicodeVersion) {
            this.raw.unicode.activeVersion = this._terminalConfigurationService.config.unicodeVersion;
        }
    }
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _writeText(data) {
        this.raw.write(data);
    }
    dispose() {
        this._anyTerminalFocusContextKey.reset();
        this._anyFocusedTerminalHasSelection.reset();
        this._disposeOfWebglRenderer();
        this._onDidDispose.fire();
        super.dispose();
    }
};
__decorate([
    debounce(100)
], XtermTerminal.prototype, "_refreshLigaturesAddon", null);
__decorate([
    debounce(100)
], XtermTerminal.prototype, "_refreshImageAddon", null);
XtermTerminal = XtermTerminal_1 = __decorate([
    __param(4, IConfigurationService),
    __param(5, IInstantiationService),
    __param(6, ITerminalLogService),
    __param(7, INotificationService),
    __param(8, IThemeService),
    __param(9, ITelemetryService),
    __param(10, ITerminalConfigurationService),
    __param(11, IClipboardService),
    __param(12, IContextKeyService),
    __param(13, IAccessibilitySignalService),
    __param(14, ILayoutService)
], XtermTerminal);
export { XtermTerminal };
export function getXtermScaledDimensions(w, font, width, height) {
    if (!font.charWidth || !font.charHeight) {
        return null;
    }
    // Because xterm.js converts from CSS pixels to actual pixels through
    // the use of canvas, window.devicePixelRatio needs to be used here in
    // order to be precise. font.charWidth/charHeight alone as insufficient
    // when window.devicePixelRatio changes.
    const scaledWidthAvailable = width * w.devicePixelRatio;
    const scaledCharWidth = font.charWidth * w.devicePixelRatio + font.letterSpacing;
    const cols = Math.max(Math.floor(scaledWidthAvailable / scaledCharWidth), 1);
    const scaledHeightAvailable = height * w.devicePixelRatio;
    const scaledCharHeight = Math.ceil(font.charHeight * w.devicePixelRatio);
    const scaledLineHeight = Math.floor(scaledCharHeight * font.lineHeight);
    const rows = Math.max(Math.floor(scaledHeightAvailable / scaledLineHeight), 1);
    return { rows, cols };
}
function vscodeToXtermLogLevel(logLevel) {
    switch (logLevel) {
        case LogLevel.Trace: return 'trace';
        case LogLevel.Debug: return 'debug';
        case LogLevel.Info: return 'info';
        case LogLevel.Warning: return 'warn';
        case LogLevel.Error: return 'error';
        default: return 'off';
    }
}
function vscodeToXtermCursorStyle(style) {
    // 'line' is used instead of bar in VS Code to be consistent with editor.cursorStyle
    if (style === 'line') {
        return 'bar';
    }
    return style;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoieHRlcm1UZXJtaW5hbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIveHRlcm0veHRlcm1UZXJtaW5hbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFVaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQ0FBb0MsQ0FBQztBQUUxRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRXpHLE9BQU8sRUFBcUIsbUJBQW1CLEVBQTRDLE1BQU0scURBQXFELENBQUM7QUFFdkosT0FBTyxFQUEySiw2QkFBNkIsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ3hOLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsbUJBQW1CLEVBQWtCLE1BQU0sMEJBQTBCLENBQUM7QUFDL0UsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBZSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNsRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUMvRCxPQUFPLEVBQUUseUJBQXlCLEVBQUUseUJBQXlCLEVBQUUsZ0NBQWdDLEVBQUUsZ0NBQWdDLEVBQUUsb0JBQW9CLEVBQUUsbUNBQW1DLEVBQUUsb0NBQW9DLEVBQUUsOENBQThDLEVBQUUsZ0NBQWdDLEVBQUUsbURBQW1ELEVBQUUsMENBQTBDLEVBQUUsK0NBQStDLEVBQUUsbUNBQW1DLEVBQUUsNENBQTRD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QyxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRTtZQUN4RCxLQUFLLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRTtZQUMxRCxNQUFNLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRTtZQUMzRCxJQUFJLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRTtZQUN6RCxPQUFPLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRTtZQUM1RCxJQUFJLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRTtZQUN6RCxLQUFLLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRTtZQUMxRCxXQUFXLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRTtZQUNoRSxTQUFTLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRTtZQUM5RCxXQUFXLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRTtZQUNqRSxZQUFZLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRTtZQUNsRSxVQUFVLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRTtZQUNoRSxhQUFh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