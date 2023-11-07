/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CanvasAddon as CanvasAddonType } from '@xterm/addon-canvas';
import type { SerializeAddon as SerializeAddonType } from '@xterm/addon-serialize';
import type { IMarker, Terminal as RawXtermTerminal } from '@xterm/xterm';
import { importAMDNodeModule } from 'vs/amdX';
import { $, addStandardDisposableListener, append } from 'vs/base/browser/dom';
import { memoize, throttle } from 'vs/base/common/decorators';
import { Event } from 'vs/base/common/event';
import { Disposable, MutableDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./media/stickyScroll';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ICommandDetectionCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { PANEL_BACKGROUND } from 'vs/workbench/common/theme';
import { IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminalInstance';
import { ScrollPosition } from 'vs/workbench/contrib/terminal/browser/xterm/markNavigationAddon';
import { TERMINAL_BACKGROUND_COLOR } from 'vs/workbench/contrib/terminal/common/terminalColorRegistry';
import { terminalStickyScrollBackground, terminalStickyScrollHoverBackground } from 'vs/workbench/contrib/terminalContrib/stickyScroll/browser/terminalStickyScrollColorRegistry';

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
	private _canvasAddon?: CanvasAddonType;

	private _element?: HTMLElement;
	private _currentStickyMarker?: IMarker;

	private _refreshListeners = this._register(new MutableDisposable());

	private _state: OverlayState = OverlayState.Off;

	constructor(
		private readonly _xterm: IXtermTerminal & { raw: RawXtermTerminal },
		private readonly _commandDetection: ICommandDetectionCapability,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super();

		// Only show sticky scroll in the normal buffer
		this._register(Event.runAndSubscribe(this._xterm.raw.buffer.onBufferChange, buffer => {
			this._setState((buffer ?? this._xterm.raw.buffer.active).type === 'normal' ? OverlayState.On : OverlayState.Off);
		}));

		// Eagerly create the overlay
		TerminalInstance.getXtermConstructor(this._keybindingService, this._contextKeyService).then(ctor => {
			const overlay = new ctor({
				rows: 1,
				cols: this._xterm.raw.cols,
				allowProposedApi: true
			});
			this._syncOptions(overlay, this._xterm.raw);
			this._stickyScrollOverlay = overlay;

			this._getSerializeAddonConstructor().then(SerializeAddon => {
				this._serializeAddon = new SerializeAddon();
				this._xterm.raw.loadAddon(this._serializeAddon);
			});

			// TODO: Sync every render
			if (this._xterm.isGpuAccelerated) {
				this._getCanvasAddonConstructor().then(CanvasAddon => {
					this._canvasAddon = new CanvasAddon();
					overlay.loadAddon(this._canvasAddon);
				});
			}
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
		}
		this._element?.classList.toggle(CssClasses.Visible, isVisible);
	}

	@throttle(0)
	private _refresh(): void {
		if (!this._xterm?.raw?.element) {
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

		// Hide if the marker doesn't exist or has been trimmed from the scrollback
		const marker = command.marker;
		if (!marker || marker.line === -1) {
			this._setVisible(false);
			return;
		}

		// Hide sticky scroll if it's on the same line
		if (marker.line === this._xterm.raw.buffer.active.viewportY) {
			this._setVisible(false);
			return;
		}

		// TODO: Support multi-line prompts
		// TODO: SUpport multi-line commands

		if (this._stickyScrollOverlay) {
			this._stickyScrollOverlay.write('\x1b[H\x1b[K');
			// TODO: Serializing all content up to the required line is inefficient; support providing single line/range serialize addon
			const s = this._serializeAddon?.serialize({
				scrollback: this._xterm.raw.buffer.active.baseY - marker.line
			});
			const content = s ? s.substring(0, s.indexOf('\r')) : undefined;
			if (content) {
				this._stickyScrollOverlay.write(content);
				// Debug log to show the command
				// this._stickyScrollOverlay.write(` [${command?.command}]`);

				// TODO: Only sync options when needed
				this._syncOptions(this._stickyScrollOverlay, this._xterm.raw);
			}

			if (command.exitCode !== undefined) {
				this._currentStickyMarker = marker;
				this._setVisible(true);
			} else {
				this._setVisible(false);
			}
		} else {
			this._setVisible(false);
		}
	}

	private _ensureElement(): HTMLElement {
		if (!this._element) {
			this._element = document.createElement('div');
			// TODO: Use display in a class over hide/show/setVisibility
			this._element.classList.add('terminal-sticky-scroll');
			// // TODO: Safety
			this._xterm!.raw.element!.parentElement!.append(this._element);

			const hoverOverlay = $('.hover-overlay');

			// Scroll to the command on click
			this._register(addStandardDisposableListener(hoverOverlay, 'click', e => {
				if (this._xterm && this._currentStickyMarker) {
					this._xterm.scrollToLine(this._currentStickyMarker.line, ScrollPosition.Middle);
					this._xterm.markTracker.registerTemporaryDecoration(this._currentStickyMarker);
				}
			}));

			// Instead of juggling decorations for hover styles, use the selection to indicate the
			// hover state as the selection is inaccessible anyway
			this._register(addStandardDisposableListener(hoverOverlay, 'mouseover', () => this._stickyScrollOverlay?.selectAll()));
			this._register(addStandardDisposableListener(hoverOverlay, 'mouseleave', () => this._stickyScrollOverlay?.clearSelection()));

			// TODO: Add to a container outside the xterm instance?
			// TODO: Remove !
			this._stickyScrollOverlay!.open(this._element);

			append(this._element, hoverOverlay);
		}

		return this._element;
	}

	private _syncOptions(target: RawXtermTerminal, copyFrom: RawXtermTerminal): void {
		const o = copyFrom.options;
		const theme = this._themeService.getColorTheme();
		// TODO: BG should be editor-aware
		const terminalBackground = theme.getColor(terminalStickyScrollBackground) || theme.getColor(TERMINAL_BACKGROUND_COLOR) || theme.getColor(PANEL_BACKGROUND);
		target.resize(copyFrom.cols, 1);
		target.options = {
			cursorInactiveStyle: 'none',
			scrollback: 0,
			logLevel: 'off',

			// Selection is used for hover state in the overlay
			theme: {
				...this._xterm!.getXtermTheme(),
				background: terminalBackground?.toString(),
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
