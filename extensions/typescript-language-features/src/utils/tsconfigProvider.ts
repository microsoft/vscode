/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

export interface TSConfig {
	readonly path: string;
	readonly posixPath: string;
	readonly workspaceFolder?: vscode.WorkspaceFolder;
}

export default class TsConfigProvider {
	public async getConfigsForWorkspace(): Promise<Iterable<TSConfig>> {
		if (!vscode.workspace.workspaceFolders) {
			return [];
		}
		const configs = new Map<string, TSConfig>();
		for (const config of await vscode.workspace.findFiles('**/tsconfig*.json', '**/node_modules/**')) {
			const root = vscode.workspace.getWorkspaceFolder(config);
			if (root) {
				configs.set(config.fsPath, {
					path: config.fsPath,
					posixPath: config.path,
					workspaceFolder: root
				});
			}
		}
		return configs.values();
	}
}
