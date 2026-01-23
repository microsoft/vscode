/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SimpleBrowserManager } from './simpleBrowserManager';
import { SimpleBrowserView } from './simpleBrowserView';

declare class URL {
	constructor(input: string, base?: string | URL);
	hostname: string;
}

const openApiCommand = 'simpleBrowser.api.open';
const showCommand = 'simpleBrowser.show';
const integratedBrowserCommand = 'workbench.action.browser.open';
const useIntegratedBrowserSetting = 'simpleBrowser.useIntegratedBrowser';

const enabledHosts = new Set<string>([
	'localhost',
	// localhost IPv4
	'127.0.0.1',
	// localhost IPv6
	'[0:0:0:0:0:0:0:1]',
	'[::1]',
	// all interfaces IPv4
	'0.0.0.0',
	// all interfaces IPv6
	'[0:0:0:0:0:0:0:0]',
	'[::]'
]);

const openerId = 'simpleBrowser.open';

/**
 * Checks if the integrated browser should be used instead of the simple browser
 */
async function shouldUseIntegratedBrowser(): Promise<boolean> {
	const config = vscode.workspace.getConfiguration();
	if (!config.get<boolean>(useIntegratedBrowserSetting, false)) {
		return false;
	}

	// Verify that the integrated browser command is available
	const commands = await vscode.commands.getCommands(true);
	return commands.includes(integratedBrowserCommand);
}

/**
 * Opens a URL in the integrated browser
 */
async function openInIntegratedBrowser(url?: string): Promise<void> {
	await vscode.commands.executeCommand(integratedBrowserCommand, url);
}

export function activate(context: vscode.ExtensionContext) {

	const manager = new SimpleBrowserManager(context.extensionUri);
	context.subscriptions.push(manager);

	context.subscriptions.push(vscode.window.registerWebviewPanelSerializer(SimpleBrowserView.viewType, {
		deserializeWebviewPanel: async (panel, state) => {
			manager.restore(panel, state);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand(showCommand, async (url?: string) => {
		if (await shouldUseIntegratedBrowser()) {
			return openInIntegratedBrowser(url);
		}

		if (!url) {
			url = await vscode.window.showInputBox({
				placeHolder: vscode.l10n.t("https://example.com"),
				prompt: vscode.l10n.t("Enter url to visit")
			});
		}

		if (url) {
			manager.show(url);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand(openApiCommand, async (url: vscode.Uri, showOptions?: {
		preserveFocus?: boolean;
		viewColumn: vscode.ViewColumn;
	}) => {
		if (await shouldUseIntegratedBrowser()) {
			await openInIntegratedBrowser(url.toString(true));
		} else {
			manager.show(url, showOptions);
		}
	}));

	context.subscriptions.push(vscode.window.registerExternalUriOpener(openerId, {
		canOpenExternalUri(uri: vscode.Uri) {
			// We have to replace the IPv6 hosts with IPv4 because URL can't handle IPv6.
			const originalUri = new URL(uri.toString(true));
			if (enabledHosts.has(originalUri.hostname)) {
				return isWeb()
					? vscode.ExternalUriOpenerPriority.Default
					: vscode.ExternalUriOpenerPriority.Option;
			}

			return vscode.ExternalUriOpenerPriority.None;
		},
		async openExternalUri(resolveUri: vscode.Uri) {
			if (await shouldUseIntegratedBrowser()) {
				await openInIntegratedBrowser(resolveUri.toString(true));
			} else {
				return manager.show(resolveUri, {
					viewColumn: vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active
				});
			}
		}
	}, {
		schemes: ['http', 'https'],
		label: vscode.l10n.t("Open in simple browser"),
	}));
}

function isWeb(): boolean {
	return !(typeof process === 'object' && !!process.versions.node) && vscode.env.uiKind === vscode.UIKind.Web;
}
