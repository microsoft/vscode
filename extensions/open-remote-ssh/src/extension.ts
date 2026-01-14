/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import Log from './common/logger';
import { RemoteSSHResolver, REMOTE_SSH_AUTHORITY } from './authResolver';
import { openSSHConfigFile, promptOpenRemoteSSHWindow } from './commands';
import { HostTreeDataProvider } from './hostTreeView';
import { getRemoteWorkspaceLocationData, RemoteLocationHistory } from './remoteLocationHistory';

export async function activate(context: vscode.ExtensionContext) {
	const logger = new Log('Remote - SSH');
	context.subscriptions.push(logger);

	const remoteSSHResolver = new RemoteSSHResolver(context, logger);
	context.subscriptions.push(vscode.workspace.registerRemoteAuthorityResolver(REMOTE_SSH_AUTHORITY, remoteSSHResolver));
	context.subscriptions.push(remoteSSHResolver);

	const locationHistory = new RemoteLocationHistory(context);
	const locationData = getRemoteWorkspaceLocationData();
	if (locationData) {
		await locationHistory.addLocation(locationData[0], locationData[1]);
	}

	const hostTreeDataProvider = new HostTreeDataProvider(locationHistory);
	context.subscriptions.push(vscode.window.createTreeView('sshHosts', { treeDataProvider: hostTreeDataProvider }));
	context.subscriptions.push(hostTreeDataProvider);

	context.subscriptions.push(vscode.commands.registerCommand('openremotessh.openEmptyWindow', () => promptOpenRemoteSSHWindow(false)));
	context.subscriptions.push(vscode.commands.registerCommand('openremotessh.openEmptyWindowInCurrentWindow', () => promptOpenRemoteSSHWindow(true)));
	context.subscriptions.push(vscode.commands.registerCommand('openremotessh.openConfigFile', () => openSSHConfigFile()));
	context.subscriptions.push(vscode.commands.registerCommand('openremotessh.showLog', () => logger.show()));
}

export function deactivate() {
}
