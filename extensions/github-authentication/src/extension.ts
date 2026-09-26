/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GitHubAuthenticationProvider, GitHubAuthenticationProviderFactory, UriEventHandler } from './github';
import { GitHubEnterpriseAuthenticationProvider } from './githubEnterprise';

export async function activate(context: vscode.ExtensionContext) {
	const uriHandler = new UriEventHandler();
	context.subscriptions.push(uriHandler);
	context.subscriptions.push(vscode.window.registerUriHandler(uriHandler));

	context.subscriptions.push(new GitHubAuthenticationProvider(context, uriHandler));

	const githubEnterpriseAuthProvider = new GitHubEnterpriseAuthenticationProvider(new GitHubAuthenticationProviderFactory(context, uriHandler));
	context.subscriptions.push(githubEnterpriseAuthProvider);
	const updateEnterpriseConfiguration = async () => {
		const setting = vscode.workspace.getConfiguration().get<string>('github-enterprise.uri');
		let uri: vscode.Uri | undefined;
		try {
			uri = setting ? vscode.Uri.parse(setting, true) : undefined;
		} catch (error) {
			const message = vscode.l10n.t('GitHub Enterprise Server URI is not a valid URI: {0}', error.message ?? error);
			await githubEnterpriseAuthProvider.update(undefined, message);
			void vscode.window.showErrorMessage(message);
			return;
		}
		await githubEnterpriseAuthProvider.update(uri);
	};
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('github-enterprise.uri')) {
			void updateEnterpriseConfiguration().catch(error => vscode.window.showErrorMessage(vscode.l10n.t('Could not update GitHub Enterprise authentication: {0}', error.message)));
		}
	}));
	try {
		await updateEnterpriseConfiguration();
	} catch (error) {
		const message = vscode.l10n.t('Could not initialize GitHub Enterprise authentication: {0}', error instanceof Error ? error.message : String(error));
		await githubEnterpriseAuthProvider.update(undefined, message);
		void vscode.window.showErrorMessage(message);
	}

	// Listener to prompt for reload when the fetch implementation setting changes
	const beforeFetchSetting = vscode.workspace.getConfiguration().get<boolean>('github-authentication.useElectronFetch', true);
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async e => {
		if (e.affectsConfiguration('github-authentication.useElectronFetch')) {
			const afterFetchSetting = vscode.workspace.getConfiguration().get<boolean>('github-authentication.useElectronFetch', true);
			if (beforeFetchSetting !== afterFetchSetting) {
				const selection = await vscode.window.showInformationMessage(
					vscode.l10n.t('GitHub Authentication - Reload required'),
					{
						modal: true,
						detail: vscode.l10n.t('A reload is required for the fetch setting change to take effect.')
					},
					vscode.l10n.t('Reload Window')
				);
				if (selection) {
					await vscode.commands.executeCommand('workbench.action.reloadWindow');
				}
			}
		}
	}));
}
