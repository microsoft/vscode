/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITerminalContribution, ITerminalInstance, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { TypeAheadAddon } from 'vs/workbench/contrib/terminalContrib/typeAhead/browser/terminalTypeAheadAddon';
import { ITerminalProcessManager, TERMINAL_CONFIG_SECTION } from 'vs/workbench/contrib/terminal/common/terminal';
import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { TerminalTypeAheadSettingId, type ITerminalTypeAheadConfiguration } from 'vs/workbench/contrib/terminalContrib/typeAhead/common/terminalTypeAheadConfiguration';

class TerminalTypeAheadContribution extends DisposableStore implements ITerminalContribution {
	static readonly ID = 'terminal.typeAhead';

	static get(instance: ITerminalInstance): TerminalTypeAheadContribution | null {
		return instance.getContribution<TerminalTypeAheadContribution>(TerminalTypeAheadContribution.ID);
	}

	private _addon: TypeAheadAddon | undefined;

	constructor(
		instance: ITerminalInstance,
		private readonly _processManager: ITerminalProcessManager,
		widgetManager: TerminalWidgetManager,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();
		this.add(toDisposable(() => this._addon?.dispose()));
	}

	xtermReady(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		this._loadTypeAheadAddon(xterm.raw);
		this.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalTypeAheadSettingId.LocalEchoEnabled)) {
				this._loadTypeAheadAddon(xterm.raw);
			}
		}));

		// Reset the addon when the terminal launches or relaunches
		this.add(this._processManager.onProcessReady(() => {
			this._addon?.reset();
		}));
	}

	private _loadTypeAheadAddon(xterm: RawXtermTerminal): void {
		const enabled = this._configurationService.getValue<ITerminalTypeAheadConfiguration>(TERMINAL_CONFIG_SECTION).localEchoEnabled;
		const isRemote = !!this._processManager.remoteAuthority;
		if (enabled === 'off' || enabled === 'auto' && !isRemote) {
			this._addon?.dispose();
			this._addon = undefined;
			return;
		}
		if (this._addon) {
			return;
		}
		if (enabled === 'on' || (enabled === 'auto' && isRemote)) {
			this._addon = this._instantiationService.createInstance(TypeAheadAddon, this._processManager);
			xterm.loadAddon(this._addon);
		}
	}
}

registerTerminalContribution(TerminalTypeAheadContribution.ID, TerminalTypeAheadContribution);
