/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { Disposable, MutableDisposable, type IDisposable } from '../../../../../base/common/lifecycle.js';
import type { ITerminalContribution, IXtermTerminal } from '../../../terminal/browser/terminal.js';
import { registerTerminalContribution, type ITerminalContributionContext } from '../../../terminal/browser/terminalExtensions.js';
import { timeout } from '../../../../../base/common/async.js';
import { TerminalResizeDimensionsOverlay } from './terminalResizeDimensionsOverlay.js';

class TerminalResizeDimensionsOverlayContribution extends Disposable implements ITerminalContribution {
	static readonly ID = 'terminal.resizeDimensionsOverlay';

	private readonly _overlay: MutableDisposable<IDisposable> = this._register(new MutableDisposable());

	constructor(
		private readonly _ctx: ITerminalContributionContext,
	) {
		super();
	}

	xtermOpen(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		// Initialize resize dimensions overlay
		this._ctx.processManager.ptyProcessReady.then(() => {
			// Wait a second to avoid resize events during startup like when opening a terminal or
			// when a terminal reconnects. Ideally we'd have an actual event to listen to here.
			timeout(1000).then(() => {
				if (!this._store.isDisposed) {
					this._overlay.value = new TerminalResizeDimensionsOverlay(this._ctx.instance.domElement, xterm);
				}
			});
		});
	}
}
registerTerminalContribution(TerminalResizeDimensionsOverlayContribution.ID, TerminalResizeDimensionsOverlayContribution);
