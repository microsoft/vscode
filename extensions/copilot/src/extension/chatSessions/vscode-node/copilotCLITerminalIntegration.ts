/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import { Terminal, TerminalLocation, TerminalOptions, TerminalProfile, ThemeIcon, Uri, ViewColumn, window, workspace } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IEnvService } from '../../../platform/env/common/envService';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { ILogService } from '../../../platform/log/common/logService';
import { deriveCopilotCliOTelEnv } from '../../../platform/otel/common/agentOTelEnv';
import { IOTelService } from '../../../platform/otel/common/otelService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { ITerminalService } from '../../../platform/terminal/common/terminalService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { createServiceIdentifier } from '../../../util/common/services';
import { disposableTimeout } from '../../../util/vs/base/common/async';
import { Disposable, DisposableStore } from '../../../util/vs/base/common/lifecycle';
import * as path from '../../../util/vs/base/common/path';
import { windowsToGitBashPath } from '../../../util/vs/workbench/contrib/terminalContrib/suggest/browser/terminalGitBashHelpers';
import { PythonTerminalService } from './copilotCLIPythonTerminalService';
import { prepareCopilotCLINativeShim } from './copilotCLINativeShim';
import { CopilotCLITerminalLinkProvider, SessionDirResolver } from './copilotCLITerminalLinkProvider';

const COPILOT_CLI_COMMAND = 'copilot';
const COPILOT_SHIM_DIRECTORY = 'copilot-shim';
const COPILOT_ICON = new ThemeIcon('copilot');

/**
 * Core setting, controlled by the `CopilotCliCommand` policy, that turns off the native shim in terminals.
 */
const COPILOT_CLI_COMMAND_ENABLED_SETTING = 'chat.copilotCliCommand.enabled';

/**
 * Directory in global storage where earlier versions wrote script shims, and where a local development build of the
 * shim is published when this build doesn't ship one.
 */
const STORED_SHIM_DIRECTORY = 'copilotCli';

/**
 * Returns where the native `copilot` shim ships: a `copilot-shim` folder in the `bin` folder that contains the `code`
 * command. On macOS the `bin` folder is under the app root; elsewhere it is next to the application executable.
 */
export function getNativeCopilotShimPath(platform: NodeJS.Platform, execPath: string, appRoot: string): string {
	if (platform === 'win32') {
		return path.win32.join(path.win32.dirname(execPath), 'bin', COPILOT_SHIM_DIRECTORY, `${COPILOT_CLI_COMMAND}.exe`);
	}
	if (platform === 'darwin') {
		return path.posix.join(appRoot, 'bin', COPILOT_SHIM_DIRECTORY, COPILOT_CLI_COMMAND);
	}
	return path.posix.join(path.posix.dirname(execPath), 'bin', COPILOT_SHIM_DIRECTORY, COPILOT_CLI_COMMAND);
}

export type TerminalOpenLocation = 'panel' | 'editor' | 'editorBeside';

export interface ICopilotCLITerminalIntegration extends Disposable {
	readonly _serviceBrand: undefined;
	openTerminal(name: string, cliArgs?: string[], cwd?: string, location?: TerminalOpenLocation): Promise<Terminal | undefined>;
	/**
	 * Sets the session-state directory used to resolve relative CLI paths.
	 */
	setTerminalSessionDir(terminal: Terminal, sessionDir: Uri): void;
	/**
	 * Sets a resolver used when no session directory is set on a terminal.
	 */
	setSessionDirResolver(resolver: SessionDirResolver): void;
}

type IShellInfo = {
	shell: 'zsh' | 'bash' | 'pwsh' | 'powershell' | 'cmd' | 'fish';
	shellPath: string;
	shellArgs: string[];
	iconPath?: ThemeIcon;
	copilotCommand: string;
	/**
	 * Clears the screen before `copilotCommand` when the command is typed into an interactive shell.
	 */
	clearCommand: string;
	exitCommand: string | undefined;
};

export const ICopilotCLITerminalIntegration = createServiceIdentifier<ICopilotCLITerminalIntegration>('ICopilotCLITerminalIntegration');

export class CopilotCLITerminalIntegration extends Disposable implements ICopilotCLITerminalIntegration {
	declare _serviceBrand: undefined;
	private readonly initialization: Promise<void>;
	/**
	 * The native shim when available and enabled; otherwise `copilot`, resolved from PATH.
	 */
	private copilotCommand: string = COPILOT_CLI_COMMAND;
	/**
	 * The native shim that ships with this build, or a local development build published in global storage.
	 */
	private nativeShimPath: string | undefined;
	private readonly pythonTerminalService: PythonTerminalService;
	private readonly _linkProvider: CopilotCLITerminalLinkProvider | undefined;
	constructor(
		@IVSCodeExtensionContext private readonly context: IVSCodeExtensionContext,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IEnvService private readonly envService: IEnvService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceService workspaceService: IWorkspaceService,
		@IOTelService private readonly _otelService: IOTelService,
	) {
		super();
		this.pythonTerminalService = new PythonTerminalService(logService);
		if (configurationService.getConfig(ConfigKey.Advanced.CLITerminalLinks)) {
			this._linkProvider = new CopilotCLITerminalLinkProvider(logService, workspaceService);
			this._register(window.registerTerminalLinkProvider(this._linkProvider));
		}
		this.initialization = this.initialize();
	}

	private async initialize(): Promise<void> {
		this.nativeShimPath = await this.findNativeShim();
		this.updateCopilotCommand();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(COPILOT_CLI_COMMAND_ENABLED_SETTING)) {
				this.updateCopilotCommand();
			}
		}));

		const provideTerminalProfile = async () => {
			const shellInfo = await this.getShellInfo([]);
			const options = await getCommonTerminalOptions('GitHub Copilot CLI', this._authenticationService, this._otelService, 'panel');
			this.sendTerminalOpenTelemetry('new', shellInfo?.shell ?? 'unknown', 'newFromTerminalProfile', 'panel');
			if (!shellInfo) {
				// Create a profile with the user's default shell as a fallback.
				return new TerminalProfile({
					...options,
					titleTemplate: '${sequence}',
					iconPath: COPILOT_ICON,
				});
			}
			return new TerminalProfile({
				...options,
				titleTemplate: '${sequence}',
				shellPath: shellInfo.shellPath,
				shellArgs: shellInfo.shellArgs,
				iconPath: shellInfo.iconPath,
			});
		};
		this._register(window.registerTerminalProfileProvider('copilot-cli', { provideTerminalProfile }));
	}

	/**
	 * Uses the native shim, and adds its directory to the terminal PATH, unless it is missing or
	 * `chat.copilotCliCommand.enabled` (or its `CopilotCliCommand` policy) turns it off. A Copilot CLI on PATH keeps
	 * working either way.
	 */
	private updateCopilotCommand(): void {
		const enabled = this.configurationService.getNonExtensionConfig<boolean>(COPILOT_CLI_COMMAND_ENABLED_SETTING) !== false;
		if (enabled && this.nativeShimPath) {
			this.copilotCommand = this.nativeShimPath;
			this.terminalService.contributePath('copilot-cli', path.dirname(this.nativeShimPath), { command: COPILOT_CLI_COMMAND }, true);
			return;
		}

		this.copilotCommand = COPILOT_CLI_COMMAND;
		// Also drops a persisted contribution when no usable native shim is available.
		this.terminalService.removePathContribution('copilot-cli');
		if (!enabled && this.nativeShimPath) {
			this.logService.info(`[CopilotCLITerminalIntegration] ${COPILOT_CLI_COMMAND_ENABLED_SETTING} is off; terminals run copilot from PATH.`);
		}
	}

	/**
	 * Returns the shim that ships next to the `code` command. A build from source doesn't ship one; it can use a local
	 * development build instead (see `copilotCLINativeShim.ts`).
	 */
	private async findNativeShim(): Promise<string | undefined> {
		const shippedPath = getNativeCopilotShimPath(process.platform, process.execPath, this.envService.appRoot);
		if (await isFile(shippedPath)) {
			await this.removeStoredShims();
			return shippedPath;
		}

		const globalStorageUri = this.context.globalStorageUri;
		if (!globalStorageUri) {
			// globalStorageUri is not available in extension tests
			this.logService.info(`[CopilotCLITerminalIntegration] The native copilot shim was not found at ${shippedPath}; terminals run copilot from PATH.`);
			return undefined;
		}
		return prepareCopilotCLINativeShim(globalStorageUri.fsPath, this.logService);
	}

	/**
	 * Removes the script shims that earlier versions wrote to global storage, which terminals restored with their old
	 * PATH could still run, and any local development build published there.
	 */
	private async removeStoredShims(): Promise<void> {
		const globalStorageUri = this.context.globalStorageUri;
		if (!globalStorageUri) {
			return;
		}

		try {
			await fs.rm(path.join(globalStorageUri.fsPath, STORED_SHIM_DIRECTORY), { recursive: true, force: true });
		} catch (error) {
			this.logService.warn(`[CopilotCLITerminalIntegration] Failed to remove the stored copilot shims: ${error}`);
		}
	}

	public setTerminalSessionDir(terminal: Terminal, sessionDir: Uri): void {
		this._linkProvider?.setSessionDir(terminal, sessionDir);
	}

	public setSessionDirResolver(resolver: SessionDirResolver): void {
		this._linkProvider?.setSessionDirResolver(resolver);
	}

	public async openTerminal(name: string, cliArgs: string[] = [], cwd?: string, location: TerminalOpenLocation = 'editor'): Promise<Terminal | undefined> {
		// If cliArgs are provided (e.g. --resume), we are resuming a session; otherwise it's a new session.
		const sessionType = cliArgs.length > 0 ? 'resume' : 'new';

		await this.initialization;
		const shellPathAndArgs = await this.getShellInfo(cliArgs);

		const options = await getCommonTerminalOptions(name, this._authenticationService, this._otelService, location);
		options.cwd = cwd;
		if (shellPathAndArgs) {
			options.iconPath = shellPathAndArgs.iconPath ?? options.iconPath;
		}

		if (shellPathAndArgs && (shellPathAndArgs.shell !== 'powershell' && shellPathAndArgs.shell !== 'pwsh')) {
			const terminal = await this.pythonTerminalService.createTerminal(options);
			if (terminal) {
				this._register(terminal);
				this._linkProvider?.registerTerminal(terminal);
				const command = this.buildCommandForPythonTerminal(shellPathAndArgs.copilotCommand, cliArgs, shellPathAndArgs);
				await this.sendCommandToTerminal(terminal, command, true, shellPathAndArgs);
				this.sendTerminalOpenTelemetry(sessionType, shellPathAndArgs.shell, 'pythonTerminal', location);
				return terminal;
			}
		}

		if (!shellPathAndArgs) {
			const terminal = this._register(this.terminalService.createTerminal(options));
			this._linkProvider?.registerTerminal(terminal);
			const command = this.buildCommandForTerminal(terminal, this.copilotCommand, cliArgs);
			await this.sendCommandToTerminal(terminal, command, false, shellPathAndArgs);
			this.sendTerminalOpenTelemetry(sessionType, 'unknown', 'fallbackTerminal', location);
			return terminal;
		}

		options.shellPath = shellPathAndArgs.shellPath;
		options.shellArgs = shellPathAndArgs.shellArgs;
		const terminal = this._register(this.terminalService.createTerminal(options));
		this._linkProvider?.registerTerminal(terminal);
		terminal.show();
		this.sendTerminalOpenTelemetry(sessionType, shellPathAndArgs.shell, 'shellArgsTerminal', location);
		return terminal;
	}

	private sendTerminalOpenTelemetry(sessionType: string, shell: string, terminalCreationMethod: string, location: TerminalOpenLocation): void {
		/* __GDPR__
			"copilotcli.terminal.open" : {
				"owner": "DonJayamanne",
				"comment": "Event sent when a Copilot CLI terminal is opened.",
				"sessionType" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the terminal is for a new session or resuming an existing one." },
				"shell" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The shell type used for the terminal." },
				"terminalCreationMethod" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "How the terminal was created." },
				"location" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Where the terminal was opened - panel, editor area (active), or editor area (beside)." },
				"shim" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the terminal runs the native copilot shim that ships with VS Code or resolves copilot from PATH." }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('copilotcli.terminal.open', {
			sessionType,
			shell,
			terminalCreationMethod,
			location,
			shim: this.copilotCommand === COPILOT_CLI_COMMAND ? 'path' : 'native'
		});
	}

	private buildCommandForPythonTerminal(copilotCommand: string, cliArgs: string[], shellInfo: IShellInfo) {
		let commandPrefix = '';
		if (shellInfo.shell === 'zsh' || shellInfo.shell === 'bash' || shellInfo.shell === 'fish') {
			// Starting with empty space to hide from terminal history
			commandPrefix = ' ';
		}
		let invocationPrefix = '';
		if (shellInfo.shell === 'powershell' || shellInfo.shell === 'pwsh') {
			invocationPrefix = '& ';
		}

		const exitCommand = shellInfo.exitCommand || '';

		// Clear the screen first to hide the environment activation commands sent to the terminal.
		return `${commandPrefix}${shellInfo.clearCommand}${invocationPrefix}${quoteArgsForShell(copilotCommand, [])} ${cliArgs.join(' ')} ${exitCommand}`;
	}

	private buildCommandForTerminal(terminal: Terminal, copilotCommand: string, cliArgs: string[]) {
		return `${quoteArgsForShell(copilotCommand, [])} ${cliArgs.join(' ')}`;
	}

	private async sendCommandToTerminal(terminal: Terminal, command: string, waitForPythonActivation: boolean, shellInfo: IShellInfo | undefined = undefined): Promise<void> {
		// Wait for shell integration to be available
		const shellIntegrationTimeout = 3000;
		let shellIntegrationAvailable = terminal.shellIntegration ? true : false;
		const disposables = new DisposableStore();
		const integrationPromise = shellIntegrationAvailable ? Promise.resolve() : new Promise<void>((resolve) => {
			const disposable = disposables.add(this.terminalService.onDidChangeTerminalShellIntegration(e => {
				if (e.terminal === terminal && e.shellIntegration) {
					shellIntegrationAvailable = true;
					disposable.dispose();
					resolve();
				}
			}));

			disposables.add(disposableTimeout(() => {
				disposable.dispose();
				resolve();
			}, shellIntegrationTimeout));
		});

		try {
			await integrationPromise;

			if (waitForPythonActivation) {
				// Wait for python extension to send its initialization commands.
				// Else if we send too early, the copilot command might not get executed properly.
				// Activating powershell scripts can take longer, so wait a bit more.
				const delay = (shellInfo?.shell === 'powershell' || shellInfo?.shell === 'pwsh') ? 3000 : 1000;
				await new Promise<void>(resolve => disposables.add(disposableTimeout(resolve, delay))); // Wait a bit to ensure the terminal is ready
			}

			if (terminal.shellIntegration) {
				terminal.shellIntegration.executeCommand(command);
			} else {
				terminal.sendText(command);
			}

			terminal.show();
		} finally {
			disposables.dispose();
		}
	}

	private async getShellInfo(cliArgs: string[]): Promise<IShellInfo | undefined> {
		const configPlatform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';

		// vscode.env.shell already resolves to the user's configured default terminal profile path.
		const shellPath = this.envService.shell;
		const defaultProfileName = workspace.getConfiguration('terminal').get<string | undefined>(`integrated.defaultProfile.${configPlatform}`);
		let shellArgs: string[] = [];
		if (defaultProfileName) {
			const profiles = workspace.getConfiguration('terminal').get<Record<string, { path?: string | string[]; args?: string[] }>>(`integrated.profiles.${configPlatform}`);
			const profileArgs = profiles?.[defaultProfileName]?.args;
			shellArgs = Array.isArray(profileArgs) ? profileArgs : [];
		}

		// Detect shell type from the resolved shell path basename,
		// matching how getShellIntegrationInjection() does it in terminalEnvironment.ts
		const shellBasename = process.platform === 'win32'
			? path.basename(shellPath).toLowerCase()
			: path.basename(shellPath);
		const iconPath = COPILOT_ICON;
		const copilotCommand = this.copilotCommand;

		if (shellBasename === 'zsh') {
			return {
				shell: 'zsh',
				shellPath,
				shellArgs: [`-ci${shellArgs.includes('-l') ? 'l' : ''}`, quoteArgsForShell(copilotCommand, cliArgs)],
				iconPath,
				copilotCommand,
				clearCommand: 'clear && ',
				exitCommand: `&& exit`
			};
		} else if (shellBasename === 'bash' || shellBasename === 'bash.exe') {
			// Git Bash on Windows doesn't translate a Windows path inside the `-ic` shell string, so use its MSYS form.
			const bashCommand = configPlatform === 'windows' ? windowsToGitBashPath(copilotCommand) : copilotCommand;
			return {
				shell: 'bash',
				shellPath,
				shellArgs: [`-${shellArgs.includes('-l') ? 'l' : ''}ic`, quoteArgsForShell(bashCommand, cliArgs)],
				iconPath,
				copilotCommand: bashCommand,
				clearCommand: 'clear && ',
				exitCommand: `&& exit`
			};
		} else if (shellBasename === 'fish') {
			const fishArgs: string[] = [];
			if (shellArgs.includes('-l')) {
				fishArgs.push('-l');
			}
			fishArgs.push('-c', quoteArgsForShell(copilotCommand, cliArgs));
			return {
				shell: 'fish',
				shellPath,
				shellArgs: fishArgs,
				iconPath,
				copilotCommand,
				clearCommand: 'clear; ',
				exitCommand: `; and exit`
			};
		} else if (shellBasename === 'pwsh' || shellBasename === 'pwsh.exe') {
			return {
				shell: 'pwsh',
				shellPath,
				shellArgs: ['-Command', quoteArgsForPowerShell(copilotCommand, cliArgs)],
				iconPath,
				copilotCommand,
				clearCommand: 'Clear-Host; ',
				exitCommand: `&& exit`
			};
		} else if ((shellBasename === 'powershell' || shellBasename === 'powershell.exe') && configPlatform === 'windows') {
			return {
				shell: 'powershell',
				shellPath,
				shellArgs: ['-Command', quoteArgsForPowerShell(copilotCommand, cliArgs)],
				iconPath,
				copilotCommand,
				clearCommand: 'Clear-Host; ',
				exitCommand: `&& exit`
			};
		} else if ((shellBasename === 'cmd' || shellBasename === 'cmd.exe') && configPlatform === 'windows') {
			return {
				shell: 'cmd',
				shellPath,
				shellArgs: ['/c', copilotCommand, ...cliArgs],
				iconPath,
				copilotCommand,
				clearCommand: 'cls && ',
				exitCommand: '&& exit'
			};
		}

		return undefined;
	}

}

function quoteArgsForShell(shellScript: string, args: string[]): string {
	const escapeArg = (arg: string): string => {
		// If argument contains spaces, quotes, or special characters, wrap in quotes and escape internal quotes
		if (/[\s"'$`\\|&;()<>]/.test(arg)) {
			return `"${arg.replace(/["\\]/g, '\\$&')}"`;
		}
		return arg;
	};

	const escapedArgs = args.map(escapeArg);
	return args.length ? `${escapeArg(shellScript)} ${escapedArgs.join(' ')}` : escapeArg(shellScript);
}

/**
 * Builds a PowerShell command that runs `command` with `args`. Single-quoted strings are literal in PowerShell, so
 * only embedded single quotes need escaping.
 */
function quoteArgsForPowerShell(command: string, args: string[]): string {
	const quote = (value: string) => `'${value.replace(/'/g, `''`)}'`;
	return ['&', quote(command), ...args.map(quote)].join(' ');
}

async function isFile(filePath: string): Promise<boolean> {
	try {
		return (await fs.stat(filePath)).isFile();
	} catch {
		return false;
	}
}

async function getCommonTerminalOptions(name: string, authenticationService: IAuthenticationService, otelService: IOTelService, location: TerminalOpenLocation = 'editor'): Promise<TerminalOptions> {
	const options: TerminalOptions = {
		name,
		titleTemplate: '${sequence}',
		iconPath: new ThemeIcon('terminal'),
		hideFromUser: false
	};
	if (location === 'panel') {
		options.location = TerminalLocation.Panel;
	} else {
		options.location = { viewColumn: location === 'editorBeside' ? ViewColumn.Beside : ViewColumn.Active };
	}
	const session = await authenticationService.getGitHubSession('any', { silent: true });
	if (session) {
		options.env = {
			// Old Token name for GitHub integrations (deprecate once the new variable has been adopted widely)
			GH_TOKEN: session.accessToken,
			// New Token name for Copilot
			COPILOT_GITHUB_TOKEN: session.accessToken,
			// Forward OTel config so the CLI binary exports traces/metrics to the same endpoint.
			// Pass an empty env so all vars are explicitly included in TerminalOptions.env,
			// regardless of process.env state (which may have stale values from the
			// in-process background agent). TerminalOptions.env overlays the inherited
			// process.env, so explicit entries here take precedence.
			// `deriveCopilotCliOTelEnv` returns `{}` when not `enabledExplicitly`.
			...deriveCopilotCliOTelEnv(otelService.config, {}),
		};
	}
	return options;
}
