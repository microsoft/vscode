/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { OperatingSystem, OS } from '../../../../../base/common/platform.js';
import { count } from '../../../../../base/common/strings.js';
import type { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalLogService } from '../../../../../platform/terminal/common/terminal.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import type { IChatTerminalToolInvocationData } from '../../../chat/common/chatService.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress, type IToolConfirmationMessages } from '../../../chat/common/languageModelToolsService.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { getRecommendedToolsOverRunInTerminal } from './alternativeRecommendation.js';
import { CommandLineAutoApprover } from './commandLineAutoApprover.js';
import { BasicExecuteStrategy } from './executeStrategy/basicExecuteStrategy.js';
import type { ITerminalExecuteStrategy } from './executeStrategy/executeStrategy.js';
import { NoneExecuteStrategy } from './executeStrategy/noneExecuteStrategy.js';
import { RichExecuteStrategy } from './executeStrategy/richExecuteStrategy.js';
import { isPowerShell } from './runInTerminalHelpers.js';
import { extractInlineSubCommands, splitCommandLineIntoSubCommands } from './subCommands.js';
import { ShellIntegrationQuality, ToolTerminalCreator, type IToolTerminal } from './toolTerminalCreator.js';

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
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILanguageModelToolsService private readonly _languageModelToolsService: ILanguageModelToolsService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();

		this._commandLineAutoApprover = this._register(_instantiationService.createInstance(CommandLineAutoApprover));
		this._osBackend = new Lazy(async () => (await this._remoteAgentService.getEnvironment())?.os ?? OS);
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
				// TODO: Ideally this would be named something like editedCommand for clarity
				command: this._rewrittenCommand ?? args.command,
				language,
			}
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		if (this._alternativeRecommendation) {
			return this._alternativeRecommendation;
		}

		const args = invocation.parameters as IInputParams;
		const toolSpecificData = invocation.toolSpecificData as IChatTerminalToolInvocationData | undefined; // undefined when auto-approved

		this._logService.debug(`RunInTerminalTool: Invoking with options ${JSON.stringify(args)}`);

		const chatSessionId = invocation.context?.sessionId;
		// TODO: How to handle !this.simulationTestContext.isInSimulationTests?
		if (chatSessionId === undefined) {
			throw new Error('A chat session ID is required for this tool');
		}

		const command = toolSpecificData?.command ?? this._rewrittenCommand ?? args.command;
		const didUserEditCommand = typeof toolSpecificData?.command === 'string' && toolSpecificData.command !== args.command;
		const didToolEditCommand = !didUserEditCommand && this._rewrittenCommand !== undefined;

		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		let error: string | undefined;

		const timingStart = Date.now();
		const termId = generateUuid();

		if (args.isBackground) {
			this._logService.debug(`RunInTerminalTool: Creating background terminal with ID=${termId}`);
			const toolTerminal = await this._instantiationService.createInstance(ToolTerminalCreator).createTerminal(chatSessionId, termId, token, true);
			if (token.isCancellationRequested) {
				toolTerminal.instance.dispose();
				throw new CancellationError();
			}

			this._terminalService.setActiveInstance(toolTerminal.instance);
			const timingConnectMs = Date.now() - timingStart;

			throw new Error('NYI run in bg terminal');
			// try {
			// 	this._logService.debug(`RunInTerminalTool: Starting background execution \`${command}\``);
			// 	const execution = new BackgroundTerminalExecution(toolTerminal.terminal, command);
			// 	RunInTerminalTool.executions.set(termId, execution);
			// 	const resultText = (
			// 		didUserEditCommand
			// 			? `Note: The user manually edited the command to \`${command}\`, and that command is now running in terminal with ID=${termId}`
			// 			: didToolEditCommand
			// 				? `Note: The tool simplified the command to \`${command}\`, and that command is now running in terminal with ID=${termId}`
			// 				: `Command is running in terminal with ID=${termId}`
			// 	);
			// 	return new LanguageModelToolResult([new LanguageModelTextPart(resultText)]);
			// } catch (e) {
			// 	error = 'threw';
			// 	if (termId) {
			// 		RunInTerminalTool.executions.delete(termId);
			// 	}
			// 	throw e;
			// } finally {
			// 	const timingExecuteMs = Date.now() - timingStart;
			// 	// TODO: Add telemetry back
			// 	// this.sendTelemetry({
			// 	// 	didUserEditCommand,
			// 	// 	didToolEditCommand,
			// 	// 	shellIntegrationQuality: toolTerminal.shellIntegrationQuality,
			// 	// 	isBackground: true,
			// 	// 	error,
			// 	// 	outputLineCount: -1,
			// 	// 	exitCode: undefined,
			// 	// 	isNewSession: true,
			// 	// 	timingExecuteMs,
			// 	// 	timingConnectMs,
			// 	// });
			// }
		} else {
			// TODO: Connect to existing session terminal
			// let toolTerminal = sessionId ? await this.terminalService.getToolTerminalForSession(sessionId) : undefined;
			let toolTerminal: IToolTerminal | undefined = undefined;
			const isNewSession = !toolTerminal;
			if (toolTerminal) {
				this._logService.debug(`RunInTerminalTool: Using existing terminal with session ID \`${chatSessionId}\``);
			} else {
				this._logService.debug(`RunInTerminalTool: Creating terminal with session ID \`${chatSessionId}\``);
				toolTerminal = await this._instantiationService.createInstance(ToolTerminalCreator).createTerminal(chatSessionId, termId, token);
				if (token.isCancellationRequested) {
					toolTerminal.instance.dispose();
					throw new CancellationError();
				}
			}

			this._terminalService.setActiveInstance(toolTerminal.instance);

			const timingConnectMs = Date.now() - timingStart;

			let terminalResult = '';
			let outputLineCount = -1;
			let exitCode: number | undefined;
			try {
				let strategy: ITerminalExecuteStrategy;
				switch (toolTerminal.shellIntegrationQuality) {
					case ShellIntegrationQuality.None: {
						strategy = this._instantiationService.createInstance(NoneExecuteStrategy, toolTerminal.instance);
						break;
					}
					case ShellIntegrationQuality.Basic: {
						// TODO: Don't use !
						const commandDetection = toolTerminal.instance.capabilities.get(TerminalCapability.CommandDetection)!;
						strategy = this._instantiationService.createInstance(BasicExecuteStrategy, toolTerminal.instance, commandDetection);
						break;
					}
					case ShellIntegrationQuality.Rich: {
						// TODO: Don't use !
						const commandDetection = toolTerminal.instance.capabilities.get(TerminalCapability.CommandDetection)!;
						strategy = this._instantiationService.createInstance(RichExecuteStrategy, toolTerminal.instance, commandDetection);
						break;
					}
				}
				this._logService.debug(`RunInTerminalTool: Using \`${strategy.type}\` execute strategy for command \`${command}\``);
				const executeResult = await strategy.execute(command, token);
				this._logService.debug(`RunInTerminalTool: Finished \`${strategy.type}\` execute strategy with exitCode \`${executeResult.exitCode}\`, result.length \`${executeResult.result.length}\`, error \`${executeResult.error}\``);
				outputLineCount = count(executeResult.result, '\n');
				exitCode = executeResult.exitCode;
				error = executeResult.error;
				if (typeof executeResult.result === 'string') {
					terminalResult = executeResult.result;
				} else {
					return executeResult.result;
				}
			} catch (e) {
				this._logService.debug(`RunInTerminalTool: Threw exception`);
				toolTerminal.instance.dispose();
				error = 'threw';
				throw e;
			} finally {
				const timingExecuteMs = Date.now() - timingStart;
				this._sendTelemetry({
					didUserEditCommand,
					didToolEditCommand,
					isBackground: false,
					shellIntegrationQuality: toolTerminal.shellIntegrationQuality,
					error,
					isNewSession,
					outputLineCount,
					exitCode,
					timingExecuteMs,
					timingConnectMs,
				});
			}

			const resultText: string[] = [];
			if (didUserEditCommand) {
				resultText.push(`Note: The user manually edited the command to \`${command}\`, and this is the output of running that command instead:\n`);
			} else if (didToolEditCommand) {
				resultText.push(`Note: The tool simplified the command to \`${command}\`, and this is the output of running that command instead:\n`);
			}
			resultText.push(terminalResult);

			return {
				content: [{
					kind: 'text',
					value: resultText.join(''),
				}]
			};
		}
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

	private _sendTelemetry(state: {
		didUserEditCommand: boolean;
		didToolEditCommand: boolean;
		error: string | undefined;
		isBackground: boolean;
		isNewSession: boolean;
		shellIntegrationQuality: ShellIntegrationQuality;
		outputLineCount: number;
		timingConnectMs: number;
		timingExecuteMs: number;
		exitCode: number | undefined;
	}) {
		type TelemetryEvent = {
			result: string;
			strategy: 0 | 1 | 2;
			userEditedCommand: 0 | 1;
			toolEditedCommand: 0 | 1;
			isBackground: 0 | 1;
			isNewSession: 0 | 1;
			outputLineCount: number;
			nonZeroExitCode: -1 | 0 | 1;
			timingConnectMs: number;
			timingExecuteMs: number;
		};
		type TelemetryClassification = {
			owner: 'tyriar';
			comment: 'Understanding the usage of the runInTerminal tool';

			result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the tool ran successfully, or the type of error' };
			strategy: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'What strategy was used to execute the command (0=none, 1=basic, 2=rich)' };
			userEditedCommand: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the user edited the command' };
			toolEditedCommand: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the tool edited the command' };
			isBackground: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the command is a background command' };
			isNewSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether this was the first execution for the terminal session' };
			outputLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How many lines of output were produced, this is -1 when isBackground is true or if there\'s an error' };
			nonZeroExitCode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the command exited with a non-zero code (-1=error/unknown, 0=zero exit code, 1=non-zero)' };
			timingConnectMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How long the terminal took to start up and connect to' };
			timingExecuteMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How long the command took to execute' };
		};
		this._telemetryService.publicLog2<TelemetryEvent, TelemetryClassification>('toolUse.runInTerminal', {
			result: state.error ?? 'success',
			strategy: state.shellIntegrationQuality === ShellIntegrationQuality.Rich ? 2 : state.shellIntegrationQuality === ShellIntegrationQuality.Basic ? 1 : 0,
			userEditedCommand: state.didUserEditCommand ? 1 : 0,
			toolEditedCommand: state.didToolEditCommand ? 1 : 0,
			isBackground: state.isBackground ? 1 : 0,
			isNewSession: state.isNewSession ? 1 : 0,
			outputLineCount: state.outputLineCount,
			nonZeroExitCode: state.exitCode === undefined ? -1 : state.exitCode === 0 ? 0 : 1,
			timingConnectMs: state.timingConnectMs,
			timingExecuteMs: state.timingExecuteMs,
		});
	}
}

// class BackgroundTerminalExecution {
// 	private _output: string = '';
// 	get output(): string {
// 		return sanitizeTerminalOutput(this._output);
// 	}

// 	constructor(
// 		public readonly terminal: vscode.Terminal,
// 		command: string
// 	) {
// 		const shellExecution = terminal.shellIntegration!.executeCommand(command);
// 		this.init(shellExecution);
// 	}

// 	private async init(shellExecution: vscode.TerminalShellExecution) {
// 		try {
// 			const stream = shellExecution.read();
// 			for await (const chunk of stream) {
// 				this._output += chunk;
// 			}
// 		} catch (e) {
// 			this._output += e instanceof Error ? e.message : String(e);
// 		}
// 	}
// }
