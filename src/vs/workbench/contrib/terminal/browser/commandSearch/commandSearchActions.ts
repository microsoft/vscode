/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from 'vs/base/common/async';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { localize } from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ICommandSearchProvider, ICommandSearchRequest, showCommandSearchPrompt } from 'vs/workbench/contrib/terminal/browser/commandSearch/commandSearchPrompt';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { terminalStrings } from 'vs/workbench/contrib/terminal/common/terminalStrings';

export function registerCommandSearchActions() {
	const category = terminalStrings.actionCategory;

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ShowCommandSearch,
				title: { value: localize('showCommandSearch', "Show Command Search"), original: 'Show Command Search' },
				f1: true,
				category,
				precondition: TerminalContextKeys.focus,
				keybinding: {
					primary: KeyMod.Shift | KeyCode.Digit3,
					weight: KeybindingWeight.WorkbenchContrib
				}
			});
		}
		async run(accessor: ServicesAccessor) {
			const terminalService = accessor.get(ITerminalService);
			const activeInstance = terminalService.activeInstance;
			if (!activeInstance) {
				return;
			}

			const commandSearchProvider = new FakeCommandSearchProvider();
			const result = await showCommandSearchPrompt(accessor, activeInstance, commandSearchProvider);
			if (!result) {
				return;
			}

			activeInstance.runCommand(result.command, result.execute);
			activeInstance.focus();
		}
	});
}

class FakeCommandSearchProvider implements ICommandSearchProvider {
	private _map = new Map</*threadId*/number, number>();
	async query(request: ICommandSearchRequest): Promise<string[]> {
		await timeout(300);
		const count = this._map.get(request.threadId) ?? 0;
		this._map.set(request.threadId, count + 1);
		let firstOption = '';
		for (let i = 0; i <= count; i++) {
			firstOption = (i === 0 ? '' : firstOption + '\n') + `echo ${i + 1}`;
		}
		return [
			firstOption,
			'second option',
			'third option'
		];
	}
}
