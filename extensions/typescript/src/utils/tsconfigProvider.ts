/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

export default class TsConfigProvider extends vscode.Disposable {
	private readonly tsconfigs = new Set<string>();

	private activated: boolean = false;
	private disposables: vscode.Disposable[] = [];

	constructor() {
		super(() => this.dispose());
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}

	public async getConfigsForWorkspace(): Promise<Iterable<string>> {
		if (!vscode.workspace.rootPath && !vscode.workspace.workspaceFolders) {
			return [];
		}
		await this.ensureActivated();
		return this.tsconfigs;
	}

	private async ensureActivated() {
		if (this.activated) {
			return this;
		}
		this.activated = true;

		for (const config of await TsConfigProvider.loadWorkspaceTsconfigs()) {
			this.tsconfigs.add(config.fsPath);
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

	private handleProjectCreate(e: vscode.Uri) {
		this.tsconfigs.add(e.fsPath);
	}

	private handleProjectDelete(e: vscode.Uri) {
		this.tsconfigs.delete(e.fsPath);
	}
}
