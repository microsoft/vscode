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

	context.subscriptions.push(vscode.commands.registerCommand(openApiCommand, (url: vscode.Uri, showOptions?: { preserveFocus?: boolean }) => {
		manager.show(url.toString(), showOptions);
	}));

	context.subscriptions.push(vscode.window.registerExternalUriOpener(['http', 'https'], {
		canOpenExternalUri(uri: vscode.Uri) {
			const configuration = vscode.workspace.getConfiguration('simpleBrowser');
			if (!configuration.get('opener.enabled', false)) {
				return false;
			}

			const enabledHosts = configuration.get<string[]>('opener.enabledHosts', [
				'localhost',
				'127.0.0.1'
			]);
			try {
				const originalUri = new URL(uri.toString());
				if (!enabledHosts.includes(originalUri.hostname)) {
					return false;
				}
			} catch {
				return false;
			}

			return true;
		},
		openExternalUri(_opener, resolveUri) {
			return manager.show(resolveUri.toString());
		}
	}, {
		label: localize('openTitle', "Open in simple browser"),
	}));
}
