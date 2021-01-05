/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SimpleBrowserManager } from './simpleBrowserManager';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

const openCommand = 'simpleBrowser.open';
const showCommand = 'simpleBrowser.show';

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

	context.subscriptions.push(vscode.commands.registerCommand(openCommand, (url: vscode.Uri) => {
		manager.show(url.toString());
	}));

	context.subscriptions.push(vscode.window.registerExternalUriOpener(['http', 'https'], {
		openExternalUri(uri: vscode.Uri): vscode.Command | undefined {
			const configuration = vscode.workspace.getConfiguration('simpleBrowser');
			if (!configuration.get('opener.enabled', false)) {
				return undefined;
			}

			return {
				title: localize('openTitle', "Open in simple browser"),
				command: openCommand,
				arguments: [uri]
			};
		}
	}));
}
