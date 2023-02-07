/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ICommandSearchPromptRequest, ICommandSearchProvider, ICommandSearchRefineRequest, showCommandSearchPrompt } from 'vs/workbench/contrib/terminal/browser/commandSearch/commandSearchPrompt';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalCommandId, TERMINAL_ACTION_CATEGORY } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';

export function registerCommandSearchActions() {
	// TODO: Share
	const category: ILocalizedString = { value: TERMINAL_ACTION_CATEGORY, original: 'Terminal' };

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ShowAiCommandSearch,
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

			// TODO: Alt to not send enter?
			activeInstance.runCommand(result.command, result.execute);
			activeInstance.focus();
		}
	});
}

class FakeCommandSearchProvider implements ICommandSearchProvider {
	async getPromptResults(request: ICommandSearchPromptRequest): Promise<string[]> {
		return ['a', 'b', 'c'];
	}
	async refineResults(request: ICommandSearchRefineRequest): Promise<string[]> {
		return ['d', 'e', 'f'];
	}
}
