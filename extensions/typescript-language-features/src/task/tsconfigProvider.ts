/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { wait } from '../test/testUtils';

export interface TSConfig {
	readonly uri: vscode.Uri;
	readonly fsPath: string;
	readonly posixPath: string;
	readonly workspaceFolder?: vscode.WorkspaceFolder;
}

export class TsConfigProvider {
	public async getConfigsForWorkspace(options?: { timeout: number }): Promise<Iterable<TSConfig>> {
		if (!vscode.workspace.workspaceFolders) {
			return [];
		}

		const configs = new Map<string, TSConfig>();
		for (const config of await this.findConfigFiles(options)) {
			const root = vscode.workspace.getWorkspaceFolder(config);
			if (root) {
				configs.set(config.fsPath, {
					uri: config,
					fsPath: config.fsPath,
					posixPath: config.path,
					workspaceFolder: root
				});
			}
		}
		return configs.values();
	}

	private async findConfigFiles(options?: { timeout: number }): Promise<vscode.Uri[]> {
		const timeout = options?.timeout;
		const task = (token?: vscode.CancellationToken) => vscode.workspace.findFiles('**/tsconfig*.json', '**/{node_modules,.*}/**', undefined, token);

		if (typeof timeout === 'number') {
			const cancel = new vscode.CancellationTokenSource();
			return Promise.race([
				task(cancel.token),
				wait(timeout).then(() => {
					cancel.cancel();
					return [];
				}),
			]);
		} else {
			return task();
		}
	}
}
