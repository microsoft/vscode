/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { addDisposableListener } from '../../../../../base/browser/dom.js';
import { combinedDisposable, Disposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { listInactiveSelectionBackground } from '../../../../../platform/theme/common/colorRegistry.js';
import { registerColor, transparent } from '../../../../../platform/theme/common/colorUtils.js';
import { PANEL_BORDER } from '../../../../common/theme.js';
import { IDetachedTerminalInstance, ITerminalContribution, ITerminalInstance, IXtermTerminal } from '../../../terminal/browser/terminal.js';
import { registerTerminalContribution } from '../../../terminal/browser/terminalExtensions.js';
import { TerminalWidgetManager } from '../../../terminal/browser/widgets/widgetManager.js';
import { ITerminalProcessInfo, ITerminalProcessManager } from '../../../terminal/common/terminal.js';
import { terminalCommandGuideConfigSection, TerminalCommandGuideSettingId, type ITerminalCommandGuideConfiguration } from '../common/terminalCommandGuideConfiguration.js';

// #region Terminal Contributions

class TerminalCommandGuideContribution extends Disposable implements ITerminalContribution {
	static readonly ID = 'terminal.highlight';

	static get(instance: ITerminalInstance | IDetachedTerminalInstance): TerminalCommandGuideContribution | null {
		return instance.getContribution<TerminalCommandGuideContribution>(TerminalCommandGuideContribution.ID);
	}

	private _xterm: IXtermTerminal & { raw: RawXtermTerminal } | undefined;
	private readonly _activeCommandGuide = this._register(new MutableDisposable());

	constructor(
		private readonly _instance: ITerminalInstance | IDetachedTerminalInstance,
		processManager: ITerminalProcessManager | ITerminalProcessInfo,
		widgetManager: TerminalWidgetManager,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
	}

	xtermOpen(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		this._xterm = xterm;
		this._refreshActivatedState();
		this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalCommandGuideSettingId.ShowCommandGuide)) {
				this._refreshActivatedState();
			}
		});
	}

	private _refreshActivatedState() {
		const xterm = this._xterm;
		if (!xterm) {
			return;
		}

		const showCommandGuide = this._configurationService.getValue<ITerminalCommandGuideConfiguration>(terminalCommandGuideConfigSection).showCommandGuide;
		if (!!this._activeCommandGuide.value === showCommandGuide) {
			return;
		}

		if (!showCommandGuide) {
			this._activeCommandGuide.clear();
		} else {
			const screenElement = xterm.raw.element!.querySelector('.xterm-screen')!;
			const viewportElement = xterm.raw.element!.querySelector('.xterm-viewport')!;
			this._activeCommandGuide.value = combinedDisposable(
				addDisposableListener(screenElement, 'mousemove', (e: MouseEvent) => this._tryShowHighlight(screenElement, xterm, e)),
				addDisposableListener(viewportElement, 'mousemove', (e: MouseEvent) => this._tryShowHighlight(screenElement, xterm, e)),
				addDisposableListener(xterm.raw.element!, 'mouseout', () => xterm.markTracker.showCommandGuide(undefined)),
				xterm.raw.onData(() => xterm.markTracker.showCommandGuide(undefined)),
				toDisposable(() => xterm.markTracker.showCommandGuide(undefined)),
			);
		}
	}

	private _tryShowHighlight(element: Element, xterm: IXtermTerminal & { raw: RawXtermTerminal }, e: MouseEvent) {
		const rect = element.getBoundingClientRect();
		if (!rect) {
			return;
		}
		const mouseCursorY = Math.floor(e.offsetY / (rect.height / xterm.raw.rows));
		const command = this._instance.capabilities.get(TerminalCapability.CommandDetection)?.getCommandForLine(xterm.raw.buffer.active.viewportY + mouseCursorY);
		if (command && 'getOutput' in command) {
			xterm.markTracker.showCommandGuide(command);
		} else {
			xterm.markTracker.showCommandGuide(undefined);
		}
	}
}

registerTerminalContribution(TerminalCommandGuideContribution.ID, TerminalCommandGuideContribution, false);

export const TERMINAL_COMMAND_GUIDE_COLOR = registerColor('terminalCommandGuide.foreground', {
	dark: transparent(listInactiveSelectionBackground, 1),
	light: transparent(listInactiveSelectionBackground, 1),
	hcDark: PANEL_BORDER,
	hcLight: PANEL_BORDER
}, localize('terminalCommandGuide.foreground', 'The foreground color of the terminal command guide that appears to the left of a command and its output on hover.'));

// #endregion
