/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IMarker as IXtermMarker } from '@xterm/xterm';
import { asArray } from '../../../../../../base/common/arrays.js';
import { timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { createCommandUri, MarkdownString, type IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../../base/common/path.js';
import { OperatingSystem, OS } from '../../../../../../base/common/platform.js';
import { count } from '../../../../../../base/common/strings.js';
import type { SingleOrMany } from '../../../../../../base/common/types.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { TerminalCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalLogService, ITerminalProfile } from '../../../../../../platform/terminal/common/terminal.js';
import { IRemoteAgentService } from '../../../../../services/remote/common/remoteAgentService.js';
import { TerminalToolConfirmationStorageKeys } from '../../../../chat/browser/chatContentParts/toolInvocationParts/chatTerminalToolConfirmationSubPart.js';
import { openTerminalSettingsLinkCommandId } from '../../../../chat/browser/chatContentParts/toolInvocationParts/chatTerminalToolProgressPart.js';
import { IChatService, type IChatTerminalToolInvocationData } from '../../../../chat/common/chatService.js';
import { ChatConfiguration } from '../../../../chat/common/constants.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolInvocationPresentation, ToolProgress, type IToolConfirmationMessages, type ToolConfirmationAction } from '../../../../chat/common/languageModelToolsService.js';
import { ITerminalService, type ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import type { XtermTerminal } from '../../../../terminal/browser/xterm/xtermTerminal.js';
import { ITerminalProfileResolverService } from '../../../../terminal/common/terminal.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
import { getRecommendedToolsOverRunInTerminal } from '../alternativeRecommendation.js';
import { CommandLineAutoApprover, type IAutoApproveRule, type ICommandApprovalResult, type ICommandApprovalResultWithReason } from '../commandLineAutoApprover.js';
import { CommandSimplifier } from '../commandSimplifier.js';
import { BasicExecuteStrategy } from '../executeStrategy/basicExecuteStrategy.js';
import type { ITerminalExecuteStrategy } from '../executeStrategy/executeStrategy.js';
import { NoneExecuteStrategy } from '../executeStrategy/noneExecuteStrategy.js';
import { RichExecuteStrategy } from '../executeStrategy/richExecuteStrategy.js';
import { getOutput } from '../outputHelpers.js';
import { dedupeRules, generateAutoApproveActions, isPowerShell } from '../runInTerminalHelpers.js';
import { RunInTerminalToolTelemetry } from '../runInTerminalToolTelemetry.js';
import { splitCommandLineIntoSubCommands } from '../subCommands.js';
import { ShellIntegrationQuality, ToolTerminalCreator, type IToolTerminal } from '../toolTerminalCreator.js';
import { OutputMonitor } from './monitoring/outputMonitor.js';
import { IPollingResult, OutputMonitorState } from './monitoring/types.js';

const enum TerminalToolStorageKeysInternal {
	TerminalSession = 'chat.terminalSessions'
}

interface IStoredTerminalAssociation {
	sessionId: string;
	id: string;
	shellIntegrationQuality: ShellIntegrationQuality;
	isBackground?: boolean;
}

export const RunInTerminalToolData: IToolData = {
	id: 'run_in_terminal',
	toolReferenceName: 'runInTerminal',
	displayName: localize('runInTerminalTool.displayName', 'Run in Terminal'),
	modelDescription: [
		'This tool allows you to execute shell commands in a persistent terminal session, preserving environment variables, working directory, and other context across multiple commands.',
		'',
		'Command Execution:',
		// TODO: Multi-line command execution does work, but it requires AST parsing to pull
		// sub-commands out reliably https://github.com/microsoft/vscode/issues/261794
		'- Does NOT support multi-line commands',
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
	icon: Codicon.terminal,
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

/**
 * A set of characters to ignore when reporting telemetry
 */
const telemetryIgnoredSequences = [
	'\x1b[I', // Focus in
	'\x1b[O', // Focus out
];

const promptInjectionWarningCommandsLower = [
	'curl',
	'wget',
];
const promptInjectionWarningCommandsLowerPwshOnly = [
	'invoke-restmethod',
	'invoke-webrequest',
	'irm',
	'iwr',
];

export class RunInTerminalTool extends Disposable implements IToolImpl {

	private readonly _terminalToolCreator: ToolTerminalCreator;
	private readonly _commandSimplifier: CommandSimplifier;
	private readonly _telemetry: RunInTerminalToolTelemetry;
	protected readonly _commandLineAutoApprover: CommandLineAutoApprover;
	protected readonly _sessionTerminalAssociations: Map<string, IToolTerminal> = new Map();

	// Immutable window state
	protected readonly _osBackend: Promise<OperatingSystem>;

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
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILanguageModelToolsService private readonly _languageModelToolsService: ILanguageModelToolsService,
		@IStorageService private readonly _storageService: IStorageService,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
		@ITerminalProfileResolverService private readonly _terminalProfileResolverService: ITerminalProfileResolverService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@IChatService private readonly _chatService: IChatService
	) {
		super();

		this._osBackend = this._remoteAgentService.getEnvironment().then(remoteEnv => remoteEnv?.os ?? OS);

		this._terminalToolCreator = _instantiationService.createInstance(ToolTerminalCreator);
		this._commandSimplifier = _instantiationService.createInstance(CommandSimplifier, this._osBackend);
		this._telemetry = _instantiationService.createInstance(RunInTerminalToolTelemetry);
		this._commandLineAutoApprover = this._register(_instantiationService.createInstance(CommandLineAutoApprover));

		// Clear out warning accepted state if the setting is disabled
		this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, e => {
			if (!e || e.affectsConfiguration(TerminalChatAgentToolsSettingId.EnableAutoApprove)) {
				if (this._configurationService.getValue(TerminalChatAgentToolsSettingId.EnableAutoApprove) !== true) {
					this._storageService.remove(TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted, StorageScope.APPLICATION);
				}
			}
		}));

		// Restore terminal associations from storage
		this._restoreTerminalAssociations();
		this._register(this._terminalService.onDidDisposeInstance(e => {
			for (const [sessionId, toolTerminal] of this._sessionTerminalAssociations.entries()) {
				if (e === toolTerminal.instance) {
					this._sessionTerminalAssociations.delete(sessionId);
				}
			}
		}));

		// Listen for chat session disposal to clean up associated terminals
		this._register(this._chatService.onDidDisposeSession(e => {
			this._cleanupSessionTerminals(e.sessionId);
		}));
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const args = context.parameters as IRunInTerminalInputParams;

		const alternativeRecommendation = getRecommendedToolsOverRunInTerminal(args.command, this._languageModelToolsService);
		const presentation = alternativeRecommendation ? ToolInvocationPresentation.Hidden : undefined;

		const os = await this._osBackend;
		const shell = await this._getCopilotShell();
		const language = os === OperatingSystem.Windows ? 'pwsh' : 'sh';

		const instance = context.chatSessionId ? this._sessionTerminalAssociations.get(context.chatSessionId)?.instance : undefined;
		const terminalToolSessionId = generateUuid();

		let toolEditedCommand: string | undefined = await this._commandSimplifier.rewriteIfNeeded(args, instance, shell);
		if (toolEditedCommand === args.command) {
			toolEditedCommand = undefined;
		}

		let autoApproveInfo: IMarkdownString | undefined;
		let confirmationMessages: IToolConfirmationMessages | undefined;
		if (alternativeRecommendation) {
			confirmationMessages = undefined;
		} else {
			// Determine auto approval, this happens even when auto approve is off to that reasoning
			// can be reviewed in the terminal channel. It also allows gauging the effective set of
			// commands that would be auto approved if it were enabled.
			const actualCommand = toolEditedCommand ?? args.command;
			const subCommands = splitCommandLineIntoSubCommands(actualCommand, shell, os);
			const subCommandResults = subCommands.map(e => this._commandLineAutoApprover.isCommandAutoApproved(e, shell, os));
			const commandLineResult = this._commandLineAutoApprover.isCommandLineAutoApproved(actualCommand);
			const autoApproveReasons: string[] = [
				...subCommandResults.map(e => e.reason),
				commandLineResult.reason,
			];

			let isAutoApproved = false;
			let isDenied = false;
			let autoApproveReason: 'subCommand' | 'commandLine' | undefined;
			let autoApproveDefault: boolean | undefined;

			const deniedSubCommandResult = subCommandResults.find(e => e.result === 'denied');
			if (deniedSubCommandResult) {
				this._logService.info('autoApprove: Sub-command DENIED auto approval');
				isDenied = true;
				autoApproveDefault = deniedSubCommandResult.rule?.isDefaultRule;
				autoApproveReason = 'subCommand';
			} else if (commandLineResult.result === 'denied') {
				this._logService.info('autoApprove: Command line DENIED auto approval');
				isDenied = true;
				autoApproveDefault = commandLineResult.rule?.isDefaultRule;
				autoApproveReason = 'commandLine';
			} else {
				if (subCommandResults.every(e => e.result === 'approved')) {
					this._logService.info('autoApprove: All sub-commands auto-approved');
					autoApproveReason = 'subCommand';
					isAutoApproved = true;
					autoApproveDefault = subCommandResults.every(e => e.rule?.isDefaultRule);
				} else {
					this._logService.info('autoApprove: All sub-commands NOT auto-approved');
					if (commandLineResult.result === 'approved') {
						this._logService.info('autoApprove: Command line auto-approved');
						autoApproveReason = 'commandLine';
						isAutoApproved = true;
						autoApproveDefault = commandLineResult.rule?.isDefaultRule;
					} else {
						this._logService.info('autoApprove: Command line NOT auto-approved');
					}
				}
			}

			// Log detailed auto approval reasoning
			for (const reason of autoApproveReasons) {
				this._logService.info(`- ${reason}`);
			}

			// Apply auto approval or force it off depending on enablement/opt-in state
			const isAutoApproveEnabled = this._configurationService.getValue(TerminalChatAgentToolsSettingId.EnableAutoApprove) === true;
			const isAutoApproveWarningAccepted = this._storageService.getBoolean(TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted, StorageScope.APPLICATION, false);
			const isAutoApproveAllowed = isAutoApproveEnabled && isAutoApproveWarningAccepted;
			if (isAutoApproveEnabled) {
				autoApproveInfo = this._createAutoApproveInfo(
					isAutoApproved,
					isDenied,
					autoApproveReason,
					subCommandResults,
					commandLineResult,
				);
			} else {
				isAutoApproved = false;
			}

			// Send telemetry about auto approval process
			this._telemetry.logPrepare({
				terminalToolSessionId,
				subCommands,
				autoApproveAllowed: !isAutoApproveEnabled ? 'off' : isAutoApproveWarningAccepted ? 'allowed' : 'needsOptIn',
				autoApproveResult: isAutoApproved ? 'approved' : isDenied ? 'denied' : 'manual',
				autoApproveReason,
				autoApproveDefault
			});

			// Add a disclaimer warning about prompt injection for common commands that return
			// content from the web
			let disclaimer: IMarkdownString | undefined;
			const subCommandsLowerFirstWordOnly = subCommands.map(command => command.split(' ')[0].toLowerCase());
			if (!isAutoApproved && (
				subCommandsLowerFirstWordOnly.some(command => promptInjectionWarningCommandsLower.includes(command)) ||
				(isPowerShell(shell, os) && subCommandsLowerFirstWordOnly.some(command => promptInjectionWarningCommandsLowerPwshOnly.includes(command)))
			)) {
				disclaimer = new MarkdownString(`$(${Codicon.info.id}) ` + localize('runInTerminal.promptInjectionDisclaimer', 'Web content may contain malicious code or attempt prompt injection attacks.'), { supportThemeIcons: true });
			}

			let customActions: ToolConfirmationAction[] | undefined;
			if (!isAutoApproved && isAutoApproveEnabled) {
				customActions = generateAutoApproveActions(actualCommand, subCommands, { subCommandResults, commandLineResult });
			}

			let shellType = basename(shell, '.exe');
			if (shellType === 'powershell') {
				shellType = 'pwsh';
			}
			confirmationMessages = (isAutoApproved && isAutoApproveAllowed) ? undefined : {
				title: args.isBackground
					? localize('runInTerminal.background', "Run `{0}` command? (background terminal)", shellType)
					: localize('runInTerminal', "Run `{0}` command?", shellType),
				message: new MarkdownString(args.explanation),
				disclaimer,
				terminalCustomActions: customActions,
			};
		}

		return {
			confirmationMessages,
			presentation,
			toolSpecificData: {
				kind: 'terminal',
				terminalToolSessionId,
				commandLine: {
					original: args.command,
					toolEdited: toolEditedCommand
				},
				language,
				alternativeRecommendation,
				autoApproveInfo,
			}
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const toolSpecificData = invocation.toolSpecificData as IChatTerminalToolInvocationData | undefined;
		if (!toolSpecificData) {
			throw new Error('toolSpecificData must be provided for this tool');
		}
		if (toolSpecificData.alternativeRecommendation) {
			return {
				content: [{
					kind: 'text',
					value: toolSpecificData.alternativeRecommendation
				}]
			};
		}

		const args = invocation.parameters as IRunInTerminalInputParams;
		this._logService.debug(`RunInTerminalTool: Invoking with options ${JSON.stringify(args)}`);
		let toolResultMessage: string | undefined;

		const chatSessionId = invocation.context?.sessionId ?? 'no-chat-session';
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
		const isNewSession = !args.isBackground && !this._sessionTerminalAssociations.has(chatSessionId);

		const timingStart = Date.now();
		const termId = generateUuid();

		const store = new DisposableStore();

		this._logService.debug(`RunInTerminalTool: Creating ${args.isBackground ? 'background' : 'foreground'} terminal. termId=${termId}, chatSessionId=${chatSessionId}`);
		const toolTerminal = await (args.isBackground
			? this._initBackgroundTerminal(chatSessionId, termId, token)
			: this._initForegroundTerminal(chatSessionId, termId, token));

		this._terminalService.setActiveInstance(toolTerminal.instance);
		this._terminalService.revealTerminal(toolTerminal.instance, true);
		const timingConnectMs = Date.now() - timingStart;

		const xterm = await toolTerminal.instance.xtermReadyPromise;
		if (!xterm) {
			throw new Error('Instance was disposed before xterm.js was ready');
		}

		let inputUserChars = 0;
		let inputUserSigint = false;
		store.add(xterm.raw.onData(data => {
			if (!telemetryIgnoredSequences.includes(data)) {
				inputUserChars += data.length;
			}
			inputUserSigint ||= data === '\x03';
		}));

		let outputMonitor: OutputMonitor | undefined;
		if (args.isBackground) {
			let pollingResult: IPollingResult & { pollDurationMs: number } | undefined;
			try {
				this._logService.debug(`RunInTerminalTool: Starting background execution \`${command}\``);
				const execution = new BackgroundTerminalExecution(toolTerminal.instance, xterm, command, chatSessionId);
				RunInTerminalTool._backgroundExecutions.set(termId, execution);

				outputMonitor = store.add(this._instantiationService.createInstance(OutputMonitor, execution, undefined, invocation.context!, token, command));
				await Event.toPromise(outputMonitor.onDidFinishCommand);
				const pollingResult = outputMonitor.pollingResult;

				if (token.isCancellationRequested) {
					throw new CancellationError();
				}

				let resultText = (
					didUserEditCommand
						? `Note: The user manually edited the command to \`${command}\`, and that command is now running in terminal with ID=${termId}`
						: didToolEditCommand
							? `Note: The tool simplified the command to \`${command}\`, and that command is now running in terminal with ID=${termId}`
							: `Command is running in terminal with ID=${termId}`
				);
				if (pollingResult && pollingResult.modelOutputEvalResponse) {
					resultText += `\n\ The command became idle with output:\n${pollingResult.modelOutputEvalResponse}`;
				} else if (pollingResult) {
					resultText += `\n\ The command is still running, with output:\n${pollingResult.output}`;
				}

				const toolResultMessage = toolSpecificData.autoApproveInfo;
				return {
					toolResultMessage: toolResultMessage,
					toolMetadata: {
						exitCode: undefined // Background processes don't have immediate exit codes
					},
					content: [{
						kind: 'text',
						value: resultText,
					}]
				};
			} catch (e) {
				if (termId) {
					RunInTerminalTool._backgroundExecutions.get(termId)?.dispose();
					RunInTerminalTool._backgroundExecutions.delete(termId);
				}
				error = e instanceof CancellationError ? 'canceled' : 'unexpectedException';
				throw e;
			} finally {
				store.dispose();
				this._logService.debug(`RunInTerminalTool: Finished polling \`${pollingResult?.output.length}\` lines of output in \`${pollingResult?.pollDurationMs}\``);
				const timingExecuteMs = Date.now() - timingStart;
				this._telemetry.logInvoke(toolTerminal.instance, {
					terminalToolSessionId: toolSpecificData.terminalToolSessionId,
					didUserEditCommand,
					didToolEditCommand,
					shellIntegrationQuality: toolTerminal.shellIntegrationQuality,
					isBackground: true,
					error,
					exitCode: undefined,
					isNewSession: true,
					timingExecuteMs,
					timingConnectMs,
					terminalExecutionIdleBeforeTimeout: pollingResult?.state === OutputMonitorState.Idle,
					outputLineCount: pollingResult?.output ? count(pollingResult.output, '\n') : 0,
					pollDurationMs: pollingResult?.pollDurationMs,
					inputUserChars,
					inputUserSigint,
					inputToolManualAcceptCount: outputMonitor?.outputMonitorTelemetryCounters.inputToolManualAcceptCount,
					inputToolManualRejectCount: outputMonitor?.outputMonitorTelemetryCounters.inputToolManualRejectCount,
					inputToolManualChars: outputMonitor?.outputMonitorTelemetryCounters.inputToolManualChars,
					inputToolAutoAcceptCount: outputMonitor?.outputMonitorTelemetryCounters.inputToolAutoAcceptCount,
					inputToolAutoChars: outputMonitor?.outputMonitorTelemetryCounters.inputToolAutoChars,
					inputToolManualShownCount: outputMonitor?.outputMonitorTelemetryCounters.inputToolManualShownCount,
					inputToolFreeFormInputCount: outputMonitor?.outputMonitorTelemetryCounters.inputToolFreeFormInputCount,
					inputToolFreeFormInputShownCount: outputMonitor?.outputMonitorTelemetryCounters.inputToolFreeFormInputShownCount
				});
			}
		} else {
			let terminalResult = '';

			let outputLineCount = -1;
			let exitCode: number | undefined;
			try {
				let strategy: ITerminalExecuteStrategy;
				const commandDetection = toolTerminal.instance.capabilities.get(TerminalCapability.CommandDetection);
				switch (toolTerminal.shellIntegrationQuality) {
					case ShellIntegrationQuality.None: {
						strategy = this._instantiationService.createInstance(NoneExecuteStrategy, toolTerminal.instance, () => toolTerminal.receivedUserInput ?? false);
						toolResultMessage = '$(info) Enable [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration) to improve command detection';
						break;
					}
					case ShellIntegrationQuality.Basic: {
						strategy = this._instantiationService.createInstance(BasicExecuteStrategy, toolTerminal.instance, () => toolTerminal.receivedUserInput ?? false, commandDetection!);
						break;
					}
					case ShellIntegrationQuality.Rich: {
						strategy = this._instantiationService.createInstance(RichExecuteStrategy, toolTerminal.instance, commandDetection!);
						break;
					}
				}
				this._logService.debug(`RunInTerminalTool: Using \`${strategy.type}\` execute strategy for command \`${command}\``);
				store.add(strategy.onDidCreateStartMarker(startMarker => {
					if (!outputMonitor) {
						outputMonitor = store.add(this._instantiationService.createInstance(OutputMonitor, { instance: toolTerminal.instance, sessionId: invocation.context?.sessionId, getOutput: (marker?: IXtermMarker) => getOutput(toolTerminal.instance, marker ?? startMarker) }, undefined, invocation.context, token, command));
					}
				}));
				const executeResult = await strategy.execute(command, token);
				// Reset user input state after command execution completes
				toolTerminal.receivedUserInput = false;
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}

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
				error = e instanceof CancellationError ? 'canceled' : 'unexpectedException';
				throw e;
			} finally {
				store.dispose();
				const timingExecuteMs = Date.now() - timingStart;
				this._telemetry.logInvoke(toolTerminal.instance, {
					terminalToolSessionId: toolSpecificData.terminalToolSessionId,
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
					inputUserChars,
					inputUserSigint,
					terminalExecutionIdleBeforeTimeout: undefined,
					pollDurationMs: undefined,
					inputToolManualAcceptCount: outputMonitor?.outputMonitorTelemetryCounters?.inputToolManualAcceptCount,
					inputToolManualRejectCount: outputMonitor?.outputMonitorTelemetryCounters?.inputToolManualRejectCount,
					inputToolManualChars: outputMonitor?.outputMonitorTelemetryCounters?.inputToolManualChars,
					inputToolAutoAcceptCount: outputMonitor?.outputMonitorTelemetryCounters?.inputToolAutoAcceptCount,
					inputToolAutoChars: outputMonitor?.outputMonitorTelemetryCounters?.inputToolAutoChars,
					inputToolManualShownCount: outputMonitor?.outputMonitorTelemetryCounters?.inputToolManualShownCount,
					inputToolFreeFormInputCount: outputMonitor?.outputMonitorTelemetryCounters?.inputToolFreeFormInputCount,
					inputToolFreeFormInputShownCount: outputMonitor?.outputMonitorTelemetryCounters?.inputToolFreeFormInputShownCount
				});
			}

			const resultText: string[] = [];
			if (didUserEditCommand) {
				resultText.push(`Note: The user manually edited the command to \`${command}\`, and this is the output of running that command instead:\n`);
			} else if (didToolEditCommand) {
				resultText.push(`Note: The tool simplified the command to \`${command}\`, and this is the output of running that command instead:\n`);
			}
			resultText.push(terminalResult);

			let resolvedToolResultMessage: IMarkdownString | undefined;
			if (toolSpecificData.autoApproveInfo) {
				if (toolResultMessage) {
					resolvedToolResultMessage = new MarkdownString(`${toolSpecificData.autoApproveInfo.value}\n\n${toolResultMessage}`, toolSpecificData.autoApproveInfo);
				} else {
					resolvedToolResultMessage = toolSpecificData.autoApproveInfo;
				}
			}

			return {
				toolResultMessage: resolvedToolResultMessage,
				toolMetadata: {
					exitCode: exitCode
				},
				content: [{
					kind: 'text',
					value: resultText.join(''),
				}]
			};
		}
	}

	// #region Terminal init

	protected async _getCopilotShellOrProfile(): Promise<string | ITerminalProfile> {
		const os = await this._osBackend;

		// Check for chat agent terminal profile first
		const customChatAgentProfile = this._getChatTerminalProfile(os);
		if (customChatAgentProfile) {
			return customChatAgentProfile;
		}

		// When setting is null, use the previous behavior
		const defaultShell = await this._terminalProfileResolverService.getDefaultShell({
			os,
			remoteAuthority: this._remoteAgentService.getConnection()?.remoteAuthority
		});

		// Force pwsh over cmd as cmd doesn't have shell integration
		if (basename(defaultShell) === 'cmd.exe') {
			return 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
		}

		return defaultShell;
	}

	private async _getCopilotShell(): Promise<string> {
		const shellOrProfile = await this._getCopilotShellOrProfile();
		if (typeof shellOrProfile === 'string') {
			return shellOrProfile;
		}
		return shellOrProfile.path;
	}

	private _getChatTerminalProfile(os: OperatingSystem): ITerminalProfile | undefined {
		let profileSetting: string;
		switch (os) {
			case OperatingSystem.Windows:
				profileSetting = TerminalChatAgentToolsSettingId.TerminalProfileWindows;
				break;
			case OperatingSystem.Macintosh:
				profileSetting = TerminalChatAgentToolsSettingId.TerminalProfileMacOs;
				break;
			case OperatingSystem.Linux:
			default:
				profileSetting = TerminalChatAgentToolsSettingId.TerminalProfileLinux;
				break;
		}

		const profile = this._configurationService.getValue(profileSetting);
		if (this._isValidChatAgentTerminalProfile(profile)) {
			return profile;
		}

		return undefined;
	}

	private _isValidChatAgentTerminalProfile(profile: unknown): profile is ITerminalProfile {
		if (profile === null || profile === undefined || typeof profile !== 'object') {
			return false;
		}
		if ('path' in profile && typeof (profile as { path: unknown }).path === 'string') {
			return true;
		}
		return false;
	}

	private async _initBackgroundTerminal(chatSessionId: string, termId: string, token: CancellationToken): Promise<IToolTerminal> {
		this._logService.debug(`RunInTerminalTool: Creating background terminal with ID=${termId}`);
		const shellOrProfile = await this._getCopilotShellOrProfile();
		const toolTerminal = await this._terminalToolCreator.createTerminal(shellOrProfile, token);
		this._registerInputListener(toolTerminal);
		this._sessionTerminalAssociations.set(chatSessionId, toolTerminal);
		if (token.isCancellationRequested) {
			toolTerminal.instance.dispose();
			throw new CancellationError();
		}
		await this._setupProcessIdAssociation(toolTerminal, chatSessionId, termId, true);
		return toolTerminal;
	}

	private async _initForegroundTerminal(chatSessionId: string, termId: string, token: CancellationToken): Promise<IToolTerminal> {
		const cachedTerminal = this._sessionTerminalAssociations.get(chatSessionId);
		if (cachedTerminal) {
			this._logService.debug(`RunInTerminalTool: Using cached foreground terminal with session ID \`${chatSessionId}\``);
			this._terminalToolCreator.refreshShellIntegrationQuality(cachedTerminal);
			return cachedTerminal;
		}
		const shellOrProfile = await this._getCopilotShellOrProfile();
		const toolTerminal = await this._terminalToolCreator.createTerminal(shellOrProfile, token);
		this._registerInputListener(toolTerminal);
		this._sessionTerminalAssociations.set(chatSessionId, toolTerminal);
		if (token.isCancellationRequested) {
			toolTerminal.instance.dispose();
			throw new CancellationError();
		}
		await this._setupProcessIdAssociation(toolTerminal, chatSessionId, termId, false);
		return toolTerminal;
	}

	private _registerInputListener(toolTerminal: IToolTerminal): void {
		const disposable = toolTerminal.instance.onData(data => {
			if (!telemetryIgnoredSequences.includes(data)) {
				toolTerminal.receivedUserInput = data.length > 0;
			}
		});
		this._register(toolTerminal.instance.onDisposed(() => disposable.dispose()));
	}


	// #endregion

	// #region Session management

	private _restoreTerminalAssociations(): void {
		const storedAssociations = this._storageService.get(TerminalToolStorageKeysInternal.TerminalSession, StorageScope.WORKSPACE, '{}');
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
							this._removeProcessIdAssociation(instance.processId!);
						}));
					}
				}
			}
		} catch (error) {
			this._logService.debug(`RunInTerminalTool: Failed to restore terminal associations: ${error}`);
		}
	}

	private async _setupProcessIdAssociation(toolTerminal: IToolTerminal, chatSessionId: string, termId: string, isBackground: boolean) {
		await this._associateProcessIdWithSession(toolTerminal.instance, chatSessionId, termId, toolTerminal.shellIntegrationQuality, isBackground);
		this._register(toolTerminal.instance.onDisposed(() => {
			if (toolTerminal!.instance.processId) {
				this._removeProcessIdAssociation(toolTerminal!.instance.processId);
			}
		}));
	}

	private async _associateProcessIdWithSession(terminal: ITerminalInstance, sessionId: string, id: string, shellIntegrationQuality: ShellIntegrationQuality, isBackground?: boolean): Promise<void> {
		try {
			// Wait for process ID with timeout
			const pid = await Promise.race([
				terminal.processReady.then(() => terminal.processId),
				timeout(5000).then(() => { throw new Error('Timeout'); })
			]);

			if (typeof pid === 'number') {
				const storedAssociations = this._storageService.get(TerminalToolStorageKeysInternal.TerminalSession, StorageScope.WORKSPACE, '{}');
				const associations: Record<number, IStoredTerminalAssociation> = JSON.parse(storedAssociations);

				const existingAssociation = associations[pid] || {};
				associations[pid] = {
					...existingAssociation,
					sessionId,
					shellIntegrationQuality,
					id,
					isBackground
				};

				this._storageService.store(TerminalToolStorageKeysInternal.TerminalSession, JSON.stringify(associations), StorageScope.WORKSPACE, StorageTarget.USER);
				this._logService.debug(`RunInTerminalTool: Associated terminal PID ${pid} with session ${sessionId}`);
			}
		} catch (error) {
			this._logService.debug(`RunInTerminalTool: Failed to associate terminal with session: ${error}`);
		}
	}

	private async _removeProcessIdAssociation(pid: number): Promise<void> {
		try {
			const storedAssociations = this._storageService.get(TerminalToolStorageKeysInternal.TerminalSession, StorageScope.WORKSPACE, '{}');
			const associations: Record<number, IStoredTerminalAssociation> = JSON.parse(storedAssociations);

			if (associations[pid]) {
				delete associations[pid];
				this._storageService.store(TerminalToolStorageKeysInternal.TerminalSession, JSON.stringify(associations), StorageScope.WORKSPACE, StorageTarget.USER);
				this._logService.debug(`RunInTerminalTool: Removed terminal association for PID ${pid}`);
			}
		} catch (error) {
			this._logService.debug(`RunInTerminalTool: Failed to remove terminal association: ${error}`);
		}
	}

	private _cleanupSessionTerminals(sessionId: string): void {
		const toolTerminal = this._sessionTerminalAssociations.get(sessionId);
		if (toolTerminal) {
			this._logService.debug(`RunInTerminalTool: Cleaning up terminal for disposed chat session ${sessionId}`);

			this._sessionTerminalAssociations.delete(sessionId);
			toolTerminal.instance.dispose();

			// Clean up any background executions associated with this session
			const terminalToRemove: string[] = [];
			for (const [termId, execution] of RunInTerminalTool._backgroundExecutions.entries()) {
				if (execution.instance === toolTerminal.instance) {
					execution.dispose();
					terminalToRemove.push(termId);
				}
			}
			for (const termId of terminalToRemove) {
				RunInTerminalTool._backgroundExecutions.delete(termId);
			}
		}
	}

	// #endregion

	// #region Auto approve

	private _createAutoApproveInfo(
		isAutoApproved: boolean,
		isDenied: boolean,
		autoApproveReason: 'subCommand' | 'commandLine' | undefined,
		subCommandResults: ICommandApprovalResultWithReason[],
		commandLineResult: ICommandApprovalResultWithReason,
	): MarkdownString | undefined {
		const formatRuleLinks = (result: SingleOrMany<{ result: ICommandApprovalResult; rule?: IAutoApproveRule; reason: string }>): string => {
			return asArray(result).map(e => {
				const settingsUri = createCommandUri(openTerminalSettingsLinkCommandId, e.rule!.sourceTarget);
				return `[\`${e.rule!.sourceText}\`](${settingsUri.toString()} "${localize('ruleTooltip', 'View rule in settings')}")`;
			}).join(', ');
		};

		const mdTrustSettings = {
			isTrusted: {
				enabledCommands: [openTerminalSettingsLinkCommandId]
			}
		};

		const config = this._configurationService.inspect<boolean | Record<string, boolean>>(ChatConfiguration.GlobalAutoApprove);
		const isGlobalAutoApproved = config?.value ?? config.defaultValue;
		if (isGlobalAutoApproved) {
			const settingsUri = createCommandUri(openTerminalSettingsLinkCommandId, 'global');
			return new MarkdownString(`_${localize('autoApprove.global', 'Auto approved by setting {0}', `[\`${ChatConfiguration.GlobalAutoApprove}\`](${settingsUri.toString()} "${localize('ruleTooltip.global', 'View settings')}")`)}_`, mdTrustSettings);
		}

		if (isAutoApproved) {
			switch (autoApproveReason) {
				case 'commandLine': {
					if (commandLineResult.rule) {
						return new MarkdownString(`_${localize('autoApprove.rule', 'Auto approved by rule {0}', formatRuleLinks(commandLineResult))}_`, mdTrustSettings);
					}
					break;
				}
				case 'subCommand': {
					const uniqueRules = dedupeRules(subCommandResults);
					if (uniqueRules.length === 1) {
						return new MarkdownString(`_${localize('autoApprove.rule', 'Auto approved by rule {0}', formatRuleLinks(uniqueRules))}_`, mdTrustSettings);
					} else if (uniqueRules.length > 1) {
						return new MarkdownString(`_${localize('autoApprove.rules', 'Auto approved by rules {0}', formatRuleLinks(uniqueRules))}_`, mdTrustSettings);
					}
					break;
				}
			}
		} else if (isDenied) {
			switch (autoApproveReason) {
				case 'commandLine': {
					if (commandLineResult.rule) {
						return new MarkdownString(`_${localize('autoApproveDenied.rule', 'Auto approval denied by rule {0}', formatRuleLinks(commandLineResult))}_`, mdTrustSettings);
					}
					break;
				}
				case 'subCommand': {
					const uniqueRules = dedupeRules(subCommandResults.filter(e => e.result === 'denied'));
					if (uniqueRules.length === 1) {
						return new MarkdownString(`_${localize('autoApproveDenied.rule', 'Auto approval denied by rule {0}', formatRuleLinks(uniqueRules))}_`);
					} else if (uniqueRules.length > 1) {
						return new MarkdownString(`_${localize('autoApproveDenied.rules', 'Auto approval denied by rules {0}', formatRuleLinks(uniqueRules))}_`);
					}
					break;
				}
			}
		}

		return undefined;
	}

	// #endregion
}

class BackgroundTerminalExecution extends Disposable {
	private _startMarker?: IXtermMarker;

	constructor(
		readonly instance: ITerminalInstance,
		private readonly _xterm: XtermTerminal,
		private readonly _commandLine: string,
		readonly sessionId: string
	) {
		super();

		this._startMarker = this._register(this._xterm.raw.registerMarker());
		this.instance.runCommand(this._commandLine, true);
	}
	getOutput(marker?: IXtermMarker): string {
		return getOutput(this.instance, marker ?? this._startMarker);
	}
}
