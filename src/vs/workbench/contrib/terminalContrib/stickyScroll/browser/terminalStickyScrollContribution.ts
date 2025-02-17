/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalContribution, ITerminalInstance, IXtermTerminal } from '../../../terminal/browser/terminal.js';
import type { ITerminalContributionContext } from '../../../terminal/browser/terminalExtensions.js';
import { TerminalInstance, TerminalInstanceColorProvider } from '../../../terminal/browser/terminalInstance.js';
import { TerminalStickyScrollSettingId } from '../common/terminalStickyScrollConfiguration.js';
import './media/stickyScroll.css';
import { TerminalStickyScrollOverlay } from './terminalStickyScrollOverlay.js';

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
		private readonly _ctx: ITerminalContributionContext,
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
				this._disableListeners.value = this._ctx.instance.capabilities.onDidRemoveCapability(e => {
					if (e.id === TerminalCapability.CommandDetection) {
						this._refreshState();
					}
				});
			}
		} else {
			this._disableListeners.clear();
			if (!this._enableListeners.value) {
				this._enableListeners.value = this._ctx.instance.capabilities.onDidAddCapability(e => {
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
				this._ctx.instance,
				this._xterm!,
				this._instantiationService.createInstance(TerminalInstanceColorProvider, this._ctx.instance.targetRef),
				this._ctx.instance.capabilities.get(TerminalCapability.CommandDetection)!,
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
		const capability = this._ctx.instance.capabilities.get(TerminalCapability.CommandDetection);
		return !!(this._configurationService.getValue(TerminalStickyScrollSettingId.Enabled) && capability && this._xterm?.raw?.element);
	}
}
