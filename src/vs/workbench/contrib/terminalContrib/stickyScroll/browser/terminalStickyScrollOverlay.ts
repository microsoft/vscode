/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { CanvasAddon as CanvasAddonType } from '@xterm/addon-canvas';
import type { SerializeAddon as SerializeAddonType } from '@xterm/addon-serialize';
import type { IMarker, ITerminalOptions, ITheme, Terminal as RawXtermTerminal, Terminal as XTermTerminal } from '@xterm/xterm';
import { importAMDNodeModule } from 'vs/amdX';
import { $, addStandardDisposableListener } from 'vs/base/browser/dom';
import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { memoize, throttle } from 'vs/base/common/decorators';
import { Event } from 'vs/base/common/event';
import { Disposable, MutableDisposable, combinedDisposable, toDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./media/stickyScroll';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICommandDetectionCapability, ITerminalCommand } from 'vs/platform/terminal/common/capabilities/capabilities';
import { ICurrentPartialCommand } from 'vs/platform/terminal/common/capabilities/commandDetection/terminalCommand';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IXtermColorProvider, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IXtermCore } from 'vs/workbench/contrib/terminal/browser/xterm-private';
import { TERMINAL_CONFIG_SECTION } from 'vs/workbench/contrib/terminal/common/terminal';
import { terminalStickyScrollHoverBackground } from 'vs/workbench/contrib/terminalContrib/stickyScroll/browser/terminalStickyScrollColorRegistry';

const enum OverlayState {
	/** Initial state/disabled by the alt buffer. */
	Off = 0,
	On = 1
}

const enum CssClasses {
	Visible = 'visible'
}

export class TerminalStickyScrollOverlay extends Disposable {
	private _stickyScrollOverlay?: RawXtermTerminal;
	private _serializeAddon?: SerializeAddonType;

	private _canvasAddon = this._register(new MutableDisposable<CanvasAddonType>());
	private _pendingCanvasAddon?: CancelablePromise<void>;

	private _element?: HTMLElement;
	private _currentStickyCommand?: ITerminalCommand | ICurrentPartialCommand;
	private _currentContent?: string;

	private _refreshListeners = this._register(new MutableDisposable());

	private _state: OverlayState = OverlayState.Off;
	private _maxLineCount: number = 5;

	constructor(
		private readonly _xterm: IXtermTerminal & { raw: RawXtermTerminal },
		private readonly _xtermColorProvider: IXtermColorProvider,
		private readonly _commandDetection: ICommandDetectionCapability,
		xtermCtor: Promise<typeof XTermTerminal>,
		@IConfigurationService configurationService: IConfigurationService,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super();

		// Only show sticky scroll in the normal buffer
		this._register(Event.runAndSubscribe(this._xterm.raw.buffer.onBufferChange, buffer => {
			this._setState((buffer ?? this._xterm.raw.buffer.active).type === 'normal' ? OverlayState.On : OverlayState.Off);
		}));

		// React to configuration changes
		this._register(Event.runAndSubscribe(configurationService.onDidChangeConfiguration, e => {
			if (!e || e.affectsConfiguration(TerminalSettingId.StickyScrollMaxLineCount)) {
				this._maxLineCount = configurationService.getValue(TerminalSettingId.StickyScrollMaxLineCount);
			}
		}));

		// Eagerly create the overlay
		xtermCtor.then(ctor => {
			this._stickyScrollOverlay = this._register(new ctor({
				rows: 1,
				cols: this._xterm.raw.cols,
				allowProposedApi: true,
				...this._getOptions()
			}));
			this._register(configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(TERMINAL_CONFIG_SECTION)) {
					this._syncOptions();
				}
			}));
			this._register(this._themeService.onDidColorThemeChange(() => {
				this._syncOptions();
			}));

			this._getSerializeAddonConstructor().then(SerializeAddon => {
				this._serializeAddon = this._register(new SerializeAddon());
				this._xterm.raw.loadAddon(this._serializeAddon);
				// Trigger a render as the serialize addon is required to render
				this._refresh();
			});

			this._syncGpuAccelerationState();
		});
	}

	private _setState(state: OverlayState) {
		if (this._state === state) {
			return;
		}
		switch (state) {
			case OverlayState.Off: {
				this._setVisible(false);
				this._uninstallRefreshListeners();
				break;
			}
			case OverlayState.On: {
				this._refresh();
				this._installRefreshListeners();
				break;
			}
		}
	}

	private _installRefreshListeners() {
		if (!this._refreshListeners.value) {
			this._refreshListeners.value = combinedDisposable(
				this._xterm.raw.onScroll(() => this._refresh()),
				this._xterm.raw.onLineFeed(() => this._refresh()),
				addStandardDisposableListener(this._xterm.raw.element!.querySelector('.xterm-viewport')!, 'scroll', () => this._refresh()),
			);
		}
	}

	private _uninstallRefreshListeners() {
		this._refreshListeners.clear();
	}

	private _setVisible(isVisible: boolean) {
		if (isVisible) {
			this._ensureElement();
			// The GPU acceleration state may be changes at any time and there is no event to listen
			// to currently.
			this._syncGpuAccelerationState();
		}
		this._element?.classList.toggle(CssClasses.Visible, isVisible);
	}

	@throttle(0)
	private _refresh(): void {
		if (!this._xterm.raw.element?.parentElement || !this._stickyScrollOverlay || !this._serializeAddon) {
			return;
		}

		// The command from viewportY + 1 is used because this one will not be obscured by sticky
		// scroll.
		const command = this._commandDetection.getCommandForLine(this._xterm.raw.buffer.active.viewportY);
		this._currentStickyCommand = undefined;

		// No command
		if (!command) {
			this._setVisible(false);
			return;
		}

		// Partial command
		if (!('marker' in command)) {
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

	private _updateContent(command: ITerminalCommand | ICurrentPartialCommand, startMarker: IMarker) {
		if (!this._xterm.raw.element?.parentElement || !this._stickyScrollOverlay || !this._serializeAddon) {
			return;
		}

		// Determine sticky scroll line count
		const buffer = this._xterm.raw.buffer.active;
		const promptRowCount = command.getPromptRowCount();
		const commandRowCount = command.getCommandRowCount();
		const stickyScrollLineStart = startMarker.line - (promptRowCount - 1);

		// Calculate the row offset, this is the number of rows that will be clipped from the top
		// of the sticky overlay because we do not want to show any content above the bounds of the
		// original terminal. This is done because it seems like scrolling flickers more when a
		// partial line can be drawn on the top.
		const rowOffset = 'getOutput' in command && command.endMarker ? Math.max(buffer.viewportY - command.endMarker.line + 1, 0) : 0;
		const stickyScrollLineCount = Math.min(promptRowCount + commandRowCount - 1, this._maxLineCount) - rowOffset;

		// Hide sticky scroll if it's currently on a line that contains it
		if (buffer.viewportY === stickyScrollLineStart) {
			this._setVisible(false);
			return;
		}

		// Clear attrs, reset cursor position, clear right
		const content = this._serializeAddon.serialize({
			range: {
				start: stickyScrollLineStart + rowOffset,
				end: stickyScrollLineStart + rowOffset + stickyScrollLineCount - 1
			}
		});

		// Write content if it differs
		if (content && this._currentContent !== content) {
			if (this._stickyScrollOverlay.rows !== stickyScrollLineCount) {
				this._stickyScrollOverlay.resize(this._stickyScrollOverlay.cols, stickyScrollLineCount);
			}
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
				const termBox = this._xterm.raw.element.getBoundingClientRect();
				const rowHeight = termBox.height / this._xterm.raw.rows;
				const overlayHeight = stickyScrollLineCount * rowHeight;
				this._element.style.bottom = `${termBox.height - overlayHeight}px`;
			}
		} else {
			this._setVisible(false);
		}
	}

	private _ensureElement() {
		if (
			// The element is already created
			this._element ||
			// If the overlay is yet to be created, the terminal cannot be opened so defer to next call
			!this._stickyScrollOverlay ||
			// The xterm.js instance isn't opened yet
			!this._xterm?.raw.element?.parentElement
		) {
			return;
		}

		const overlay = this._stickyScrollOverlay;

		this._element = $('.terminal-sticky-scroll');
		const hoverOverlay = $('.hover-overlay');
		this._element.append(hoverOverlay);
		this._xterm.raw.element.parentElement.append(this._element);
		this._register(toDisposable(() => this._element?.remove()));

		const scrollBarWidth = (this._xterm.raw as any as { _core: IXtermCore })._core.viewport?.scrollBarWidth;
		if (scrollBarWidth !== undefined) {
			this._element.style.right = `${scrollBarWidth}px`;
		}

		this._stickyScrollOverlay.open(this._element);

		// Scroll to the command on click
		this._register(addStandardDisposableListener(hoverOverlay, 'click', () => {
			if (this._xterm && this._currentStickyCommand && 'getOutput' in this._currentStickyCommand) {
				this._xterm.markTracker.revealCommand(this._currentStickyCommand);
			}
		}));

		// Instead of juggling decorations for hover styles, swap out the theme to indicate the
		// hover state. This comes with the benefit over other methods of working well with special
		// decorative characters like powerline symbols.
		this._register(addStandardDisposableListener(hoverOverlay, 'mouseover', () => overlay.options.theme = this._getTheme(true)));
		this._register(addStandardDisposableListener(hoverOverlay, 'mouseleave', () => overlay.options.theme = this._getTheme(false)));
	}

	@throttle(0)
	private _syncOptions() {
		if (!this._stickyScrollOverlay) {
			return;
		}
		this._stickyScrollOverlay.resize(this._xterm.raw.cols, this._stickyScrollOverlay.rows);
		this._stickyScrollOverlay.options = this._getOptions();
		this._syncGpuAccelerationState();
	}

	private _syncGpuAccelerationState() {
		if (!this._stickyScrollOverlay) {
			return;
		}
		const overlay = this._stickyScrollOverlay;

		// The Webgl renderer isn't used here as there are a limited number of webgl contexts
		// available within a given page. This is a single row that isn't rendered to often so the
		// performance isn't as important
		if (this._xterm.isGpuAccelerated) {
			if (!this._canvasAddon.value && !this._pendingCanvasAddon) {
				this._pendingCanvasAddon = createCancelablePromise(async token => {
					const CanvasAddon = await this._getCanvasAddonConstructor();
					if (!token.isCancellationRequested) {
						this._canvasAddon.value = new CanvasAddon();
						overlay.loadAddon(this._canvasAddon.value);
					}
					this._pendingCanvasAddon = undefined;
				});
			}
		} else {
			this._canvasAddon.clear();
			this._pendingCanvasAddon?.cancel();
			this._pendingCanvasAddon = undefined;
		}
	}

	private _getOptions(): ITerminalOptions {
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
			overviewRulerWidth: o.overviewRulerWidth,
		};
	}

	private _getTheme(isHovering: boolean): ITheme {
		const theme = this._themeService.getColorTheme();
		return {
			...this._xterm.getXtermTheme(),
			background: isHovering
				? theme.getColor(terminalStickyScrollHoverBackground)?.toString() ?? this._xtermColorProvider.getBackgroundColor(theme)?.toString()
				: this._xtermColorProvider.getBackgroundColor(theme)?.toString(),
			selectionBackground: undefined,
			selectionInactiveBackground: undefined
		};
	}

	@memoize
	private async _getCanvasAddonConstructor(): Promise<typeof CanvasAddonType> {
		const m = await importAMDNodeModule<typeof import('@xterm/addon-canvas')>('@xterm/addon-canvas', 'lib/xterm-addon-canvas.js');
		return m.CanvasAddon;
	}

	@memoize
	private async _getSerializeAddonConstructor(): Promise<typeof SerializeAddonType> {
		const m = await importAMDNodeModule<typeof import('@xterm/addon-serialize')>('@xterm/addon-serialize', 'lib/addon-serialize.js');
		return m.SerializeAddon;
	}
}
