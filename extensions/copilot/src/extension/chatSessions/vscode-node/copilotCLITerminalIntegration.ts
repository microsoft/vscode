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
import { CopilotCLITerminalLinkProvider, SessionDirResolver } from './copilotCLITerminalLinkProvider';

//@ts-ignore
import powershellScript from './copilotCLIShim.ps1';

const COPILOT_CLI_SHIM_JS = 'copilotCLIShim.js';
const COPILOT_CLI_COMMAND = 'copilot';
const COPILOT_ICON = new ThemeIcon('copilot');

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
	exitCommand: string | undefined;
};

export const ICopilotCLITerminalIntegration = createServiceIdentifier<ICopilotCLITerminalIntegration>('ICopilotCLITerminalIntegration');

export class CopilotCLITerminalIntegration extends Disposable implements ICopilotCLITerminalIntegration {
	declare _serviceBrand: undefined;
	private readonly initialization: Promise<void>;
	private shellScriptPath: string | undefined;
	/**
	 * On Windows only: a POSIX shell script (no extension) that Git Bash / MSYS bash
	 * can execute. Used when the user's default shell is `bash.exe`, since bash cannot
	 * run the `copilot.bat` shim.
	 */
	private posixShellScriptPath: string | undefined;
	private powershellScriptPath: string | undefined;
	private readonly pythonTerminalService: PythonTerminalService;
	private readonly _linkProvider: CopilotCLITerminalLinkProvider | undefined;
	constructor(
		@IVSCodeExtensionContext private readonly context: IVSCodeExtensionContext,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IEnvService private readonly envService: IEnvService,
		@ILogService logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IConfigurationService configurationService: IConfigurationService,
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
		const globalStorageUri = this.context.globalStorageUri;
		if (!globalStorageUri) {
			// globalStorageUri is not available in extension tests
			return;
		}

		const storageLocation = path.join(globalStorageUri.fsPath, 'copilotCli');
		this.terminalService.contributePath('copilot-cli', storageLocation, { command: COPILOT_CLI_COMMAND }, true);

		await fs.mkdir(storageLocation, { recursive: true });

		if (process.platform === 'win32') {
			this.powershellScriptPath = path.join(storageLocation, `${COPILOT_CLI_COMMAND}.ps1`);
			await fs.writeFile(this.powershellScriptPath, powershellScript);
			const copilotPowershellScript = `@echo off
powershell -ExecutionPolicy Bypass -File "${this.powershellScriptPath}" %*
`;
			this.shellScriptPath = path.join(storageLocation, `${COPILOT_CLI_COMMAND}.bat`);
			await fs.writeFile(this.shellScriptPath, copilotPowershellScript);

			// Also create a POSIX shell script for Git Bash on Windows. Bash cannot
			// execute the .bat shim directly inside a `bash -c` string, and we cannot run
			// the JS shim via Electron-as-node here because Electron on Windows does not
			// support console stdin (see copilotCLIShim.ts header). Instead, delegate to
			// the existing .bat shim, which routes through cmd.exe -> PowerShell where
			// console stdin works correctly.
			const posixBatPath = windowsToGitBashPath(this.shellScriptPath);
			const copilotBashScript = `#!/bin/sh\nexec "${posixBatPath}" "$@"\n`;
			this.posixShellScriptPath = path.join(storageLocation, COPILOT_CLI_COMMAND);
			await fs.writeFile(this.posixShellScriptPath, copilotBashScript);
		} else {
			const copilotShellScript = `#!/bin/sh
unset NODE_OPTIONS
ELECTRON_RUN_AS_NODE=1 "${process.execPath}" "${path.join(storageLocation, COPILOT_CLI_SHIM_JS)}" "$@"`;
			await fs.copyFile(path.join(__dirname, COPILOT_CLI_SHIM_JS), path.join(storageLocation, COPILOT_CLI_SHIM_JS));
			this.shellScriptPath = path.join(storageLocation, COPILOT_CLI_COMMAND);
			this.powershellScriptPath = path.join(storageLocation, `copilotCLIShim.ps1`);
			await fs.writeFile(this.shellScriptPath, copilotShellScript);
			await fs.writeFile(this.powershellScriptPath, powershellScript);
			await fs.chmod(this.shellScriptPath, 0o750);
		}

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

	public setTerminalSessionDir(terminal: Terminal, sessionDir: Uri): void {
		this._linkProvider?.setSessionDir(terminal, sessionDir);
	}

	public setSessionDirResolver(resolver: SessionDirResolver): void {
		this._linkProvider?.setSessionDirResolver(resolver);
	}

	public async openTerminal(name: string, cliArgs: string[] = [], cwd?: string, location: TerminalOpenLocation = 'editor'): Promise<Terminal | undefined> {
		// Capture session type before mutating cliArgs.
		// If cliArgs are provided (e.g. --resume), we are resuming a session; otherwise it's a new session.
		const sessionType = cliArgs.length > 0 ? 'resume' : 'new';

		// Generate another set of shell args, but with --clear to clear the terminal before running the command.
		// We'd like to hide all of the custom shell commands we send to the terminal from the user.
		cliArgs.unshift('--clear');

		let [shellPathAndArgs] = await Promise.all([
			this.getShellInfo(cliArgs),
			this.initialization
		]);

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
				const command = this.buildCommandForPythonTerminal(shellPathAndArgs?.copilotCommand, cliArgs, shellPathAndArgs);
				await this.sendCommandToTerminal(terminal, command, true, shellPathAndArgs);
				this.sendTerminalOpenTelemetry(sessionType, shellPathAndArgs.shell, 'pythonTerminal', location);
				return terminal;
			}
		}

		if (!shellPathAndArgs) {
			const terminal = this._register(this.terminalService.createTerminal(options));
			this._linkProvider?.registerTerminal(terminal);
			cliArgs.shift(); // Remove --clear as we can't run it without a shell integration
			const command = this.buildCommandForTerminal(terminal, COPILOT_CLI_COMMAND, cliArgs);
			await this.sendCommandToTerminal(terminal, command, false, shellPathAndArgs);
			this.sendTerminalOpenTelemetry(sessionType, 'unknown', 'fallbackTerminal', location);
			return terminal;
		}

		cliArgs.shift(); // Remove --clear as we are creating a new terminal with our own args.
		shellPathAndArgs = await this.getShellInfo(cliArgs);
		if (shellPathAndArgs) {
			options.shellPath = shellPathAndArgs.shellPath;
			options.shellArgs = shellPathAndArgs.shellArgs;
			const terminal = this._register(this.terminalService.createTerminal(options));
			this._linkProvider?.registerTerminal(terminal);
			terminal.show();
			this.sendTerminalOpenTelemetry(sessionType, shellPathAndArgs.shell, 'shellArgsTerminal', location);
			return terminal;
		}

		return undefined;
	}

	private sendTerminalOpenTelemetry(sessionType: string, shell: string, terminalCreationMethod: string, location: TerminalOpenLocation): void {
		/* __GDPR__
			"copilotcli.terminal.open" : {
				"owner": "DonJayamanne",
				"comment": "Event sent when a Copilot CLI terminal is opened.",
				"sessionType" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the terminal is for a new session or resuming an existing one." },
				"shell" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The shell type used for the terminal." },
				"terminalCreationMethod" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "How the terminal was created." },
				"location" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Where the terminal was opened - panel, editor area (active), or editor area (beside)." }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('copilotcli.terminal.open', {
			sessionType,
			shell,
			terminalCreationMethod,
			location
		});
	}

	private buildCommandForPythonTerminal(copilotCommand: string, cliArgs: string[], shellInfo: IShellInfo) {
		let commandPrefix = '';
		if (shellInfo.shell === 'zsh' || shellInfo.shell === 'bash' || shellInfo.shell === 'fish') {
			// Starting with empty space to hide from terminal history
			commandPrefix = ' ';
		}
		if (shellInfo.shell === 'powershell' || shellInfo.shell === 'pwsh') {
			// Run powershell script
			commandPrefix = '& ';
		}

		const exitCommand = shellInfo.exitCommand || '';

		return `${commandPrefix}${quoteArgsForShell(copilotCommand, [])} ${cliArgs.join(' ')} ${exitCommand}`;
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

		if (shellBasename === 'zsh' && this.shellScriptPath) {
			return {
				shell: 'zsh',
				shellPath,
				shellArgs: [`-ci${shellArgs.includes('-l') ? 'l' : ''}`, quoteArgsForShell(this.shellScriptPath, cliArgs)],
				iconPath,
				copilotCommand: this.shellScriptPath,
				exitCommand: `&& exit`
			};
		} else if ((shellBasename === 'bash' || shellBasename === 'bash.exe') && (configPlatform === 'windows' ? this.posixShellScriptPath : this.shellScriptPath)) {
			// On Windows (Git Bash), use the POSIX shim and reference it by its MSYS path,
			// since the path lives inside the `-ic` shell-string and is not translated by MSYS.
			const scriptPath = configPlatform === 'windows' ? this.posixShellScriptPath! : this.shellScriptPath!;
			const bashScriptPath = configPlatform === 'windows' ? windowsToGitBashPath(scriptPath) : scriptPath;
			return {
				shell: 'bash',
				shellPath,
				shellArgs: [`-${shellArgs.includes('-l') ? 'l' : ''}ic`, quoteArgsForShell(bashScriptPath, cliArgs)],
				iconPath,
				copilotCommand: bashScriptPath,
				exitCommand: `&& exit`
			};
		} else if (shellBasename === 'fish' && this.shellScriptPath) {
			const fishArgs: string[] = [];
			if (shellArgs.includes('-l')) {
				fishArgs.push('-l');
			}
			fishArgs.push('-c', quoteArgsForShell(this.shellScriptPath, cliArgs));
			return {
				shell: 'fish',
				shellPath,
				shellArgs: fishArgs,
				iconPath,
				copilotCommand: this.shellScriptPath,
				exitCommand: `; and exit`
			};
		} else if ((shellBasename === 'pwsh' || shellBasename === 'pwsh.exe') && this.powershellScriptPath) {
			return {
				shell: 'pwsh',
				shellPath,
				shellArgs: ['-File', this.powershellScriptPath, ...cliArgs],
				iconPath,
				copilotCommand: this.powershellScriptPath,
				exitCommand: `&& exit`
			};
		} else if ((shellBasename === 'powershell' || shellBasename === 'powershell.exe') && this.powershellScriptPath && configPlatform === 'windows') {
			return {
				shell: 'powershell',
				shellPath,
				shellArgs: ['-File', this.powershellScriptPath, ...cliArgs],
				iconPath,
				copilotCommand: this.powershellScriptPath,
				exitCommand: `&& exit`
			};
		} else if ((shellBasename === 'cmd' || shellBasename === 'cmd.exe') && this.shellScriptPath && configPlatform === 'windows') {
			return {
				shell: 'cmd',
				shellPath,
				shellArgs: ['/c', this.shellScriptPath, ...cliArgs],
				iconPath,
				copilotCommand: this.shellScriptPath,
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
			...(otelService.config.enabled ? deriveCopilotCliOTelEnv(otelService.config, {}) : {}),
		};
	}
	return options;
}
