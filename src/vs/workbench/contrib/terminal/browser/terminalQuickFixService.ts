/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ITerminalQuickFixProvider, ITerminalCommandSelector } from 'vs/platform/terminal/common/xterm/terminalQuickFix';
import { ITerminalQuickFixProviderSelector, ITerminalQuickFixService } from 'vs/workbench/contrib/terminal/common/terminal';
import { ITerminalContributionService } from 'vs/workbench/contrib/terminal/common/terminalExtensionPoints';

export class TerminalQuickFixService implements ITerminalQuickFixService {
	declare _serviceBrand: undefined;

	private _selectors: Map<string, ITerminalCommandSelector> = new Map();

	private _providers: Map<string, ITerminalQuickFixProvider> = new Map();
	get providers(): Map<string, ITerminalQuickFixProvider> { return this._providers; }

	private readonly _onDidRegisterProvider = new Emitter<ITerminalQuickFixProviderSelector>();
	readonly onDidRegisterProvider = this._onDidRegisterProvider.event;
	private readonly _onDidRegisterCommandSelector = new Emitter<ITerminalCommandSelector>();
	readonly onDidRegisterCommandSelector = this._onDidRegisterCommandSelector.event;
	private readonly _onDidUnregisterProvider = new Emitter<string>();
	readonly onDidUnregisterProvider = this._onDidUnregisterProvider.event;

	constructor(@ITerminalContributionService private readonly _terminalContributionService: ITerminalContributionService) {
		this._terminalContributionService.terminalQuickFixes.then(selectors => {
			for (const selector of selectors) {
				this.registerCommandSelector(selector);
			}
		});
	}

	registerCommandSelector(selector: ITerminalCommandSelector): void {
		this._selectors.set(selector.id, selector);
		this._onDidRegisterCommandSelector.fire(selector);
	}

	registerQuickFixProvider(id: string, provider: ITerminalQuickFixProvider): IDisposable {
		// This is more complicated than it looks like it should be because we need to return an
		// IDisposable synchronously but we must await ITerminalContributionService.quickFixes
		// asynchronously before actually registering the provider.
		let disposed = false;
		this._terminalContributionService.terminalQuickFixes.then(() => {
			if (disposed) {
				return;
			}
			this._providers.set(id, provider);
			const selector = this._selectors.get(id);
			if (!selector) {
				throw new Error(`No registered selector for ID: ${id}`);
			}
			this._onDidRegisterProvider.fire({ selector, provider });
		});
		return toDisposable(() => {
			disposed = true;
			this._providers.delete(id);
			const selector = this._selectors.get(id);
			if (selector) {
				this._selectors.delete(id);
				this._onDidUnregisterProvider.fire(selector.id);
			}
		});
	}
}
