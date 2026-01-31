/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IMarker as IXtermMarker } from '@xterm/xterm';
import { DeferredPromise, timeout, type CancelablePromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { MarkdownString, type IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { basename, posix, win32 } from '../../../../../../base/common/path.js';
import { OperatingSystem, OS } from '../../../../../../base/common/platform.js';
import { count } from '../../../../../../base/common/strings.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService, type ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { ICommandDetectionCapability, TerminalCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalLogService, ITerminalProfile } from '../../../../../../platform/terminal/common/terminal.js';
import { IRemoteAgentService } from '../../../../../services/remote/common/remoteAgentService.js';
import { TerminalToolConfirmationStorageKeys } from '../../../../chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolConfirmationSubPart.js';
import { IChatService, type IChatTerminalToolInvocationData } from '../../../../chat/common/chatService/chatService.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolInvocationPresentation, ToolProgress } from '../../../../chat/common/tools/languageModelToolsService.js';
import { ITerminalChatService, ITerminalService, type ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { ITerminalProfileResolverService } from '../../../../terminal/common/terminal.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
import { getRecommendedToolsOverRunInTerminal } from '../alternativeRecommendation.js';
import { BasicExecuteStrategy } from '../executeStrategy/basicExecuteStrategy.js';
import type { ITerminalExecuteStrategy, ITerminalExecuteStrategyResult } from '../executeStrategy/executeStrategy.js';
import { NoneExecuteStrategy } from '../executeStrategy/noneExecuteStrategy.js';
import { RichExecuteStrategy } from '../executeStrategy/richExecuteStrategy.js';
import { getOutput } from '../outputHelpers.js';
import { extractCdPrefix, isFish, isPowerShell, isWindowsPowerShell, isZsh } from '../runInTerminalHelpers.js';
import type { ICommandLinePresenter } from './commandLinePresenter/commandLinePresenter.js';
import { NodeCommandLinePresenter } from './commandLinePresenter/nodeCommandLinePresenter.js';
import { PythonCommandLinePresenter } from './commandLinePresenter/pythonCommandLinePresenter.js';
import { RubyCommandLinePresenter } from './commandLinePresenter/rubyCommandLinePresenter.js';
import { SandboxedCommandLinePresenter } from './commandLinePresenter/sandboxedCommandLinePresenter.js';
import { RunInTerminalToolTelemetry } from '../runInTerminalToolTelemetry.js';
import { ShellIntegrationQuality, ToolTerminalCreator, type IToolTerminal } from '../toolTerminalCreator.js';
import { TreeSitterCommandParser, TreeSitterCommandParserLanguage } from '../treeSitterCommandParser.js';
import { type ICommandLineAnalyzer, type ICommandLineAnalyzerOptions } from './commandLineAnalyzer/commandLineAnalyzer.js';
import { CommandLineAutoApproveAnalyzer } from './commandLineAnalyzer/commandLineAutoApproveAnalyzer.js';
import { CommandLineFileWriteAnalyzer } from './commandLineAnalyzer/commandLineFileWriteAnalyzer.js';
import { CommandLineSandboxAnalyzer } from './commandLineAnalyzer/commandLineSandboxAnalyzer.js';
import { OutputMonitor } from './monitoring/outputMonitor.js';
import { IPollingResult, OutputMonitorState } from './monitoring/types.js';
import { chatSessionResourceToId, LocalChatSessionUri } from '../../../../chat/common/model/chatUri.js';
import { TerminalToolId } from './toolIds.js';
import { URI } from '../../../../../../base/common/uri.js';
import type { ICommandLineRewriter } from './commandLineRewriter/commandLineRewriter.js';
import { CommandLineCdPrefixRewriter } from './commandLineRewriter/commandLineCdPrefixRewriter.js';
import { CommandLinePreventHistoryRewriter } from './commandLineRewriter/commandLinePreventHistoryRewriter.js';
import { CommandLinePwshChainOperatorRewriter } from './commandLineRewriter/commandLinePwshChainOperatorRewriter.js';
import { CommandLineSandboxRewriter } from './commandLineRewriter/commandLineSandboxRewriter.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IHistoryService } from '../../../../../services/history/common/history.js';
import { TerminalCommandArtifactCollector } from './terminalCommandArtifactCollector.js';
import { isNumber, isString } from '../../../../../../base/common/types.js';
import { ChatConfiguration } from '../../../../chat/common/constants.js';
import { IChatWidgetService } from '../../../../chat/browser/chat.js';
import { TerminalChatCommandId } from '../../../chat/browser/terminalChat.js';
import { clamp } from '../../../../../../base/common/numbers.js';

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
		'- Prefer relative paths when navigating directories, only use absolute when the path is far away or the current cwd is not expected',
		'- Remember when isBackground=false is specified, that the shell and cwd are reused until it is moved to the background',
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
		'- Be specific with Select-Object properties to avoid excessive output',
		'- Avoid printing credentials unless absolutely required',
	].join('\n');
}

const genericDescription = `
Command Execution:
- Use && to chain simple commands on one line
- Prefer pipelines | over temporary files for data flow
- Never create a sub-shell (eg. bash -c "command") unless explicitly asked

Directory Management:
- Prefer relative paths when navigating directories, only use absolute when the path is far away or the current cwd is not expected
- Remember when isBackground=false is specified, that shell and cwd is reused until it is moved to the background
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
- Be specific with commands to avoid excessive output
- Avoid printing credentials unless absolutely required`;

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
		id: TerminalToolId.RunInTerminal,
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
				goal: {
					type: 'string',
					description: 'A short description of the goal or purpose of the command (e.g., "Install dependencies", "Start development server").'
				},
				isBackground: {
					type: 'boolean',
					description: `Whether the command starts a background process.\n\n- If true, a new shell will be spawned where the cwd is the workspace directory and will run asynchronously in the background and you will not see the output.\n\n- If false, a single shell is shared between all non-background terminals where the cwd starts at the workspace directory and is remembered until that terminal is moved to the background, the tool call will block on the command finishing and only then you will get the output.\n\nExamples of background processes: building in watch mode, starting a server. You can check the output of a background process later on by using ${TerminalToolId.GetTerminalOutput}.`
				},
				timeout: {
					type: 'number',
					description: 'An optional timeout in milliseconds. When provided, the tool will stop tracking the command after this duration and return the output collected so far. Be conservative with the timeout duration, give enough time that the command would complete on a low-end machine. Use 0 for no timeout. If it\'s not clear how long the command will take then use 0 to avoid prematurely terminating it, never guess too low.',
				},
			},
			required: [
				'command',
				'explanation',
				'goal',
				'isBackground',
				'timeout',
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
	goal: string;
	isBackground: boolean;
	timeout?: number;
}

/**
 * Interface for accessing a running terminal execution.
 * Used by tools that need to await or interact with background terminal commands.
 */
export interface IActiveTerminalExecution {
	/**
	 * Promise that resolves when the terminal command completes.
	 */
	readonly completionPromise: Promise<ITerminalExecuteStrategyResult>;

	/**
	 * The terminal instance associated with this execution.
	 */
	readonly instance: ITerminalInstance;

	/**
	 * Gets the current output from the terminal.
	 */
	getOutput(): string;
}

/**
 * A set of characters to ignore when reporting telemetry
 */
const telemetryIgnoredSequences = [
	'\x1b[I', // Focus in
	'\x1b[O', // Focus out
];

const altBufferMessage = localize('runInTerminalTool.altBufferMessage', "The command opened the alternate buffer.");


export class RunInTerminalTool extends Disposable implements IToolImpl {

	private readonly _terminalToolCreator: ToolTerminalCreator;
	private readonly _treeSitterCommandParser: TreeSitterCommandParser;
	private readonly _telemetry: RunInTerminalToolTelemetry;
	private readonly _commandArtifactCollector: TerminalCommandArtifactCollector;
	protected readonly _profileFetcher: TerminalProfileFetcher;

	private readonly _commandLineRewriters: ICommandLineRewriter[];
	private readonly _commandLineAnalyzers: ICommandLineAnalyzer[];
	private readonly _commandLinePresenters: ICommandLinePresenter[];

	protected readonly _sessionTerminalAssociations = new ResourceMap<IToolTerminal>();

	// Immutable window state
	protected readonly _osBackend: Promise<OperatingSystem>;

	private static readonly _activeExecutions = new Map<string, ActiveTerminalExecution>();
	public static getBackgroundOutput(id: string): string {
		const execution = RunInTerminalTool._activeExecutions.get(id);
		if (!execution) {
			throw new Error('Invalid terminal ID');
		}
		return execution.getOutput();
	}

	/**
	 * Gets an active terminal execution by ID. Returns undefined if not found.
	 * Can be used to await the completion of a background terminal command.
	 */
	public static getExecution(id: string): IActiveTerminalExecution | undefined {
		return RunInTerminalTool._activeExecutions.get(id);
	}

	/**
	 * Removes an active terminal execution by ID and disposes it.
	 * @returns true if the execution was found and removed, false otherwise.
	 */
	public static removeExecution(id: string): boolean {
		const execution = RunInTerminalTool._activeExecutions.get(id);
		if (!execution) {
			return false;
		}
		execution.dispose();
		RunInTerminalTool._activeExecutions.delete(id);
		return true;
	}

	constructor(
		@IChatService protected readonly _chatService: IChatService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IHistoryService private readonly _historyService: IHistoryService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILabelService private readonly _labelService: ILabelService,
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
			this._register(this._instantiationService.createInstance(CommandLinePreventHistoryRewriter)),
			this._register(this._instantiationService.createInstance(CommandLineSandboxRewriter)),
		];
		this._commandLineAnalyzers = [
			this._register(this._instantiationService.createInstance(CommandLineFileWriteAnalyzer, this._treeSitterCommandParser, (message, args) => this._logService.info(`RunInTerminalTool#CommandLineFileWriteAnalyzer: ${message}`, args))),
			this._register(this._instantiationService.createInstance(CommandLineAutoApproveAnalyzer, this._treeSitterCommandParser, this._telemetry, (message, args) => this._logService.info(`RunInTerminalTool#CommandLineAutoApproveAnalyzer: ${message}`, args))),
			this._register(this._instantiationService.createInstance(CommandLineSandboxAnalyzer)),
		];
		this._commandLinePresenters = [
			this._instantiationService.createInstance(SandboxedCommandLinePresenter),
			new NodeCommandLinePresenter(),
			new PythonCommandLinePresenter(),
			new RubyCommandLinePresenter(),
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
			for (const [sessionResource, toolTerminal] of this._sessionTerminalAssociations.entries()) {
				if (e === toolTerminal.instance) {
					this._sessionTerminalAssociations.delete(sessionResource);
				}
			}
		}));

		// Listen for chat session disposal to clean up associated terminals
		this._register(this._chatService.onDidDisposeSession(e => {
			for (const resource of e.sessionResource) {
				this._cleanupSessionTerminals(resource);
			}
		}));
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const args = context.parameters as IRunInTerminalInputParams;

		const chatSessionResource = context.chatSessionResource ?? (context.chatSessionId ? LocalChatSessionUri.forSession(context.chatSessionId) : undefined);
		let instance: ITerminalInstance | undefined;
		if (chatSessionResource) {
			const toolTerminal = this._sessionTerminalAssociations.get(chatSessionResource);
			if (toolTerminal && !toolTerminal.isBackground) {
				instance = toolTerminal.instance;
			}
		}
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
		let forDisplayCommand: string | undefined = undefined;
		for (const rewriter of this._commandLineRewriters) {
			const rewriteResult = await rewriter.rewrite({
				commandLine: rewrittenCommand,
				cwd,
				shell,
				os
			});
			if (rewriteResult) {
				rewrittenCommand = rewriteResult.rewritten;
				forDisplayCommand = rewriteResult.forDisplay;
				this._logService.info(`RunInTerminalTool: Command rewritten by ${rewriter.constructor.name}: ${rewriteResult.reasoning}`);
			}
		}

		const toolSpecificData: IChatTerminalToolInvocationData = {
			kind: 'terminal',
			terminalToolSessionId,
			terminalCommandId,
			commandLine: {
				original: args.command,
				toolEdited: rewrittenCommand === args.command ? undefined : rewrittenCommand,
				forDisplay: forDisplayCommand,
			},
			cwd,
			language,
			isBackground: args.isBackground,
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
			chatSessionResource,
		};
		const commandLineAnalyzerResults = await Promise.all(this._commandLineAnalyzers.map(e => e.analyze(commandLineAnalyzerOptions)));

		const disclaimersRaw = commandLineAnalyzerResults.map(e => e.disclaimers).filter(e => !!e).flatMap(e => e);
		let disclaimer: IMarkdownString | undefined;
		if (disclaimersRaw.length > 0) {
			const disclaimerTexts = disclaimersRaw.map(d => typeof d === 'string' ? d : d.value);
			const hasMarkdownDisclaimer = disclaimersRaw.some(d => typeof d !== 'string');
			const mdOptions = hasMarkdownDisclaimer
				? { supportThemeIcons: true, isTrusted: { enabledCommands: [TerminalChatCommandId.OpenTerminalSettingsLink] } }
				: { supportThemeIcons: true };
			disclaimer = new MarkdownString(`$(${Codicon.info.id}) ` + disclaimerTexts.join(' '), mdOptions);
		}

		const analyzersIsAutoApproveAllowed = commandLineAnalyzerResults.every(e => e.isAutoApproveAllowed);
		const customActions = isEligibleForAutoApproval() && analyzersIsAutoApproveAllowed ? commandLineAnalyzerResults.map(e => e.customActions ?? []).flat() : undefined;

		let shellType = basename(shell, '.exe');
		if (shellType === 'powershell') {
			shellType = 'pwsh';
		}

		// Check if the command would be auto-approved based on rules (ignoring warning state)
		const wouldBeAutoApproved = (
			// Does at least one analyzer auto approve
			commandLineAnalyzerResults.some(e => e.isAutoApproved) &&
			// No analyzer denies auto approval
			commandLineAnalyzerResults.every(e => e.isAutoApproved !== false) &&
			// All analyzers allow auto approval
			analyzersIsAutoApproveAllowed
		);

		const isFinalAutoApproved = (
			// Is the setting enabled and the user has opted-in
			isAutoApproveAllowed &&
			// Would be auto-approved based on rules
			wouldBeAutoApproved
		) || commandLineAnalyzerResults.some(e => e.forceAutoApproval);

		// Pass auto approve info if the command:
		// - Was auto approved
		// - Would have be auto approved, but the opt-in warning was not accepted
		// - Was denied explicitly by a rule
		//
		// This allows surfacing this information to the user.
		if (isFinalAutoApproved || (isAutoApproveEnabled && commandLineAnalyzerResults.some(e => e.autoApproveInfo))) {
			toolSpecificData.autoApproveInfo = commandLineAnalyzerResults.find(e => e.autoApproveInfo)?.autoApproveInfo;
		}

		// Extract cd prefix for display - show directory in title, command suffix in editor
		const commandToDisplay = (toolSpecificData.commandLine.userEdited ?? toolSpecificData.commandLine.toolEdited ?? toolSpecificData.commandLine.original).trimStart();
		const extractedCd = extractCdPrefix(commandToDisplay, shell, os);
		let confirmationTitle: string;
		if (extractedCd && cwd) {
			// Construct the full directory path using the cwd's scheme/authority
			const isAbsolutePath = os === OperatingSystem.Windows
				? win32.isAbsolute(extractedCd.directory)
				: posix.isAbsolute(extractedCd.directory);
			const directoryUri = isAbsolutePath
				? URI.from({ scheme: cwd.scheme, authority: cwd.authority, path: extractedCd.directory })
				: URI.joinPath(cwd, extractedCd.directory);
			const directoryLabel = this._labelService.getUriLabel(directoryUri);
			const cdPrefix = commandToDisplay.substring(0, commandToDisplay.length - extractedCd.command.length);

			toolSpecificData.confirmation = {
				commandLine: extractedCd.command,
				cwdLabel: directoryLabel,
				cdPrefix,
			};

			confirmationTitle = args.isBackground
				? localize('runInTerminal.background.inDirectory', "Run `{0}` command in background within `{1}`?", shellType, directoryLabel)
				: localize('runInTerminal.inDirectory', "Run `{0}` command within `{1}`?", shellType, directoryLabel);
		} else {
			toolSpecificData.confirmation = {
				commandLine: commandToDisplay,
			};
			confirmationTitle = args.isBackground
				? localize('runInTerminal.background', "Run `{0}` command in background?", shellType)
				: localize('runInTerminal', "Run `{0}` command?", shellType);
		}

		// Check for presentation overrides (e.g., Python -c command extraction)
		// Use the command after cd prefix extraction if available, since that's what's displayed in the editor
		const commandForPresenter = extractedCd?.command ?? commandToDisplay;
		let presenterInput = commandForPresenter;
		for (const presenter of this._commandLinePresenters) {
			const presenterResult = await presenter.present({ commandLine: { original: args.command, forDisplay: presenterInput }, shell, os });
			if (presenterResult) {
				toolSpecificData.presentationOverrides = {
					commandLine: presenterResult.commandLine,
					language: presenterResult.language ?? undefined,
				};
				if (extractedCd && toolSpecificData.confirmation?.cwdLabel) {
					confirmationTitle = args.isBackground
						? localize('runInTerminal.presentationOverride.background.inDirectory', "Run `{0}` command in `{1}` in background within `{2}`?", presenterResult.languageDisplayName, shellType, toolSpecificData.confirmation.cwdLabel)
						: localize('runInTerminal.presentationOverride.inDirectory', "Run `{0}` command in `{1}` within `{2}`?", presenterResult.languageDisplayName, shellType, toolSpecificData.confirmation.cwdLabel);
				} else {
					confirmationTitle = args.isBackground
						? localize('runInTerminal.presentationOverride.background', "Run `{0}` command in `{1}` in background?", presenterResult.languageDisplayName, shellType)
						: localize('runInTerminal.presentationOverride', "Run `{0}` command in `{1}`?", presenterResult.languageDisplayName, shellType);
				}
				if (!presenterResult.processOtherPresenters) {
					break;
				}
				presenterInput = presenterResult.commandLine;
			}
		}

		const confirmationMessages = isFinalAutoApproved ? undefined : {
			title: confirmationTitle,
			message: new MarkdownString(localize('runInTerminal.confirmationMessage', "Explanation: {0}\n\nGoal: {1}", args.explanation, args.goal)),
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
		let toolResultMessage: string | IMarkdownString | undefined;

		const chatSessionResource = invocation.context?.sessionResource ?? LocalChatSessionUri.forSession(invocation.context?.sessionId ?? 'no-chat-session');
		const chatSessionId = chatSessionResourceToId(chatSessionResource);
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
		const isNewSession = !args.isBackground && !this._sessionTerminalAssociations.has(chatSessionResource);

		const timingStart = Date.now();
		const termId = generateUuid();
		const terminalToolSessionId = (toolSpecificData as IChatTerminalToolInvocationData).terminalToolSessionId;

		const store = new DisposableStore();

		// Unified terminal initialization
		this._logService.debug(`RunInTerminalTool: Creating ${args.isBackground ? 'background' : 'foreground'} terminal. termId=${termId}, chatSessionId=${chatSessionId}`);
		const toolTerminal = await this._initTerminal(chatSessionResource, termId, terminalToolSessionId, args.isBackground, token);

		this._handleTerminalVisibility(toolTerminal, chatSessionResource);

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

		// Unified execution: always use execute strategy for both background and foreground
		let terminalResult = '';
		let outputLineCount = -1;
		let exitCode: number | undefined;
		let altBufferResult: IToolResult | undefined;
		let didTimeout = false;
		let didMoveToBackground = args.isBackground;
		let timeoutPromise: CancelablePromise<void> | undefined;
		let outputMonitor: OutputMonitor | undefined;
		let pollingResult: IPollingResult & { pollDurationMs: number } | undefined;
		const executeCancellation = store.add(new CancellationTokenSource(token));

		// Set up timeout if provided and the setting is enabled (only for foreground)
		const timeoutValue = args.timeout !== undefined ? clamp(args.timeout, 0, Number.MAX_SAFE_INTEGER) : undefined;
		if (!args.isBackground && timeoutValue !== undefined && timeoutValue > 0) {
			const shouldEnforceTimeout = this._configurationService.getValue(TerminalChatAgentToolsSettingId.EnforceTimeoutFromModel) === true;
			if (shouldEnforceTimeout) {
				timeoutPromise = timeout(timeoutValue);
				timeoutPromise.then(() => {
					if (!executeCancellation.token.isCancellationRequested) {
						didTimeout = true;
						executeCancellation.cancel();
					}
				});
			}
		}

		// Set up continue in background listener - uses a race promise instead of cancellation
		// to allow the execution strategy to continue running and preserve its marker
		let continueInBackgroundResolve: (() => void) | undefined;
		const continueInBackgroundPromise = new Promise<void>(resolve => {
			continueInBackgroundResolve = resolve;
		});
		if (terminalToolSessionId) {
			store.add(this._terminalChatService.onDidContinueInBackground(sessionId => {
				if (sessionId === terminalToolSessionId) {
					const execution = RunInTerminalTool._activeExecutions.get(termId);
					if (execution) {
						execution.setBackground();
					}
					didMoveToBackground = true;
					// Resolve the race promise instead of cancelling - this allows the execution
					// to continue running so it can be awaited later
					continueInBackgroundResolve?.();
				}
			}));
		}

		let executionPromise: Promise<ITerminalExecuteStrategyResult> | undefined;
		try {
			// Create unified ActiveTerminalExecution (creates and owns the strategy)
			const execution = this._instantiationService.createInstance(
				ActiveTerminalExecution,
				chatSessionId,
				termId,
				toolTerminal,
				commandDetection!,
				args.isBackground
			);
			if (toolTerminal.shellIntegrationQuality === ShellIntegrationQuality.None) {
				toolResultMessage = '$(info) Enable [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration) to improve command detection';
			}
			this._logService.debug(`RunInTerminalTool: Using \`${execution.strategy.type}\` execute strategy for command \`${command}\``);
			store.add(execution);
			RunInTerminalTool._activeExecutions.set(termId, execution);

			// Set up OutputMonitor when start marker is created
			const startMarkerPromise = Event.toPromise(execution.strategy.onDidCreateStartMarker);
			store.add(execution.strategy.onDidCreateStartMarker(startMarker => {
				if (!outputMonitor) {
					outputMonitor = store.add(this._instantiationService.createInstance(
						OutputMonitor,
						{
							instance: toolTerminal.instance,
							sessionId: invocation.context?.sessionId,
							getOutput: (marker?: IXtermMarker) => execution.getOutput(marker ?? startMarker)
						},
						undefined,
						invocation.context,
						token,
						command
					));
				}
			}));

			// Start execution (non-blocking - runs in background)
			executionPromise = execution.start(command, executeCancellation.token, commandId);

			if (args.isBackground) {
				// Background mode: wait for OutputMonitor to detect idle, then return
				this._logService.debug(`RunInTerminalTool: Starting background execution \`${command}\``);
				// Wait for the start marker to be created (which creates the outputMonitor)
				await startMarkerPromise;
				if (outputMonitor) {
					await Event.toPromise(outputMonitor.onDidFinishCommand);
					pollingResult = outputMonitor.pollingResult;
				}

				await this._commandArtifactCollector.capture(toolSpecificData, toolTerminal.instance, commandId);
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
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
			} else {
				// Foreground mode: race execution completion against continue in background
				const raceResult = await Promise.race([
					executionPromise.then(result => ({ type: 'completed' as const, result })),
					continueInBackgroundPromise.then(() => ({ type: 'background' as const }))
				]);

				if (raceResult.type === 'background') {
					// Moved to background - execution continues running, just return current output
					this._logService.debug(`RunInTerminalTool: Continue in background triggered, returning output collected so far`);
					error = 'continueInBackground';
					const backgroundOutput = execution.getOutput();
					outputLineCount = backgroundOutput ? count(backgroundOutput.trim(), '\n') + 1 : 0;
					terminalResult = backgroundOutput;
				} else {
					const executeResult = raceResult.result;
					// Reset user input state after command execution completes
					toolTerminal.receivedUserInput = false;
					if (token.isCancellationRequested) {
						throw new CancellationError();
					}

					if (executeResult.didEnterAltBuffer) {
						const state = toolSpecificData.terminalCommandState ?? {};
						state.timestamp = state.timestamp ?? timingStart;
						toolSpecificData.terminalCommandState = state;
						toolResultMessage = altBufferMessage;
						outputLineCount = 0;
						error = executeResult.error ?? 'alternateBuffer';
						altBufferResult = {
							toolResultMessage,
							toolMetadata: {
								exitCode: undefined
							},
							content: [{
								kind: 'text',
								value: altBufferMessage,
							}]
						};
					} else {
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

						this._logService.debug(`RunInTerminalTool: Finished \`${execution.strategy.type}\` execute strategy with exitCode \`${executeResult.exitCode}\`, result.length \`${executeResult.output?.length}\`, error \`${executeResult.error}\``);
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
					}
				}
			}
		} catch (e) {
			// Handle timeout case - get output collected so far and return it
			if (didTimeout && e instanceof CancellationError) {
				this._logService.debug(`RunInTerminalTool: Timeout reached, returning output collected so far`);
				error = 'timeout';
				const timeoutOutput = getOutput(toolTerminal.instance, undefined);
				outputLineCount = timeoutOutput ? count(timeoutOutput.trim(), '\n') + 1 : 0;
				terminalResult = timeoutOutput ?? '';
			} else {
				this._logService.debug(`RunInTerminalTool: Threw exception`);
				// Capture output snapshot before disposing on cancellation
				if (e instanceof CancellationError) {
					await this._commandArtifactCollector.capture(toolSpecificData, toolTerminal.instance, commandId);
				}
				// Clean up the execution on error
				RunInTerminalTool._activeExecutions.get(termId)?.dispose();
				RunInTerminalTool._activeExecutions.delete(termId);
				toolTerminal.instance.dispose();
				error = e instanceof CancellationError ? 'canceled' : 'unexpectedException';
				throw e;
			}
		} finally {
			timeoutPromise?.cancel();
			if (didMoveToBackground && executionPromise) {
				// Execution moved to background - attach error handler since we won't await it
				executionPromise.catch((e: unknown) => {
					if (!(e instanceof CancellationError)) {
						this._logService.error(`RunInTerminalTool: Background execution error`, e);
					}
				});
			} else {
				// Foreground completed or error - clean up execution
				RunInTerminalTool._activeExecutions.get(termId)?.dispose();
				RunInTerminalTool._activeExecutions.delete(termId);
			}
			store.dispose();
			const timingExecuteMs = Date.now() - timingStart;
			this._telemetry.logInvoke(toolTerminal.instance, {
				terminalToolSessionId: toolSpecificData.terminalToolSessionId,
				didUserEditCommand,
				didToolEditCommand,
				isBackground: args.isBackground,
				shellIntegrationQuality: toolTerminal.shellIntegrationQuality,
				error,
				isNewSession,
				outputLineCount,
				exitCode,
				timingExecuteMs,
				timingConnectMs,
				inputUserChars,
				inputUserSigint,
				terminalExecutionIdleBeforeTimeout: pollingResult?.state === OutputMonitorState.Idle,
				pollDurationMs: pollingResult?.pollDurationMs,
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

		if (altBufferResult) {
			return altBufferResult;
		}

		const resultText: string[] = [];
		if (didUserEditCommand) {
			resultText.push(`Note: The user manually edited the command to \`${command}\`, and this is the output of running that command instead:\n`);
		} else if (didToolEditCommand) {
			resultText.push(`Note: The tool simplified the command to \`${command}\`, and this is the output of running that command instead:\n`);
		}
		if (didMoveToBackground && !args.isBackground) {
			resultText.push(`Note: This terminal execution was moved to the background using the ID ${termId}\n`);
		}
		resultText.push(terminalResult);

		const isError = exitCode !== undefined && exitCode !== 0;
		return {
			toolResultMessage,
			toolMetadata: {
				exitCode: exitCode
			},
			toolResultDetails: isError ? {
				input: command,
				output: [{ type: 'embed', isText: true, value: terminalResult }],
				isError: true
			} : undefined,
			content: [{
				kind: 'text',
				value: resultText.join(''),
			}]
		};
	}

	private _handleTerminalVisibility(toolTerminal: IToolTerminal, chatSessionResource: URI) {
		const chatSessionOpenInWidget = !!this._chatWidgetService.getWidgetBySessionResource(chatSessionResource);
		if (this._configurationService.getValue(TerminalChatAgentToolsSettingId.OutputLocation) === 'terminal' && chatSessionOpenInWidget) {
			this._terminalService.setActiveInstance(toolTerminal.instance);
			this._terminalService.revealTerminal(toolTerminal.instance, true);
		}
	}

	// #region Terminal init

	/**
	 * Initializes a terminal for command execution. For foreground mode, reuses existing cached
	 * terminal from the session. For background mode, always creates a new terminal to allow
	 * parallel execution.
	 */
	private async _initTerminal(chatSessionResource: URI, termId: string, terminalToolSessionId: string | undefined, isBackground: boolean, token: CancellationToken): Promise<IToolTerminal> {
		// For foreground mode, try to reuse cached terminal (but not if it was a background terminal)
		if (!isBackground) {
			const cachedTerminal = this._sessionTerminalAssociations.get(chatSessionResource);
			if (cachedTerminal && !cachedTerminal.isBackground) {
				this._logService.debug(`RunInTerminalTool: Using cached terminal with session resource \`${chatSessionResource}\``);
				this._terminalToolCreator.refreshShellIntegrationQuality(cachedTerminal);
				this._terminalChatService.registerTerminalInstanceWithToolSession(terminalToolSessionId, cachedTerminal.instance);
				return cachedTerminal;
			}
		}

		this._logService.debug(`RunInTerminalTool: Creating ${isBackground ? 'background' : 'foreground'} terminal with ID=${termId}`);
		const profile = await this._profileFetcher.getCopilotProfile();
		const os = await this._osBackend;
		const toolTerminal = await this._terminalToolCreator.createTerminal(profile, os, token);
		toolTerminal.isBackground = isBackground;
		this._terminalChatService.registerTerminalInstanceWithToolSession(terminalToolSessionId, toolTerminal.instance);
		this._terminalChatService.registerTerminalInstanceWithChatSession(chatSessionResource, toolTerminal.instance);
		this._registerInputListener(toolTerminal);
		this._sessionTerminalAssociations.set(chatSessionResource, toolTerminal);
		if (token.isCancellationRequested) {
			toolTerminal.instance.dispose();
			throw new CancellationError();
		}
		await this._setupProcessIdAssociation(toolTerminal, chatSessionResource, termId, isBackground);
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
						// Convert stored string ID to URI for backward compatibility
						const chatSessionResource = LocalChatSessionUri.forSession(association.sessionId);
						this._logService.debug(`RunInTerminalTool: Restored terminal association for PID ${instance.processId}, session ${association.sessionId}`);
						const toolTerminal: IToolTerminal = {
							instance,
							shellIntegrationQuality: association.shellIntegrationQuality,
							isBackground: association.isBackground
						};
						this._sessionTerminalAssociations.set(chatSessionResource, toolTerminal);
						this._terminalChatService.registerTerminalInstanceWithChatSession(chatSessionResource, instance);

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

	private async _setupProcessIdAssociation(toolTerminal: IToolTerminal, chatSessionResource: URI, termId: string, isBackground: boolean) {
		await this._associateProcessIdWithSession(toolTerminal.instance, chatSessionResource, termId, toolTerminal.shellIntegrationQuality, isBackground);
		this._register(toolTerminal.instance.onDisposed(() => {
			if (toolTerminal!.instance.processId) {
				this._removeProcessIdAssociation(toolTerminal!.instance.processId);
			}
		}));
	}

	private async _associateProcessIdWithSession(terminal: ITerminalInstance, chatSessionResource: URI, id: string, shellIntegrationQuality: ShellIntegrationQuality, isBackground?: boolean): Promise<void> {
		try {
			// Wait for process ID with timeout
			const pid = await Promise.race([
				terminal.processReady.then(() => terminal.processId),
				timeout(5000).then(() => { throw new Error('Timeout'); })
			]);

			if (isNumber(pid)) {
				const storedAssociations = this._storageService.get(TerminalToolStorageKeysInternal.TerminalSession, StorageScope.WORKSPACE, '{}');
				const associations: Record<number, IStoredTerminalAssociation> = JSON.parse(storedAssociations);

				// Convert URI to string ID for storage (backward compatibility)
				const sessionId = chatSessionResourceToId(chatSessionResource);
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

	private _cleanupSessionTerminals(chatSessionResource: URI): void {
		const toolTerminal = this._sessionTerminalAssociations.get(chatSessionResource);
		if (toolTerminal) {
			this._logService.debug(`RunInTerminalTool: Cleaning up terminal for disposed chat session ${chatSessionResource}`);

			this._sessionTerminalAssociations.delete(chatSessionResource);
			toolTerminal.instance.dispose();

			// Clean up any active executions associated with this session
			const terminalToRemove: string[] = [];
			for (const [termId, execution] of RunInTerminalTool._activeExecutions.entries()) {
				if (execution.instance === toolTerminal.instance) {
					execution.dispose();
					terminalToRemove.push(termId);
				}
			}
			for (const termId of terminalToRemove) {
				RunInTerminalTool._activeExecutions.delete(termId);
			}
		}
	}
	// #endregion
}

/**
 * Represents an active terminal command execution that can run in either foreground or background
 * mode. This unified class replaces the previous split between foreground strategy execution and
 * BackgroundTerminalExecution, allowing seamless switching between modes.
 */
class ActiveTerminalExecution extends Disposable implements IActiveTerminalExecution {
	private _startMarker: IXtermMarker | undefined;
	private _isBackground: boolean;
	private readonly _completionDeferred: DeferredPromise<ITerminalExecuteStrategyResult>;

	/**
	 * The promise that resolves when the execute strategy completes. Can be awaited to get the
	 * full result with exit code.
	 */
	get completionPromise(): Promise<ITerminalExecuteStrategyResult> {
		return this._completionDeferred.p;
	}

	get isBackground(): boolean {
		return this._isBackground;
	}

	get startMarker(): IXtermMarker | undefined {
		return this._startMarker;
	}

	readonly strategy: ITerminalExecuteStrategy;
	private readonly _toolTerminal: IToolTerminal;

	get instance(): ITerminalInstance {
		return this._toolTerminal.instance;
	}

	constructor(
		readonly sessionId: string,
		readonly termId: string,
		toolTerminal: IToolTerminal,
		commandDetection: ICommandDetectionCapability,
		isBackground: boolean,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._toolTerminal = toolTerminal;
		this._isBackground = isBackground;
		this._completionDeferred = new DeferredPromise<ITerminalExecuteStrategyResult>();

		// Create and register the strategy for disposal to clean up its internal resources
		this.strategy = this._register(this._createStrategy(commandDetection));

		this._register(this.strategy.onDidCreateStartMarker(marker => {
			if (marker) {
				// Don't register marker - strategy already manages its lifecycle
				this._startMarker = marker;
			}
		}));
	}

	private _createStrategy(commandDetection: ICommandDetectionCapability): ITerminalExecuteStrategy {
		switch (this._toolTerminal.shellIntegrationQuality) {
			case ShellIntegrationQuality.None:
				return this._instantiationService.createInstance(NoneExecuteStrategy, this._toolTerminal.instance, () => this._toolTerminal.receivedUserInput ?? false);
			case ShellIntegrationQuality.Basic:
				return this._instantiationService.createInstance(BasicExecuteStrategy, this._toolTerminal.instance, () => this._toolTerminal.receivedUserInput ?? false, commandDetection);
			case ShellIntegrationQuality.Rich:
				return this._instantiationService.createInstance(RichExecuteStrategy, this._toolTerminal.instance, commandDetection);
		}
	}

	/**
	 * Starts the command execution using the execute strategy.
	 * @param commandLine The command to execute
	 * @param token Cancellation token
	 * @param commandId Optional command ID for linking
	 * @returns The execution result
	 */
	async start(commandLine: string, token: CancellationToken, commandId?: string): Promise<ITerminalExecuteStrategyResult> {
		try {
			const result = await this.strategy.execute(commandLine, token, commandId);
			this._completionDeferred.complete(result);
			return result;
		} catch (e) {
			this._completionDeferred.error(e);
			throw e;
		}
	}

	/**
	 * Switches this execution to foreground mode, meaning callers will await its completion.
	 */
	setForeground(): void {
		this._isBackground = false;
	}

	/**
	 * Switches this execution to background mode.
	 */
	setBackground(): void {
		this._isBackground = true;
	}

	/**
	 * Gets the current output from the terminal.
	 */
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
