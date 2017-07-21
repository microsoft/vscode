/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

export interface TSConfig {
	path: string;
	workspaceFolder?: vscode.WorkspaceFolder;
}

export default class TsConfigProvider extends vscode.Disposable {
	private readonly tsconfigs = new Map<string, TSConfig>();

	private activated: boolean = false;
	private disposables: vscode.Disposable[] = [];

	constructor() {
		super(() => this.dispose());
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}

	public async getConfigsForWorkspace(): Promise<Iterable<TSConfig>> {
		if (!vscode.workspace.workspaceFolders) {
			return [];
		}
		await this.ensureActivated();
		return this.tsconfigs.values();
	}

	private async ensureActivated() {
		if (this.activated) {
			return this;
		}
		this.activated = true;

		for (const config of await TsConfigProvider.loadWorkspaceTsconfigs()) {
			this.handleProjectCreate(config);
		}

		const configFileWatcher = vscode.workspace.createFileSystemWatcher('**/tsconfig*.json');
		this.disposables.push(configFileWatcher);
		configFileWatcher.onDidCreate(this.handleProjectCreate, this, this.disposables);
		configFileWatcher.onDidDelete(this.handleProjectDelete, this, this.disposables);

		return this;
	}

	private static loadWorkspaceTsconfigs() {
		return vscode.workspace.findFiles('**/tsconfig*.json', '**/node_modules/**');
	}

	private handleProjectCreate(config: vscode.Uri) {
		const root = vscode.workspace.getWorkspaceFolder(config);
		if (root) {
			this.tsconfigs.set(config.fsPath, {
				path: config.fsPath,
				workspaceFolder: root
			});
		}
	}

	private handleProjectDelete(e: vscode.Uri) {
		this.tsconfigs.delete(e.fsPath);
	}
}
