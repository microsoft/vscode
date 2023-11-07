/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { IDimension } from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./media/stickyScroll';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { ITerminalContribution, ITerminalInstance, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessInfo, ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalStickyScrollOverlay } from 'vs/workbench/contrib/terminalContrib/stickyScroll/browser/terminalStickyScrollOverlay';

class TerminalStickyScrollContribution extends Disposable implements ITerminalContribution {
	static readonly ID = 'terminal.stickyScroll';

	static get(instance: ITerminalInstance): TerminalStickyScrollContribution | null {
		return instance.getContribution<TerminalStickyScrollContribution>(TerminalStickyScrollContribution.ID);
	}

	private _xterm?: IXtermTerminal & { raw: RawXtermTerminal };

	private _overlay = this._register(new MutableDisposable<TerminalStickyScrollOverlay>());

	private _enableListeners = this._register(new MutableDisposable());
	private _disableListeners = this._register(new MutableDisposable());

	constructor(
		private readonly _instance: ITerminalInstance,
		processManager: ITerminalProcessManager | ITerminalProcessInfo,
		widgetManager: TerminalWidgetManager,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, e => {
			if (!e || e.affectsConfiguration(TerminalSettingId.EnableStickyScroll)) {
				this._refreshState();
			}
		}));
	}

	xtermReady(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		this._xterm = xterm;
		this._refreshState();
	}

	layout(xterm: IXtermTerminal & { raw: RawXtermTerminal }, dimension: IDimension): void {
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
		if (this._shouldBeEnabled()) {
			this._overlay.value = this._instantiationService.createInstance(TerminalStickyScrollOverlay, this._instance, this._xterm!, this._instance.capabilities.get(TerminalCapability.CommandDetection)!);
		}
	}

	private _tryDisable(): void {
		if (!this._shouldBeEnabled()) {
			this._overlay.clear();
		}
	}

	private _shouldBeEnabled(): boolean {
		const capability = this._instance.capabilities.get(TerminalCapability.CommandDetection);
		return !!(this._configurationService.getValue(TerminalSettingId.EnableStickyScroll) && capability && this._xterm?.raw?.element);
	}
}

registerTerminalContribution(TerminalStickyScrollContribution.ID, TerminalStickyScrollContribution, true);
