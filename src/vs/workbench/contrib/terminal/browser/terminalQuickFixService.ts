/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ITerminalQuickFixProvider, ITerminalCommandSelector } from 'vs/platform/terminal/common/xterm/terminalQuickFix';
import { ITerminalQuickFixProviderSelector, ITerminalQuickFixService } from 'vs/workbench/contrib/terminal/common/terminal';

export class TerminalQuickFixService implements ITerminalQuickFixService {
	private readonly _onDidRegisterProvider = new Emitter<ITerminalQuickFixProviderSelector>();
	readonly onDidRegisterProvider = this._onDidRegisterProvider.event;
	private readonly _onDidUnregisterProvider = new Emitter<string>();
	readonly onDidUnregisterProvider = this._onDidUnregisterProvider.event;
	_serviceBrand: undefined;
	_providers: Map<string, ITerminalQuickFixProvider> = new Map();
	_selectors: Map<string, ITerminalCommandSelector> = new Map();
	get providers(): Map<string, ITerminalQuickFixProvider> { return this._providers; }

	registerCommandSelector(selector: ITerminalCommandSelector): void {
		this._selectors.set(selector.id, selector);
	}

	registerQuickFixProvider(id: string, provider: ITerminalQuickFixProvider): IDisposable {
		this._providers.set(id, provider);
		const selector = this._selectors.get(id);
		if (!selector) {
			throw new Error(`No registered selector for ID: ${id}`);
		}
		this._onDidRegisterProvider.fire({ selector, provider });
		return toDisposable(() => {
			this._selectors.delete(id);
			this._providers.delete(id);
			this._onDidUnregisterProvider.fire(selector.id);
		});
	}
}
