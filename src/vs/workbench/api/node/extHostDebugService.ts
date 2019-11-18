/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as vscode from 'vscode';
import * as path from 'vs/base/common/path';
import { DebugAdapterExecutable } from 'vs/workbench/api/common/extHostTypes';
import { ExecutableDebugAdapter, SocketDebugAdapter } from 'vs/workbench/contrib/debug/node/debugAdapter';
import { AbstractDebugAdapter } from 'vs/workbench/contrib/debug/common/abstractDebugAdapter';
import { IExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';
import { IExtHostExtensionService } from 'vs/workbench/api/common/extHostExtensionService';
import { IExtHostDocumentsAndEditors, ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { IAdapterDescriptor } from 'vs/workbench/contrib/debug/common/debug';
import { IExtHostConfiguration, ExtHostConfigProvider } from '../common/extHostConfiguration';
import { IExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import { ExtensionDescriptionRegistry } from 'vs/workbench/services/extensions/common/extensionDescriptionRegistry';
import { IExtHostTerminalService } from 'vs/workbench/api/common/extHostTerminalService';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { ExtHostDebugServiceBase, ExtHostDebugSession } from 'vs/workbench/api/common/extHostDebugService';
import { ISignService } from 'vs/platform/sign/common/sign';
import { SignService } from 'vs/platform/sign/node/signService';
import { hasChildProcesses, prepareCommand, runInExternalTerminal } from 'vs/workbench/contrib/debug/node/terminals';
import { IDisposable } from 'vs/base/common/lifecycle';
import { AbstractVariableResolverService } from 'vs/workbench/services/configurationResolver/common/variableResolver';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { IProcessEnvironment } from 'vs/base/common/platform';


export class ExtHostDebugService extends ExtHostDebugServiceBase {

	readonly _serviceBrand: undefined;

	private _integratedTerminalInstance?: vscode.Terminal;
	private _terminalDisposedListener: IDisposable | undefined;

	constructor(
		@IExtHostRpcService extHostRpcService: IExtHostRpcService,
		@IExtHostWorkspace workspaceService: IExtHostWorkspace,
		@IExtHostExtensionService extensionService: IExtHostExtensionService,
		@IExtHostDocumentsAndEditors editorsService: IExtHostDocumentsAndEditors,
		@IExtHostConfiguration configurationService: IExtHostConfiguration,
		@IExtHostTerminalService private _terminalService: IExtHostTerminalService,
		@IExtHostCommands commandService: IExtHostCommands
	) {
		super(extHostRpcService, workspaceService, extensionService, editorsService, configurationService, commandService);
	}

	protected createDebugAdapter(adapter: IAdapterDescriptor, session: ExtHostDebugSession): AbstractDebugAdapter | undefined {
		switch (adapter.type) {
			case 'server':
				return new SocketDebugAdapter(adapter);
			case 'executable':
				return new ExecutableDebugAdapter(adapter, session.type);
		}
		return super.createDebugAdapter(adapter, session);
	}

	protected daExecutableFromPackage(session: ExtHostDebugSession, extensionRegistry: ExtensionDescriptionRegistry): DebugAdapterExecutable | undefined {
		const dae = ExecutableDebugAdapter.platformAdapterExecutable(extensionRegistry.getAllExtensionDescriptions(), session.type);
		if (dae) {
			return new DebugAdapterExecutable(dae.command, dae.args, dae.options);
		}
		return undefined;
	}

	protected createSignService(): ISignService | undefined {
		return new SignService();
	}

	public async $runInTerminal(args: DebugProtocol.RunInTerminalRequestArguments): Promise<number | undefined> {

		if (args.kind === 'integrated') {

			if (!this._terminalDisposedListener) {
				// React on terminal disposed and check if that is the debug terminal #12956
				this._terminalDisposedListener = this._terminalService.onDidCloseTerminal(terminal => {
					if (this._integratedTerminalInstance && this._integratedTerminalInstance === terminal) {
						this._integratedTerminalInstance = undefined;
					}
				});
			}

			let needNewTerminal = true;	// be pessimistic
			if (this._integratedTerminalInstance) {
				const pid = await this._integratedTerminalInstance.processId;
				needNewTerminal = await hasChildProcesses(pid);		// if no processes running in terminal reuse terminal
			}

			const configProvider = await this._configurationService.getConfigProvider();
			const shell = this._terminalService.getDefaultShell(true, configProvider);

			if (needNewTerminal || !this._integratedTerminalInstance) {

				const options: vscode.TerminalOptions = {
					shellPath: shell,
					// shellArgs: this._terminalService._getDefaultShellArgs(configProvider),
					cwd: args.cwd,
					name: args.title || nls.localize('debug.terminal.title', "debuggee"),
					env: args.env
				};
				delete args.cwd;
				delete args.env;
				this._integratedTerminalInstance = this._terminalService.createTerminalFromOptions(options);
			}

			const terminal = this._integratedTerminalInstance;

			terminal.show();

			const shellProcessId = await this._integratedTerminalInstance.processId;
			const command = prepareCommand(args, shell, configProvider);
			terminal.sendText(command, true);

			return shellProcessId;

		} else if (args.kind === 'external') {

			runInExternalTerminal(args, await this._configurationService.getConfigProvider());
		}
		return super.$runInTerminal(args);
	}
}

export class ExtHostVariableResolverService extends AbstractVariableResolverService {

	constructor(folders: vscode.WorkspaceFolder[], editorService: ExtHostDocumentsAndEditors, configurationService: ExtHostConfigProvider) {
		super({
			getFolderUri: (folderName: string): URI | undefined => {
				const found = folders.filter(f => f.name === folderName);
				if (found && found.length > 0) {
					return found[0].uri;
				}
				return undefined;
			},
			getWorkspaceFolderCount: (): number => {
				return folders.length;
			},
			getConfigurationValue: (folderUri: URI, section: string): string | undefined => {
				return configurationService.getConfiguration(undefined, folderUri).get<string>(section);
			},
			getExecPath: (): string | undefined => {
				return process.env['VSCODE_EXEC_PATH'];
			},
			getFilePath: (): string | undefined => {
				const activeEditor = editorService.activeEditor();
				if (activeEditor) {
					const resource = activeEditor.document.uri;
					if (resource.scheme === Schemas.file) {
						return path.normalize(resource.fsPath);
					}
				}
				return undefined;
			},
			getSelectedText: (): string | undefined => {
				const activeEditor = editorService.activeEditor();
				if (activeEditor && !activeEditor.selection.isEmpty) {
					return activeEditor.document.getText(activeEditor.selection);
				}
				return undefined;
			},
			getLineNumber: (): string | undefined => {
				const activeEditor = editorService.activeEditor();
				if (activeEditor) {
					return String(activeEditor.selection.end.line + 1);
				}
				return undefined;
			}
		}, process.env as IProcessEnvironment);
	}
}
