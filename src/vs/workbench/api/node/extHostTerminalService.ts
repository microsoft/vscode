/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import product from 'vs/platform/product/common/product';
import * as os from 'os';
import { URI, UriComponents } from 'vs/base/common/uri';
import * as platform from 'vs/base/common/platform';
import * as terminalEnvironment from 'vs/workbench/contrib/terminal/common/terminalEnvironment';
import { IShellLaunchConfigDto, IShellDefinitionDto, IShellAndArgsDto } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostConfiguration, ExtHostConfigProvider, IExtHostConfiguration } from 'vs/workbench/api/common/extHostConfiguration';
import { ILogService } from 'vs/platform/log/common/log';
import { IShellLaunchConfig, ITerminalEnvironment } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalProcess } from 'vs/workbench/contrib/terminal/node/terminalProcess';
import { ExtHostWorkspace, IExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { ExtHostVariableResolverService } from 'vs/workbench/api/node/extHostDebugService';
import { ExtHostDocumentsAndEditors, IExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { getSystemShell, detectAvailableShells } from 'vs/workbench/contrib/terminal/node/terminal';
import { getMainProcessParentEnv } from 'vs/workbench/contrib/terminal/node/terminalEnvironment';
import { BaseExtHostTerminalService, ExtHostTerminal } from 'vs/workbench/api/common/extHostTerminalService';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';

export class ExtHostTerminalService extends BaseExtHostTerminalService {

	private _variableResolver: ExtHostVariableResolverService | undefined;
	private _lastActiveWorkspace: IWorkspaceFolder | undefined;

	// TODO: Pull this from main side
	private _isWorkspaceShellAllowed: boolean = false;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostConfiguration private _extHostConfiguration: ExtHostConfiguration,
		@IExtHostWorkspace private _extHostWorkspace: ExtHostWorkspace,
		@IExtHostDocumentsAndEditors private _extHostDocumentsAndEditors: ExtHostDocumentsAndEditors,
		@ILogService private _logService: ILogService
	) {
		super(extHostRpc);
		this._updateLastActiveWorkspace();
		this._updateVariableResolver();
		this._registerListeners();
	}

	public createTerminal(name?: string, shellPath?: string, shellArgs?: string[] | string): vscode.Terminal {
		const terminal = new ExtHostTerminal(this._proxy, name);
		terminal.create(shellPath, shellArgs);
		this._terminals.push(terminal);
		return terminal;
	}

	public createTerminalFromOptions(options: vscode.TerminalOptions): vscode.Terminal {
		const terminal = new ExtHostTerminal(this._proxy, options.name);
		terminal.create(options.shellPath, options.shellArgs, options.cwd, options.env, /*options.waitOnExit*/ undefined, options.strictEnv, options.hideFromUser);
		this._terminals.push(terminal);
		return terminal;
	}

	public getDefaultShell(useAutomationShell: boolean, configProvider: ExtHostConfigProvider): string {
		const fetchSetting = (key: string) => {
			const setting = configProvider
				.getConfiguration(key.substr(0, key.lastIndexOf('.')))
				.inspect<string | string[]>(key.substr(key.lastIndexOf('.') + 1));
			return this._apiInspectConfigToPlain<string | string[]>(setting);
		};
		return terminalEnvironment.getDefaultShell(
			fetchSetting,
			this._isWorkspaceShellAllowed,
			getSystemShell(platform.platform),
			process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432'),
			process.env.windir,
			this._lastActiveWorkspace,
			this._variableResolver,
			this._logService,
			useAutomationShell
		);
	}

	private _getDefaultShellArgs(useAutomationShell: boolean, configProvider: ExtHostConfigProvider): string[] | string {
		const fetchSetting = (key: string) => {
			const setting = configProvider
				.getConfiguration(key.substr(0, key.lastIndexOf('.')))
				.inspect<string | string[]>(key.substr(key.lastIndexOf('.') + 1));
			return this._apiInspectConfigToPlain<string | string[]>(setting);
		};

		return terminalEnvironment.getDefaultShellArgs(fetchSetting, this._isWorkspaceShellAllowed, useAutomationShell, this._lastActiveWorkspace, this._variableResolver, this._logService);
	}

	private _apiInspectConfigToPlain<T>(
		config: { key: string; defaultValue?: T; globalValue?: T; workspaceValue?: T, workspaceFolderValue?: T } | undefined
	): { user: T | undefined, value: T | undefined, default: T | undefined } {
		return {
			user: config ? config.globalValue : undefined,
			value: config ? config.workspaceValue : undefined,
			default: config ? config.defaultValue : undefined,
		};
	}

	private async _getNonInheritedEnv(): Promise<platform.IProcessEnvironment> {
		const env = await getMainProcessParentEnv();
		env.VSCODE_IPC_HOOK_CLI = process.env['VSCODE_IPC_HOOK_CLI']!;
		return env;
	}

	private _registerListeners(): void {
		this._extHostDocumentsAndEditors.onDidChangeActiveTextEditor(() => this._updateLastActiveWorkspace());
		this._extHostWorkspace.onDidChangeWorkspace(() => this._updateVariableResolver());
	}

	private _updateLastActiveWorkspace(): void {
		const activeEditor = this._extHostDocumentsAndEditors.activeEditor();
		if (activeEditor) {
			this._lastActiveWorkspace = this._extHostWorkspace.getWorkspaceFolder(activeEditor.document.uri) as IWorkspaceFolder;
		}
	}

	private async _updateVariableResolver(): Promise<void> {
		const configProvider = await this._extHostConfiguration.getConfigProvider();
		const workspaceFolders = await this._extHostWorkspace.getWorkspaceFolders2();
		this._variableResolver = new ExtHostVariableResolverService(workspaceFolders || [], this._extHostDocumentsAndEditors, configProvider);
	}

	public async $spawnExtHostProcess(id: number, shellLaunchConfigDto: IShellLaunchConfigDto, activeWorkspaceRootUriComponents: UriComponents, cols: number, rows: number, isWorkspaceShellAllowed: boolean): Promise<void> {
		const shellLaunchConfig: IShellLaunchConfig = {
			name: shellLaunchConfigDto.name,
			executable: shellLaunchConfigDto.executable,
			args: shellLaunchConfigDto.args,
			cwd: typeof shellLaunchConfigDto.cwd === 'string' ? shellLaunchConfigDto.cwd : URI.revive(shellLaunchConfigDto.cwd),
			env: shellLaunchConfigDto.env
		};

		// Merge in shell and args from settings
		const platformKey = platform.isWindows ? 'windows' : (platform.isMacintosh ? 'osx' : 'linux');
		const configProvider = await this._extHostConfiguration.getConfigProvider();
		if (!shellLaunchConfig.executable) {
			shellLaunchConfig.executable = this.getDefaultShell(false, configProvider);
			shellLaunchConfig.args = this._getDefaultShellArgs(false, configProvider);
		} else {
			if (this._variableResolver) {
				shellLaunchConfig.executable = this._variableResolver.resolve(this._lastActiveWorkspace, shellLaunchConfig.executable);
				if (shellLaunchConfig.args) {
					if (Array.isArray(shellLaunchConfig.args)) {
						const resolvedArgs: string[] = [];
						for (const arg of shellLaunchConfig.args) {
							resolvedArgs.push(this._variableResolver.resolve(this._lastActiveWorkspace, arg));
						}
						shellLaunchConfig.args = resolvedArgs;
					} else {
						shellLaunchConfig.args = this._variableResolver.resolve(this._lastActiveWorkspace, shellLaunchConfig.args);
					}
				}
			}
		}

		const activeWorkspaceRootUri = URI.revive(activeWorkspaceRootUriComponents);
		// Get the environment
		const apiLastActiveWorkspace = await this._extHostWorkspace.getWorkspaceFolder(activeWorkspaceRootUri);
		const lastActiveWorkspace = apiLastActiveWorkspace ? {
			uri: apiLastActiveWorkspace.uri,
			name: apiLastActiveWorkspace.name,
			index: apiLastActiveWorkspace.index,
			toResource: () => {
				throw new Error('Not implemented');
			}
		} as IWorkspaceFolder : null;

		// Get the initial cwd
		const terminalConfig = configProvider.getConfiguration('terminal.integrated');

		const initialCwd = terminalEnvironment.getCwd(shellLaunchConfig, os.homedir(), lastActiveWorkspace ? lastActiveWorkspace : undefined, this._variableResolver, activeWorkspaceRootUri, terminalConfig.cwd, this._logService);
		shellLaunchConfig.cwd = initialCwd;

		const envFromConfig = this._apiInspectConfigToPlain(configProvider.getConfiguration('terminal.integrated').inspect<ITerminalEnvironment>(`env.${platformKey}`));
		const baseEnv = terminalConfig.get<boolean>('inheritEnv', true) ? process.env as platform.IProcessEnvironment : await this._getNonInheritedEnv();
		const env = terminalEnvironment.createTerminalEnvironment(
			shellLaunchConfig,
			lastActiveWorkspace,
			envFromConfig,
			this._variableResolver,
			isWorkspaceShellAllowed,
			product.version,
			terminalConfig.get<'auto' | 'off' | 'on'>('detectLocale', 'auto'),
			baseEnv
		);

		this._proxy.$sendResolvedLaunchConfig(id, shellLaunchConfig);
		// Fork the process and listen for messages
		this._logService.debug(`Terminal process launching on ext host`, shellLaunchConfig, initialCwd, cols, rows, env);
		// TODO: Support conpty on remote, it doesn't seem to work for some reason?
		// TODO: When conpty is enabled, only enable it when accessibilityMode is off
		const enableConpty = false; //terminalConfig.get('windowsEnableConpty') as boolean;
		this._setupExtHostProcessListeners(id, new TerminalProcess(shellLaunchConfig, initialCwd, cols, rows, env, enableConpty, this._logService));
	}

	public $requestAvailableShells(): Promise<IShellDefinitionDto[]> {
		return detectAvailableShells();
	}

	public async $requestDefaultShellAndArgs(useAutomationShell: boolean): Promise<IShellAndArgsDto> {
		const configProvider = await this._extHostConfiguration.getConfigProvider();
		return Promise.resolve({
			shell: this.getDefaultShell(useAutomationShell, configProvider),
			args: this._getDefaultShellArgs(useAutomationShell, configProvider)
		});
	}

	public $acceptWorkspacePermissionsChanged(isAllowed: boolean): void {
		this._isWorkspaceShellAllowed = isAllowed;
	}
}
