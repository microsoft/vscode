/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GitHubAuthenticationProvider, GitHubEnterpriseAuthenticationProvider, UriEventHandler } from './github';

const githubEnterpriseProviderId = 'github-enterprise';
const githubEnterpriseProviderLabel = 'GitHub Enterprise';
const githubEnterpriseSetting = 'github-enterprise.uri';

const githubCopilotEnterpriseSetting = 'github.copilot.enterprise.uri';

function getConfiguredUriSettingValue(primarySetting: string, fallbackSetting?: string): { value: string | undefined; settingName: string } {
	const configuration = vscode.workspace.getConfiguration();
	const primaryValue = configuration.get<string>(primarySetting);
	if (typeof primaryValue === 'string' && primaryValue.trim().length > 0) {
		return { value: primaryValue, settingName: primarySetting };
	}
	return { value: fallbackSetting ? configuration.get<string>(fallbackSetting) : undefined, settingName: fallbackSetting ?? primarySetting };
}

class NullAuthProvider implements vscode.AuthenticationProvider {
	private _onDidChangeSessions = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	onDidChangeSessions = this._onDidChangeSessions.event;

	private readonly _disposable: vscode.Disposable;

	constructor(providerId: string, providerLabel: string, private readonly _errorMessage: string) {
		this._disposable = vscode.authentication.registerAuthenticationProvider(providerId, providerLabel, this);
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
	const legacySetting = getConfiguredUriSettingValue(githubEnterpriseSetting);
	const copilotSetting = getConfiguredUriSettingValue(githubCopilotEnterpriseSetting, githubEnterpriseSetting);
	const configuredSettings = [legacySetting, copilotSetting].filter((setting): setting is { value: string; settingName: string } => !!setting.value);
	if (!configuredSettings.length) {
		return new NullAuthProvider(githubEnterpriseProviderId, githubEnterpriseProviderLabel, `"${githubEnterpriseSetting}" not set`);
	}

	const uris: vscode.Uri[] = [];
	let defaultUri: vscode.Uri | undefined;
	for (const setting of configuredSettings) {
		try {
			const uri = vscode.Uri.parse(setting.value, true);
			uris.push(uri);
			if (setting.settingName === githubEnterpriseSetting) {
				defaultUri = uri;
			}
		} catch (e) {
			vscode.window.showErrorMessage(vscode.l10n.t('GitHub Enterprise Server URI from {0} is not a valid URI: {1}', setting.settingName, e.message ?? e));
		}
	}
	if (!uris.length) {
		return new NullAuthProvider(githubEnterpriseProviderId, githubEnterpriseProviderLabel, 'GitHub Enterprise URI invalid');
	}
	return new GitHubEnterpriseAuthenticationProvider(context, uriHandler, {
		ghesUris: uris,
		defaultGhesUri: defaultUri
	});
}

export function activate(context: vscode.ExtensionContext) {
	const uriHandler = new UriEventHandler();
	context.subscriptions.push(uriHandler);
	context.subscriptions.push(vscode.window.registerUriHandler(uriHandler));

	context.subscriptions.push(new GitHubAuthenticationProvider(context, uriHandler));

	let before = [
		getConfiguredUriSettingValue(githubEnterpriseSetting).value,
		getConfiguredUriSettingValue(githubCopilotEnterpriseSetting, githubEnterpriseSetting).value
	];
	let authProvider = initGHES(context, uriHandler);
	context.subscriptions.push({
		dispose: () => authProvider.dispose()
	});
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration(githubEnterpriseSetting) || e.affectsConfiguration(githubCopilotEnterpriseSetting)) {
			const after = [
				getConfiguredUriSettingValue(githubEnterpriseSetting).value,
				getConfiguredUriSettingValue(githubCopilotEnterpriseSetting, githubEnterpriseSetting).value
			];
			if (before[0] !== after[0] || before[1] !== after[1]) {
				authProvider.dispose();
				before = after;
				authProvider = initGHES(context, uriHandler);
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
