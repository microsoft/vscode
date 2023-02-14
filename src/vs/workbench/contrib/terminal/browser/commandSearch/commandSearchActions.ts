/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from 'vs/base/common/async';
import { localize } from 'vs/nls';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ICommandSearchProvider, ICommandSearchRequest, showCommandSearchPrompt } from 'vs/workbench/contrib/terminal/browser/commandSearch/commandSearchPrompt';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalCommandId, TERMINAL_ACTION_CATEGORY } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';

export function registerCommandSearchActions() {
	// TODO: Share
	const category: ILocalizedString = { value: TERMINAL_ACTION_CATEGORY, original: 'Terminal' };

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ShowCommandSearch,
				title: { value: localize('showCommandSearch', "Show Command Search"), original: 'Show Command Search' },
				f1: true,
				category,
				precondition: TerminalContextKeys.processSupported
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
	async query(request: ICommandSearchRequest): Promise<string[]> {
		await timeout(300);
		return ['a', 'b', 'c'];
	}
}
