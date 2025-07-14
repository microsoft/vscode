/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { OperatingSystem, OS } from '../../../../../base/common/platform.js';
import type { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress, type IToolConfirmationMessages } from '../../../chat/common/languageModelToolsService.js';
import { getRecommendedToolsOverRunInTerminal } from './alternativeRecommendation.js';
import { CommandLineAutoApprover } from './commandLineAutoApprover.js';
import { isPowerShell } from './runInTerminalHelpers.js';
import { extractInlineSubCommands, splitCommandLineIntoSubCommands } from './subCommands.js';

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
	protected readonly _commandLineAutoApprover: CommandLineAutoApprover;

	// TODO: These should not be part of the state as different sessions could get confused
	private _alternativeRecommendation?: IToolResult;
	private _rewrittenCommand?: string;

	private _osBackend: Lazy<Promise<OperatingSystem>>;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@ILanguageModelToolsService private readonly _languageModelToolsService: ILanguageModelToolsService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();

		this._commandLineAutoApprover = this._register(instantiationService.createInstance(CommandLineAutoApprover));
		this._osBackend = new Lazy(async () => (await this._remoteAgentService.getEnvironment())?.os ?? OS);
		// this._commandLineAutoApprover = this._register(this.instantiationService.createInstance(CommandLineAutoApprover));
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const args = context.parameters as IInputParams;

		this._alternativeRecommendation = getRecommendedToolsOverRunInTerminal(args.command, this._languageModelToolsService);
		const presentation = this._alternativeRecommendation ? 'hidden' : undefined;

		// TODO: This isn't good enough, it should pull from the shell type that is active or is about to be launched
		const os = await this._osBackend.value;
		// TODO: Fix pulling default shell (was this.envService.shell)
		const shell = 'pwsh';
		const language = os === OperatingSystem.Windows ? 'pwsh' : 'sh';

		let confirmationMessages: IToolConfirmationMessages | undefined;
		if (this._alternativeRecommendation) {
			confirmationMessages = undefined;
		} else {
			const subCommands = splitCommandLineIntoSubCommands(args.command, shell, os);
			const inlineSubCommands = subCommands.map(e => Array.from(extractInlineSubCommands(e, shell, os))).flat();
			const allSubCommands = [...subCommands, ...inlineSubCommands];
			if (allSubCommands.every(e => this._commandLineAutoApprover.isAutoApproved(e, shell, os))) {
				confirmationMessages = undefined;
			} else {
				confirmationMessages = {
					title: args.isBackground
						? localize('runInTerminal.background', "Run command in background terminal")
						: localize('runInTerminal.foreground', "Run command in terminal"),
					message: new MarkdownString(
						args.explanation
					),
				};
			}
		}

		const rewrittenCommand = await this._rewriteCommandIfNeeded(context, args, shell);
		if (rewrittenCommand && rewrittenCommand !== args.command) {
			this._rewrittenCommand = rewrittenCommand;
		} else {
			this._rewrittenCommand = undefined;
		}

		return {
			confirmationMessages,
			presentation,
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

	protected async _rewriteCommandIfNeeded(context: IToolInvocationPreparationContext, args: IInputParams, shell: string): Promise<string> {
		const commandLine = args.command;
		const os = await this._osBackend.value;

		// Re-write the command if it starts with `cd <dir> && <suffix>` or `cd <dir>; <suffix>`
		// to just `<suffix>` if the directory matches the current terminal's cwd. This simplifies
		// the result in the chat by removing redundancies that some models like to add.
		// TODO: Fix pulling default shell (was this.envService.shell)
		const isPwsh = isPowerShell(shell, os);
		const cdPrefixMatch = commandLine.match(
			isPwsh
				? /^(?:cd|Set-Location(?: -Path)?) (?<dir>[^\s]+) ?(?:&&|;)\s+(?<suffix>.+)$/i
				: /^cd (?<dir>[^\s]+) &&\s+(?<suffix>.+)$/
		);
		const cdDir = cdPrefixMatch?.groups?.dir;
		const cdSuffix = cdPrefixMatch?.groups?.suffix;
		if (cdDir && cdSuffix) {
			let cwd: URI | undefined;

			// Get the current session terminal's cwd
			// const sessionId = context.chatSessionId;
			// TODO: Associate session with terminal, get cwd
			// if (sessionId) {
			// 	const terminal = await this.terminalService.getToolTerminalForSession(sessionId);
			// 	if (terminal) {
			// 		cwd = await this.terminalService.getCwdForSession(sessionId);
			// 	}
			// }

			// If a terminal is not available, use the workspace root
			if (!cwd) {
				const workspaceFolders = this._workspaceContextService.getWorkspace().folders;
				if (workspaceFolders.length === 1) {
					cwd = workspaceFolders[0].uri;
				}
			}

			// Re-write the command if it matches the cwd
			if (cwd) {
				// Remove any surrounding quotes
				let cdDirPath = cdDir;
				if (cdDirPath.startsWith('"') && cdDirPath.endsWith('"')) {
					cdDirPath = cdDirPath.slice(1, -1);
				}
				// Normalize trailing slashes
				cdDirPath = cdDirPath.replace(/(?:[\\\/])$/, '');
				let cwdFsPath = cwd.fsPath.replace(/(?:[\\\/])$/, '');
				// Case-insensitive comparison on Windows
				if (os === OperatingSystem.Windows) {
					cdDirPath = cdDirPath.toLowerCase();
					cwdFsPath = cwdFsPath.toLowerCase();
				}
				if (cdDirPath === cwdFsPath) {
					return cdSuffix;
				}
			}
		}

		return commandLine;
	}
}
