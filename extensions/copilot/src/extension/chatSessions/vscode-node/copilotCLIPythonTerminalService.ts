/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { PythonEnvironmentApi } from './copilotCLIPythonEnvironmentApi';

export class PythonTerminalService {
	constructor(@ILogService private readonly logService: ILogService,
	) { }

	private async getEnvExtApi(): Promise<PythonEnvironmentApi | undefined> {
		const extension = vscode.extensions.getExtension<PythonEnvironmentApi>('ms-python.vscode-python-envs');
		if (!extension) {
			return undefined;
		}
		if (!extension.isActive) {
			await extension.activate();
		}

		return extension.exports;
	}

	public async createTerminal(options: vscode.TerminalOptions) {
		try {
			const workspaceUri = vscode.workspace.workspaceFolders?.length ? vscode.workspace.workspaceFolders[0].uri : undefined;
			if (!workspaceUri) {
				return;
			}

			const api = await this.getEnvExtApi();
			if (!api) {
				return;
			}
			const env = await api.getEnvironment(workspaceUri);
			if (!env || !env.sysPrefix.toLowerCase().startsWith(workspaceUri.fsPath.toLowerCase())) {
				return;
			}
			return await api.createTerminal(env, options);
		} catch (ex) {
			this.logService.error('Failed to create terminal with Python environment', ex.toString());
		}
	}
}
