/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as path from 'path';
import SSHConfiguration, { getSSHConfigPath } from './ssh/sshConfig';
import { RemoteLocationHistory } from './remoteLocationHistory';
import { Disposable } from './common/disposable';
import { addNewHost, openRemoteSSHLocationWindow, openRemoteSSHWindow, openSSHConfigFile } from './commands';
import SSHDestination from './ssh/sshDestination';

class HostItem {
	constructor(
		public hostname: string,
		public locations: string[]
	) {
	}
}

class HostLocationItem {
	constructor(
		public path: string,
		public hostname: string
	) {
	}
}

type DataTreeItem = HostItem | HostLocationItem;

export class HostTreeDataProvider extends Disposable implements vscode.TreeDataProvider<DataTreeItem> {

	private readonly _onDidChangeTreeData = this._register(new vscode.EventEmitter<DataTreeItem | DataTreeItem[] | void>());
	public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(
		private locationHistory: RemoteLocationHistory
	) {
		super();

		this._register(vscode.commands.registerCommand('openremotessh.explorer.add', () => addNewHost()));
		this._register(vscode.commands.registerCommand('openremotessh.explorer.configure', () => openSSHConfigFile()));
		this._register(vscode.commands.registerCommand('openremotessh.explorer.refresh', () => this.refresh()));
		this._register(vscode.commands.registerCommand('openremotessh.explorer.emptyWindowInNewWindow', e => this.openRemoteSSHWindow(e, false)));
		this._register(vscode.commands.registerCommand('openremotessh.explorer.emptyWindowInCurrentWindow', e => this.openRemoteSSHWindow(e, true)));
		this._register(vscode.commands.registerCommand('openremotessh.explorer.reopenFolderInNewWindow', e => this.openRemoteSSHLocationWindow(e, false)));
		this._register(vscode.commands.registerCommand('openremotessh.explorer.reopenFolderInCurrentWindow', e => this.openRemoteSSHLocationWindow(e, true)));
		this._register(vscode.commands.registerCommand('openremotessh.explorer.deleteFolderHistoryItem', e => this.deleteHostLocation(e)));

		this._register(vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('remote.SSH.configFile')) {
				this.refresh();
			}
		}));
		this._register(vscode.workspace.onDidSaveTextDocument(e => {
			if (e.uri.fsPath === getSSHConfigPath()) {
				this.refresh();
			}
		}));
	}

	getTreeItem(element: DataTreeItem): vscode.TreeItem {
		if (element instanceof HostLocationItem) {
			const label = path.posix.basename(element.path).replace(/\.code-workspace$/, ' (Workspace)');
			const treeItem = new vscode.TreeItem(label);
			treeItem.description = path.posix.dirname(element.path);
			treeItem.iconPath = new vscode.ThemeIcon('folder');
			treeItem.contextValue = 'openremotessh.explorer.folder';
			return treeItem;
		}

		const treeItem = new vscode.TreeItem(element.hostname);
		treeItem.collapsibleState = element.locations.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
		treeItem.iconPath = new vscode.ThemeIcon('vm');
		treeItem.contextValue = 'openremotessh.explorer.host';
		return treeItem;
	}

	async getChildren(element?: HostItem): Promise<DataTreeItem[]> {
		if (!element) {
			const sshConfigFile = await SSHConfiguration.loadFromFS();
			const hosts = sshConfigFile.getAllConfiguredHosts();
			return hosts.map(hostname => new HostItem(hostname, this.locationHistory.getHistory(hostname)));
		}
		if (element instanceof HostItem) {
			return element.locations.map(location => new HostLocationItem(location, element.hostname));
		}
		return [];
	}

	private refresh() {
		this._onDidChangeTreeData.fire();
	}

	private async deleteHostLocation(element: HostLocationItem) {
		await this.locationHistory.removeLocation(element.hostname, element.path);
		this.refresh();
	}

	private async openRemoteSSHWindow(element: HostItem, reuseWindow: boolean) {
		const sshDest = new SSHDestination(element.hostname);
		openRemoteSSHWindow(sshDest.toEncodedString(), reuseWindow);
	}

	private async openRemoteSSHLocationWindow(element: HostLocationItem, reuseWindow: boolean) {
		const sshDest = new SSHDestination(element.hostname);
		openRemoteSSHLocationWindow(sshDest.toEncodedString(), element.path, reuseWindow);
	}
}
