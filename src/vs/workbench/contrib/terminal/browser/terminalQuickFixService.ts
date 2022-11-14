/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ITerminalCommandSelector, ITerminalQuickFixProvider, ITerminalQuickFixSelectorProvider, ITerminalQuickFixService } from 'vs/workbench/contrib/terminal/common/terminal';

export class TerminalQuickFixService implements ITerminalQuickFixService {
	private readonly _onDidRegisterProvider = new Emitter<ITerminalQuickFixSelectorProvider>();
	readonly onDidRegisterProvider = this._onDidRegisterProvider.event;
	private readonly _onDidUnregisterProvider = new Emitter<ITerminalQuickFixSelectorProvider>();
	readonly onDidUnregisterProvider = this._onDidUnregisterProvider.event;
	_serviceBrand: undefined;
	_providers: Map<string, { selector: ITerminalCommandSelector; provider: ITerminalQuickFixProvider }> = new Map();
	get providers(): ITerminalQuickFixSelectorProvider[] {
		return Array.from(Object.entries(this._providers)).map(p => {
			return {
				id: p[0],
				selector: p[1].selector,
				provider: p[1].provider
			};
		});
	}
	registerQuickFixSelector(id: string, selector: ITerminalCommandSelector): void {

	}
	registerQuickFixProvider(id: string, selector: ITerminalCommandSelector, provider: ITerminalQuickFixProvider): IDisposable {
		const selectorProvider = { id, selector, provider };
		this._providers.set(id, selectorProvider);
		this._onDidRegisterProvider.fire(selectorProvider);
		return toDisposable(() => {
			this._onDidUnregisterProvider.fire(selectorProvider);
			this._providers.delete(id);
		});
	}
}
