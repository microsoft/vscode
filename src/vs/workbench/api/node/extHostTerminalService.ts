/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as platform from 'vs/base/common/platform';
import { withNullAsUndefined } from 'vs/base/common/types';
import { generateUuid } from 'vs/base/common/uuid';
import { getSystemShell, getSystemShellSync } from 'vs/base/node/shell';
import { ILogService } from 'vs/platform/log/common/log';
import { SafeConfigProvider } from 'vs/platform/terminal/common/terminal';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IShellAndArgsDto } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostConfigProvider, ExtHostConfiguration, IExtHostConfiguration } from 'vs/workbench/api/common/extHostConfiguration';
import { ExtHostVariableResolverService } from 'vs/workbench/api/common/extHostDebugService';
import { ExtHostDocumentsAndEditors, IExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { BaseExtHostTerminalService, ExtHostTerminal } from 'vs/workbench/api/common/extHostTerminalService';
import { ExtHostWorkspace, IExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';
import { TerminalSettingId } from 'vs/workbench/contrib/terminal/common/terminal';
import * as terminalEnvironment from 'vs/workbench/contrib/terminal/common/terminalEnvironment';
import type * as vscode from 'vscode';

export class ExtHostTerminalService extends BaseExtHostTerminalService {

	private _variableResolver: ExtHostVariableResolverService | undefined;
	private _lastActiveWorkspace: IWorkspaceFolder | undefined;

	private _defaultShell: string | undefined;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostConfiguration private _extHostConfiguration: ExtHostConfiguration,
		@IExtHostWorkspace private _extHostWorkspace: ExtHostWorkspace,
		@IExtHostDocumentsAndEditors private _extHostDocumentsAndEditors: ExtHostDocumentsAndEditors,
		@ILogService private _logService: ILogService
	) {
		super(true, extHostRpc);

		// Getting the SystemShell is an async operation, however, the ExtHost terminal service is mostly synchronous
		// and the API `vscode.env.shell` is also synchronous. The default shell _should_ be set when extensions are
		// starting up but if not, we run getSystemShellSync below which gets a sane default.
		getSystemShell(platform.OS, process.env as platform.IProcessEnvironment).then(s => this._defaultShell = s);

		this._updateLastActiveWorkspace();
		this._registerListeners();
	}

	public createTerminal(name?: string, shellPath?: string, shellArgs?: string[] | string): vscode.Terminal {
		const terminal = new ExtHostTerminal(this._proxy, generateUuid(), { name, shellPath, shellArgs }, name);
		this._terminals.push(terminal);
		terminal.create(shellPath, shellArgs);
		return terminal.value;
	}

	public createTerminalFromOptions(options: vscode.TerminalOptions, isFeatureTerminal?: boolean): vscode.Terminal {
		const terminal = new ExtHostTerminal(this._proxy, generateUuid(), options, options.name);
		this._terminals.push(terminal);
		terminal.create(
			withNullAsUndefined(options.shellPath),
			withNullAsUndefined(options.shellArgs),
			withNullAsUndefined(options.cwd),
			withNullAsUndefined(options.env),
			withNullAsUndefined(options.icon),
			withNullAsUndefined(options.message),
			/*options.waitOnExit*/ undefined,
			withNullAsUndefined(options.strictEnv),
			withNullAsUndefined(options.hideFromUser),
			withNullAsUndefined(isFeatureTerminal),
			true
		);
		return terminal.value;
	}

	// TODO: Replace get shell/args calls with cached default shell given from renderer
	public getDefaultShell(useAutomationShell: boolean, configProvider: ExtHostConfigProvider): string {
		return terminalEnvironment.getDefaultShell(
			this._buildSafeConfigProvider(configProvider),
			this._defaultShell ?? getSystemShellSync(platform.OS, process.env as platform.IProcessEnvironment),
			process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432'),
			process.env.windir,
			terminalEnvironment.createVariableResolver(this._lastActiveWorkspace, process.env, this._variableResolver),
			this._logService,
			useAutomationShell
		);
	}

	public getDefaultShellArgs(useAutomationShell: boolean, configProvider: ExtHostConfigProvider): string[] | string {
		return terminalEnvironment.getDefaultShellArgs(
			this._buildSafeConfigProvider(configProvider),
			useAutomationShell,
			terminalEnvironment.createVariableResolver(this._lastActiveWorkspace, process.env, this._variableResolver),
			this._logService
		);
	}

	private _registerListeners(): void {
		this._extHostDocumentsAndEditors.onDidChangeActiveTextEditor(() => this._updateLastActiveWorkspace());
	}

	private _updateLastActiveWorkspace(): void {
		const activeEditor = this._extHostDocumentsAndEditors.activeEditor();
		if (activeEditor) {
			this._lastActiveWorkspace = this._extHostWorkspace.getWorkspaceFolder(activeEditor.document.uri) as IWorkspaceFolder;
		}
	}

	public async getDefaultShellAndArgs(useAutomationShell: boolean): Promise<IShellAndArgsDto> {
		const configProvider = await this._extHostConfiguration.getConfigProvider();
		return {
			shell: this.getDefaultShell(useAutomationShell, configProvider),
			args: this.getDefaultShellArgs(useAutomationShell, configProvider)
		};
	}

	// TODO: Remove when workspace trust is enabled
	private _buildSafeConfigProvider(configProvider: ExtHostConfigProvider): SafeConfigProvider {
		const config = configProvider.getConfiguration();
		return (key: string) => {
			const isWorkspaceConfigAllowed = config.get(TerminalSettingId.AllowWorkspaceConfiguration);
			if (isWorkspaceConfigAllowed) {
				return config.get(key) as any;
			}
			const inspected = config.inspect(key);
			return inspected?.globalValue || inspected?.defaultValue;
		};
	}
}
