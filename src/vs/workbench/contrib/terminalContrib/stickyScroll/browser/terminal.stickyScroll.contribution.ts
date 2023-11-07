/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./media/stickyScroll';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { ITerminalContribution, ITerminalInstance, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessInfo, ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalStickyScrollOverlay } from 'vs/workbench/contrib/terminalContrib/stickyScroll/browser/terminalStickyScrollOverlay';

class TerminalStickyScrollContribution extends DisposableStore implements ITerminalContribution {
	static readonly ID = 'terminal.stickyScroll';

	static get(instance: ITerminalInstance): TerminalStickyScrollContribution | null {
		return instance.getContribution<TerminalStickyScrollContribution>(TerminalStickyScrollContribution.ID);
	}

	private _xterm?: IXtermTerminal & { raw: RawXtermTerminal };

	private _overlay = new MutableDisposable<TerminalStickyScrollOverlay>();

	private _enableListeners = new MutableDisposable();
	private _disableListeners = new MutableDisposable();

	constructor(
		private readonly _instance: ITerminalInstance,
		processManager: ITerminalProcessManager | ITerminalProcessInfo,
		widgetManager: TerminalWidgetManager,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._refreshState();
	}

	xtermReady(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		this._xterm = xterm;
		this._refreshState();
	}

	private _refreshState(): void {
		if (this._overlay.value) {
			this._tryDisable();
		} else {
			this._tryEnable();
		}

		if (this._overlay.value) {
			this._enableListeners.clear();
			if (!this._disableListeners.value) {
				this._disableListeners.value = this._instance.capabilities.onDidRemoveCapability(e => {
					if (e.id === TerminalCapability.CommandDetection) {
						this._refreshState();
					}
				});
			}
		} else {
			this._disableListeners.clear();
			if (!this._enableListeners.value) {
				this._enableListeners.value = this._instance.capabilities.onDidAddCapability(e => {
					if (e.id === TerminalCapability.CommandDetection) {
						this._refreshState();
					}
				});
			}
		}
	}

	private _tryEnable(): void {
		const capability = this._instance.capabilities.get(TerminalCapability.CommandDetection);
		if (capability && this._xterm) {
			this._overlay.value = this._instantiationService.createInstance(TerminalStickyScrollOverlay, this._xterm, capability);
		}
	}

	private _tryDisable(): void {
		const capability = this._instance.capabilities.get(TerminalCapability.CommandDetection);
		if (!capability || !this._xterm) {
			this._overlay.clear();
		}
	}
}

registerTerminalContribution(TerminalStickyScrollContribution.ID, TerminalStickyScrollContribution, true);
