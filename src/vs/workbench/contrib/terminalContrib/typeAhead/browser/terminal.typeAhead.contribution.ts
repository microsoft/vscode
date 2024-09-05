/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITerminalContribution, ITerminalInstance, IXtermTerminal } from '../../../terminal/browser/terminal.js';
import { registerTerminalContribution } from '../../../terminal/browser/terminalExtensions.js';
import { TerminalWidgetManager } from '../../../terminal/browser/widgets/widgetManager.js';
import { TypeAheadAddon } from './terminalTypeAheadAddon.js';
import { ITerminalProcessManager, TERMINAL_CONFIG_SECTION } from '../../../terminal/common/terminal.js';
import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { TerminalTypeAheadSettingId, type ITerminalTypeAheadConfiguration } from '../common/terminalTypeAheadConfiguration.js';

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
