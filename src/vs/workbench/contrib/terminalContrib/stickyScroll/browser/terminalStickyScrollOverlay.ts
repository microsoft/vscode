/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { CanvasAddon as CanvasAddonType } from '@xterm/addon-canvas';
import type { SerializeAddon as SerializeAddonType } from '@xterm/addon-serialize';
import type { IMarker, ITerminalOptions, Terminal as RawXtermTerminal, Terminal as XTermTerminal } from '@xterm/xterm';
import { importAMDNodeModule } from 'vs/amdX';
import { $, addStandardDisposableListener } from 'vs/base/browser/dom';
import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { memoize, throttle } from 'vs/base/common/decorators';
import { Event } from 'vs/base/common/event';
import { Disposable, MutableDisposable, combinedDisposable, toDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./media/stickyScroll';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICommandDetectionCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IXtermColorProvider, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ScrollPosition } from 'vs/workbench/contrib/terminal/browser/xterm/markNavigationAddon';
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
	private _currentStickyMarker?: IMarker;
	private _currentContent?: string;

	private _refreshListeners = this._register(new MutableDisposable());

	private _state: OverlayState = OverlayState.Off;

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

		// React to option changes
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TERMINAL_CONFIG_SECTION)) {
				this._syncOptions();
			}
		}));
		this._register(this._themeService.onDidColorThemeChange(() => {
			this._syncOptions();
		}));

		// Eagerly create the overlay
		xtermCtor.then(ctor => {
			this._stickyScrollOverlay = this._register(new ctor({
				rows: 1,
				cols: this._xterm.raw.cols,
				allowProposedApi: true,
				...this._getOptions()
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
		const command = this._commandDetection.getCommandForLine(this._xterm.raw.buffer.active.viewportY + 1);
		this._currentStickyMarker = undefined;

		// Sticky scroll only works with non-partial commands
		if (!command || !('marker' in command)) {
			this._setVisible(false);
			return;
		}

		const marker = command.marker;
		if (
			// The marker doesn't exist
			!marker ||
			// The marker was trimmed from the scrollback
			marker.line === -1 ||
			// Hide sticky scroll if it's on the same line
			marker.line === this._xterm.raw.buffer.active.viewportY
		) {
			this._setVisible(false);
			return;
		}

		// TODO: Support multi-line prompts
		// TODO: Support multi-line commands

		// Clear attrs, reset cursor position, clear right
		// TODO: Serializing all content up to the required line is inefficient; support providing single line/range serialize addon
		const s = this._serializeAddon.serialize({
			scrollback: this._xterm.raw.buffer.active.baseY - marker.line
		});

		// Write content if it differs
		const content = s ? s.substring(0, s.indexOf('\r')) : undefined;
		if (content && this._currentContent !== content) {
			this._stickyScrollOverlay.write('\x1b[0m\x1b[H\x1b[K');
			this._stickyScrollOverlay.write(content);
			this._currentContent = content;
			// Debug log to show the command
			// this._stickyScrollOverlay.write(` [${command?.command}]`);
		}

		if (content && command.exitCode !== undefined) {
			this._currentStickyMarker = marker;
			this._setVisible(true);
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

		this._stickyScrollOverlay.open(this._element);

		// Scroll to the command on click
		this._register(addStandardDisposableListener(hoverOverlay, 'click', () => {
			if (this._xterm && this._currentStickyMarker) {
				this._xterm.scrollToLine(this._currentStickyMarker.line, ScrollPosition.Middle);
				this._xterm.markTracker.registerTemporaryDecoration(this._currentStickyMarker);
			}
		}));

		// Instead of juggling decorations for hover styles, use the selection to indicate the
		// hover state as the selection is inaccessible anyway
		this._register(addStandardDisposableListener(hoverOverlay, 'mouseover', () => overlay.selectAll()));
		this._register(addStandardDisposableListener(hoverOverlay, 'mouseleave', () => overlay.clearSelection()));
	}

	@throttle(0)
	private _syncOptions() {
		if (!this._stickyScrollOverlay) {
			return;
		}
		this._stickyScrollOverlay.resize(this._xterm.raw.cols, 1);
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
		const theme = this._themeService.getColorTheme();
		return {
			cursorInactiveStyle: 'none',
			scrollback: 0,
			logLevel: 'off',

			// Selection is used for hover state in the overlay
			theme: {
				...this._xterm.getXtermTheme(),
				background: this._xtermColorProvider.getBackgroundColor(theme)?.toString(),
				selectionBackground: theme.getColor(terminalStickyScrollHoverBackground)?.toString(),
				selectionInactiveBackground: undefined
			},

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
