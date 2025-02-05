/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ProviderResult } from '../../../../../editor/common/languages.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { IChatModel } from '../../common/chatModel.js';
import { IChatRequestVariableValue, IChatVariableResolverProgress, IChatVariablesService } from '../../common/chatVariables.js';

export class BuiltinVariablesContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.builtinVariables';

	constructor(
		@IChatVariablesService varsService: IChatVariablesService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const terminalSelectionVar = instantiationService.createInstance(TerminalSelectionVariable);
		varsService.registerVariable({
			id: 'copilot.terminalSelection',
			name: 'terminalSelection',
			fullName: localize('termSelection', "Terminal Selection"),
			description: localize('termSelectionDescription', "The active terminal's selection"),
			icon: Codicon.terminal,
		}, async (messageText: string, arg: string | undefined, model: IChatModel, progress: (part: IChatVariableResolverProgress) => void, token: CancellationToken): Promise<IChatRequestVariableValue | undefined> => {
			return await terminalSelectionVar.resolve(token);
		});

		const terminalLastCommandVar = instantiationService.createInstance(TerminalLastCommandVariable);
		varsService.registerVariable({
			id: 'copilot.terminalLastCommand',
			name: 'terminalLastCommand',
			fullName: localize('terminalLastCommand', "Terminal Last Command"),
			description: localize('termLastCommandDesc', "The active terminal's last run command"),
			icon: Codicon.terminal,
		}, async (messageText: string, arg: string | undefined, model: IChatModel, progress: (part: IChatVariableResolverProgress) => void, token: CancellationToken): Promise<IChatRequestVariableValue | undefined> => {
			return await terminalLastCommandVar.resolve(token);
		});
	}
}

class TerminalSelectionVariable {
	constructor(
		@ITerminalService private readonly terminalService: ITerminalService
	) { }

	resolve(token: CancellationToken): ProviderResult<IChatRequestVariableValue> {
		const terminalSelection = this.terminalService.activeInstance?.selection;
		return terminalSelection ? `The active terminal's selection:\n${terminalSelection}` : undefined;
	}
}

class TerminalLastCommandVariable {
	constructor(
		@ITerminalService private readonly terminalService: ITerminalService
	) { }

	resolve(token: CancellationToken): ProviderResult<IChatRequestVariableValue> {
		const lastCommand = this.terminalService.activeInstance?.capabilities.get(TerminalCapability.CommandDetection)?.commands.at(-1);
		if (!lastCommand) {
			return;
		}

		const userPrompt: string[] = [];
		userPrompt.push(`The following is the last command run in the terminal:`);
		userPrompt.push(lastCommand.command);
		if (lastCommand.cwd) {
			userPrompt.push(`It was run in the directory:`);
			userPrompt.push(lastCommand.cwd);
		}
		const output = lastCommand.getOutput();
		if (output) {
			userPrompt.push(`It has the following output:`);
			userPrompt.push(output);
		}

		const prompt = userPrompt.join('\n');
		return `The active terminal's last run command:\n${prompt}`;
	}
}
