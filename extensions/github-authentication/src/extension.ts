/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GitHubAuthenticationProvider, UriEventHandler } from './github';

const settingNotSent = '"github-enterprise.uri" not set';
const settingInvalid = '"github-enterprise.uri" invalid';

class NullAuthProvider implements vscode.AuthenticationProvider {
	private _onDidChangeSessions = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	onDidChangeSessions = this._onDidChangeSessions.event;

	private readonly _disposable: vscode.Disposable;

	constructor(private readonly _errorMessage: string) {
		this._disposable = vscode.authentication.registerAuthenticationProvider('github-enterprise', 'GitHub Enterprise', this);
	}

	createSession(): Thenable<vscode.AuthenticationSession> {
		throw new Error(this._errorMessage);
	}

	getSessions(): Thenable<vscode.AuthenticationSession[]> {
		return Promise.resolve([]);
	}
	removeSession(): Thenable<void> {
		throw new Error(this._errorMessage);
	}

	dispose() {
		this._onDidChangeSessions.dispose();
		this._disposable.dispose();
	}
}

function initGHES(context: vscode.ExtensionContext, uriHandler: UriEventHandler): vscode.Disposable {
	const settingValue = vscode.workspace.getConfiguration().get<string>('github-enterprise.uri');
	if (!settingValue) {
		const provider = new NullAuthProvider(settingNotSent);
		context.subscriptions.push(provider);
		return provider;
	}

	// validate user value
	let uri: vscode.Uri;
	try {
		uri = vscode.Uri.parse(settingValue, true);
	} catch (e) {
		vscode.window.showErrorMessage(vscode.l10n.t('GitHub Enterprise Server URI is not a valid URI: {0}', e.message ?? e));
		const provider = new NullAuthProvider(settingInvalid);
		context.subscriptions.push(provider);
		return provider;
	}

	const githubEnterpriseAuthProvider = new GitHubAuthenticationProvider(context, uriHandler, uri);
	context.subscriptions.push(githubEnterpriseAuthProvider);
	return githubEnterpriseAuthProvider;
}

export function activate(context: vscode.ExtensionContext) {
	const uriHandler = new UriEventHandler();
	context.subscriptions.push(uriHandler);
	context.subscriptions.push(vscode.window.registerUriHandler(uriHandler));

	context.subscriptions.push(new GitHubAuthenticationProvider(context, uriHandler));

	let before = vscode.workspace.getConfiguration().get<string>('github-enterprise.uri');
	let githubEnterpriseAuthProvider = initGHES(context, uriHandler);
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('github-enterprise.uri')) {
			const after = vscode.workspace.getConfiguration().get<string>('github-enterprise.uri');
			if (before !== after) {
				githubEnterpriseAuthProvider?.dispose();
				before = after;
				githubEnterpriseAuthProvider = initGHES(context, uriHandler);
			}
		}
	}));

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
