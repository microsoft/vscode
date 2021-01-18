/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URL } from 'url';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { SimpleBrowserManager } from './simpleBrowserManager';

const localize = nls.loadMessageBundle();

const openApiCommand = 'simpleBrowser.api.open';
const showCommand = 'simpleBrowser.show';

const enabledHosts = new Set<string>([
	'localhost',
	'127.0.0.1'
]);

const openerId = 'simpleBrowser.open';

export function activate(context: vscode.ExtensionContext) {

	const manager = new SimpleBrowserManager(context.extensionUri);
	context.subscriptions.push(manager);

	context.subscriptions.push(vscode.commands.registerCommand(showCommand, async (url?: string) => {
		if (!url) {
			url = await vscode.window.showInputBox({
				placeHolder: localize('simpleBrowser.show.placeholder', "https://example.com"),
				prompt: localize('simpleBrowser.show.prompt', "Enter url to visit")
			});
		}

		if (url) {
			manager.show(url);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand(openApiCommand, (url: vscode.Uri, showOptions?: {
		preserveFocus?: boolean,
		viewColumn: vscode.ViewColumn,
	}) => {
		manager.show(url.toString(), showOptions);
	}));

	context.subscriptions.push(vscode.window.registerExternalUriOpener(['http', 'https'], {
		canOpenExternalUri(uri: vscode.Uri) {
			const configuration = vscode.workspace.getConfiguration('simpleBrowser');
			if (!configuration.get('opener.enabled', false)) {
				return false;
			}

			const originalUri = new URL(uri.toString());
			if (enabledHosts.has(originalUri.hostname)) {
				return true;
			}

			return false;
		},
		openExternalUri(resolveUri: vscode.Uri) {
			return manager.show(resolveUri.toString());
		}
	}, {
		id: openerId,
		label: localize('openTitle', "Open in simple browser"),
	}));
}
