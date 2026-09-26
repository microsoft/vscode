/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { isSearchAllowed, JevSearchProvider } from './provider';
import { scoreLocally } from './scorer';

export function activate(context: vscode.ExtensionContext): void {
	const output = vscode.window.createOutputChannel('Jev Search PoC', { log: true });
	context.subscriptions.push(output);
	const provider = new JevSearchProvider({
		name: vscode.l10n.t("Jev PoC (Local Demo)"),
		notice: vscode.l10n.t("Local token-overlap demo only; Jev was not called."),
		score: scoreLocally,
	}, output);
	context.subscriptions.push(provider);
	let registration: vscode.Disposable | undefined;
	const stop = () => {
		provider.cancel();
		registration?.dispose();
		registration = undefined;
	};
	context.subscriptions.push(new vscode.Disposable(stop));
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
		if ((event.affectsConfiguration('chat.disableAIFeatures') || event.affectsConfiguration('search.searchView.semanticSearchBehavior')) && !isSearchAllowed()) {
			stop();
			output.info('Local demo stopped because AI features were disabled or semantic search is no longer manual.');
		}
	}));
	context.subscriptions.push(vscode.commands.registerCommand('jevSearch.startDemo', async () => {
		if (context.extensionMode !== vscode.ExtensionMode.Development) {
			await vscode.window.showErrorMessage(vscode.l10n.t("This PoC must be loaded with --extensionDevelopmentPath. It is not a production extension."));
			return;
		}
		if (!isSearchAllowed()) {
			await vscode.window.showErrorMessage(vscode.l10n.t("The local demo requires a trusted workspace, enabled AI features, and search.searchView.semanticSearchBehavior set to manual."));
			return;
		}
		if (!vscode.workspace.workspaceFolders?.length || vscode.workspace.workspaceFolders.some(folder => folder.uri.scheme !== 'file')) {
			await vscode.window.showErrorMessage(vscode.l10n.t("Open the bundled sample workspace or another small local workspace before starting the demo."));
			return;
		}
		if (!registration) {
			try {
				registration = vscode.workspace.registerAITextSearchProvider('file', provider);
			} catch (error) {
				output.error(error instanceof Error ? error : String(error));
				await vscode.window.showErrorMessage(vscode.l10n.t("Could not register the Jev demo provider. Only one AI Search provider can use the file scheme. Use an isolated development profile without another AI Search provider; see the output channel for details."));
				return;
			}
		}
		await vscode.commands.executeCommand('workbench.view.search');
		await vscode.window.showInformationMessage(vscode.l10n.t("Local demo ready. Enter a query in Search, then run Search: Search with AI. No model or network service will be called."));
	}));
}
