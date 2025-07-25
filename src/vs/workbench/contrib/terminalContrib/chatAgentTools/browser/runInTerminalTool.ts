/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IMarker as IXtermMarker } from '@xterm/xterm';
import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { OperatingSystem, OS } from '../../../../../base/common/platform.js';
import { count } from '../../../../../base/common/strings.js';
import type { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalLogService } from '../../../../../platform/terminal/common/terminal.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { IChatService, type IChatTerminalToolInvocationData } from '../../../chat/common/chatService.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress, type IToolConfirmationMessages } from '../../../chat/common/languageModelToolsService.js';
import { ITerminalService, type ITerminalInstance } from '../../../terminal/browser/terminal.js';
import type { XtermTerminal } from '../../../terminal/browser/xterm/xtermTerminal.js';
import { ITerminalProfileResolverService } from '../../../terminal/common/terminal.js';
import { getRecommendedToolsOverRunInTerminal } from './alternativeRecommendation.js';
import { CommandLineAutoApprover } from './commandLineAutoApprover.js';
import { BasicExecuteStrategy } from './executeStrategy/basicExecuteStrategy.js';
import type { ITerminalExecuteStrategy } from './executeStrategy/executeStrategy.js';
import { NoneExecuteStrategy } from './executeStrategy/noneExecuteStrategy.js';
import { RichExecuteStrategy } from './executeStrategy/richExecuteStrategy.js';
import { isPowerShell } from './runInTerminalHelpers.js';
import { extractInlineSubCommands, splitCommandLineIntoSubCommands } from './subCommands.js';
import { ShellIntegrationQuality, ToolTerminalCreator, type IToolTerminal } from './toolTerminalCreator.js';
import { ILanguageModelsService } from '../../../chat/common/languageModels.js';
import { getOutput, pollForOutputAndIdle, promptForMorePolling, racePollingOrPrompt } from './bufferOutputPolling.js';

const TERMINAL_SESSION_STORAGE_KEY = 'chat.terminalSessions';

interface IStoredTerminalAssociation {
	sessionId: string;
	id: string;
	shellIntegrationQuality: ShellIntegrationQuality;
	isBackground?: boolean;
}

export const RunInTerminalToolData: IToolData = {
	id: 'run_in_terminal',
	toolReferenceName: 'runInTerminal',
	canBeReferencedInPrompt: true,
	displayName: localize('runInTerminalTool.displayName', 'Run in Terminal'),
	modelDescription: [
		'This tool allows you to execute shell commands in a persistent terminal session, preserving environment variables, working directory, and other context across multiple commands.',
		'',
		'Command Execution:',
		'- Supports multi-line commands',
		'',
		'Directory Management:',
		'- Must use absolute paths to avoid navigation issues.',
		'',
		'Program Execution:',
		'- Supports Python, Node.js, and other executables.',
		'- Install dependencies via pip, npm, etc.',
		'',
		'Background Processes:',
		'- For long-running tasks (e.g., servers), set isBackground=true.',
		'- Returns a terminal ID for checking status and runtime later.',
		'',
		'Output Management:',
		'- Output is automatically truncated if longer than 60KB to prevent context overflow',
		'- Use filters like \'head\', \'tail\', \'grep\' to limit output size',
		'- For pager commands, disable paging: use \'git --no-pager\' or add \'| cat\'',
		'',
		'Best Practices:',
		'- Be specific with commands to avoid excessive output',
		'- Use targeted queries instead of broad scans',
		'- Consider using \'wc -l\' to count before listing many items'
	].join('\n'),
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
				description: 'Whether the command starts a background process. If true, the command will run in the background and you will not see the output. If false, the tool call will block on the command finishing, and then you will get the output. Examples of background processes: building in watch mode, starting a server. You can check the output of a background process later on by using get_terminal_output.'
			},
		},
		required: [
			'command',
			'explanation',
			'isBackground',
		]
	}
};

export interface IRunInTerminalInputParams {
	command: string;
	explanation: string;
	isBackground: boolean;
}

export class RunInTerminalTool extends Disposable implements IToolImpl {

	protected readonly _commandLineAutoApprover: CommandLineAutoApprover;
	private readonly _sessionTerminalAssociations: Map<string, IToolTerminal> = new Map();

	// Immutable window state
	protected readonly _osBackend: Promise<OperatingSystem>;

	// HACK: Per-tool call state, saved globally
	// TODO: These should not be part of the state as different sessions could get confused https://github.com/microsoft/vscode/issues/255889
	private _alternativeRecommendation?: IToolResult;

	private static readonly _backgroundExecutions = new Map<string, BackgroundTerminalExecution>();
	public static getBackgroundOutput(id: string): string {
		const backgroundExecution = RunInTerminalTool._backgroundExecutions.get(id);
		if (!backgroundExecution) {
			throw new Error('Invalid terminal ID');
		}
		return backgroundExecution.getOutput();
	}

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILanguageModelToolsService private readonly _languageModelToolsService: ILanguageModelToolsService,
		@IStorageService private readonly _storageService: IStorageService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
		@ITerminalProfileResolverService private readonly _terminalProfileResolverService: ITerminalProfileResolverService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@IChatService private readonly _chatService: IChatService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService
	) {
		super();

		this._commandLineAutoApprover = this._register(_instantiationService.createInstance(CommandLineAutoApprover));
		this._osBackend = this._remoteAgentService.getEnvironment().then(remoteEnv => remoteEnv?.os ?? OS);

		// Restore terminal associations from storage
		this._restoreTerminalAssociations();
		this._register(this._terminalService.onDidDisposeInstance(e => {
			for (const [sessionId, toolTerminal] of this._sessionTerminalAssociations.entries()) {
				if (e === toolTerminal.instance) {
					this._sessionTerminalAssociations.delete(sessionId);
				}
			}
		}));
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const args = context.parameters as IRunInTerminalInputParams;

		this._alternativeRecommendation = getRecommendedToolsOverRunInTerminal(args.command, this._languageModelToolsService);
		const presentation = this._alternativeRecommendation ? 'hidden' : undefined;

		const os = await this._osBackend;
		const shell = await this._terminalProfileResolverService.getDefaultShell({
			os,
			remoteAuthority: this._remoteAgentService.getConnection()?.remoteAuthority
		});
		const language = os === OperatingSystem.Windows ? 'pwsh' : 'sh';

		let confirmationMessages: IToolConfirmationMessages | undefined;
		if (this._alternativeRecommendation) {
			confirmationMessages = undefined;
		} else {
			const subCommands = splitCommandLineIntoSubCommands(args.command, shell, os);
			const inlineSubCommands = subCommands.map(e => Array.from(extractInlineSubCommands(e, shell, os))).flat();
			const allSubCommands = [...subCommands, ...inlineSubCommands];
			const subCommandResults = allSubCommands.map(e => this._commandLineAutoApprover.isCommandAutoApproved(e, shell, os));
			const autoApproveReasons: string[] = [...subCommandResults.map(e => e.reason)];

			if (subCommandResults.every(e => e.isAutoApproved)) {
				this._logService.info('autoApprove: All sub-commands auto-approved');
				confirmationMessages = undefined;
			} else {
				this._logService.info('autoApprove: All sub-commands NOT auto-approved');
				const commandLineResults = this._commandLineAutoApprover.isCommandLineAutoApproved(args.command);
				autoApproveReasons.push(commandLineResults.reason);
				if (commandLineResults.isAutoApproved) {
					this._logService.info('autoApprove: Command line auto-approved');
					confirmationMessages = undefined;
				} else {
					this._logService.info('autoApprove: Command line NOT auto-approved');
					confirmationMessages = {
						title: args.isBackground
							? localize('runInTerminal.background', "Run command in background terminal")
							: localize('runInTerminal.foreground', "Run command in terminal"),
						message: new MarkdownString(args.explanation),
					};
				}
			}

			// TODO: Surface reason on tool part https://github.com/microsoft/vscode/pull/256793
			for (const reason of autoApproveReasons) {
				this._logService.info(`- ${reason}`);
			}
		}

		const instance = context.chatSessionId ? this._sessionTerminalAssociations.get(context.chatSessionId)?.instance : undefined;
		let toolEditedCommand: string | undefined = await this._rewriteCommandIfNeeded(args, instance, shell);
		if (toolEditedCommand === args.command) {
			toolEditedCommand = undefined;
		}

		return {
			confirmationMessages,
			presentation,
			toolSpecificData: {
				kind: 'terminal',
				commandLine: {
					original: args.command,
					toolEdited: toolEditedCommand
				},
				language,
			}
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		if (this._alternativeRecommendation) {
			return this._alternativeRecommendation;
		}

		const args = invocation.parameters as IRunInTerminalInputParams;

		this._logService.debug(`RunInTerminalTool: Invoking with options ${JSON.stringify(args)}`);

		const toolSpecificData = invocation.toolSpecificData as IChatTerminalToolInvocationData | undefined;
		if (!toolSpecificData) {
			throw new Error('toolSpecificData must be provided for this tool');
		}

		const chatSessionId = invocation.context?.sessionId;
		if (!invocation.context || chatSessionId === undefined) {
			throw new Error('A chat session ID is required for this tool');
		}

		const command = toolSpecificData.commandLine.userEdited ?? toolSpecificData.commandLine.toolEdited ?? toolSpecificData.commandLine.original;
		const didUserEditCommand = (
			toolSpecificData.commandLine.userEdited !== undefined &&
			toolSpecificData.commandLine.userEdited !== toolSpecificData.commandLine.original
		);
		const didToolEditCommand = (
			!didUserEditCommand &&
			toolSpecificData.commandLine.toolEdited !== undefined &&
			toolSpecificData.commandLine.toolEdited !== toolSpecificData.commandLine.original
		);

		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		let error: string | undefined;

		const timingStart = Date.now();
		const termId = generateUuid();

		if (args.isBackground) {
			let outputAndIdle: { terminalExecutionIdleBeforeTimeout: boolean; output: string; pollDurationMs?: number; modelOutputEvalResponse?: string } | undefined = undefined;

			this._logService.debug(`RunInTerminalTool: Creating background terminal with ID=${termId}`);
			const toolTerminal = await this._instantiationService.createInstance(ToolTerminalCreator).createTerminal(token);
			this._sessionTerminalAssociations.set(chatSessionId, toolTerminal);
			if (token.isCancellationRequested) {
				toolTerminal.instance.dispose();
				throw new CancellationError();
			}
			await this._setupTerminalAssociation(toolTerminal, chatSessionId, termId, args.isBackground);

			this._terminalService.setActiveInstance(toolTerminal.instance);
			const timingConnectMs = Date.now() - timingStart;

			try {
				this._logService.debug(`RunInTerminalTool: Starting background execution \`${command}\``);
				const xterm = await toolTerminal.instance.xtermReadyPromise;
				if (!xterm) {
					throw new Error('Instance was disposed before xterm.js was ready');
				}
				const execution = new BackgroundTerminalExecution(toolTerminal.instance, xterm, command);
				RunInTerminalTool._backgroundExecutions.set(termId, execution);
				outputAndIdle = await pollForOutputAndIdle(execution, false, token, this._languageModelsService);
				if (!outputAndIdle.terminalExecutionIdleBeforeTimeout) {
					outputAndIdle = await racePollingOrPrompt(
						() => pollForOutputAndIdle(execution, true, token, this._languageModelsService),
						() => promptForMorePolling(command, invocation.context!, this._chatService),
						outputAndIdle,
						token,
						this._languageModelsService,
						execution
					);
				}

				let resultText = (
					didUserEditCommand
						? `Note: The user manually edited the command to \`${command}\`, and that command is now running in terminal with ID=${termId}`
						: didToolEditCommand
							? `Note: The tool simplified the command to \`${command}\`, and that command is now running in terminal with ID=${termId}`
							: `Command is running in terminal with ID=${termId}`
				);
				if (outputAndIdle && outputAndIdle.modelOutputEvalResponse) {
					resultText += `\n\ The command became idle with output:\n${outputAndIdle.modelOutputEvalResponse}`;
				} else if (outputAndIdle) {
					resultText += `\n\ The command is still running, with output:\n${outputAndIdle.output}`;
				}
				return {
					content: [{
						kind: 'text',
						value: resultText,
					}]
				};
			} catch (e) {
				error = 'threw';
				if (termId) {
					RunInTerminalTool._backgroundExecutions.get(termId)?.dispose();
					RunInTerminalTool._backgroundExecutions.delete(termId);
				}
				throw e;
			} finally {
				this._logService.debug(`RunInTerminalTool: Finished polling \`${outputAndIdle?.output.length}\` lines of output in \`${outputAndIdle?.pollDurationMs}\``);
				const timingExecuteMs = Date.now() - timingStart;
				this._sendTelemetry(toolTerminal.instance, {
					didUserEditCommand,
					didToolEditCommand,
					didAcceptUserInput: false,
					shellIntegrationQuality: toolTerminal.shellIntegrationQuality,
					isBackground: true,
					error,
					exitCode: undefined,
					isNewSession: true,
					timingExecuteMs,
					timingConnectMs,
					terminalExecutionIdleBeforeTimeout: outputAndIdle?.terminalExecutionIdleBeforeTimeout,
					outputLineCount: outputAndIdle?.output ? count(outputAndIdle.output, '\n') : 0,
					pollDurationMs: outputAndIdle?.pollDurationMs,
				});
			}
		} else {
			let toolTerminal: IToolTerminal | undefined = this._sessionTerminalAssociations.get(chatSessionId);
			const isNewSession = !toolTerminal;
			if (toolTerminal) {
				this._logService.debug(`RunInTerminalTool: Using existing terminal with session ID \`${chatSessionId}\``);
			} else {
				this._logService.debug(`RunInTerminalTool: Creating terminal with session ID \`${chatSessionId}\``);
				toolTerminal = await this._instantiationService.createInstance(ToolTerminalCreator).createTerminal(token);
				this._sessionTerminalAssociations.set(chatSessionId, toolTerminal);
				if (token.isCancellationRequested) {
					toolTerminal.instance.dispose();
					throw new CancellationError();
				}
				await this._setupTerminalAssociation(toolTerminal, chatSessionId, termId, args.isBackground);
			}

			this._terminalService.setActiveInstance(toolTerminal.instance);

			const timingConnectMs = Date.now() - timingStart;

			const store = new DisposableStore();
			let didAcceptUserInput = false;
			const xterm = await toolTerminal.instance.xtermReadyPromise;
			if (xterm) {
				store.add(xterm.raw.onData(() => didAcceptUserInput = true));
			}

			let terminalResult = '';
			let outputLineCount = -1;
			let exitCode: number | undefined;
			try {
				let strategy: ITerminalExecuteStrategy;
				const commandDetection = toolTerminal.instance.capabilities.get(TerminalCapability.CommandDetection);
				switch (toolTerminal.shellIntegrationQuality) {
					case ShellIntegrationQuality.None: {
						strategy = this._instantiationService.createInstance(NoneExecuteStrategy, toolTerminal.instance);
						break;
					}
					case ShellIntegrationQuality.Basic: {
						strategy = this._instantiationService.createInstance(BasicExecuteStrategy, toolTerminal.instance, commandDetection!);
						break;
					}
					case ShellIntegrationQuality.Rich: {
						strategy = this._instantiationService.createInstance(RichExecuteStrategy, toolTerminal.instance, commandDetection!);
						break;
					}
				}
				this._logService.debug(`RunInTerminalTool: Using \`${strategy.type}\` execute strategy for command \`${command}\``);
				const executeResult = await strategy.execute(command, token);
				this._logService.debug(`RunInTerminalTool: Finished \`${strategy.type}\` execute strategy with exitCode \`${executeResult.exitCode}\`, result.length \`${executeResult.output?.length}\`, error \`${executeResult.error}\``);
				outputLineCount = executeResult.output === undefined ? 0 : count(executeResult.output.trim(), '\n') + 1;
				exitCode = executeResult.exitCode;
				error = executeResult.error;

				const resultArr: string[] = [];
				if (executeResult.output !== undefined) {
					resultArr.push(executeResult.output);
				}
				if (executeResult.additionalInformation) {
					resultArr.push(executeResult.additionalInformation);
				}
				terminalResult = resultArr.join('\n\n');

			} catch (e) {
				this._logService.debug(`RunInTerminalTool: Threw exception`);
				toolTerminal.instance.dispose();
				error = 'threw';
				throw e;
			} finally {
				store.dispose();
				const timingExecuteMs = Date.now() - timingStart;
				this._sendTelemetry(toolTerminal.instance, {
					didUserEditCommand,
					didToolEditCommand,
					didAcceptUserInput,
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

	protected async _rewriteCommandIfNeeded(args: IRunInTerminalInputParams, instance: Pick<ITerminalInstance, 'getCwdResource'> | undefined, shell: string): Promise<string> {
		const commandLine = args.command;
		const os = await this._osBackend;

		// Re-write the command if it starts with `cd <dir> && <suffix>` or `cd <dir>; <suffix>`
		// to just `<suffix>` if the directory matches the current terminal's cwd. This simplifies
		// the result in the chat by removing redundancies that some models like to add.
		const isPwsh = isPowerShell(shell, os);
		const cdPrefixMatch = commandLine.match(
			isPwsh
				? /^(?:cd(?: \/d)?|Set-Location(?: -Path)?) (?<dir>[^\s]+) ?(?:&&|;)\s+(?<suffix>.+)$/i
				: /^cd (?<dir>[^\s]+) &&\s+(?<suffix>.+)$/
		);
		const cdDir = cdPrefixMatch?.groups?.dir;
		const cdSuffix = cdPrefixMatch?.groups?.suffix;
		if (cdDir && cdSuffix) {
			let cwd: URI | undefined;

			// Get the current session terminal's cwd
			if (instance) {
				cwd = await instance.getCwdResource();
			}

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

	private _restoreTerminalAssociations(): void {
		const storedAssociations = this._storageService.get(TERMINAL_SESSION_STORAGE_KEY, StorageScope.WORKSPACE, '{}');
		try {
			const associations: Record<number, IStoredTerminalAssociation> = JSON.parse(storedAssociations);

			// Find existing terminals and associate them with sessions
			for (const instance of this._terminalService.instances) {
				if (instance.processId) {
					const association = associations[instance.processId];
					if (association) {
						this._logService.debug(`RunInTerminalTool: Restored terminal association for PID ${instance.processId}, session ${association.sessionId}`);
						const toolTerminal: IToolTerminal = {
							instance,
							shellIntegrationQuality: association.shellIntegrationQuality
						};
						this._sessionTerminalAssociations.set(association.sessionId, toolTerminal);

						// Listen for terminal disposal to clean up storage
						this._register(instance.onDisposed(() => {
							this._removeTerminalAssociation(instance.processId!);
						}));
					}
				}
			}
		} catch (error) {
			this._logService.debug(`RunInTerminalTool: Failed to restore terminal associations: ${error}`);
		}
	}

	private async _setupTerminalAssociation(toolTerminal: IToolTerminal, chatSessionId: string, termId: string, isBackground: boolean) {
		await this._associateTerminalWithSession(toolTerminal.instance, chatSessionId, termId, toolTerminal.shellIntegrationQuality, isBackground);
		this._register(toolTerminal.instance.onDisposed(() => {
			if (toolTerminal!.instance.processId) {
				this._removeTerminalAssociation(toolTerminal!.instance.processId);
			}
		}));
	}

	private async _associateTerminalWithSession(terminal: ITerminalInstance, sessionId: string, id: string, shellIntegrationQuality: ShellIntegrationQuality, isBackground?: boolean): Promise<void> {
		try {
			// Wait for process ID with timeout
			const pid = await Promise.race([
				terminal.processReady.then(() => terminal.processId),
				timeout(5000).then(() => { throw new Error('Timeout'); })
			]);

			if (typeof pid === 'number') {
				const storedAssociations = this._storageService.get(TERMINAL_SESSION_STORAGE_KEY, StorageScope.WORKSPACE, '{}');
				const associations: Record<number, IStoredTerminalAssociation> = JSON.parse(storedAssociations);

				const existingAssociation = associations[pid] || {};
				associations[pid] = {
					...existingAssociation,
					sessionId,
					shellIntegrationQuality,
					id,
					isBackground
				};

				this._storageService.store(TERMINAL_SESSION_STORAGE_KEY, JSON.stringify(associations), StorageScope.WORKSPACE, StorageTarget.USER);
				this._logService.debug(`RunInTerminalTool: Associated terminal PID ${pid} with session ${sessionId}`);
			}
		} catch (error) {
			this._logService.debug(`RunInTerminalTool: Failed to associate terminal with session: ${error}`);
		}
	}

	private async _removeTerminalAssociation(pid: number): Promise<void> {
		try {
			const storedAssociations = this._storageService.get(TERMINAL_SESSION_STORAGE_KEY, StorageScope.WORKSPACE, '{}');
			const associations: Record<number, IStoredTerminalAssociation> = JSON.parse(storedAssociations);

			if (associations[pid]) {
				delete associations[pid];
				this._storageService.store(TERMINAL_SESSION_STORAGE_KEY, JSON.stringify(associations), StorageScope.WORKSPACE, StorageTarget.USER);
				this._logService.debug(`RunInTerminalTool: Removed terminal association for PID ${pid}`);
			}
		} catch (error) {
			this._logService.debug(`RunInTerminalTool: Failed to remove terminal association: ${error}`);
		}
	}

	private _sendTelemetry(instance: ITerminalInstance, state: {
		didUserEditCommand: boolean;
		didToolEditCommand: boolean;
		didAcceptUserInput: boolean;
		error: string | undefined;
		isBackground: boolean;
		isNewSession: boolean;
		shellIntegrationQuality: ShellIntegrationQuality;
		outputLineCount: number;
		timingConnectMs: number;
		pollDurationMs?: number;
		terminalExecutionIdleBeforeTimeout?: boolean;
		timingExecuteMs: number;
		exitCode: number | undefined;
	}) {
		type TelemetryEvent = {
			terminalSessionId: string;

			result: string;
			strategy: 0 | 1 | 2;
			userEditedCommand: 0 | 1;
			toolEditedCommand: 0 | 1;
			acceptedUserInput: 0 | 1;
			isBackground: 0 | 1;
			isNewSession: 0 | 1;
			outputLineCount: number;
			nonZeroExitCode: -1 | 0 | 1;
			timingConnectMs: number;
			pollDurationMs: number;
			terminalExecutionIdleBeforeTimeout: boolean;
		};
		type TelemetryClassification = {
			owner: 'tyriar';
			comment: 'Understanding the usage of the runInTerminal tool';

			terminalSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session ID of the terminal instance.' };

			result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the tool ran successfully, or the type of error' };
			strategy: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'What strategy was used to execute the command (0=none, 1=basic, 2=rich)' };
			userEditedCommand: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the user edited the command' };
			toolEditedCommand: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the tool edited the command' };
			acceptedUserInput: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the terminal accepted user input during the execution' };
			isBackground: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the command is a background command' };
			isNewSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether this was the first execution for the terminal session' };
			outputLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How many lines of output were produced, this is -1 when isBackground is true or if there\'s an error' };
			nonZeroExitCode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the command exited with a non-zero code (-1=error/unknown, 0=zero exit code, 1=non-zero)' };
			timingConnectMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How long the terminal took to start up and connect to' };
			pollDurationMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How long the tool polled for output, this is undefined when isBackground is true or if there\'s an error' };
			terminalExecutionIdleBeforeTimeout: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Indicates whether a terminal became idle before the run-in-terminal tool timed out or was cancelled by the user. This occurs when no data events are received twice consecutively and the model determines, based on terminal output, that the command has completed.' };
		};
		this._telemetryService.publicLog2<TelemetryEvent, TelemetryClassification>('toolUse.runInTerminal', {
			terminalSessionId: instance.sessionId,
			result: state.error ?? 'success',
			strategy: state.shellIntegrationQuality === ShellIntegrationQuality.Rich ? 2 : state.shellIntegrationQuality === ShellIntegrationQuality.Basic ? 1 : 0,
			userEditedCommand: state.didUserEditCommand ? 1 : 0,
			toolEditedCommand: state.didToolEditCommand ? 1 : 0,
			acceptedUserInput: state.didAcceptUserInput ? 1 : 0,
			isBackground: state.isBackground ? 1 : 0,
			isNewSession: state.isNewSession ? 1 : 0,
			outputLineCount: state.outputLineCount,
			nonZeroExitCode: state.exitCode === undefined ? -1 : state.exitCode === 0 ? 0 : 1,
			timingConnectMs: state.timingConnectMs,
			pollDurationMs: state.pollDurationMs ?? 0,
			terminalExecutionIdleBeforeTimeout: state.terminalExecutionIdleBeforeTimeout ?? false
		});
	}
}

class BackgroundTerminalExecution extends Disposable {
	private _startMarker?: IXtermMarker;

	constructor(
		private readonly _instance: ITerminalInstance,
		private readonly _xterm: XtermTerminal,
		private readonly _commandLine: string
	) {
		super();

		this._startMarker = this._register(this._xterm.raw.registerMarker());
		this._instance.runCommand(this._commandLine, true);
	}
	getOutput(): string {
		return getOutput(this._instance, this._startMarker);
	}
}
