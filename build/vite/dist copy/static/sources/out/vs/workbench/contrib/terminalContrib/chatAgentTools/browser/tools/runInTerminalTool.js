/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var RunInTerminalTool_1;
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { getMediaMime } from '../../../../../../base/common/mime.js';
import { basename, posix, win32 } from '../../../../../../base/common/path.js';
import { OS } from '../../../../../../base/common/platform.js';
import { count } from '../../../../../../base/common/strings.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import { IRemoteAgentService } from '../../../../../services/remote/common/remoteAgentService.js';
import { IChatService } from '../../../../chat/common/chatService/chatService.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { ILanguageModelToolsService, ToolDataSource, ToolInvocationPresentation } from '../../../../chat/common/tools/languageModelToolsService.js';
import { ITerminalChatService, ITerminalService } from '../../../../terminal/browser/terminal.js';
import { ITerminalProfileResolverService } from '../../../../terminal/common/terminal.js';
import { getRecommendedToolsOverRunInTerminal } from '../alternativeRecommendation.js';
import { BasicExecuteStrategy } from '../executeStrategy/basicExecuteStrategy.js';
import { NoneExecuteStrategy } from '../executeStrategy/noneExecuteStrategy.js';
import { RichExecuteStrategy } from '../executeStrategy/richExecuteStrategy.js';
import { getOutput } from '../outputHelpers.js';
import { buildCommandDisplayText, extractCdPrefix, isFish, isPowerShell, isWindowsPowerShell, isZsh, normalizeTerminalCommandForDisplay } from '../runInTerminalHelpers.js';
import { NodeCommandLinePresenter } from './commandLinePresenter/nodeCommandLinePresenter.js';
import { PythonCommandLinePresenter } from './commandLinePresenter/pythonCommandLinePresenter.js';
import { RubyCommandLinePresenter } from './commandLinePresenter/rubyCommandLinePresenter.js';
import { SandboxedCommandLinePresenter } from './commandLinePresenter/sandboxedCommandLinePresenter.js';
import { RunInTerminalToolTelemetry } from '../runInTerminalToolTelemetry.js';
import { ToolTerminalCreator } from '../toolTerminalCreator.js';
import { TreeSitterCommandParser } from '../treeSitterCommandParser.js';
import { CommandLineAutoApproveAnalyzer } from './commandLineAnalyzer/commandLineAutoApproveAnalyzer.js';
import { CommandLineFileWriteAnalyzer } from './commandLineAnalyzer/commandLineFileWriteAnalyzer.js';
import { CommandLineSandboxAnalyzer } from './commandLineAnalyzer/commandLineSandboxAnalyzer.js';
import { OutputMonitor } from './monitoring/outputMonitor.js';
import { OutputMonitorState } from './monitoring/types.js';
import { chatSessionResourceToId, LocalChatSessionUri } from '../../../../chat/common/model/chatUri.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CommandLineCdPrefixRewriter } from './commandLineRewriter/commandLineCdPrefixRewriter.js';
import { CommandLinePreventHistoryRewriter } from './commandLineRewriter/commandLinePreventHistoryRewriter.js';
import { CommandLinePwshChainOperatorRewriter } from './commandLineRewriter/commandLinePwshChainOperatorRewriter.js';
import { CommandLineBackgroundDetachRewriter } from './commandLineRewriter/commandLineBackgroundDetachRewriter.js';
import { CommandLineSandboxRewriter } from './commandLineRewriter/commandLineSandboxRewriter.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IHistoryService } from '../../../../../services/history/common/history.js';
import { TerminalCommandArtifactCollector } from './terminalCommandArtifactCollector.js';
import { isNumber, isString } from '../../../../../../base/common/types.js';
import { IChatWidgetService } from '../../../../chat/browser/chat.js';
import { clamp } from '../../../../../../base/common/numbers.js';
import { SandboxOutputAnalyzer } from './sandboxOutputAnalyzer.js';
import { IAgentSessionsService } from '../../../../chat/browser/agentSessions/agentSessionsService.js';
import { ITerminalSandboxService } from '../../common/terminalSandboxService.js';
import { LanguageModelPartAudience } from '../../../../chat/common/languageModels.js';
import { isSessionAutoApproveLevel, isTerminalAutoApproveAllowed, isToolEligibleForTerminalAutoApproval } from './terminalToolAutoApprove.js';
// #region Tool data
const TERMINAL_SANDBOX_DOCUMENTATION_URL = 'https://aka.ms/vscode-sandboxing';
const TOOL_REFERENCE_NAME = 'runInTerminal';
const LEGACY_TOOL_REFERENCE_FULL_NAMES = ['runCommands/runInTerminal'];
function createPowerShellModelDescription(shell, isSandboxEnabled, backgroundNotifications, networkDomains) {
    const isWinPwsh = isWindowsPowerShell(shell);
    const parts = [
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
        '- By default (mode=sync), shell and cwd are reused by subsequent sync commands',
        '- Use $PWD or Get-Location for current directory',
        '- Use Push-Location/Pop-Location for directory stack',
        '',
        'Program Execution:',
        '- Supports .NET, Python, Node.js, and other executables',
        '- Install modules via Install-Module, Install-Package',
        '- Use Get-Command to verify cmdlet/function availability',
        '',
        'Async Mode:',
        '- For long-running tasks (e.g., servers), use mode=async',
        '- Returns a terminal ID for checking status and runtime later',
        `- Use ${"send_to_terminal" /* TerminalToolId.SendToTerminal */} to send commands to a persistent terminal session (async mode)`,
        '- Use Start-Job for background PowerShell jobs',
    ];
    if (isSandboxEnabled) {
        parts.push(...createSandboxLines(networkDomains));
    }
    parts.push('', 'Output Management:', '- Output is automatically truncated if longer than 60KB to prevent context overflow', '- Use Select-Object, Where-Object, Format-Table to filter output', '- Use -First/-Last parameters to limit results', '- For pager commands, add | Out-String or | Format-List', '', 'Best Practices:', '- Use proper cmdlet names instead of aliases in scripts', '- Quote paths with spaces: "C:\\Path With Spaces"', '- Prefer PowerShell cmdlets over external commands when available', '- Prefer idiomatic PowerShell like Get-ChildItem instead of dir or ls for file listings', '- Use Test-Path to check file/directory existence', '- Be specific with Select-Object properties to avoid excessive output', '- Avoid printing credentials unless absolutely required', `- NEVER run Start-Sleep or similar wait commands.${backgroundNotifications ? ' You will be automatically notified on your next turn when async terminal commands complete or need input.' : ''} Use ${"get_terminal_output" /* TerminalToolId.GetTerminalOutput */} to check output before then`);
    return parts.join('\n');
}
function createSandboxLines(networkDomains) {
    const lines = [
        '',
        'Sandboxing:',
        '- ATTENTION: Terminal sandboxing is enabled, commands run in a sandbox by default',
        '- When executing commands within the sandboxed environment, all operations requiring a temporary directory must utilize the $TMPDIR environment variable. The /tmp directory is not guaranteed to be accessible or writable and must be avoided',
        '- Tools and scripts should respect the TMPDIR environment variable, which is automatically set to an appropriate path within the sandbox',
        '- When a command fails due to sandbox restrictions, immediately re-run it with requestUnsandboxedExecution=true. Do NOT ask the user for permission — setting this flag automatically shows a confirmation prompt to the user',
        '- Only set requestUnsandboxedExecution=true when there is evidence of failures caused by the sandbox, e.g. \'Operation not permitted\' errors, network failures, or file access errors, etc',
        '- When setting requestUnsandboxedExecution=true, also provide requestUnsandboxedExecutionReason explaining why the command needs unsandboxed access',
    ];
    if (networkDomains) {
        const deniedSet = new Set(networkDomains.deniedDomains);
        const effectiveAllowed = networkDomains.allowedDomains.filter(d => !deniedSet.has(d));
        if (effectiveAllowed.length === 0) {
            lines.push('- All network access is blocked in the sandbox');
        }
        else {
            lines.push(`- Only the following domains are accessible in the sandbox (all other network access is blocked): ${effectiveAllowed.join(', ')}`);
        }
        if (networkDomains.deniedDomains.length > 0) {
            lines.push(`- The following domains are explicitly blocked in the sandbox: ${networkDomains.deniedDomains.join(', ')}`);
        }
    }
    return lines;
}
function createGenericDescription(isSandboxEnabled, backgroundNotifications, networkDomains) {
    const parts = [`
Command Execution:
- Use && to chain simple commands on one line
- Prefer pipelines | over temporary files for data flow
- Never create a sub-shell (eg. bash -c "command") unless explicitly asked

Directory Management:
- Prefer relative paths when navigating directories, only use absolute when the path is far away or the current cwd is not expected
- By default (mode=sync), shell and cwd are reused by subsequent sync commands
- Use $PWD for current directory references
- Consider using pushd/popd for directory stack management
- Supports directory shortcuts like ~ and -

Program Execution:
- Supports Python, Node.js, and other executables
- Install packages via package managers (brew, apt, etc.)
- Use which or command -v to verify command availability

Async Mode:
- For long-running tasks (e.g., servers), use mode=async
- Returns a terminal ID for checking status and runtime later
- Use ${"send_to_terminal" /* TerminalToolId.SendToTerminal */} to send commands to a persistent terminal session`];
    if (isSandboxEnabled) {
        parts.push(createSandboxLines(networkDomains).join('\n'));
    }
    parts.push(`

Output Management:
- Output is automatically truncated if longer than 60KB to prevent context overflow
- Use head, tail, grep, awk to filter and limit output size
- For pager commands, disable paging: git --no-pager or add | cat
- Use wc -l to count lines before displaying large outputs

Best Practices:
- Quote variables: "$var" instead of $var to handle spaces
- Use find with -exec or xargs for file operations
- Be specific with commands to avoid excessive output
- Avoid printing credentials unless absolutely required
- NEVER run sleep or similar wait commands in a terminal.${backgroundNotifications ? ' You will be automatically notified on your next turn when async terminal commands complete or need input.' : ''} Use ${"get_terminal_output" /* TerminalToolId.GetTerminalOutput */} to check output before then`);
    return parts.join('');
}
function createBashModelDescription(isSandboxEnabled, backgroundNotifications, networkDomains) {
    return [
        'This tool allows you to execute shell commands in a persistent bash terminal session, preserving environment variables, working directory, and other context across multiple commands.',
        createGenericDescription(isSandboxEnabled, backgroundNotifications, networkDomains),
        '- Use [[ ]] for conditional tests instead of [ ]',
        '- Prefer $() over backticks for command substitution',
        '- Use set -e at start of complex commands to exit on errors'
    ].join('\n');
}
function createZshModelDescription(isSandboxEnabled, backgroundNotifications, networkDomains) {
    return [
        'This tool allows you to execute shell commands in a persistent zsh terminal session, preserving environment variables, working directory, and other context across multiple commands.',
        createGenericDescription(isSandboxEnabled, backgroundNotifications, networkDomains),
        '- Use type to check command type (builtin, function, alias)',
        '- Use jobs, fg, bg for job control',
        '- Use [[ ]] for conditional tests instead of [ ]',
        '- Prefer $() over backticks for command substitution',
        '- Use setopt errexit for strict error handling',
        '- Take advantage of zsh globbing features (**, extended globs)'
    ].join('\n');
}
function createFishModelDescription(isSandboxEnabled, backgroundNotifications, networkDomains) {
    return [
        'This tool allows you to execute shell commands in a persistent fish terminal session, preserving environment variables, working directory, and other context across multiple commands.',
        createGenericDescription(isSandboxEnabled, backgroundNotifications, networkDomains),
        '- Use type to check command type (builtin, function, alias)',
        '- Use jobs, fg, bg for job control',
        '- Use test expressions for conditionals (no [[ ]] syntax)',
        '- Prefer command substitution with () syntax',
        '- Variables are arrays by default, use $var[1] for first element',
        '- Use set -e for strict error handling',
        '- Take advantage of fish\'s autosuggestions and completions'
    ].join('\n');
}
export async function createRunInTerminalToolData(accessor) {
    const instantiationService = accessor.get(IInstantiationService);
    const terminalSandboxService = accessor.get(ITerminalSandboxService);
    const configurationService = accessor.get(IConfigurationService);
    const profileFetcher = instantiationService.createInstance(TerminalProfileFetcher);
    const [shell, os, isSandboxEnabled] = await Promise.all([
        profileFetcher.getCopilotShell(),
        profileFetcher.osBackend,
        terminalSandboxService.isEnabled(),
    ]);
    const networkDomains = isSandboxEnabled ? terminalSandboxService.getResolvedNetworkDomains() : undefined;
    const backgroundNotifications = configurationService.getValue("chat.tools.terminal.backgroundNotifications" /* TerminalChatAgentToolsSettingId.BackgroundNotifications */) === true;
    let modelDescription;
    if (shell && os && isPowerShell(shell, os)) {
        modelDescription = createPowerShellModelDescription(shell, isSandboxEnabled, backgroundNotifications, networkDomains);
    }
    else if (shell && os && isZsh(shell, os)) {
        modelDescription = createZshModelDescription(isSandboxEnabled, backgroundNotifications, networkDomains);
    }
    else if (shell && os && isFish(shell, os)) {
        modelDescription = createFishModelDescription(isSandboxEnabled, backgroundNotifications, networkDomains);
    }
    else {
        modelDescription = createBashModelDescription(isSandboxEnabled, backgroundNotifications, networkDomains);
    }
    const sharedProperties = {
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
    };
    const sandboxProperties = isSandboxEnabled ? {
        requestUnsandboxedExecution: {
            type: 'boolean',
            description: 'Request that this command run outside the terminal sandbox. Only set this when the command clearly needs unsandboxed access. The user will be prompted before the command runs unsandboxed.'
        },
        requestUnsandboxedExecutionReason: {
            type: 'string',
            description: 'A short explanation of why this command must run outside the terminal sandbox. Only provide this when requestUnsandboxedExecution is true.'
        },
    } : {};
    return {
        id: "run_in_terminal" /* TerminalToolId.RunInTerminal */,
        toolReferenceName: TOOL_REFERENCE_NAME,
        legacyToolReferenceFullNames: LEGACY_TOOL_REFERENCE_FULL_NAMES,
        displayName: localize('runInTerminalTool.displayName', 'Run in Terminal'),
        modelDescription: `${modelDescription}\n\nExecution mode:\n- mode='sync': wait for completion up to timeout; if still running, return with a terminal ID.\n- mode='async': wait for an initial idle/output signal, then return with terminal output snapshot and ID.${backgroundNotifications ? `\n\nAsync terminal notifications: When a command finishes in an async terminal, you will be automatically notified on your next turn with the exit code and terminal output. You will also be notified if the terminal needs input. Use ${"get_terminal_output" /* TerminalToolId.GetTerminalOutput */} to check output before then. Do NOT poll or sleep to wait for completion.` : `\n\nUse ${"get_terminal_output" /* TerminalToolId.GetTerminalOutput */} to check on async terminal output. Do NOT poll or sleep to wait for completion.`}`,
        userDescription: localize('runInTerminalTool.userDescription', 'Run commands in the terminal'),
        source: ToolDataSource.Internal,
        icon: Codicon.terminal,
        inputSchema: {
            type: 'object',
            properties: {
                ...sharedProperties,
                ...sandboxProperties,
                mode: {
                    type: 'string',
                    enum: ['sync', 'async'],
                    enumDescriptions: [
                        'Wait for completion up to timeout, then return with collected output. If still running at timeout, the terminal session continues in the background.',
                        'Wait for an initial idle/output signal, then return with a terminal ID and output snapshot while the session may continue running.'
                    ],
                    description: 'Execution mode for this command.'
                },
                isBackground: {
                    type: 'boolean',
                    description: 'Legacy execution mode flag. Deprecated in favor of "mode". If true, equivalent to mode=async. If false, equivalent to mode=sync.'
                },
                timeout: {
                    type: 'number',
                    description: 'Timeout in milliseconds that determines how long to wait before returning. Required for mode=sync. Ignored for mode=async. Use 0 for no timeout.',
                },
            },
            required: ['command', 'explanation', 'goal', 'mode']
        }
    };
}
// #endregion
// #region Tool implementation
var TerminalToolStorageKeysInternal;
(function (TerminalToolStorageKeysInternal) {
    TerminalToolStorageKeysInternal["TerminalSession"] = "chat.terminalSessions";
})(TerminalToolStorageKeysInternal || (TerminalToolStorageKeysInternal = {}));
/**
 * A set of characters to ignore when reporting telemetry
 */
const telemetryIgnoredSequences = [
    '\x1b[I', // Focus in
    '\x1b[O', // Focus out
];
const altBufferMessage = '\n' + localize('runInTerminalTool.altBufferMessage', "The command opened the alternate buffer.");
let RunInTerminalTool = class RunInTerminalTool extends Disposable {
    static { RunInTerminalTool_1 = this; }
    static { this._activeExecutions = new Map(); }
    static getBackgroundOutput(id) {
        const execution = RunInTerminalTool_1._activeExecutions.get(id);
        if (!execution) {
            throw new Error('Invalid terminal ID');
        }
        return execution.getOutput();
    }
    /**
     * Gets an active terminal execution by ID. Returns undefined if not found.
     * Can be used to await the completion of a background terminal command.
     */
    static getExecution(id) {
        return RunInTerminalTool_1._activeExecutions.get(id);
    }
    /**
     * Removes an active terminal execution by ID and disposes it.
     * @returns true if the execution was found and removed, false otherwise.
     */
    static removeExecution(id) {
        const execution = RunInTerminalTool_1._activeExecutions.get(id);
        if (!execution) {
            return false;
        }
        execution.dispose();
        RunInTerminalTool_1._activeExecutions.delete(id);
        return true;
    }
    _resolveExecutionOptions(args) {
        const mode = args.mode ?? (args.isBackground ? 'async' : 'sync');
        switch (mode) {
            case 'async':
                return { mode: 'async', persistentSession: true, waitStrategy: 'idle' };
            case 'sync':
            default:
                return { mode: 'sync', persistentSession: false, waitStrategy: 'completion' };
        }
    }
    /**
     * Controls whether this tool wires up sandbox-specific command-line
     * behavior, including both the {@link CommandLineSandboxRewriter} and the
     * {@link CommandLineSandboxAnalyzer}. This is separate from
     * ITerminalSandboxService.isEnabled(), which reports whether terminal
     * sandboxing is currently enabled for the running window.
     */
    get _enableCommandLineSandboxRewriting() {
        return true;
    }
    constructor(_chatService, _configurationService, _fileService, _historyService, _instantiationService, _labelService, _languageModelToolsService, _remoteAgentService, _storageService, _terminalChatService, _logService, _terminalService, _terminalSandboxService, _workspaceContextService, _chatWidgetService, _agentSessionsService) {
        super();
        this._chatService = _chatService;
        this._configurationService = _configurationService;
        this._fileService = _fileService;
        this._historyService = _historyService;
        this._instantiationService = _instantiationService;
        this._labelService = _labelService;
        this._languageModelToolsService = _languageModelToolsService;
        this._remoteAgentService = _remoteAgentService;
        this._storageService = _storageService;
        this._terminalChatService = _terminalChatService;
        this._logService = _logService;
        this._terminalService = _terminalService;
        this._terminalSandboxService = _terminalSandboxService;
        this._workspaceContextService = _workspaceContextService;
        this._chatWidgetService = _chatWidgetService;
        this._agentSessionsService = _agentSessionsService;
        this._archivedSessionListener = this._register(new MutableDisposable());
        this._sessionTerminalAssociations = new ResourceMap();
        this._sessionTerminalInstances = new ResourceMap();
        this._terminalsBeingDisposedBySessionCleanup = new Set();
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
        if (this._enableCommandLineSandboxRewriting) {
            this._commandLineRewriters.push(this._register(this._instantiationService.createInstance(CommandLineSandboxRewriter)));
        }
        // BackgroundDetachRewriter must come after SandboxRewriter so that nohup/Start-Process
        // wraps the entire sandbox runtime, keeping both the sandbox and the child process alive
        // through VS Code shutdown.
        this._commandLineRewriters.push(this._register(this._instantiationService.createInstance(CommandLineBackgroundDetachRewriter)));
        // PreventHistoryRewriter must be last so the leading space is applied to the final
        // command, including any sandbox wrapping.
        this._commandLineRewriters.push(this._register(this._instantiationService.createInstance(CommandLinePreventHistoryRewriter)));
        this._commandLineAnalyzers = [
            this._register(this._instantiationService.createInstance(CommandLineFileWriteAnalyzer, this._treeSitterCommandParser, (message, args) => this._logService.info(`RunInTerminalTool#CommandLineFileWriteAnalyzer: ${message}`, args))),
            this._register(this._instantiationService.createInstance(CommandLineAutoApproveAnalyzer, this._treeSitterCommandParser, this._telemetry, (message, args) => this._logService.info(`RunInTerminalTool#CommandLineAutoApproveAnalyzer: ${message}`, args))),
        ];
        if (this._enableCommandLineSandboxRewriting) {
            this._commandLineAnalyzers.push(this._register(this._instantiationService.createInstance(CommandLineSandboxAnalyzer)));
        }
        this._commandLinePresenters = [
            this._instantiationService.createInstance(SandboxedCommandLinePresenter),
            new NodeCommandLinePresenter(),
            new PythonCommandLinePresenter(),
            new RubyCommandLinePresenter(),
        ];
        this._outputAnalyzers = [
            this._register(this._instantiationService.createInstance(SandboxOutputAnalyzer)),
        ];
        // Clear out warning accepted state if the setting is disabled
        this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, e => {
            if (!e || e.affectsConfiguration("chat.tools.terminal.enableAutoApprove" /* TerminalChatAgentToolsSettingId.EnableAutoApprove */)) {
                if (this._configurationService.getValue("chat.tools.terminal.enableAutoApprove" /* TerminalChatAgentToolsSettingId.EnableAutoApprove */) !== true) {
                    this._storageService.remove("chat.tools.terminal.autoApprove.warningAccepted" /* TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted */, -1 /* StorageScope.APPLICATION */);
                }
            }
        }));
        // Restore terminal associations from storage
        this._restoreTerminalAssociations();
        this._register(this._terminalService.onDidDisposeInstance(e => {
            this._removeTerminalAssociations(e);
        }));
        // Listen for chat session disposal to clean up associated terminals
        this._register(this._chatService.onDidDisposeSession(e => {
            for (const resource of e.sessionResources) {
                this._cleanupSessionTerminals(resource);
            }
        }));
    }
    async handleToolStream(context, _token) {
        const partialInput = context.rawInput;
        if (partialInput && typeof partialInput === 'object' && partialInput.command) {
            const truncatedCommand = buildCommandDisplayText(partialInput.command);
            const invocationMessage = new MarkdownString(localize('runInTerminal.streaming', "Running `{0}`", truncatedCommand));
            return { invocationMessage };
        }
        return { invocationMessage: localize('runInTerminal.streaming.default', "Running command") };
    }
    async prepareToolInvocation(context, token) {
        const args = context.parameters;
        const executionOptions = this._resolveExecutionOptions(args);
        const chatSessionResource = context.chatSessionResource;
        let instance;
        if (chatSessionResource) {
            const toolTerminal = this._sessionTerminalAssociations.get(chatSessionResource);
            if (toolTerminal && !toolTerminal.isBackground) {
                instance = toolTerminal.instance;
            }
        }
        const [os, shell, cwd, sandboxPrereqs] = await Promise.all([
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
            })(),
            this._terminalSandboxService.checkForSandboxingPrereqs()
        ]);
        const language = os === 1 /* OperatingSystem.Windows */ ? 'pwsh' : 'sh';
        const isTerminalSandboxEnabled = sandboxPrereqs.enabled;
        const explicitUnsandboxRequest = isTerminalSandboxEnabled && args.requestUnsandboxedExecution === true;
        let requiresUnsandboxConfirmation = explicitUnsandboxRequest;
        let requestUnsandboxedExecutionReason = explicitUnsandboxRequest ? args.requestUnsandboxedExecutionReason : undefined;
        let blockedDomains;
        const missingDependencies = sandboxPrereqs.failedCheck === "dependencies" /* TerminalSandboxPrerequisiteCheck.Dependencies */ && sandboxPrereqs.missingDependencies?.length
            ? sandboxPrereqs.missingDependencies
            : undefined;
        const terminalToolSessionId = generateUuid();
        // Generate a custom command ID to link the command between renderer and pty host
        const terminalCommandId = `tool-${generateUuid()}`;
        let rewrittenCommand = args.command;
        let forDisplayCommand = undefined;
        let isSandboxWrapped = false;
        for (const rewriter of this._commandLineRewriters) {
            const rewriteResult = await rewriter.rewrite({
                commandLine: rewrittenCommand,
                cwd,
                shell,
                os,
                isBackground: executionOptions.persistentSession,
                requestUnsandboxedExecution: requiresUnsandboxConfirmation,
            });
            if (rewriteResult) {
                rewrittenCommand = rewriteResult.rewritten;
                forDisplayCommand = rewriteResult.forDisplay ?? forDisplayCommand;
                if (rewriteResult.isSandboxWrapped) {
                    isSandboxWrapped = true;
                }
                else if (rewriteResult.isSandboxWrapped === false) {
                    isSandboxWrapped = false;
                }
                if (rewriteResult.requiresUnsandboxConfirmation) {
                    requiresUnsandboxConfirmation = true;
                }
                if (rewriteResult.blockedDomains?.length) {
                    blockedDomains = rewriteResult.blockedDomains;
                    requestUnsandboxedExecutionReason = this._getBlockedDomainReason(rewriteResult.blockedDomains, rewriteResult.deniedDomains);
                }
                this._logService.info(`RunInTerminalTool: Command rewritten by ${rewriter.constructor.name}: ${rewriteResult.reasoning}`);
            }
        }
        const toolSpecificData = {
            kind: 'terminal',
            terminalToolSessionId,
            terminalCommandId,
            commandLine: {
                original: args.command,
                toolEdited: rewrittenCommand === args.command ? undefined : rewrittenCommand,
                forDisplay: forDisplayCommand ?? normalizeTerminalCommandForDisplay(rewrittenCommand ?? args.command),
                isSandboxWrapped,
            },
            cwd,
            language,
            isBackground: executionOptions.persistentSession,
            requestUnsandboxedExecution: requiresUnsandboxConfirmation,
            requestUnsandboxedExecutionReason,
            missingSandboxDependencies: missingDependencies,
        };
        let sandboxConfirmationMessageForMissingDeps = undefined;
        // If sandbox dependencies are missing, show a confirmation asking the user to install them.
        // This is handled before the tool is invoked so the model never sees the dependency error.
        if (missingDependencies) {
            const depsList = missingDependencies.join(', ');
            sandboxConfirmationMessageForMissingDeps = {
                title: localize('runInTerminal.missingDeps.title', "Missing Sandbox Dependencies"),
                message: new MarkdownString(localize('runInTerminal.missingDeps.message', "The following dependencies required for sandboxed execution are not installed: {0}. Would you like to install them?", depsList)),
                customButtons: [
                    localize('runInTerminal.missingDeps.install', "Install"),
                    localize('runInTerminal.missingDeps.cancel', "Cancel"),
                ],
            };
        }
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
        const isEligibleForAutoApproval = () => isToolEligibleForTerminalAutoApproval(TOOL_REFERENCE_NAME, this._configurationService, LEGACY_TOOL_REFERENCE_FULL_NAMES);
        const isAutoApproveEnabled = this._configurationService.getValue("chat.tools.terminal.enableAutoApprove" /* TerminalChatAgentToolsSettingId.EnableAutoApprove */) === true;
        const isAutoApproveAllowed = isTerminalAutoApproveAllowed(TOOL_REFERENCE_NAME, this._configurationService, this._storageService, LEGACY_TOOL_REFERENCE_FULL_NAMES);
        const commandLineAnalyzerOptions = {
            commandLine,
            cwd,
            os,
            shell,
            treeSitterLanguage: isPowerShell(shell, os) ? "powershell" /* TreeSitterCommandParserLanguage.PowerShell */ : "bash" /* TreeSitterCommandParserLanguage.Bash */,
            terminalToolSessionId,
            chatSessionResource,
            requiresUnsandboxConfirmation,
        };
        // In Autopilot/Bypass Approvals modes, do not interact with terminal auto-approve rules.
        // Commands should flow through directly based on the chat permission level.
        const isSessionAutoApproved = chatSessionResource && isSessionAutoApproveLevel(chatSessionResource, this._configurationService, this._chatWidgetService, this._chatService);
        const commandLineAnalyzers = isSessionAutoApproved
            ? this._commandLineAnalyzers.filter(e => !(e instanceof CommandLineAutoApproveAnalyzer))
            : this._commandLineAnalyzers;
        const commandLineAnalyzerResults = await Promise.all(commandLineAnalyzers.map(e => e.analyze(commandLineAnalyzerOptions)));
        const disclaimersRaw = commandLineAnalyzerResults.map(e => e.disclaimers).filter(e => !!e).flatMap(e => e);
        let disclaimer;
        if (disclaimersRaw.length > 0) {
            const disclaimerTexts = disclaimersRaw.map(d => typeof d === 'string' ? d : d.value);
            const hasMarkdownDisclaimer = disclaimersRaw.some(d => typeof d !== 'string');
            const mdOptions = hasMarkdownDisclaimer
                ? { supportThemeIcons: true, isTrusted: { enabledCommands: ["workbench.action.terminal.chat.openTerminalSettingsLink" /* TerminalChatCommandId.OpenTerminalSettingsLink */] } }
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
            analyzersIsAutoApproveAllowed);
        const isFinalAutoApproved = (
        // Is the setting enabled and the user has opted-in
        isAutoApproveAllowed &&
            // Would be auto-approved based on rules
            wouldBeAutoApproved) || commandLineAnalyzerResults.some(e => e.forceAutoApproval);
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
        const commandToDisplay = (toolSpecificData.commandLine.forDisplay ?? toolSpecificData.commandLine.userEdited ?? toolSpecificData.commandLine.toolEdited ?? toolSpecificData.commandLine.original).trimStart();
        const extractedCd = extractCdPrefix(commandToDisplay, shell, os);
        let confirmationTitle;
        if (extractedCd && cwd) {
            // Construct the full directory path using the cwd's scheme/authority
            const isAbsolutePath = os === 1 /* OperatingSystem.Windows */
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
            confirmationTitle = localize('runInTerminal.inDirectory', "Run `{0}` command within `{1}`?", shellType, directoryLabel);
        }
        else {
            toolSpecificData.confirmation = {
                commandLine: commandToDisplay,
            };
            confirmationTitle = localize('runInTerminal', "Run `{0}` command?", shellType);
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
                    if (presenterResult.languageDisplayName) {
                        confirmationTitle = localize('runInTerminal.presentationOverride.inDirectory', "Run `{0}` command in `{1}` within `{2}`?", presenterResult.languageDisplayName, shellType, toolSpecificData.confirmation.cwdLabel);
                    }
                    else {
                        confirmationTitle = localize('runInTerminal.presentationOverride.inDirectory.withoutLanguage', "Run command in `{0}` within `{1}`?", shellType, toolSpecificData.confirmation.cwdLabel);
                    }
                }
                else {
                    if (presenterResult.languageDisplayName) {
                        confirmationTitle = localize('runInTerminal.presentationOverride', "Run `{0}` command in `{1}`?", presenterResult.languageDisplayName, shellType);
                    }
                    else {
                        confirmationTitle = localize('runInTerminal.presentationOverride.withoutLanguage', "Run command in `{0}`?", shellType);
                    }
                }
                if (!presenterResult.processOtherPresenters) {
                    break;
                }
                presenterInput = presenterResult.commandLine;
            }
        }
        if (requiresUnsandboxConfirmation) {
            confirmationTitle = blockedDomains?.length
                ? localize('runInTerminal.unsandboxed.domain', "Run `{0}` command outside the [sandbox]({1}) to access {2}?", shellType, TERMINAL_SANDBOX_DOCUMENTATION_URL, this._formatBlockedDomainsForTitle(blockedDomains))
                : localize('runInTerminal.unsandboxed', "Run `{0}` command outside the [sandbox]({1})?", shellType, TERMINAL_SANDBOX_DOCUMENTATION_URL);
        }
        // If forceConfirmationReason is set, always show confirmation regardless of auto-approval
        const shouldShowConfirmation = (!isFinalAutoApproved && !isSessionAutoApproved) || context.forceConfirmationReason !== undefined;
        const confirmationMessage = requiresUnsandboxConfirmation
            ? new MarkdownString(localize('runInTerminal.unsandboxed.confirmationMessage', "Explanation: {0}\n\nGoal: {1}\n\nReason for leaving the sandbox: {2}", args.explanation, args.goal, requestUnsandboxedExecutionReason || localize('runInTerminal.unsandboxed.confirmationMessage.defaultReason', "The model indicated that this command needs unsandboxed access.")))
            : new MarkdownString(localize('runInTerminal.confirmationMessage', "Explanation: {0}\n\nGoal: {1}", args.explanation, args.goal));
        const confirmationMessages = shouldShowConfirmation ? {
            title: confirmationTitle,
            message: confirmationMessage,
            disclaimer,
            allowAutoConfirm: undefined,
            terminalCustomActions: customActions,
        } : undefined;
        const rawDisplayCommand = toolSpecificData.commandLine.forDisplay ?? toolSpecificData.commandLine.toolEdited ?? toolSpecificData.commandLine.original;
        const displayCommand = rawDisplayCommand.length > 80
            ? rawDisplayCommand.substring(0, 77) + '...'
            : rawDisplayCommand;
        const invocationMessage = toolSpecificData.commandLine.isSandboxWrapped
            ? new MarkdownString(localize('runInTerminal.invocation.sandbox', "Running `{0}` in sandbox", displayCommand))
            : new MarkdownString(localize('runInTerminal.invocation', "Running `{0}`", displayCommand));
        return {
            invocationMessage,
            icon: toolSpecificData.commandLine.isSandboxWrapped ? Codicon.terminalSecure : Codicon.terminal,
            confirmationMessages: sandboxConfirmationMessageForMissingDeps ?? confirmationMessages,
            toolSpecificData,
        };
    }
    _formatBlockedDomainsForTitle(blockedDomains) {
        if (blockedDomains.length === 1) {
            return `\`${blockedDomains[0]}\``;
        }
        return localize('runInTerminal.unsandboxed.domain.summary', "`{0}` and {1} more domains", blockedDomains[0], blockedDomains.length - 1);
    }
    _getBlockedDomainReason(blockedDomains, deniedDomains = []) {
        if (deniedDomains.length === blockedDomains.length && deniedDomains.length > 0) {
            if (blockedDomains.length === 1) {
                return localize('runInTerminal.unsandboxed.domain.reason.denied.single', "This command accesses {0}, which is blocked by chat.agent.sandbox.deniedNetworkDomains.", blockedDomains[0]);
            }
            return localize('runInTerminal.unsandboxed.domain.reason.denied.multi', "This command accesses {0} and {1} more domains that are blocked by chat.agent.sandbox.deniedNetworkDomains.", blockedDomains[0], blockedDomains.length - 1);
        }
        if (deniedDomains.length > 0) {
            if (blockedDomains.length === 1) {
                return localize('runInTerminal.unsandboxed.domain.reason.mixed.single', "This command accesses {0}, which is blocked by chat.agent.sandbox.deniedNetworkDomains or not added to chat.agent.sandbox.allowedNetworkDomains.", blockedDomains[0]);
            }
            return localize('runInTerminal.unsandboxed.domain.reason.mixed.multi', "This command accesses {0} and {1} more domains that are blocked by chat.agent.sandbox.deniedNetworkDomains or not added to chat.agent.sandbox.allowedNetworkDomains.", blockedDomains[0], blockedDomains.length - 1);
        }
        if (blockedDomains.length === 1) {
            return localize('runInTerminal.unsandboxed.domain.reason.single', "This command accesses {0}, which is not permitted by the current chat.agent.sandbox configuration.", blockedDomains[0]);
        }
        return localize('runInTerminal.unsandboxed.domain.reason.multi', "This command accesses {0} and {1} more domains that are not permitted by the current chat.agent.sandbox configuration.", blockedDomains[0], blockedDomains.length - 1);
    }
    async invoke(invocation, _countTokens, _progress, token) {
        const toolSpecificData = invocation.toolSpecificData;
        if (!toolSpecificData) {
            throw new Error('toolSpecificData must be provided for this tool');
        }
        if (!invocation.context) {
            throw new Error('Invocation context must be provided for this tool');
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
        // Handle missing sandbox dependencies install flow.
        // The user was shown a confirmation window in prepareToolInvocation.
        if (toolSpecificData.missingSandboxDependencies?.length) {
            const installButton = localize('runInTerminal.missingDeps.install', "Install");
            if (invocation.selectedCustomButton === installButton) {
                // Install dependencies, focus terminal for sudo password, wait for completion
                const sessionResource = invocation.context.sessionResource;
                const { exitCode } = await this._terminalSandboxService.installMissingSandboxDependencies(toolSpecificData.missingSandboxDependencies, sessionResource, token, {
                    createTerminal: async () => this._terminalService.createTerminal({}),
                    focusTerminal: async (terminal) => {
                        this._terminalService.setActiveInstance(terminal);
                        await this._terminalService.revealTerminal(terminal, true);
                        terminal.focus();
                    },
                });
                if (exitCode !== undefined && exitCode !== 0) {
                    return {
                        content: [{
                                kind: 'text',
                                value: localize('runInTerminal.missingDeps.failed', "Sandbox dependency installation failed (exit code {0}). The command was not executed.", exitCode),
                            }],
                    };
                }
                if (exitCode === undefined) {
                    return {
                        content: [{
                                kind: 'text',
                                value: localize('runInTerminal.missingDeps.unknown', "Could not determine whether sandbox dependency installation succeeded. The command was not executed."),
                            }],
                    };
                }
                // Installation succeeded — fall through to execute the original command
                this._logService.info('RunInTerminalTool: Sandbox dependency installation succeeded, proceeding with command execution');
            }
            else {
                // User chose to cancel — do not run the command
                this._logService.info('RunInTerminalTool: User cancelled sandbox dependency installation');
                return {
                    content: [{
                            kind: 'text',
                            value: localize('runInTerminal.missingDeps.cancelled', "Sandbox dependency installation was cancelled by the user."),
                        }],
                };
            }
        }
        const args = invocation.parameters;
        const executionOptions = this._resolveExecutionOptions(args);
        this._logService.debug(`RunInTerminalTool: Invoking with options ${JSON.stringify(args)}`);
        let toolResultMessage;
        if (args.timeout !== undefined && (Number.isNaN(args.timeout) || args.timeout < 0)) {
            return {
                content: [{
                        kind: 'text',
                        value: 'Error: timeout must be a non-negative number of milliseconds (use 0 for no timeout).'
                    }]
            };
        }
        if (executionOptions.mode === 'sync' && args.timeout === undefined) {
            if (args.isBackground === false) {
                // Legacy path: isBackground=false didn't require timeout, default to no timeout
                args.timeout = 0;
            }
            else {
                return {
                    content: [{
                            kind: 'text',
                            value: 'Error: timeout is required for mode=sync and must be provided in milliseconds (use 0 for no timeout).'
                        }]
                };
            }
        }
        const chatSessionResource = invocation.context.sessionResource;
        const command = toolSpecificData.commandLine.userEdited ?? toolSpecificData.commandLine.toolEdited ?? toolSpecificData.commandLine.original;
        const didUserEditCommand = (toolSpecificData.commandLine.userEdited !== undefined &&
            toolSpecificData.commandLine.userEdited !== toolSpecificData.commandLine.original);
        const didToolEditCommand = (!didUserEditCommand &&
            toolSpecificData.commandLine.toolEdited !== undefined &&
            toolSpecificData.commandLine.toolEdited !== toolSpecificData.commandLine.original &&
            // Only consider it a meaningful edit if the display form also differs from the
            // original. Cosmetic rewrites like prepending a space to prevent shell history
            // should not trigger the "tool simplified the command" note.
            normalizeTerminalCommandForDisplay(toolSpecificData.commandLine.toolEdited).trim() !== normalizeTerminalCommandForDisplay(toolSpecificData.commandLine.original).trim());
        const didSandboxWrapCommand = toolSpecificData.commandLine.isSandboxWrapped === true;
        if (token.isCancellationRequested) {
            throw new CancellationError();
        }
        let error;
        const isNewSession = !executionOptions.persistentSession && !this._sessionTerminalAssociations.has(chatSessionResource);
        const timingStart = Date.now();
        const termId = generateUuid();
        const terminalToolSessionId = toolSpecificData.terminalToolSessionId;
        const store = new DisposableStore();
        // Unified terminal initialization
        this._logService.debug(`RunInTerminalTool: Creating ${executionOptions.persistentSession ? 'background' : 'foreground'} terminal. termId=${termId}, chatSessionResource=${chatSessionResource}`);
        const toolTerminal = await this._initTerminal(chatSessionResource, termId, terminalToolSessionId, executionOptions.persistentSession, token);
        this._handleTerminalVisibility(toolTerminal, chatSessionResource);
        const timingConnectMs = Date.now() - timingStart;
        const xterm = await toolTerminal.instance.xtermReadyPromise;
        if (!xterm) {
            throw new Error('Instance was disposed before xterm.js was ready');
        }
        const commandDetection = toolTerminal.instance.capabilities.get(2 /* TerminalCapability.CommandDetection */);
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
        let exitCode;
        let altBufferResult;
        let didTimeout = false;
        // Covers both terminals that start as background (persistentSession) and
        // foreground terminals that later move to background (timeout/continue-in-bg).
        let isBackgroundExecution = executionOptions.persistentSession;
        let timeoutPromise;
        let timeoutRacePromise;
        let outputMonitor;
        let pollingResult;
        const executeCancellation = store.add(new CancellationTokenSource(token));
        // Set up timeout only for wait strategies that block on command completion.
        const timeoutValue = args.timeout !== undefined ? clamp(args.timeout, 0, Number.MAX_SAFE_INTEGER) : undefined;
        if (executionOptions.waitStrategy === 'completion' && timeoutValue !== undefined && timeoutValue > 0) {
            const shouldEnforceTimeout = this._configurationService.getValue("chat.tools.terminal.enforceTimeoutFromModel" /* TerminalChatAgentToolsSettingId.EnforceTimeoutFromModel */) === true;
            if (shouldEnforceTimeout) {
                timeoutPromise = timeout(timeoutValue);
                timeoutRacePromise = timeoutPromise.then(() => ({ type: 'timeout' })).catch(() => ({ type: 'timeout' }));
            }
        }
        // Set up continue in background listener - uses a race promise instead of cancellation
        // to allow the execution strategy to continue running and preserve its marker
        let continueInBackgroundResolve;
        const continueInBackgroundPromise = new Promise(resolve => {
            continueInBackgroundResolve = resolve;
        });
        if (terminalToolSessionId) {
            store.add(this._terminalChatService.onDidContinueInBackground(sessionId => {
                if (sessionId === terminalToolSessionId) {
                    const execution = RunInTerminalTool_1._activeExecutions.get(termId);
                    execution?.setBackground?.();
                    isBackgroundExecution = true;
                    // Resolve the race promise instead of cancelling - this allows the execution
                    // to continue running so it can be awaited later
                    continueInBackgroundResolve?.();
                }
            }));
        }
        let executionPromise;
        try {
            // Create unified ActiveTerminalExecution (creates and owns the strategy)
            const execution = this._instantiationService.createInstance(ActiveTerminalExecution, chatSessionResource, termId, toolTerminal, commandDetection, executionOptions.persistentSession);
            if (toolTerminal.shellIntegrationQuality === "none" /* ShellIntegrationQuality.None */) {
                toolResultMessage = '$(info) Enable [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration) to improve command detection';
            }
            this._logService.info(`RunInTerminalTool: Using \`${execution.strategy.type}\` execute strategy for command \`${command}\``);
            store.add(execution);
            RunInTerminalTool_1._activeExecutions.set(termId, execution);
            // Set up OutputMonitor when start marker is created
            const startMarkerPromise = Event.toPromise(execution.strategy.onDidCreateStartMarker);
            const outputMonitorPollFn = executionOptions.persistentSession
                ? async (executionForPoll) => ({
                    output: executionForPoll.getOutput(),
                    state: OutputMonitorState.Idle,
                })
                : undefined;
            store.add(execution.strategy.onDidCreateStartMarker(startMarker => {
                if (!outputMonitor) {
                    outputMonitor = this._instantiationService.createInstance(OutputMonitor, {
                        instance: toolTerminal.instance,
                        sessionResource: chatSessionResource,
                        getOutput: (marker) => execution.getOutput(marker ?? startMarker)
                    }, outputMonitorPollFn, invocation.context, token, command);
                }
            }));
            // Start execution (non-blocking - runs in background)
            executionPromise = execution.start(command, executeCancellation.token, commandId);
            if (executionOptions.waitStrategy === 'idle') {
                this._logService.debug(`RunInTerminalTool: Starting persistent execution with idle wait strategy \`${command}\``);
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
                let resultText = (didSandboxWrapCommand ? `Command is now running in terminal with ID=${termId}`
                    : didUserEditCommand
                        ? `Note: The user manually edited the command to \`${command}\`, and that command is now running in terminal with ID=${termId}`
                        : didToolEditCommand
                            ? `Note: The tool simplified the command to \`${command}\`, and that command is now running in terminal with ID=${termId}`
                            : `Command is running in terminal with ID=${termId}`);
                const backgroundOutput = pollingResult?.output;
                const outputAnalyzerMessage = backgroundOutput
                    ? await this._getOutputAnalyzerMessage(undefined, backgroundOutput, command, didSandboxWrapCommand)
                    : undefined;
                if (pollingResult && pollingResult.state === OutputMonitorState.Idle) {
                    resultText += `\n The command became idle with output:\n`;
                    if (outputAnalyzerMessage) {
                        resultText += `${outputAnalyzerMessage}\n`;
                    }
                    resultText += pollingResult.output;
                }
                else if (pollingResult) {
                    resultText += `\n The command is still running, with output:\n`;
                    if (outputAnalyzerMessage) {
                        resultText += `${outputAnalyzerMessage}\n`;
                    }
                    resultText += pollingResult.output;
                }
                const endCwd = await toolTerminal.instance.getCwdResource();
                return {
                    toolMetadata: {
                        exitCode: undefined,
                        id: termId,
                        cwd: endCwd?.toString(),
                    },
                    content: [{
                            kind: 'text',
                            value: resultText,
                        }],
                };
            }
            else {
                // Foreground mode: race execution completion against continue in background
                const raceCandidates = [
                    executionPromise.then(result => ({ type: 'completed', result })),
                    continueInBackgroundPromise.then(() => ({ type: 'background' }))
                ];
                if (timeoutRacePromise) {
                    raceCandidates.push(timeoutRacePromise);
                }
                const raceResult = await Promise.race(raceCandidates);
                if (raceResult.type === 'background') {
                    // Moved to background - execution continues running, just return current output
                    this._logService.debug(`RunInTerminalTool: Continue in background triggered, returning output collected so far`);
                    error = 'continueInBackground';
                    const backgroundOutput = execution.getOutput();
                    outputLineCount = backgroundOutput ? count(backgroundOutput.trim(), '\n') + 1 : 0;
                    terminalResult = backgroundOutput;
                }
                else if (raceResult.type === 'timeout') {
                    // Timeout reached - return partial output and keep terminal alive as background.
                    this._logService.debug(`RunInTerminalTool: Timeout reached, returning output collected so far`);
                    error = 'timeout';
                    didTimeout = true;
                    isBackgroundExecution = true;
                    toolTerminal.isBackground = true;
                    this._sessionTerminalAssociations.delete(chatSessionResource);
                    await this._associateProcessIdWithSession(toolTerminal.instance, chatSessionResource, termId, toolTerminal.shellIntegrationQuality, true);
                    const timeoutOutput = execution.getOutput();
                    outputLineCount = timeoutOutput ? count(timeoutOutput.trim(), '\n') + 1 : 0;
                    terminalResult = timeoutOutput ?? '';
                }
                else {
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
                        const altBufferCwd = await toolTerminal.instance.getCwdResource();
                        altBufferResult = {
                            toolResultMessage,
                            toolMetadata: {
                                exitCode: undefined,
                                id: termId,
                                cwd: altBufferCwd?.toString(),
                            },
                            content: [{
                                    kind: 'text',
                                    value: altBufferMessage,
                                }]
                        };
                    }
                    else {
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
                        this._logService.info(`RunInTerminalTool: Finished \`${execution.strategy.type}\` execute strategy with exitCode \`${executeResult.exitCode}\`, result.length \`${executeResult.output?.length}\`, error \`${executeResult.error}\``);
                        outputLineCount = executeResult.output === undefined ? 0 : count(executeResult.output.trim(), '\n') + 1;
                        exitCode = executeResult.exitCode;
                        error = executeResult.error;
                        const resultArr = [];
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
        }
        catch (e) {
            // Handle timeout case - get output collected so far and return it
            if (didTimeout && e instanceof CancellationError) {
                this._logService.debug(`RunInTerminalTool: Timeout reached, returning output collected so far`);
                error = 'timeout';
                isBackgroundExecution = true;
                toolTerminal.isBackground = true;
                this._sessionTerminalAssociations.delete(chatSessionResource);
                const timeoutOutput = getOutput(toolTerminal.instance, undefined);
                outputLineCount = timeoutOutput ? count(timeoutOutput.trim(), '\n') + 1 : 0;
                terminalResult = timeoutOutput ?? '';
            }
            else {
                this._logService.debug(`RunInTerminalTool: Threw exception`);
                // Capture output snapshot before disposing on cancellation
                if (e instanceof CancellationError) {
                    await this._commandArtifactCollector.capture(toolSpecificData, toolTerminal.instance, commandId);
                    // Mark the command as cancelled if it hasn't finished yet
                    // This ensures the decoration shows a failure icon instead of running
                    const state = toolSpecificData.terminalCommandState ?? {};
                    if (state.exitCode === undefined) {
                        state.exitCode = -1;
                        state.timestamp = state.timestamp ?? timingStart;
                        state.duration = state.duration ?? Math.max(0, Date.now() - state.timestamp);
                    }
                    toolSpecificData.terminalCommandState = state;
                }
                // Clean up the execution on error
                RunInTerminalTool_1._activeExecutions.get(termId)?.dispose();
                RunInTerminalTool_1._activeExecutions.delete(termId);
                toolTerminal.instance.dispose();
                error = e instanceof CancellationError ? 'canceled' : 'unexpectedException';
                throw e;
            }
        }
        finally {
            timeoutPromise?.cancel();
            if (isBackgroundExecution && executionPromise) {
                // Background terminal (started as bg or moved to bg) - attach error handler since we won't await it
                executionPromise.catch((e) => {
                    if (!(e instanceof CancellationError)) {
                        this._logService.error(`RunInTerminalTool: Background execution error`, e);
                    }
                });
                // Register a listener to notify the agent when commands complete in this
                // background terminal, and continue the output monitor for prompt-for-input detection
                if (this._configurationService.getValue("chat.tools.terminal.backgroundNotifications" /* TerminalChatAgentToolsSettingId.BackgroundNotifications */)) {
                    this._registerCompletionNotification(toolTerminal.instance, termId, chatSessionResource, command, outputMonitor);
                }
                else {
                    outputMonitor?.dispose();
                }
            }
            else {
                // Foreground completed or error - clean up execution and output monitor
                RunInTerminalTool_1._activeExecutions.get(termId)?.dispose();
                RunInTerminalTool_1._activeExecutions.delete(termId);
                outputMonitor?.dispose();
            }
            store.dispose();
            const timingExecuteMs = Date.now() - timingStart;
            this._telemetry.logInvoke(toolTerminal.instance, {
                terminalToolSessionId: toolSpecificData.terminalToolSessionId,
                didUserEditCommand,
                didToolEditCommand,
                isBackground: executionOptions.persistentSession,
                isSandboxWrapped: toolSpecificData.commandLine.isSandboxWrapped === true,
                requestUnsandboxedExecutionReason: args.requestUnsandboxedExecutionReason,
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
        const resultText = [];
        if (!didSandboxWrapCommand) {
            if (didUserEditCommand) {
                resultText.push(`Note: The user manually edited the command to \`${command}\`, and this is the output of running that command instead:\n`);
            }
            else if (didToolEditCommand) {
                resultText.push(`Note: The tool simplified the command to \`${command}\`, and this is the output of running that command instead:\n`);
            }
            if (isBackgroundExecution && !executionOptions.persistentSession) {
                resultText.push(`Note: This terminal execution was moved to the background using the ID ${termId}\n`);
            }
        }
        if (didTimeout && timeoutValue !== undefined && timeoutValue > 0) {
            const notificationHint = this._configurationService.getValue("chat.tools.terminal.backgroundNotifications" /* TerminalChatAgentToolsSettingId.BackgroundNotifications */)
                ? ' You will be automatically notified on your next turn when it completes.'
                : '';
            resultText.push(`Note: Command timed out after ${timeoutValue}ms. The command may still be running in terminal ID ${termId}.${notificationHint} Use ${"get_terminal_output" /* TerminalToolId.GetTerminalOutput */} to check output before then, ${"send_to_terminal" /* TerminalToolId.SendToTerminal */} to send further input, or ${"kill_terminal" /* TerminalToolId.KillTerminal */} to stop it. Do NOT use sleep or manual polling to wait.\n\n`);
        }
        const outputAnalyzerMessage = await this._getOutputAnalyzerMessage(exitCode, terminalResult, command, didSandboxWrapCommand);
        if (outputAnalyzerMessage) {
            resultText.push(`${outputAnalyzerMessage}\n`);
        }
        resultText.push(terminalResult);
        const isError = exitCode !== undefined && exitCode !== 0;
        const endCwd = await toolTerminal.instance.getCwdResource();
        const imageContent = await this._extractImagesFromOutput(terminalResult, endCwd);
        return {
            toolResultMessage,
            toolMetadata: {
                exitCode: exitCode,
                id: termId,
                cwd: endCwd?.toString(),
                timedOut: didTimeout || undefined,
                timeoutMs: didTimeout ? timeoutValue : undefined,
            },
            toolResultDetails: isError ? {
                input: command,
                output: [{ type: 'embed', isText: true, value: terminalResult }],
                isError: true
            } : undefined,
            content: [
                {
                    kind: 'text',
                    value: resultText.join(''),
                },
                ...imageContent,
            ]
        };
    }
    async _getOutputAnalyzerMessage(exitCode, exitResult, commandLine, isSandboxWrapped) {
        for (const analyzer of this._outputAnalyzers) {
            const message = await analyzer.analyze({ exitCode, exitResult, commandLine, isSandboxWrapped });
            if (message) {
                return message;
            }
        }
        return undefined;
    }
    static { this._maxImageFileSize = 5 * 1024 * 1024; }
    /**
     * Scans terminal output for file paths that point to images and reads them.
     * Returns data content parts for any found images that exist on disk.
     */
    async _extractImagesFromOutput(output, cwd) {
        // Match paths containing at least one / or \ and ending with an image
        // extension. Each atom uses [^\s/\\]* so it cannot consume separators,
        // which keeps the [/\\] tokens unambiguous and prevents catastrophic
        // backtracking on long strings.
        const pathPattern = /[^\s/\\]*(?:[/\\][^\s/\\]*)+\.(?:png|jpe?g|gif|webp|bmp)/gi;
        const matches = new Set();
        for (const line of output.split(/\r?\n/)) {
            if (line.length > 10_000) {
                continue;
            }
            for (const match of line.matchAll(pathPattern)) {
                matches.add(match[0]);
            }
        }
        if (matches.size === 0) {
            return [];
        }
        const results = [];
        for (const filePath of matches) {
            try {
                const mimeType = getMediaMime(filePath);
                if (!mimeType || !mimeType.startsWith('image/')) {
                    continue;
                }
                // Resolve the URI - check for absolute path (Unix / or Windows drive letter)
                let fileUri;
                if (/^\/|^[A-Za-z]:[\\\/]/.test(filePath)) {
                    fileUri = URI.file(filePath);
                }
                else if (cwd) {
                    fileUri = URI.joinPath(cwd, filePath);
                }
                else {
                    continue;
                }
                const stat = await this._fileService.stat(fileUri).catch(() => undefined);
                if (!stat || stat.isDirectory || stat.size > RunInTerminalTool_1._maxImageFileSize) {
                    continue;
                }
                const fileContent = await this._fileService.readFile(fileUri);
                results.push({
                    kind: 'data',
                    value: {
                        mimeType,
                        data: fileContent.value,
                    },
                    audience: [LanguageModelPartAudience.User],
                });
            }
            catch {
                // Ignore files that can't be read
            }
        }
        return results;
    }
    _handleTerminalVisibility(toolTerminal, chatSessionResource) {
        const chatSessionOpenInWidget = !!this._chatWidgetService.getWidgetBySessionResource(chatSessionResource);
        if (this._configurationService.getValue("chat.tools.terminal.outputLocation" /* TerminalChatAgentToolsSettingId.OutputLocation */) === 'terminal' && chatSessionOpenInWidget) {
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
    async _initTerminal(chatSessionResource, termId, terminalToolSessionId, isBackground, token) {
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
        this._addSessionTerminalAssociation(chatSessionResource, toolTerminal);
        if (token.isCancellationRequested) {
            toolTerminal.instance.dispose();
            throw new CancellationError();
        }
        await this._setupProcessIdAssociation(toolTerminal, chatSessionResource, termId, isBackground);
        return toolTerminal;
    }
    _registerInputListener(toolTerminal) {
        const disposable = toolTerminal.instance.onData(data => {
            if (!telemetryIgnoredSequences.includes(data)) {
                toolTerminal.receivedUserInput = data.length > 0;
            }
        });
        Event.once(toolTerminal.instance.onDisposed)(() => disposable.dispose());
    }
    // #endregion
    // #region Session management
    _restoreTerminalAssociations() {
        const storedAssociations = this._storageService.get("chat.terminalSessions" /* TerminalToolStorageKeysInternal.TerminalSession */, 1 /* StorageScope.WORKSPACE */, '{}');
        try {
            const associations = JSON.parse(storedAssociations);
            // Find existing terminals and associate them with sessions
            for (const instance of this._terminalService.instances) {
                if (instance.processId) {
                    const association = associations[instance.processId];
                    if (association) {
                        // Convert stored string ID to URI for backward compatibility
                        const chatSessionResource = LocalChatSessionUri.forSession(association.sessionId);
                        this._logService.debug(`RunInTerminalTool: Restored terminal association for PID ${instance.processId}, session ${association.sessionId}`);
                        const toolTerminal = {
                            instance,
                            shellIntegrationQuality: association.shellIntegrationQuality,
                            isBackground: association.isBackground
                        };
                        this._addSessionTerminalAssociation(chatSessionResource, toolTerminal);
                        this._terminalChatService.registerTerminalInstanceWithChatSession(chatSessionResource, instance);
                        if (association.id) {
                            RunInTerminalTool_1._activeExecutions.set(association.id, this._register(new RestoredTerminalExecution(instance)));
                        }
                        // Listen for terminal disposal to clean up storage
                        Event.once(instance.onDisposed)(() => {
                            this._removeProcessIdAssociation(instance.processId);
                            this._removeExecutionAssociations(instance);
                        });
                    }
                }
            }
        }
        catch (error) {
            this._logService.debug(`RunInTerminalTool: Failed to restore terminal associations: ${error}`);
        }
    }
    async _setupProcessIdAssociation(toolTerminal, chatSessionResource, termId, isBackground) {
        await this._associateProcessIdWithSession(toolTerminal.instance, chatSessionResource, termId, toolTerminal.shellIntegrationQuality, isBackground);
        Event.once(toolTerminal.instance.onDisposed)(() => {
            if (toolTerminal.instance.processId) {
                this._removeProcessIdAssociation(toolTerminal.instance.processId);
            }
        });
    }
    async _associateProcessIdWithSession(terminal, chatSessionResource, id, shellIntegrationQuality, isBackground) {
        try {
            // Wait for process ID with timeout
            const pid = await Promise.race([
                terminal.processReady.then(() => terminal.processId),
                timeout(5000).then(() => { throw new Error('Timeout'); })
            ]);
            if (isNumber(pid)) {
                const storedAssociations = this._storageService.get("chat.terminalSessions" /* TerminalToolStorageKeysInternal.TerminalSession */, 1 /* StorageScope.WORKSPACE */, '{}');
                const associations = JSON.parse(storedAssociations);
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
                this._storageService.store("chat.terminalSessions" /* TerminalToolStorageKeysInternal.TerminalSession */, JSON.stringify(associations), 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
                this._logService.debug(`RunInTerminalTool: Associated terminal PID ${pid} with session ${sessionId}`);
            }
        }
        catch (error) {
            this._logService.debug(`RunInTerminalTool: Failed to associate terminal with session: ${error}`);
        }
    }
    async _removeProcessIdAssociation(pid) {
        try {
            const storedAssociations = this._storageService.get("chat.terminalSessions" /* TerminalToolStorageKeysInternal.TerminalSession */, 1 /* StorageScope.WORKSPACE */, '{}');
            const associations = JSON.parse(storedAssociations);
            if (associations[pid]) {
                delete associations[pid];
                this._storageService.store("chat.terminalSessions" /* TerminalToolStorageKeysInternal.TerminalSession */, JSON.stringify(associations), 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
                this._logService.debug(`RunInTerminalTool: Removed terminal association for PID ${pid}`);
            }
        }
        catch (error) {
            this._logService.debug(`RunInTerminalTool: Failed to remove terminal association: ${error}`);
        }
    }
    _cleanupSessionTerminals(chatSessionResource) {
        const sessionTerminals = this._sessionTerminalInstances.get(chatSessionResource);
        const toolTerminal = this._sessionTerminalAssociations.get(chatSessionResource);
        const terminalsToDispose = sessionTerminals ?? (toolTerminal ? new Set([toolTerminal.instance]) : undefined);
        if (!terminalsToDispose || terminalsToDispose.size === 0) {
            return;
        }
        this._logService.debug(`RunInTerminalTool: Cleaning up ${terminalsToDispose.size} terminal(s) for ended chat session ${chatSessionResource}`);
        this._sessionTerminalAssociations.delete(chatSessionResource);
        this._sessionTerminalInstances.delete(chatSessionResource);
        for (const terminal of terminalsToDispose) {
            // Skip redundant map walks in onDidDispose since this session has already been removed.
            this._terminalsBeingDisposedBySessionCleanup.add(terminal);
            terminal.dispose();
        }
        // Clean up any active executions associated with this session
        const terminalToRemove = [];
        for (const [termId, execution] of RunInTerminalTool_1._activeExecutions.entries()) {
            if (terminalsToDispose.has(execution.instance)) {
                execution.dispose();
                terminalToRemove.push(termId);
            }
        }
        for (const termId of terminalToRemove) {
            RunInTerminalTool_1._activeExecutions.delete(termId);
        }
    }
    _addSessionTerminalAssociation(chatSessionResource, toolTerminal) {
        this._ensureArchivedSessionListener();
        let sessionTerminals = this._sessionTerminalInstances.get(chatSessionResource);
        if (!sessionTerminals) {
            sessionTerminals = new Set();
            this._sessionTerminalInstances.set(chatSessionResource, sessionTerminals);
        }
        sessionTerminals.add(toolTerminal.instance);
        if (!toolTerminal.isBackground) {
            this._sessionTerminalAssociations.set(chatSessionResource, toolTerminal);
        }
    }
    _ensureArchivedSessionListener() {
        if (this._archivedSessionListener.value) {
            return;
        }
        // Archiving a session does not fire onDidDisposeSession, but we still need to dispose
        // any terminals associated with the archived session to avoid process accumulation.
        this._archivedSessionListener.value = this._agentSessionsService.onDidChangeSessionArchivedState(session => {
            if (session.isArchived()) {
                this._cleanupSessionTerminals(session.resource);
            }
        });
    }
    _removeTerminalAssociations(terminal) {
        if (this._terminalsBeingDisposedBySessionCleanup.delete(terminal)) {
            this._removeExecutionAssociations(terminal);
            return;
        }
        for (const [sessionResource, toolTerminal] of this._sessionTerminalAssociations.entries()) {
            if (terminal === toolTerminal.instance) {
                this._sessionTerminalAssociations.delete(sessionResource);
            }
        }
        for (const [sessionResource, sessionTerminals] of this._sessionTerminalInstances.entries()) {
            if (!sessionTerminals.delete(terminal)) {
                continue;
            }
            if (sessionTerminals.size === 0) {
                this._sessionTerminalInstances.delete(sessionResource);
            }
        }
        this._removeExecutionAssociations(terminal);
    }
    _removeExecutionAssociations(terminal) {
        const executionIdsToRemove = [];
        for (const [termId, execution] of RunInTerminalTool_1._activeExecutions.entries()) {
            if (execution.instance === terminal) {
                execution.dispose();
                executionIdsToRemove.push(termId);
            }
        }
        for (const termId of executionIdsToRemove) {
            RunInTerminalTool_1._activeExecutions.delete(termId);
        }
    }
    /**
     * Registers a listener for command completion on a background terminal.
     * When a command finishes, sends a steering message to the chat session
     * so the agent is notified on its next turn.
     *
     * If an output monitor is provided, it is continued in background mode
     * to detect prompts-for-input while the terminal runs in the background.
     * The output monitor is cancelled and disposed when a command finishes.
     */
    _registerCompletionNotification(terminalInstance, termId, chatSessionResource, commandName, outputMonitor) {
        const commandDetection = terminalInstance.capabilities.get(2 /* TerminalCapability.CommandDetection */);
        if (!commandDetection) {
            outputMonitor?.dispose();
            return;
        }
        // Acquire a reference to the ChatModel so it stays alive while we wait
        // for the background terminal to complete. Without this, the model can
        // be disposed if the user navigates away, and sendRequest would throw.
        const sessionRef = this._chatService.acquireExistingSession(chatSessionResource, 'RunInTerminalTool#completionNotification');
        if (!sessionRef) {
            this._logService.warn(`RunInTerminalTool: Cannot register completion notification for terminal ${termId} - session already disposed`);
            outputMonitor?.dispose();
            return;
        }
        // Capture model/mode/tools from the last request so the steering message
        // uses the same settings as the original conversation (not defaults).
        const lastRequest = sessionRef.object.lastRequest;
        const sendOptions = {};
        if (lastRequest) {
            sendOptions.userSelectedModelId = lastRequest.modelId;
            sendOptions.modeInfo = lastRequest.modeInfo;
            if (lastRequest.userSelectedTools) {
                sendOptions.userSelectedTools = constObservable(lastRequest.userSelectedTools);
            }
        }
        // Continue the output monitor in background mode for prompt-for-input detection.
        // The monitor wakes only on new terminal data (not on a fixed interval), so
        // resource cost is proportional to actual terminal activity.
        let bgCts;
        if (outputMonitor) {
            bgCts = new CancellationTokenSource();
            outputMonitor.continueMonitoringAsync(bgCts.token);
        }
        const listener = commandDetection.onCommandFinished(command => {
            const execution = RunInTerminalTool_1._activeExecutions.get(termId);
            if (!execution) {
                cleanup();
                return;
            }
            // Dispose after first notification to avoid chatty repeated messages
            // if the user runs additional commands via send_to_terminal.
            cleanup();
            const exitCode = command.exitCode;
            const exitCodeText = exitCode !== undefined ? ` with exit code ${exitCode}` : '';
            const currentOutput = execution.getOutput();
            const message = `[Terminal ${termId} notification: command completed${exitCodeText}. Use send_to_terminal to send another command or kill_terminal to stop it.]\nTerminal output:\n${currentOutput}`;
            this._logService.debug(`RunInTerminalTool: Command completed in background terminal ${termId}, notifying chat session`);
            this._chatService.sendRequest(chatSessionResource, message, {
                queue: "steering" /* ChatRequestQueueKind.Steering */,
                isSystemInitiated: true,
                systemInitiatedLabel: localize('backgroundTaskCompleted', "Background task `{0}` completed", commandName),
                ...sendOptions,
            }).catch(e => {
                this._logService.warn(`RunInTerminalTool: Failed to send completion notification for terminal ${termId}`, e);
            });
        });
        // Clean up all background resources when the terminal is disposed
        // (e.g. user closes the terminal) to avoid leaking listeners and monitors.
        const disposedListener = terminalInstance.onDisposed(() => {
            cleanup();
        });
        // When a checkpoint is restored, requests are removed from the model.
        // Cancel the background notification and dispose the terminal so that
        // background processes don't outlive the rolled-back session state.
        const modelChangeListener = sessionRef.object.onDidChange(e => {
            if (e.kind === 'removeRequest') {
                this._logService.debug(`RunInTerminalTool: Request removed from session, cleaning up background terminal ${termId}`);
                RunInTerminalTool_1._activeExecutions.get(termId)?.dispose();
                RunInTerminalTool_1._activeExecutions.delete(termId);
                cleanup();
                terminalInstance.dispose();
            }
        });
        const cleanup = () => {
            listener.dispose();
            disposedListener.dispose();
            modelChangeListener.dispose();
            bgCts?.dispose();
            outputMonitor?.dispose();
            sessionRef.dispose();
        };
        this._register(listener);
        this._register(disposedListener);
        this._register(modelChangeListener);
    }
};
RunInTerminalTool = RunInTerminalTool_1 = __decorate([
    __param(0, IChatService),
    __param(1, IConfigurationService),
    __param(2, IFileService),
    __param(3, IHistoryService),
    __param(4, IInstantiationService),
    __param(5, ILabelService),
    __param(6, ILanguageModelToolsService),
    __param(7, IRemoteAgentService),
    __param(8, IStorageService),
    __param(9, ITerminalChatService),
    __param(10, ITerminalLogService),
    __param(11, ITerminalService),
    __param(12, ITerminalSandboxService),
    __param(13, IWorkspaceContextService),
    __param(14, IChatWidgetService),
    __param(15, IAgentSessionsService)
], RunInTerminalTool);
export { RunInTerminalTool };
/**
 * Represents an active terminal command execution that can run in either foreground or background
 * mode. This unified class replaces the previous split between foreground strategy execution and
 * BackgroundTerminalExecution, allowing seamless switching between modes.
 */
let ActiveTerminalExecution = class ActiveTerminalExecution extends Disposable {
    /**
     * The promise that resolves when the execute strategy completes. Can be awaited to get the
     * full result with exit code.
     */
    get completionPromise() {
        return this._completionDeferred.p;
    }
    get isBackground() {
        return this._isBackground;
    }
    get startMarker() {
        return this._startMarker;
    }
    get instance() {
        return this._toolTerminal.instance;
    }
    constructor(sessionResource, termId, toolTerminal, commandDetection, isBackground, _instantiationService) {
        super();
        this.sessionResource = sessionResource;
        this.termId = termId;
        this._instantiationService = _instantiationService;
        this._toolTerminal = toolTerminal;
        this._isBackground = isBackground;
        this._completionDeferred = new DeferredPromise();
        // Create and register the strategy for disposal to clean up its internal resources
        this.strategy = this._register(this._createStrategy(commandDetection));
        this._register(this.strategy.onDidCreateStartMarker(marker => {
            if (marker) {
                // Don't register marker - strategy already manages its lifecycle
                this._startMarker = marker;
            }
        }));
    }
    _createStrategy(commandDetection) {
        switch (this._toolTerminal.shellIntegrationQuality) {
            case "none" /* ShellIntegrationQuality.None */:
                return this._instantiationService.createInstance(NoneExecuteStrategy, this._toolTerminal.instance, () => this._toolTerminal.receivedUserInput ?? false);
            case "basic" /* ShellIntegrationQuality.Basic */:
                return this._instantiationService.createInstance(BasicExecuteStrategy, this._toolTerminal.instance, () => this._toolTerminal.receivedUserInput ?? false, commandDetection);
            case "rich" /* ShellIntegrationQuality.Rich */:
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
    async start(commandLine, token, commandId) {
        try {
            const result = await this.strategy.execute(commandLine, token, commandId);
            this._completionDeferred.complete(result);
            return result;
        }
        catch (e) {
            this._completionDeferred.error(e);
            throw e;
        }
    }
    /**
     * Switches this execution to foreground mode, meaning callers will await its completion.
     */
    setForeground() {
        this._isBackground = false;
    }
    /**
     * Switches this execution to background mode.
     */
    setBackground() {
        this._isBackground = true;
    }
    /**
     * Gets the current output from the terminal.
     */
    getOutput(marker) {
        return getOutput(this.instance, marker ?? this._startMarker);
    }
};
ActiveTerminalExecution = __decorate([
    __param(5, IInstantiationService)
], ActiveTerminalExecution);
class RestoredTerminalExecution extends Disposable {
    constructor(instance) {
        super();
        this.instance = instance;
        this.completionPromise = Promise.resolve({ output: undefined, error: 'restoredTerminalExecutionNotAwaitable' });
    }
    getOutput(marker) {
        return getOutput(this.instance, marker);
    }
}
let TerminalProfileFetcher = class TerminalProfileFetcher {
    constructor(_configurationService, _terminalProfileResolverService, _remoteAgentService) {
        this._configurationService = _configurationService;
        this._terminalProfileResolverService = _terminalProfileResolverService;
        this._remoteAgentService = _remoteAgentService;
        this.osBackend = this._remoteAgentService.getEnvironment().then(remoteEnv => remoteEnv?.os ?? OS);
    }
    async getCopilotProfile() {
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
        // Force bash over sh as sh doesn't have shell integration
        if (defaultProfile.path === '/bin/sh') {
            return {
                ...defaultProfile,
                path: '/bin/bash',
                profileName: 'bash',
            };
        }
        // Setting icon: undefined allows the system to use the default AI terminal icon (not overridden or removed)
        return { ...defaultProfile, icon: undefined };
    }
    async getCopilotShell() {
        return (await this.getCopilotProfile()).path;
    }
    _getChatTerminalProfile(os) {
        let profileSetting;
        switch (os) {
            case 1 /* OperatingSystem.Windows */:
                profileSetting = "chat.tools.terminal.terminalProfile.windows" /* TerminalChatAgentToolsSettingId.TerminalProfileWindows */;
                break;
            case 2 /* OperatingSystem.Macintosh */:
                profileSetting = "chat.tools.terminal.terminalProfile.osx" /* TerminalChatAgentToolsSettingId.TerminalProfileMacOs */;
                break;
            case 3 /* OperatingSystem.Linux */:
            default:
                profileSetting = "chat.tools.terminal.terminalProfile.linux" /* TerminalChatAgentToolsSettingId.TerminalProfileLinux */;
                break;
        }
        const profile = this._configurationService.getValue(profileSetting);
        if (this._isValidChatAgentTerminalProfile(profile)) {
            return profile;
        }
        return undefined;
    }
    _isValidChatAgentTerminalProfile(profile) {
        if (profile === null || profile === undefined || typeof profile !== 'object') {
            return false;
        }
        if ('path' in profile && isString(profile.path)) {
            return true;
        }
        return false;
    }
};
TerminalProfileFetcher = __decorate([
    __param(0, IConfigurationService),
    __param(1, ITerminalProfileResolverService),
    __param(2, IRemoteAgentService)
], TerminalProfileFetcher);
export { TerminalProfileFetcher };
// #endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVuSW5UZXJtaW5hbFRvb2wuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvYnJvd3Nlci90b29scy9ydW5JblRlcm1pbmFsVG9vbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQTBCLE1BQU0sd0NBQXdDLENBQUM7QUFDMUcsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzNHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDL0QsT0FBTyxFQUFFLGNBQWMsRUFBd0IsTUFBTSw4Q0FBOEMsQ0FBQztBQUNwRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzVHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDckUsT0FBTyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDL0UsT0FBTyxFQUFtQixFQUFFLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNoRixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDakUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFB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