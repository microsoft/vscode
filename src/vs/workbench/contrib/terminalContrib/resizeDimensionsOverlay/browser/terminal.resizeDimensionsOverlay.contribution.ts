/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { Disposable, MutableDisposable, type IDisposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import type { ITerminalContribution, IXtermTerminal } from '../../../terminal/browser/terminal.js';
import { registerTerminalContribution, type ITerminalContributionContext } from '../../../terminal/browser/terminalExtensions.js';
import { timeout } from '../../../../../base/common/async.js';
import { TerminalResizeDimensionsOverlay } from './terminalResizeDimensionsOverlay.js';
import { TerminalResizeDimensionsOverlaySettingId } from '../common/terminalResizeDimensionsOverlayConfiguration.js';

class TerminalResizeDimensionsOverlayContribution extends Disposable implements ITerminalContribution {
	static readonly ID = 'terminal.resizeDimensionsOverlay';

	private readonly _overlay: MutableDisposable<IDisposable> = this._register(new MutableDisposable());

	constructor(
		private readonly _ctx: ITerminalContributionContext,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
	}

	xtermOpen(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		// Initialize resize dimensions overlay
		this._ctx.processManager.ptyProcessReady.then(() => {
			// Wait a second to avoid resize events during startup like when opening a terminal or
			// when a terminal reconnects. Ideally we'd have an actual event to listen to here.
			timeout(1000).then(() => {
				if (this._store.isDisposed) {
					return;
				}
				this._updateOverlay(xterm);
				this._register(this._configurationService.onDidChangeConfiguration(e => {
					if (e.affectsConfiguration(TerminalResizeDimensionsOverlaySettingId.Enabled)) {
						this._updateOverlay(xterm);
					}
				}));
			});
		});
	}

	private _updateOverlay(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		const enabled = this._configurationService.getValue<boolean>(TerminalResizeDimensionsOverlaySettingId.Enabled) !== false;
		if (enabled) {
			if (!this._overlay.value) {
				this._overlay.value = new TerminalResizeDimensionsOverlay(this._ctx.instance.domElement, xterm);
			}
		} else {
			this._overlay.clear();
		}
	}
}
registerTerminalContribution(TerminalResizeDimensionsOverlayContribution.ID, TerminalResizeDimensionsOverlayContribution);
