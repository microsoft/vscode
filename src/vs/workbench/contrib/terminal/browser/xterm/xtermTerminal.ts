/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IBuffer, ITheme, RendererType, Terminal as RawXtermTerminal } from 'xterm';
import type { ISearchOptions, SearchAddon as SearchAddonType } from 'xterm-addon-search';
import type { Unicode11Addon as Unicode11AddonType } from 'xterm-addon-unicode11';
import type { WebglAddon as WebglAddonType } from 'xterm-addon-webgl';
import { IXtermCore } from 'vs/workbench/contrib/terminal/browser/xterm-private';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminalConfigHelper';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { ICommandTracker, ITerminalFont } from 'vs/workbench/contrib/terminal/common/terminal';
import { isSafari } from 'vs/base/browser/browser';
import { IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { TerminalStorageKeys } from 'vs/workbench/contrib/terminal/common/terminalStorageKeys';
import { INotificationService, IPromptChoice, Severity } from 'vs/platform/notification/common/notification';
import { CommandTrackerAddon } from 'vs/workbench/contrib/terminal/browser/xterm/commandTrackerAddon';
import { localize } from 'vs/nls';

// How long in milliseconds should an average frame take to render for a notification to appear
// which suggests the fallback DOM-based renderer
const SLOW_CANVAS_RENDER_THRESHOLD = 50;
const NUMBER_OF_FRAMES_TO_MEASURE = 20;

let SearchAddon: typeof SearchAddonType;
let Unicode11Addon: typeof Unicode11AddonType;
let WebglAddon: typeof WebglAddonType;

/**
 * Wraps the xterm object with additional functionality. Interaction with the backing process is out
 * of the scope of this class.
 */
export class XtermTerminal extends DisposableStore implements IXtermTerminal {
	/** The raw xterm.js instance */
	readonly raw: RawXtermTerminal;

	private _core: IXtermCore;
	private static _suggestedRendererType: 'canvas' | 'dom' | undefined = undefined;
	private _container?: HTMLElement;

	// Always on addons
	private _commandTrackerAddon: CommandTrackerAddon;

	// Lazily loaded addons
	private _searchAddon?: SearchAddonType;

	// Optional addons
	private _unicode11Addon?: Unicode11AddonType;
	private _webglAddon?: WebglAddonType;

	get commandTracker(): ICommandTracker { return this._commandTrackerAddon; }

	/**
	 * @param xtermCtor The xterm.js constructor, this is passed in so it can be fetched lazily
	 * outside of this class such that {@link raw} is not nullable.
	 */
	constructor(
		xtermCtor: typeof RawXtermTerminal,
		private readonly _configHelper: TerminalConfigHelper,
		cols: number,
		rows: number,
		private readonly _theme: ITheme,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IStorageService private readonly _storageService: IStorageService
	) {
		super();

		const font = this._configHelper.getFont(undefined, true);
		const config = this._configHelper.config;
		const editorOptions = this._configurationService.getValue<IEditorOptions>('editor');

		this.raw = this.add(new xtermCtor({
			cols,
			rows,
			altClickMovesCursor: config.altClickMovesCursor && editorOptions.multiCursorModifier === 'alt',
			scrollback: config.scrollback,
			theme: this._theme,
			drawBoldTextInBrightColors: config.drawBoldTextInBrightColors,
			fontFamily: font.fontFamily,
			fontWeight: config.fontWeight,
			fontWeightBold: config.fontWeightBold,
			fontSize: font.fontSize,
			letterSpacing: font.letterSpacing,
			lineHeight: font.lineHeight,
			minimumContrastRatio: config.minimumContrastRatio,
			cursorBlink: config.cursorBlinking,
			cursorStyle: config.cursorStyle === 'line' ? 'bar' : config.cursorStyle,
			cursorWidth: config.cursorWidth,
			bellStyle: 'none',
			macOptionIsMeta: config.macOptionIsMeta,
			macOptionClickForcesSelection: config.macOptionClickForcesSelection,
			rightClickSelectsWord: config.rightClickBehavior === 'selectWord',
			fastScrollModifier: 'alt',
			fastScrollSensitivity: editorOptions.fastScrollSensitivity,
			scrollSensitivity: editorOptions.mouseWheelScrollSensitivity,
			rendererType: this._getBuiltInXtermRenderer(config.gpuAcceleration, XtermTerminal._suggestedRendererType),
			wordSeparator: config.wordSeparators
		}));
		this._core = (this.raw as any)._core as IXtermCore;

		this.add(this._configurationService.onDidChangeConfiguration(async e => {
			if (e.affectsConfiguration(TerminalSettingId.GpuAcceleration)) {
				XtermTerminal._suggestedRendererType = undefined;
			}
			if (e.affectsConfiguration('terminal.integrated') || e.affectsConfiguration('editor.fastScrollSensitivity') || e.affectsConfiguration('editor.mouseWheelScrollSensitivity') || e.affectsConfiguration('editor.multiCursorModifier')) {
				this.updateConfig();
			}
			if (e.affectsConfiguration(TerminalSettingId.UnicodeVersion)) {
				this._updateUnicodeVersion();
			}
		}));

		// Load addons

		this._updateUnicodeVersion();

		this._commandTrackerAddon = new CommandTrackerAddon();
		this.raw.loadAddon(this._commandTrackerAddon);

		this._getSearchAddonConstructor().then(addonCtor => {
			this._searchAddon = new addonCtor();
			this.raw.loadAddon(this._searchAddon);
		});
	}

	attachToElement(container: HTMLElement) {

		if (!this._container) {
			this.raw.open(container);
		}
		this._container = container;
	}

	updateConfig(): void {
		const config = this._configHelper.config;
		this.raw.options.altClickMovesCursor = config.altClickMovesCursor;
		this._setCursorBlink(config.cursorBlinking);
		this._setCursorStyle(config.cursorStyle);
		this._setCursorWidth(config.cursorWidth);
		this.raw.options.scrollback = config.scrollback;
		this.raw.options.drawBoldTextInBrightColors = config.drawBoldTextInBrightColors;
		this.raw.options.minimumContrastRatio = config.minimumContrastRatio;
		this.raw.options.fastScrollSensitivity = config.fastScrollSensitivity;
		this.raw.options.scrollSensitivity = config.mouseWheelScrollSensitivity;
		this.raw.options.macOptionIsMeta = config.macOptionIsMeta;
		const editorOptions = this._configurationService.getValue<IEditorOptions>('editor');
		this.raw.options.altClickMovesCursor = config.altClickMovesCursor && editorOptions.multiCursorModifier === 'alt';
		this.raw.options.macOptionClickForcesSelection = config.macOptionClickForcesSelection;
		this.raw.options.rightClickSelectsWord = config.rightClickBehavior === 'selectWord';
		this.raw.options.wordSeparator = config.wordSeparators;
		this.raw.options.customGlyphs = config.customGlyphs;
		if ((!isSafari && config.gpuAcceleration === 'auto' && XtermTerminal._suggestedRendererType === undefined) || config.gpuAcceleration === 'on') {
			this._enableWebglRenderer();
		} else {
			this._disposeOfWebglRenderer();
			this.raw.options.rendererType = this._getBuiltInXtermRenderer(config.gpuAcceleration, XtermTerminal._suggestedRendererType);
		}
	}

	forceRedraw() {
		this._webglAddon?.clearTextureAtlas();
		this.raw.clearTextureAtlas();
	}


	forceRefresh() {
		this._core.viewport?._innerRefresh();
	}

	forceUnpause() {
		// HACK: Force the renderer to unpause by simulating an IntersectionObserver event.
		// This is to fix an issue where dragging the windpow to the top of the screen to
		// maximize on Windows/Linux would fire an event saying that the terminal was not
		// visible.
		if (this.raw.getOption('rendererType') === 'canvas') {
			this._core._renderService?._onIntersectionChange({ intersectionRatio: 1 });
			// HACK: Force a refresh of the screen to ensure links are refresh corrected.
			// This can probably be removed when the above hack is fixed in Chromium.
			this.raw.refresh(0, this.raw.rows - 1);
		}
	}

	findNext(term: string, searchOptions: ISearchOptions): boolean {
		if (!this._searchAddon) {
			return false;
		}
		return this._searchAddon.findNext(term, searchOptions);
	}

	findPrevious(term: string, searchOptions: ISearchOptions): boolean {
		if (!this._searchAddon) {
			return false;
		}
		return this._searchAddon.findPrevious(term, searchOptions);
	}

	getFont(): ITerminalFont {
		return this._configHelper.getFont(this._core);
	}

	getLongestViewportWrappedLineLength(): number {
		let maxLineLength = 0;
		for (let i = this.raw.buffer.active.length - 1; i >= this.raw.buffer.active.viewportY; i--) {
			const lineInfo = this._getWrappedLineCount(i, this.raw.buffer.active);
			maxLineLength = Math.max(maxLineLength, ((lineInfo.lineCount * this.raw.cols) - lineInfo.endSpaces) || 0);
			i = lineInfo.currentIndex;
		}
		return maxLineLength;
	}

	private _getWrappedLineCount(index: number, buffer: IBuffer): { lineCount: number, currentIndex: number, endSpaces: number } {
		let line = buffer.getLine(index);
		if (!line) {
			throw new Error('Could not get line');
		}
		let currentIndex = index;
		let endSpaces = 0;
		// line.length may exceed cols as it doesn't necessarily trim the backing array on resize
		for (let i = Math.min(line.length, this.raw.cols) - 1; i >= 0; i--) {
			if (line && !line?.getCell(i)?.getChars()) {
				endSpaces++;
			} else {
				break;
			}
		}
		while (line?.isWrapped && currentIndex > 0) {
			currentIndex--;
			line = buffer.getLine(currentIndex);
		}
		return { lineCount: index - currentIndex + 1, currentIndex, endSpaces };
	}

	scrollDownLine(): void {
		this.raw.scrollLines(1);
	}

	scrollDownPage(): void {
		this.raw.scrollPages(1);
	}

	scrollToBottom(): void {
		this.raw.scrollToBottom();
	}

	scrollUpLine(): void {
		this.raw.scrollLines(-1);
	}

	scrollUpPage(): void {
		this.raw.scrollPages(-1);
	}

	scrollToTop(): void {
		this.raw.scrollToTop();
	}

	clearBuffer(): void {
		this.raw.clear();
	}

	private _setCursorBlink(blink: boolean): void {
		if (this.raw.options.cursorBlink !== blink) {
			this.raw.options.cursorBlink = blink;
			this.raw.refresh(0, this.raw.rows - 1);
		}
	}

	private _setCursorStyle(style: 'block' | 'underline' | 'bar' | 'line'): void {
		if (this.raw.options.cursorStyle !== style) {
			// 'line' is used instead of bar in VS Code to be consistent with editor.cursorStyle
			this.raw.options.cursorStyle = (style === 'line') ? 'bar' : style;
		}
	}

	private _setCursorWidth(width: number): void {
		if (this.raw.options.cursorWidth !== width) {
			this.raw.options.cursorWidth = width;
		}
	}

	private _getBuiltInXtermRenderer(gpuAcceleration: string, suggestedRendererType?: string): RendererType {
		let rendererType: RendererType = 'canvas';
		if (gpuAcceleration === 'off' || (gpuAcceleration === 'auto' && suggestedRendererType === 'dom')) {
			rendererType = 'dom';
		}
		return rendererType;
	}

	private async _enableWebglRenderer(): Promise<void> {
		if (!this.raw.element || this._webglAddon) {
			return;
		}
		const Addon = await this._getWebglAddonConstructor();
		this._webglAddon = new Addon();
		try {
			this.raw.loadAddon(this._webglAddon);
			this._webglAddon.onContextLoss(() => {
				this._logService.info(`Webgl lost context, disposing of webgl renderer`);
				this._disposeOfWebglRenderer();
				this.raw.options.rendererType = 'dom';
			});
		} catch (e) {
			this._logService.warn(`Webgl could not be loaded. Falling back to the canvas renderer type.`, e);
			const neverMeasureRenderTime = this._storageService.getBoolean(TerminalStorageKeys.NeverMeasureRenderTime, StorageScope.GLOBAL, false);
			// if it's already set to dom, no need to measure render time
			if (!neverMeasureRenderTime && this._configHelper.config.gpuAcceleration !== 'off') {
				this._measureRenderTime();
			}
			this.raw.options.rendererType = 'canvas';
			XtermTerminal._suggestedRendererType = 'canvas';
			this._disposeOfWebglRenderer();
		}
	}

	protected async _getSearchAddonConstructor(): Promise<typeof SearchAddonType> {
		if (!SearchAddon) {
			SearchAddon = (await import('xterm-addon-search')).SearchAddon;
		}
		return SearchAddon;
	}

	protected async _getUnicode11Constructor(): Promise<typeof Unicode11AddonType> {
		if (!Unicode11Addon) {
			Unicode11Addon = (await import('xterm-addon-unicode11')).Unicode11Addon;
		}
		return Unicode11Addon;
	}

	protected async _getWebglAddonConstructor(): Promise<typeof WebglAddonType> {
		if (!WebglAddon) {
			WebglAddon = (await import('xterm-addon-webgl')).WebglAddon;
		}
		return WebglAddon;
	}

	private _disposeOfWebglRenderer(): void {
		try {
			this._webglAddon?.dispose();
		} catch {
			// ignore
		}
		this._webglAddon = undefined;
	}

	private async _measureRenderTime(): Promise<void> {
		const frameTimes: number[] = [];
		if (!this._core._renderService?._renderer._renderLayers) {
			return;
		}
		const textRenderLayer = this._core._renderService._renderer._renderLayers[0];
		const originalOnGridChanged = textRenderLayer?.onGridChanged;
		const evaluateCanvasRenderer = () => {
			// Discard first frame time as it's normal to take longer
			frameTimes.shift();

			const medianTime = frameTimes.sort((a, b) => a - b)[Math.floor(frameTimes.length / 2)];
			if (medianTime > SLOW_CANVAS_RENDER_THRESHOLD) {
				if (this._configHelper.config.gpuAcceleration === 'auto') {
					XtermTerminal._suggestedRendererType = 'dom';
					this.updateConfig();
				} else {
					const promptChoices: IPromptChoice[] = [
						{
							label: localize('yes', "Yes"),
							run: () => this._configurationService.updateValue(TerminalSettingId.GpuAcceleration, 'off', ConfigurationTarget.USER)
						} as IPromptChoice,
						{
							label: localize('no', "No"),
							run: () => { }
						} as IPromptChoice,
						{
							label: localize('dontShowAgain', "Don't Show Again"),
							isSecondary: true,
							run: () => this._storageService.store(TerminalStorageKeys.NeverMeasureRenderTime, true, StorageScope.GLOBAL, StorageTarget.MACHINE)
						} as IPromptChoice
					];
					this._notificationService.prompt(
						Severity.Warning,
						localize('terminal.slowRendering', 'Terminal GPU acceleration appears to be slow on your computer. Would you like to switch to disable it which may improve performance? [Read more about terminal settings](https://code.visualstudio.com/docs/editor/integrated-terminal#_changing-how-the-terminal-is-rendered).'),
						promptChoices
					);
				}
			}
		};

		textRenderLayer.onGridChanged = (terminal: RawXtermTerminal, firstRow: number, lastRow: number) => {
			const startTime = performance.now();
			originalOnGridChanged.call(textRenderLayer, terminal, firstRow, lastRow);
			frameTimes.push(performance.now() - startTime);
			if (frameTimes.length === NUMBER_OF_FRAMES_TO_MEASURE) {
				evaluateCanvasRenderer();
				// Restore original function
				textRenderLayer.onGridChanged = originalOnGridChanged;
			}
		};
	}

	private async _updateUnicodeVersion(): Promise<void> {
		if (!this._unicode11Addon && this._configHelper.config.unicodeVersion === '11') {
			const Addon = await this._getUnicode11Constructor();
			this._unicode11Addon = new Addon();
			this.raw.loadAddon(this._unicode11Addon);
		}
		if (this.raw.unicode.activeVersion !== this._configHelper.config.unicodeVersion) {
			this.raw.unicode.activeVersion = this._configHelper.config.unicodeVersion;
		}
	}
}
