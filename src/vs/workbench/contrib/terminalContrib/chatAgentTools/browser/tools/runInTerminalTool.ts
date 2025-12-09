/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IMarker as IXtermMarker } from '@xterm/xterm';
import { timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { MarkdownString, type IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../../base/common/path.js';
import { OperatingSystem, OS } from '../../../../../../base/common/platform.js';
import { count } from '../../../../../../base/common/strings.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService, type ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { TerminalCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalLogService, ITerminalProfile } from '../../../../../../platform/terminal/common/terminal.js';
import { IRemoteAgentService } from '../../../../../services/remote/common/remoteAgentService.js';
import { TerminalToolConfirmationStorageKeys } from '../../../../chat/browser/chatContentParts/toolInvocationParts/chatTerminalToolConfirmationSubPart.js';
import { IChatService, type IChatTerminalToolInvocationData } from '../../../../chat/common/chatService.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolInvocationPresentation, ToolProgress } from '../../../../chat/common/languageModelToolsService.js';
import { ITerminalChatService, ITerminalService, type ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import type { XtermTerminal } from '../../../../terminal/browser/xterm/xtermTerminal.js';
import { ITerminalProfileResolverService } from '../../../../terminal/common/terminal.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
import { getRecommendedToolsOverRunInTerminal } from '../alternativeRecommendation.js';
import { BasicExecuteStrategy } from '../executeStrategy/basicExecuteStrategy.js';
import type { ITerminalExecuteStrategy } from '../executeStrategy/executeStrategy.js';
import { NoneExecuteStrategy } from '../executeStrategy/noneExecuteStrategy.js';
import { RichExecuteStrategy } from '../executeStrategy/richExecuteStrategy.js';
import { getOutput } from '../outputHelpers.js';
import { isFish, isPowerShell, isWindowsPowerShell, isZsh } from '../runInTerminalHelpers.js';
import { RunInTerminalToolTelemetry } from '../runInTerminalToolTelemetry.js';
import { ShellIntegrationQuality, ToolTerminalCreator, type IToolTerminal } from '../toolTerminalCreator.js';
import { TreeSitterCommandParser, TreeSitterCommandParserLanguage } from '../treeSitterCommandParser.js';
import { type ICommandLineAnalyzer, type ICommandLineAnalyzerOptions } from './commandLineAnalyzer/commandLineAnalyzer.js';
import { CommandLineAutoApproveAnalyzer } from './commandLineAnalyzer/commandLineAutoApproveAnalyzer.js';
import { CommandLineFileWriteAnalyzer } from './commandLineAnalyzer/commandLineFileWriteAnalyzer.js';
import { OutputMonitor } from './monitoring/outputMonitor.js';
import { IPollingResult, OutputMonitorState } from './monitoring/types.js';
import { LocalChatSessionUri } from '../../../../chat/common/chatUri.js';
import type { ICommandLineRewriter } from './commandLineRewriter/commandLineRewriter.js';
import { CommandLineCdPrefixRewriter } from './commandLineRewriter/commandLineCdPrefixRewriter.js';
import { CommandLinePwshChainOperatorRewriter } from './commandLineRewriter/commandLinePwshChainOperatorRewriter.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IHistoryService } from '../../../../../services/history/common/history.js';
import { TerminalCommandArtifactCollector } from './terminalCommandArtifactCollector.js';
import { isNumber, isString } from '../../../../../../base/common/types.js';
import { ChatConfiguration } from '../../../../chat/common/constants.js';
import { IChatWidgetService } from '../../../../chat/browser/chat.js';

// #region Tool data

const TOOL_REFERENCE_NAME = 'runInTerminal';
const LEGACY_TOOL_REFERENCE_FULL_NAMES = ['runCommands/runInTerminal'];

function createPowerShellModelDescription(shell: string): string {
	const isWinPwsh = isWindowsPowerShell(shell);
	return [
		`This tool allows you to execute ${isWinPwsh ? 'Windows PowerShell 5.1' : 'PowerShell'} commands in a persistent terminal session, preserving environment variables, working directory, and other context across multiple commands.`,
		'',
		'Command Execution:',
		// IMPORTANT: PowerShell 5 does not support `&&` so always re-write them to `;`. Note that
		// the behavior of `&&` differs a little from `;` but in general it's fine
		isWinPwsh ? '- Use semicolons ; to chain commands on one line, NEVER use && even when asked explicitly' : '- Prefer ; when chaining commands on one line',
		'- Prefer pipelines | for object-based data flow',
		'- Never create a sub-shell (eg. powershell -c "command") unless explicitly asked',
		'',
		'Directory Management:',
		'- Must use absolute paths to avoid navigation issues',
		'- Use $PWD or Get-Location for current directory',
		'- Use Push-Location/Pop-Location for directory stack',
		'',
		'Program Execution:',
		'- Supports .NET, Python, Node.js, and other executables',
		'- Install modules via Install-Module, Install-Package',
		'- Use Get-Command to verify cmdlet/function availability',
		'',
		'Background Processes:',
		'- For long-running tasks (e.g., servers), set isBackground=true',
		'- Returns a terminal ID for checking status and runtime later',
		'- Use Start-Job for background PowerShell jobs',
		'',
		'Output Management:',
		'- Output is automatically truncated if longer than 60KB to prevent context overflow',
		'- Use Select-Object, Where-Object, Format-Table to filter output',
		'- Use -First/-Last parameters to limit results',
		'- For pager commands, add | Out-String or | Format-List',
		'',
		'Best Practices:',
		'- Use proper cmdlet names instead of aliases in scripts',
		'- Quote paths with spaces: "C:\\Path With Spaces"',
		'- Prefer PowerShell cmdlets over external commands when available',
		'- Prefer idiomatic PowerShell like Get-ChildItem instead of dir or ls for file listings',
		'- Use Test-Path to check file/directory existence',
		'- Be specific with Select-Object properties to avoid excessive output'
	].join('\n');
}

const genericDescription = `
Command Execution:
- Use && to chain simple commands on one line
- Prefer pipelines | over temporary files for data flow
- Never create a sub-shell (eg. bash -c "command") unless explicitly asked

Directory Management:
- Must use absolute paths to avoid navigation issues
- Use $PWD for current directory references
- Consider using pushd/popd for directory stack management
- Supports directory shortcuts like ~ and -

Program Execution:
- Supports Python, Node.js, and other executables
- Install packages via package managers (brew, apt, etc.)
- Use which or command -v to verify command availability

Background Processes:
- For long-running tasks (e.g., servers), set isBackground=true
- Returns a terminal ID for checking status and runtime later

Output Management:
- Output is automatically truncated if longer than 60KB to prevent context overflow
- Use head, tail, grep, awk to filter and limit output size
- For pager commands, disable paging: git --no-pager or add | cat
- Use wc -l to count lines before displaying large outputs

Best Practices:
- Quote variables: "$var" instead of $var to handle spaces
- Use find with -exec or xargs for file operations
- Be specific with commands to avoid excessive output`;

function createBashModelDescription(): string {
	return [
		'This tool allows you to execute shell commands in a persistent bash terminal session, preserving environment variables, working directory, and other context across multiple commands.',
		genericDescription,
		'- Use [[ ]] for conditional tests instead of [ ]',
		'- Prefer $() over backticks for command substitution',
		'- Use set -e at start of complex commands to exit on errors'
	].join('\n');
}

function createZshModelDescription(): string {
	return [
		'This tool allows you to execute shell commands in a persistent zsh terminal session, preserving environment variables, working directory, and other context across multiple commands.',
		genericDescription,
		'- Use type to check command type (builtin, function, alias)',
		'- Use jobs, fg, bg for job control',
		'- Use [[ ]] for conditional tests instead of [ ]',
		'- Prefer $() over backticks for command substitution',
		'- Use setopt errexit for strict error handling',
		'- Take advantage of zsh globbing features (**, extended globs)'
	].join('\n');
}

function createFishModelDescription(): string {
	return [
		'This tool allows you to execute shell commands in a persistent fish terminal session, preserving environment variables, working directory, and other context across multiple commands.',
		genericDescription,
		'- Use type to check command type (builtin, function, alias)',
		'- Use jobs, fg, bg for job control',
		'- Use test expressions for conditionals (no [[ ]] syntax)',
		'- Prefer command substitution with () syntax',
		'- Variables are arrays by default, use $var[1] for first element',
		'- Use set -e for strict error handling',
		'- Take advantage of fish\'s autosuggestions and completions'
	].join('\n');
}

export async function createRunInTerminalToolData(
	accessor: ServicesAccessor
): Promise<IToolData> {
	const instantiationService = accessor.get(IInstantiationService);

	const profileFetcher = instantiationService.createInstance(TerminalProfileFetcher);
	const shell = await profileFetcher.getCopilotShell();
	const os = await profileFetcher.osBackend;

	let modelDescription: string;
	if (shell && os && isPowerShell(shell, os)) {
		modelDescription = createPowerShellModelDescription(shell);
	} else if (shell && os && isZsh(shell, os)) {
		modelDescription = createZshModelDescription();
	} else if (shell && os && isFish(shell, os)) {
		modelDescription = createFishModelDescription();
	} else {
		modelDescription = createBashModelDescription();
	}

	return {
		id: 'run_in_terminal',
		toolReferenceName: TOOL_REFERENCE_NAME,
		legacyToolReferenceFullNames: LEGACY_TOOL_REFERENCE_FULL_NAMES,
		displayName: localize('runInTerminalTool.displayName', 'Run in Terminal'),
		modelDescription,
		userDescription: localize('runInTerminalTool.userDescription', 'Run commands in the terminal'),
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
}

// #endregion

// #region Tool implementation

const enum TerminalToolStorageKeysInternal {
	TerminalSession = 'chat.terminalSessions'
}

interface IStoredTerminalAssociation {
	sessionId: string;
	id: string;
	shellIntegrationQuality: ShellIntegrationQuality;
	isBackground?: boolean;
}

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


export class RunInTerminalTool extends Disposable implements IToolImpl {

	private readonly _terminalToolCreator: ToolTerminalCreator;
	private readonly _treeSitterCommandParser: TreeSitterCommandParser;
	private readonly _telemetry: RunInTerminalToolTelemetry;
	private readonly _commandArtifactCollector: TerminalCommandArtifactCollector;
	protected readonly _profileFetcher: TerminalProfileFetcher;

	private readonly _commandLineRewriters: ICommandLineRewriter[];
	private readonly _commandLineAnalyzers: ICommandLineAnalyzer[];

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
		@IChatService protected readonly _chatService: IChatService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IHistoryService private readonly _historyService: IHistoryService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILanguageModelToolsService private readonly _languageModelToolsService: ILanguageModelToolsService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@IStorageService private readonly _storageService: IStorageService,
		@ITerminalChatService private readonly _terminalChatService: ITerminalChatService,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
	) {
		super();

		this._osBackend = this._remoteAgentService.getEnvironment().then(remoteEnv => remoteEnv?.os ?? OS);

		this._terminalToolCreator = this._instantiationService.createInstance(ToolTerminalCreator);
		this._treeSitterCommandParser = this._register(this._instantiationService.createInstance(TreeSitterCommandParser));
		this._telemetry = this._instantiationService.createInstance(RunInTerminalToolTelemetry);
		this._commandArtifactCollector = this._instantiationService.createInstance(TerminalCommandArtifactCollector);
		this._profileFetcher = this._instantiationService.createInstance(TerminalProfileFetcher);

		this._commandLineRewriters = [
			this._register(this._instantiationService.createInstance(CommandLineCdPrefixRewriter)),
			this._register(this._instantiationService.createInstance(CommandLinePwshChainOperatorRewriter, this._treeSitterCommandParser)),
		];
		this._commandLineAnalyzers = [
			this._register(this._instantiationService.createInstance(CommandLineFileWriteAnalyzer, this._treeSitterCommandParser, (message, args) => this._logService.info(`RunInTerminalTool#CommandLineFileWriteAnalyzer: ${message}`, args))),
			this._register(this._instantiationService.createInstance(CommandLineAutoApproveAnalyzer, this._treeSitterCommandParser, this._telemetry, (message, args) => this._logService.info(`RunInTerminalTool#CommandLineAutoApproveAnalyzer: ${message}`, args))),
		];

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
			const localSessionId = LocalChatSessionUri.parseLocalSessionId(e.sessionResource);
			if (localSessionId) {
				this._cleanupSessionTerminals(localSessionId);
			}
		}));
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const args = context.parameters as IRunInTerminalInputParams;

		const instance = context.chatSessionId ? this._sessionTerminalAssociations.get(context.chatSessionId)?.instance : undefined;
		const [os, shell, cwd] = await Promise.all([
			this._osBackend,
			this._profileFetcher.getCopilotShell(),
			(async () => {
				let cwd = await instance?.getCwdResource();
				if (!cwd) {
					const activeWorkspaceRootUri = this._historyService.getLastActiveWorkspaceRoot();
					const workspaceFolder = activeWorkspaceRootUri ? this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) ?? undefined : undefined;
					cwd = workspaceFolder?.uri;
				}
				return cwd;
			})()
		]);
		const language = os === OperatingSystem.Windows ? 'pwsh' : 'sh';

		const terminalToolSessionId = generateUuid();
		// Generate a custom command ID to link the command between renderer and pty host
		const terminalCommandId = `tool-${generateUuid()}`;

		let rewrittenCommand: string | undefined = args.command;
		for (const rewriter of this._commandLineRewriters) {
			const rewriteResult = await rewriter.rewrite({
				commandLine: rewrittenCommand,
				cwd,
				shell,
				os
			});
			if (rewriteResult) {
				rewrittenCommand = rewriteResult.rewritten;
				this._logService.info(`RunInTerminalTool: Command rewritten by ${rewriter.constructor.name}: ${rewriteResult.reasoning}`);
			}
		}

		const toolSpecificData: IChatTerminalToolInvocationData = {
			kind: 'terminal',
			terminalToolSessionId,
			terminalCommandId,
			commandLine: {
				original: args.command,
				toolEdited: rewrittenCommand === args.command ? undefined : rewrittenCommand
			},
			language,
		};

		// HACK: Exit early if there's an alternative recommendation, this is a little hacky but
		// it's the current mechanism for re-routing terminal tool calls to something else.
		const alternativeRecommendation = getRecommendedToolsOverRunInTerminal(args.command, this._languageModelToolsService);
		if (alternativeRecommendation) {
			toolSpecificData.alternativeRecommendation = alternativeRecommendation;
			return {
				confirmationMessages: undefined,
				presentation: ToolInvocationPresentation.Hidden,
				toolSpecificData,
			};
		}

		// Determine auto approval, this happens even when auto approve is off to that reasoning
		// can be reviewed in the terminal channel. It also allows gauging the effective set of
		// commands that would be auto approved if it were enabled.
		const commandLine = rewrittenCommand ?? args.command;

		const isEligibleForAutoApproval = () => {
			const config = this._configurationService.getValue<Record<string, boolean>>(ChatConfiguration.EligibleForAutoApproval);
			if (config && typeof config === 'object') {
				if (Object.prototype.hasOwnProperty.call(config, TOOL_REFERENCE_NAME)) {
					return config[TOOL_REFERENCE_NAME];
				}
				for (const legacyName of LEGACY_TOOL_REFERENCE_FULL_NAMES) {
					if (Object.prototype.hasOwnProperty.call(config, legacyName)) {
						return config[legacyName];
					}
				}
			}
			// Default
			return true;
		};
		const isAutoApproveEnabled = this._configurationService.getValue(TerminalChatAgentToolsSettingId.EnableAutoApprove) === true;
		const isAutoApproveWarningAccepted = this._storageService.getBoolean(TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted, StorageScope.APPLICATION, false);
		const isAutoApproveAllowed = isEligibleForAutoApproval() && isAutoApproveEnabled && isAutoApproveWarningAccepted;

		const commandLineAnalyzerOptions: ICommandLineAnalyzerOptions = {
			commandLine,
			cwd,
			os,
			shell,
			treeSitterLanguage: isPowerShell(shell, os) ? TreeSitterCommandParserLanguage.PowerShell : TreeSitterCommandParserLanguage.Bash,
			terminalToolSessionId,
			chatSessionId: context.chatSessionId,
		};
		const commandLineAnalyzerResults = await Promise.all(this._commandLineAnalyzers.map(e => e.analyze(commandLineAnalyzerOptions)));

		const disclaimersRaw = commandLineAnalyzerResults.filter(e => e.disclaimers).flatMap(e => e.disclaimers);
		let disclaimer: IMarkdownString | undefined;
		if (disclaimersRaw.length > 0) {
			disclaimer = new MarkdownString(`$(${Codicon.info.id}) ` + disclaimersRaw.join(' '), { supportThemeIcons: true });
		}

		const analyzersIsAutoApproveAllowed = commandLineAnalyzerResults.every(e => e.isAutoApproveAllowed);
		const customActions = isEligibleForAutoApproval() && analyzersIsAutoApproveAllowed ? commandLineAnalyzerResults.map(e => e.customActions ?? []).flat() : undefined;

		let shellType = basename(shell, '.exe');
		if (shellType === 'powershell') {
			shellType = 'pwsh';
		}

		const isFinalAutoApproved = (
			// Is the setting enabled and the user has opted-in
			isAutoApproveAllowed &&
			// Does at least one analyzer auto approve
			commandLineAnalyzerResults.some(e => e.isAutoApproved) &&
			// No analyzer denies auto approval
			commandLineAnalyzerResults.every(e => e.isAutoApproved !== false) &&
			// All analyzers allow auto approval
			analyzersIsAutoApproveAllowed
		);

		if (isFinalAutoApproved) {
			toolSpecificData.autoApproveInfo = commandLineAnalyzerResults.find(e => e.autoApproveInfo)?.autoApproveInfo;
		}

		const confirmationMessages = isFinalAutoApproved ? undefined : {
			title: args.isBackground
				? localize('runInTerminal.background', "Run `{0}` command? (background terminal)", shellType)
				: localize('runInTerminal', "Run `{0}` command?", shellType),
			message: new MarkdownString(args.explanation),
			disclaimer,
			terminalCustomActions: customActions,
		};

		return {
			confirmationMessages,
			toolSpecificData,
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const toolSpecificData = invocation.toolSpecificData as IChatTerminalToolInvocationData | undefined;
		if (!toolSpecificData) {
			throw new Error('toolSpecificData must be provided for this tool');
		}
		const commandId = toolSpecificData.terminalCommandId;
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
		const terminalToolSessionId = (toolSpecificData as IChatTerminalToolInvocationData).terminalToolSessionId;

		const store = new DisposableStore();

		this._logService.debug(`RunInTerminalTool: Creating ${args.isBackground ? 'background' : 'foreground'} terminal. termId=${termId}, chatSessionId=${chatSessionId}`);
		const toolTerminal = await (args.isBackground
			? this._initBackgroundTerminal(chatSessionId, termId, terminalToolSessionId, token)
			: this._initForegroundTerminal(chatSessionId, termId, terminalToolSessionId, token));

		this._handleTerminalVisibility(toolTerminal, chatSessionId);

		const timingConnectMs = Date.now() - timingStart;

		const xterm = await toolTerminal.instance.xtermReadyPromise;
		if (!xterm) {
			throw new Error('Instance was disposed before xterm.js was ready');
		}

		const commandDetection = toolTerminal.instance.capabilities.get(TerminalCapability.CommandDetection);

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
				const execution = new BackgroundTerminalExecution(toolTerminal.instance, xterm, command, chatSessionId, commandId);
				RunInTerminalTool._backgroundExecutions.set(termId, execution);

				outputMonitor = store.add(this._instantiationService.createInstance(OutputMonitor, execution, undefined, invocation.context!, token, command));
				await Event.toPromise(outputMonitor.onDidFinishCommand);
				const pollingResult = outputMonitor.pollingResult;

				if (token.isCancellationRequested) {
					throw new CancellationError();
				}

				await this._commandArtifactCollector.capture(toolSpecificData, toolTerminal.instance, commandId);
				const state = toolSpecificData.terminalCommandState ?? {};
				state.timestamp = state.timestamp ?? timingStart;
				toolSpecificData.terminalCommandState = state;

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

				return {
					toolMetadata: {
						exitCode: undefined // Background processes don't have immediate exit codes
					},
					content: [{
						kind: 'text',
						value: resultText,
					}],
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
				const executeResult = await strategy.execute(command, token, commandId);
				// Reset user input state after command execution completes
				toolTerminal.receivedUserInput = false;
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}

				await this._commandArtifactCollector.capture(toolSpecificData, toolTerminal.instance, commandId);
				{
					const state = toolSpecificData.terminalCommandState ?? {};
					state.timestamp = state.timestamp ?? timingStart;
					if (executeResult.exitCode !== undefined) {
						state.exitCode = executeResult.exitCode;
						if (state.timestamp !== undefined) {
							state.duration = state.duration ?? Math.max(0, Date.now() - state.timestamp);
						}
					}
					toolSpecificData.terminalCommandState = state;
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

			return {
				toolResultMessage,
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

	private _handleTerminalVisibility(toolTerminal: IToolTerminal, chatSessionId: string) {
		const chatSessionOpenInWidget = !!this._chatWidgetService.getWidgetBySessionResource(LocalChatSessionUri.forSession(chatSessionId));
		if (this._configurationService.getValue(TerminalChatAgentToolsSettingId.OutputLocation) === 'terminal' && chatSessionOpenInWidget) {
			this._terminalService.setActiveInstance(toolTerminal.instance);
			this._terminalService.revealTerminal(toolTerminal.instance, true);
		}
	}

	// #region Terminal init

	private async _initBackgroundTerminal(chatSessionId: string, termId: string, terminalToolSessionId: string | undefined, token: CancellationToken): Promise<IToolTerminal> {
		this._logService.debug(`RunInTerminalTool: Creating background terminal with ID=${termId}`);
		const profile = await this._profileFetcher.getCopilotProfile();
		const toolTerminal = await this._terminalToolCreator.createTerminal(profile, token);
		this._terminalChatService.registerTerminalInstanceWithToolSession(terminalToolSessionId, toolTerminal.instance);
		this._terminalChatService.registerTerminalInstanceWithChatSession(chatSessionId, toolTerminal.instance);
		this._registerInputListener(toolTerminal);
		this._sessionTerminalAssociations.set(chatSessionId, toolTerminal);
		if (token.isCancellationRequested) {
			toolTerminal.instance.dispose();
			throw new CancellationError();
		}
		await this._setupProcessIdAssociation(toolTerminal, chatSessionId, termId, true);
		return toolTerminal;
	}

	private async _initForegroundTerminal(chatSessionId: string, termId: string, terminalToolSessionId: string | undefined, token: CancellationToken): Promise<IToolTerminal> {
		const cachedTerminal = this._sessionTerminalAssociations.get(chatSessionId);
		if (cachedTerminal) {
			this._logService.debug(`RunInTerminalTool: Using cached foreground terminal with session ID \`${chatSessionId}\``);
			this._terminalToolCreator.refreshShellIntegrationQuality(cachedTerminal);
			this._terminalChatService.registerTerminalInstanceWithToolSession(terminalToolSessionId, cachedTerminal.instance);
			return cachedTerminal;
		}
		const profile = await this._profileFetcher.getCopilotProfile();
		const toolTerminal = await this._terminalToolCreator.createTerminal(profile, token);
		this._terminalChatService.registerTerminalInstanceWithToolSession(terminalToolSessionId, toolTerminal.instance);
		this._terminalChatService.registerTerminalInstanceWithChatSession(chatSessionId, toolTerminal.instance);
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
						this._terminalChatService.registerTerminalInstanceWithChatSession(association.sessionId, instance);

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

			if (isNumber(pid)) {
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
}

class BackgroundTerminalExecution extends Disposable {
	private _startMarker?: IXtermMarker;

	constructor(
		readonly instance: ITerminalInstance,
		private readonly _xterm: XtermTerminal,
		private readonly _commandLine: string,
		readonly sessionId: string,
		commandId?: string
	) {
		super();

		this._startMarker = this._register(this._xterm.raw.registerMarker());
		this.instance.runCommand(this._commandLine, true, commandId);
	}
	getOutput(marker?: IXtermMarker): string {
		return getOutput(this.instance, marker ?? this._startMarker);
	}
}

export class TerminalProfileFetcher {

	readonly osBackend: Promise<OperatingSystem>;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalProfileResolverService private readonly _terminalProfileResolverService: ITerminalProfileResolverService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
	) {
		this.osBackend = this._remoteAgentService.getEnvironment().then(remoteEnv => remoteEnv?.os ?? OS);
	}

	async getCopilotProfile(): Promise<ITerminalProfile> {
		const os = await this.osBackend;

		// Check for chat agent terminal profile first
		const customChatAgentProfile = this._getChatTerminalProfile(os);
		if (customChatAgentProfile) {
			return customChatAgentProfile;
		}

		// When setting is null, use the previous behavior
		const defaultProfile = await this._terminalProfileResolverService.getDefaultProfile({
			os,
			remoteAuthority: this._remoteAgentService.getConnection()?.remoteAuthority
		});

		// Force pwsh over cmd as cmd doesn't have shell integration
		if (basename(defaultProfile.path) === 'cmd.exe') {
			return {
				...defaultProfile,
				path: 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
				profileName: 'PowerShell'
			};
		}

		// Setting icon: undefined allows the system to use the default AI terminal icon (not overridden or removed)
		return { ...defaultProfile, icon: undefined };
	}

	async getCopilotShell(): Promise<string> {
		return (await this.getCopilotProfile()).path;
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
		if ('path' in profile && isString((profile as { path: unknown }).path)) {
			return true;
		}
		return false;
	}
}

// #endregion
