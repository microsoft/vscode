/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ExtHostConfigProvider, IExtHostConfiguration } from 'vs/workbench/api/common/extHostConfiguration';
import { IExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { IExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';
import { URI } from 'vs/base/common/uri';
import * as path from 'vs/base/common/path';
import { IExtHostConfigurationResolverService } from 'vs/workbench/api/common/extHostConfigurationResolverService';
import { MainContext, MainThreadConfigurationResolverShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { AbstractAsyncVariableResolverService } from 'vs/workbench/services/configurationResolver/common/asyncVariableResolver';

export class ExtHostConfigurationResolverService extends AbstractAsyncVariableResolverService implements IExtHostConfigurationResolverService {
	protected readonly _proxy: MainThreadConfigurationResolverShape;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostDocumentsAndEditors private readonly _editorService: IExtHostDocumentsAndEditors,
		@IExtHostWorkspace private readonly _workspaceService: IExtHostWorkspace,
		@IExtHostConfiguration private readonly _configurationService: IExtHostConfiguration) {
		super({
			getFolderUri: (folderName: string): URI | undefined => {
				const found = this.folders.filter(f => f.name === folderName);
				if (found && found.length > 0) {
					return found[0].uri;
				}
				return undefined;
			},
			getWorkspaceFolderCount: (): number => {
				return this.folders.length;
			},
			getConfigurationValue: async (folderUri: URI | undefined, section: string): Promise<string | undefined> => {
				return (await this.configurationService).getConfiguration(undefined, folderUri).get<string>(section);
			},
			getAppRoot: (): string | undefined => {
				return process.cwd();
			},
			getExecPath: (): string | undefined => {
				return process.env['VSCODE_EXEC_PATH'];
			},
			getFilePath: async (): Promise<string | undefined> => {
				const activeUri = await this.getActiveUri();
				if (activeUri) {
					return path.normalize(activeUri.fsPath);
				}
				return undefined;
			},
			getWorkspaceFolderPathForFile: async (): Promise<string | undefined> => {
				const activeUri = await this.getActiveUri();
				if (activeUri) {
					const ws = this._workspaceService.getWorkspaceFolder(activeUri);
					if (ws) {
						return path.normalize(ws.uri.fsPath);
					}
				}
				return undefined;
			},
			getSelectedText: (): string | undefined => {
				const activeEditor = _editorService.activeEditor();
				if (activeEditor && !activeEditor.selection.isEmpty) {
					return activeEditor.document.getText(activeEditor.selection);
				}
				return undefined;
			},
			getLineNumber: (): string | undefined => {
				const activeEditor = _editorService.activeEditor();
				if (activeEditor) {
					return String(activeEditor.selection.end.line + 1);
				}
				return undefined;
			}
		}, undefined, Promise.resolve(process.env));

		this._proxy = extHostRpc.getProxy(MainContext.MainThreadConfigurationResolver);
	}

	get folders(): vscode.WorkspaceFolder[] {
		return this._workspaceService.getWorkspaceFolders() ?? [];
	}

	get configurationService(): Promise<ExtHostConfigProvider> {
		return this._configurationService.getConfigProvider();
	}

	private async getActiveUri(): Promise<URI | undefined> {
		if (this._editorService) {
			const activeEditor = this._editorService.activeEditor();
			if (activeEditor) {
				return URI.revive(await this._proxy.$getOriginalUri(activeEditor.document.uri));
			}
		}
		return undefined;
	}
}
