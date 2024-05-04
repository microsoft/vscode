/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { Event } from 'vs/base/common/event';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./media/stickyScroll';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { ITerminalContribution, ITerminalInstance, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalInstance, TerminalInstanceColorProvider } from 'vs/workbench/contrib/terminal/browser/terminalInstance';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessInfo, ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalStickyScrollSettingId } from 'vs/workbench/contrib/terminalContrib/stickyScroll/common/terminalStickyScrollConfiguration';
import { TerminalStickyScrollOverlay } from 'vs/workbench/contrib/terminalContrib/stickyScroll/browser/terminalStickyScrollOverlay';

export class TerminalStickyScrollContribution extends Disposable implements ITerminalContribution {
	static readonly ID = 'terminal.stickyScroll';

	static get(instance: ITerminalInstance): TerminalStickyScrollContribution | null {
		return instance.getContribution<TerminalStickyScrollContribution>(TerminalStickyScrollContribution.ID);
	}

	private _xterm?: IXtermTerminal & { raw: RawXtermTerminal };

	private readonly _overlay = this._register(new MutableDisposable<TerminalStickyScrollOverlay>());

	private readonly _enableListeners = this._register(new MutableDisposable());
	private readonly _disableListeners = this._register(new MutableDisposable());

	constructor(
		private readonly _instance: ITerminalInstance,
		processManager: ITerminalProcessManager | ITerminalProcessInfo,
		widgetManager: TerminalWidgetManager,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super();

		this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, e => {
			if (!e || e.affectsConfiguration(TerminalStickyScrollSettingId.Enabled)) {
				this._refreshState();
			}
		}));
	}

	xtermReady(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		this._xterm = xterm;
		this._refreshState();
	}

	xtermOpen(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		this._refreshState();
	}

	hideLock() {
		this._overlay.value?.lockHide();
	}

	hideUnlock() {
		this._overlay.value?.unlockHide();
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
			const xtermCtorEventually = TerminalInstance.getXtermConstructor(this._keybindingService, this._contextKeyService);
			this._overlay.value = this._instantiationService.createInstance(
				TerminalStickyScrollOverlay,
				this._instance,
				this._xterm!,
				this._instantiationService.createInstance(TerminalInstanceColorProvider, this._instance),
				this._instance.capabilities.get(TerminalCapability.CommandDetection)!,
				xtermCtorEventually
			);
		}
	}

	private _tryDisable(): void {
		if (!this._shouldBeEnabled()) {
			this._overlay.clear();
		}
	}

	private _shouldBeEnabled(): boolean {
		const capability = this._instance.capabilities.get(TerminalCapability.CommandDetection);
		return !!(this._configurationService.getValue(TerminalStickyScrollSettingId.Enabled) && capability && this._xterm?.raw?.element);
	}
}
