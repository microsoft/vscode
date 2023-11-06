/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/stickyScroll';
import { throttle } from 'vs/base/common/decorators';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { ITerminalContribution, ITerminalInstance, ITerminalService, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessInfo, ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';
import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { hide, show } from 'vs/base/browser/dom';

class TerminalStickyScrollContribution extends DisposableStore implements ITerminalContribution {
	static readonly ID = 'terminal.stickyScroll';

	static get(instance: ITerminalInstance): TerminalStickyScrollContribution | null {
		return instance.getContribution<TerminalStickyScrollContribution>(TerminalStickyScrollContribution.ID);
	}

	private _xterm?: IXtermTerminal & { raw: RawXtermTerminal };
	private _element?: HTMLElement;

	constructor(
		private readonly _instance: ITerminalInstance,
		processManager: ITerminalProcessManager | ITerminalProcessInfo,
		widgetManager: TerminalWidgetManager,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super();
	}

	xtermReady(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		this._xterm = xterm;
		this.add(xterm.raw.onScroll(() => this._refresh()));
		this.add(xterm.raw.onLineFeed(() => this._refresh()));
		// TODO: Disable in alt buffer
	}

	@throttle(0)
	private _refresh(): void {
		if (!this._xterm?.raw?.element) {
			return;
		}
		// TODO: Cache
		const commandDetection = this._instance.capabilities.get(TerminalCapability.CommandDetection);
		if (!commandDetection) {
			return;
		}
		const command = commandDetection.getCommandForLine(this._xterm.raw.buffer.active.viewportY);
		// TODO: Expose unified interface for fetching line content
		const marker = command && 'commandStartMarker' in command
			? command.commandStartMarker
			: command && 'marker' in command
				? command.marker
				: undefined;
		if (!marker || marker.line === -1) {
			return;
		}
		const element = this._ensureElement(this._xterm.raw.element);
		element.textContent = this._xterm.raw.buffer.active.getLine(marker.line)?.translateToString(true) ?? '';
		if (element.textContent === '') {
			hide(element);
		} else {
			show(element);
		}
		console.log('command!', command);
	}

	private _ensureElement(container: HTMLElement): HTMLElement {
		if (!this._element) {
			this._element = document.createElement('div');
			this._element.classList.add('terminal-sticky-scroll');
			// TODO: listen to font changes
			const font = this._terminalService.configHelper.getFont();
			this._element.style.fontSize = `${font.fontSize}px`;
			this._element.style.fontFamily = font.fontFamily;
			// TODO: Verify these are correct format
			this._element.style.letterSpacing = `${font.letterSpacing}px`;
			this._element.style.lineHeight = `${font.lineHeight * font.fontSize}px`;
			// TODO: Safety
			container.querySelector('.xterm-screen')!.append(this._element);
		}
		return this._element;
	}
}

registerTerminalContribution(TerminalStickyScrollContribution.ID, TerminalStickyScrollContribution, true);
