/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SerializeAddon as SerializeAddonType } from '@xterm/addon-serialize';
import type { IBufferLine, IMarker, ITerminalOptions, ITheme, Terminal as RawXtermTerminal, Terminal as XTermTerminal } from '@xterm/xterm';
import { importAMDNodeModule } from 'vs/amdX';
import { $, addDisposableListener, addStandardDisposableListener, getWindow } from 'vs/base/browser/dom';
import { memoize, throttle } from 'vs/base/common/decorators';
import { Event } from 'vs/base/common/event';
import { Disposable, MutableDisposable, combinedDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { removeAnsiEscapeCodes } from 'vs/base/common/strings';
import 'vs/css!./media/stickyScroll';
import { localize } from 'vs/nls';
import { IMenu, IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ICommandDetectionCapability, ITerminalCommand } from 'vs/platform/terminal/common/capabilities/capabilities';
import { ICurrentPartialCommand } from 'vs/platform/terminal/common/capabilities/commandDetection/terminalCommand';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ITerminalInstance, IXtermColorProvider, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { openContextMenu } from 'vs/workbench/contrib/terminal/browser/terminalContextMenu';
import { IXtermCore } from 'vs/workbench/contrib/terminal/browser/xterm-private';
import { TERMINAL_CONFIG_SECTION, TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { terminalStrings } from 'vs/workbench/contrib/terminal/common/terminalStrings';
import { TerminalStickyScrollSettingId } from 'vs/workbench/contrib/terminalContrib/stickyScroll/common/terminalStickyScrollConfiguration';
import { terminalStickyScrollBackground, terminalStickyScrollHoverBackground } from 'vs/workbench/contrib/terminalContrib/stickyScroll/browser/terminalStickyScrollColorRegistry';

const enum OverlayState {
	/** Initial state/disabled by the alt buffer. */
	Off = 0,
	On = 1
}

const enum CssClasses {
	Visible = 'visible'
}

const enum Constants {
	StickyScrollPercentageCap = 0.4
}

export class TerminalStickyScrollOverlay extends Disposable {
	private _stickyScrollOverlay?: RawXtermTerminal;
	private _serializeAddon?: SerializeAddonType;

	private _element?: HTMLElement;
	private _currentStickyCommand?: ITerminalCommand | ICurrentPartialCommand;
	private _currentContent?: string;
	private _contextMenu: IMenu;

	private readonly _refreshListeners = this._register(new MutableDisposable());

	private _state: OverlayState = OverlayState.Off;
	private _isRefreshQueued = false;
	private _rawMaxLineCount: number = 5;

	constructor(
		private readonly _instance: ITerminalInstance,
		private readonly _xterm: IXtermTerminal & { raw: RawXtermTerminal },
		private readonly _xtermColorProvider: IXtermColorProvider,
		private readonly _commandDetection: ICommandDetectionCapability,
		xtermCtor: Promise<typeof XTermTerminal>,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IMenuService menuService: IMenuService,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super();

		this._contextMenu = this._register(menuService.createMenu(MenuId.TerminalStickyScrollContext, contextKeyService));

		// Only show sticky scroll in the normal buffer
		this._register(Event.runAndSubscribe(this._xterm.raw.buffer.onBufferChange, buffer => {
			this._setState((buffer ?? this._xterm.raw.buffer.active).type === 'normal' ? OverlayState.On : OverlayState.Off);
		}));

		// React to configuration changes
		this._register(Event.runAndSubscribe(configurationService.onDidChangeConfiguration, e => {
			if (!e || e.affectsConfiguration(TerminalStickyScrollSettingId.MaxLineCount)) {
				this._rawMaxLineCount = configurationService.getValue(TerminalStickyScrollSettingId.MaxLineCount);
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

			this._getSerializeAddonConstructor().then(SerializeAddon => {
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
				Event.any(
					this._xterm.raw.onScroll,
					this._xterm.raw.onLineFeed,
					// Rarely an update may be required after just a cursor move, like when
					// scrolling horizontally in a pager
					this._xterm.raw.onCursorMove,
				)(() => this._refresh()),
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

	private _refresh(): void {
		if (this._isRefreshQueued) {
			return;
		}
		this._isRefreshQueued = true;
		queueMicrotask(() => {
			this._refreshNow();
			this._isRefreshQueued = false;
		});
	}

	private _refreshNow(): void {
		const command = this._commandDetection.getCommandForLine(this._xterm.raw.buffer.active.viewportY);

		// The command from viewportY + 1 is used because this one will not be obscured by sticky
		// scroll.
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
		const isPartialCommand = !('getOutput' in command);
		const rowOffset = !isPartialCommand && command.endMarker ? Math.max(buffer.viewportY - command.endMarker.line + 1, 0) : 0;
		const maxLineCount = Math.min(this._rawMaxLineCount, Math.floor(xterm.rows * Constants.StickyScrollPercentageCap));
		const stickyScrollLineCount = Math.min(promptRowCount + commandRowCount - 1, maxLineCount) - rowOffset;

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
			if (
				(buffer.cursorX === 1 && lineStartsWith(line, ':')) ||
				(buffer.cursorX === 5 && lineStartsWith(line, '(END)'))
			) {
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
		});

		// If a partial command's sticky scroll would show nothing, just hide it. This is another
		// edge case when using a pager or interactive editor.
		if (isPartialCommand && removeAnsiEscapeCodes(content).length === 0) {
			this._setVisible(false);
			return;
		}

		// Write content if it differs
		if (
			content && this._currentContent !== content ||
			this._stickyScrollOverlay.cols !== xterm.cols ||
			this._stickyScrollOverlay.rows !== stickyScrollLineCount
		) {
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
				const rowHeight = termBox.height / xterm.rows;
				const overlayHeight = stickyScrollLineCount * rowHeight;

				// Adjust sticky scroll content if it would below the end of the command, obscuring the
				// following command.
				let endMarkerOffset = 0;
				if (!isPartialCommand && command.endMarker && command.endMarker.line !== -1) {
					if (buffer.viewportY + stickyScrollLineCount > command.endMarker.line) {
						const diff = buffer.viewportY + stickyScrollLineCount - command.endMarker.line;
						endMarkerOffset = diff * rowHeight;
					}
				}

				this._element.style.bottom = `${termBox.height - overlayHeight + 1 + endMarkerOffset}px`;
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

		const hoverOverlay = $('.hover-overlay');
		this._element = $('.terminal-sticky-scroll', undefined, hoverOverlay);
		this._xterm.raw.element.parentElement.append(this._element);
		this._register(toDisposable(() => this._element?.remove()));

		// Fill tooltip
		let hoverTitle = localize('stickyScrollHoverTitle', 'Navigate to Command');
		const scrollToPreviousCommandKeybinding = this._keybindingService.lookupKeybinding(TerminalCommandId.ScrollToPreviousCommand);
		if (scrollToPreviousCommandKeybinding) {
			const label = scrollToPreviousCommandKeybinding.getLabel();
			if (label) {
				hoverTitle += '\n' + localize('labelWithKeybinding', "{0} ({1})", terminalStrings.scrollToPreviousCommand.value, label);
			}
		}
		const scrollToNextCommandKeybinding = this._keybindingService.lookupKeybinding(TerminalCommandId.ScrollToNextCommand);
		if (scrollToNextCommandKeybinding) {
			const label = scrollToNextCommandKeybinding.getLabel();
			if (label) {
				hoverTitle += '\n' + localize('labelWithKeybinding', "{0} ({1})", terminalStrings.scrollToNextCommand.value, label);
			}
		}
		hoverOverlay.title = hoverTitle;

		const scrollBarWidth = (this._xterm.raw as any as { _core: IXtermCore })._core.viewport?.scrollBarWidth;
		if (scrollBarWidth !== undefined) {
			this._element.style.right = `${scrollBarWidth}px`;
		}

		this._stickyScrollOverlay.open(this._element);

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

	@throttle(0)
	private _syncOptions() {
		if (!this._stickyScrollOverlay) {
			return;
		}
		this._stickyScrollOverlay.resize(this._xterm.raw.cols, this._stickyScrollOverlay.rows);
		this._stickyScrollOverlay.options = this._getOptions();
	}

	private _getOptions(): ITerminalOptions {
		const o = this._xterm.raw.options;
		return {
			allowTransparency: true,
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
				: theme.getColor(terminalStickyScrollBackground)?.toString() ?? this._xtermColorProvider.getBackgroundColor(theme)?.toString(),
			selectionBackground: undefined,
			selectionInactiveBackground: undefined
		};
	}

	@memoize
	private async _getSerializeAddonConstructor(): Promise<typeof SerializeAddonType> {
		const m = await importAMDNodeModule<typeof import('@xterm/addon-serialize')>('@xterm/addon-serialize', 'lib/addon-serialize.js');
		return m.SerializeAddon;
	}
}

function lineStartsWith(line: IBufferLine | undefined, text: string): boolean {
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
