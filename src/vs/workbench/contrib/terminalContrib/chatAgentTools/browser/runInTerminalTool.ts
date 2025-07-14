/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { OperatingSystem, OS } from '../../../../../base/common/platform.js';
import { localize } from '../../../../../nls.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress, type IToolConfirmationMessages } from '../../../chat/common/languageModelToolsService.js';
import { getRecommendedToolsOverRunInTerminal } from './alternativeRecommendation.js';

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
	// TODO: These should not be part of the state as different sessions could get confused
	private _alternativeRecommendation?: IToolResult;
	private _rewrittenCommand?: string;

	constructor(
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@ILanguageModelToolsService private readonly _languageModelToolsService: ILanguageModelToolsService
	) {
		super();

		// this._commandLineAutoApprover = this._register(this.instantiationService.createInstance(CommandLineAutoApprover));
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const args = context.parameters as IInputParams;

		this._alternativeRecommendation = getRecommendedToolsOverRunInTerminal(args.command, this._languageModelToolsService);
		// TODO: What does presentation do? Test with alternativeRecommendation
		// const presentation = this.alternativeRecommendation ? 'hidden' : undefined;

		const remoteEnv = await this._remoteAgentService.getEnvironment();
		// TODO: This isn't good enough, it should pull from the shell type that is active or is about to be launched
		const language = (remoteEnv?.os ?? OS) === OperatingSystem.Windows ? 'pwsh' : 'sh';

		let confirmationMessages: IToolConfirmationMessages | undefined;
		if (this._alternativeRecommendation) {
			confirmationMessages = undefined;
		} else {
			// 	const subCommands = splitCommandLineIntoSubCommands(options.input.command, this.envService.shell, this.envService.OS);
			// 	const inlineSubCommands = subCommands.map(e => Array.from(extractInlineSubCommands(e, this.envService.shell, this.envService.OS))).flat();
			// 	const allSubCommands = [...subCommands, ...inlineSubCommands];
			// 	if (allSubCommands.every(e => this._commandLineAutoApprover.isAutoApproved(e))) {
			// 		confirmationMessages = undefined;
			// 	} else {
			// 		confirmationMessages = {
			// 			title: options.input.isBackground ?
			// 				l10n.t`Run command in background terminal` :
			// 				l10n.t`Run command in terminal`,
			// 			message: new MarkdownString(
			// 				options.input.explanation
			// 			),
			// 		};
			// 	}
		}

		// const rewrittenCommand = await this._rewriteCommandIfNeeded(options);
		// if (rewrittenCommand && rewrittenCommand !== options.input.command) {
		// 	this.rewrittenCommand = rewrittenCommand;
		// } else {
		// 	this.rewrittenCommand = undefined;
		// }

		return {
			confirmationMessages,
			toolSpecificData: {
				kind: 'terminal',
				command: this._rewrittenCommand ?? args.command,
				language,
			}
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		// const args = invocation.parameters as IInputParams;
		return {
			content: [{
				kind: 'text',
				value: 'hi there',
			}]
		};
	}
}
