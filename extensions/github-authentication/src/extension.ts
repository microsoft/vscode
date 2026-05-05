/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GitHubAuthenticationProvider, UriEventHandler } from './github';

const githubEnterpriseProviderId = 'github-enterprise';
const githubEnterpriseProviderLabel = 'GitHub Enterprise';
const githubEnterpriseSetting = 'github-enterprise.uri';

const githubCopilotEnterpriseProviderId = 'github-enterprise-copilot';
const githubCopilotEnterpriseProviderLabel = 'GitHub Copilot Enterprise';
const githubCopilotEnterpriseSetting = 'github.copilot.enterprise.uri';

interface GitHubEnterpriseProviderDefinition {
	readonly providerId: string;
	readonly providerLabel: string;
	readonly primarySetting: string;
	readonly fallbackSetting?: string;
}

function getConfiguredUriSettingValue({ primarySetting, fallbackSetting }: GitHubEnterpriseProviderDefinition): { value: string | undefined; settingName: string } {
	const configuration = vscode.workspace.getConfiguration();
	const primaryValue = configuration.get<string>(primarySetting);
	if (primaryValue) {
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

function initGHES(context: vscode.ExtensionContext, uriHandler: UriEventHandler, providerDefinition: GitHubEnterpriseProviderDefinition): vscode.Disposable {
	const { value: settingValue, settingName } = getConfiguredUriSettingValue(providerDefinition);
	if (!settingValue) {
		const provider = new NullAuthProvider(providerDefinition.providerId, providerDefinition.providerLabel, `"${providerDefinition.primarySetting}" not set`);
		return provider;
	}

	// validate user value
	let uri: vscode.Uri;
	try {
		uri = vscode.Uri.parse(settingValue, true);
	} catch (e) {
		vscode.window.showErrorMessage(vscode.l10n.t('GitHub Enterprise Server URI from {0} is not a valid URI: {1}', settingName, e.message ?? e));
		const provider = new NullAuthProvider(providerDefinition.providerId, providerDefinition.providerLabel, `"${settingName}" invalid`);
		return provider;
	}

	const githubEnterpriseAuthProvider = new GitHubAuthenticationProvider(context, uriHandler, {
		ghesUri: uri,
		providerId: providerDefinition.providerId,
		providerLabel: providerDefinition.providerLabel
	});
	return githubEnterpriseAuthProvider;
}

export function activate(context: vscode.ExtensionContext) {
	const uriHandler = new UriEventHandler();
	context.subscriptions.push(uriHandler);
	context.subscriptions.push(vscode.window.registerUriHandler(uriHandler));

	context.subscriptions.push(new GitHubAuthenticationProvider(context, uriHandler));

	for (const providerDefinition of [
		{
			providerId: githubEnterpriseProviderId,
			providerLabel: githubEnterpriseProviderLabel,
			primarySetting: githubEnterpriseSetting
		},
		{
			providerId: githubCopilotEnterpriseProviderId,
			providerLabel: githubCopilotEnterpriseProviderLabel,
			primarySetting: githubCopilotEnterpriseSetting,
			fallbackSetting: githubEnterpriseSetting
		}
	] satisfies GitHubEnterpriseProviderDefinition[]) {
		let before = getConfiguredUriSettingValue(providerDefinition).value;
		let authProvider = initGHES(context, uriHandler, providerDefinition);
		context.subscriptions.push({
			dispose: () => authProvider.dispose()
		});
		context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(providerDefinition.primarySetting) || (providerDefinition.fallbackSetting && e.affectsConfiguration(providerDefinition.fallbackSetting))) {
				const after = getConfiguredUriSettingValue(providerDefinition).value;
				if (before !== after) {
					authProvider.dispose();
					before = after;
					authProvider = initGHES(context, uriHandler, providerDefinition);
				}
			}
		}));
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
