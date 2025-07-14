/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../../chat/common/languageModelToolsService.js';

export const RunInTerminalToolData: IToolData = {
	id: 'vscode_runInTerminal',
	toolReferenceName: 'runInTerminal2',
	canBeReferencedInPrompt: true,
	displayName: localize('runInTerminalTool.displayName', 'Run in Terminal'),
	modelDescription: localize('runInTerminalTool.modelDescription', "This is a tool for running commands in the terminal. You should provide the command to run."),
	userDescription: localize('runInTerminalTool.userDescription', 'Tool for running commands in the terminal'),
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			command: {
				type: 'string',
				description: 'The command to run in the terminal.'
			},
			explanation: {
				type: 'string',
				description: 'A one-sentence description of what the command does. This will be shown to the user before the command is run.'
			},
			isBackground: {
				type: 'boolean',
				description: 'Whether the command starts a background process. If true, the command will run in the background and you will not see the output. If false, the tool call will block on the command finishing, and then you will get the output. Examples of background processes: building in watch mode, starting a server. You can check the output of a background process later on by using copilot_getTerminalOutput.'
			},
		},
		required: [
			'command',
			'explanation',
			'isBackground',
		]
	}
};

interface IInputParams {
	command: string;
	explanation: string;
	isBackground: boolean;
}

export class RunInTerminalTool extends Disposable implements IToolImpl {
	constructor(
	) {
		super();

		// this._commandLineAutoApprover = this._register(this.instantiationService.createInstance(CommandLineAutoApprover));
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const args = context.parameters as IInputParams;
		return {
			confirmationMessages: {
				title: localize('runInTerminalTool.title', 'Run in Terminal'),
				message: new MarkdownString(localize('runInTerminalTool.confirmationMessage', "Review blah blah.")),
			},
			toolSpecificData: {
				kind: 'terminal',
				command: 'echo hello world',
				language: 'shellscript',
			}
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as IInputParams;
		return {
			content: [{
				kind: 'text',
				value: 'hi there',
			}]
		};
	}
}
