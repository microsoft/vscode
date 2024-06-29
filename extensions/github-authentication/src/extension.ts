/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { EnterpriseSettings, GitHubAuthenticationProvider, UriEventHandler } from './github';

function areEnterpriseSettingsValid(enterpriseUri?: string, enterpriseSsoId?: string): { valid: boolean; error?: string } {
	if (enterpriseUri && enterpriseSsoId) {
		return { valid: false, error: vscode.l10n.t('Only one of github-enterprise.uri and github-enterprise.sso-id are allowed') };
	}
	if (enterpriseUri) {
		try {
			vscode.Uri.parse(enterpriseUri, true);
		} catch (e) {
			return { valid: false, error: vscode.l10n.t('GitHub Enterprise Server URI is not a valid URI: {0}', e.message ?? e) };
		}
	} else if (enterpriseSsoId && (enterpriseSsoId.includes('/') || enterpriseSsoId.includes('.'))) {
		return { valid: false, error: vscode.l10n.t('GitHub Enterprise SSO ID is not valid') };
	}
	return { valid: true };
}

function setupGHES(context: vscode.ExtensionContext, uriHandler: UriEventHandler) {
	const uriSettingKey = 'github-enterprise.uri';
	const ssoIdSettingKey = 'github-enterprise.sso-id';
	const uriValue = vscode.workspace.getConfiguration().get<string>(uriSettingKey);
	const ssoIdValue = vscode.workspace.getConfiguration().get<string>(ssoIdSettingKey);
	if (!uriValue && !ssoIdValue) {
		return undefined;
	}
	let authProvider: GitHubAuthenticationProvider | undefined = initGHES(context, uriHandler, uriValue, ssoIdValue);

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async e => {
		if (e.affectsConfiguration(uriSettingKey) || e.affectsConfiguration(ssoIdSettingKey)) {
			const uriValue = vscode.workspace.getConfiguration().get<string>(uriSettingKey);
			const nameValue = vscode.workspace.getConfiguration().get<string>(ssoIdSettingKey);
			if (uriValue || nameValue) {
				authProvider?.dispose();
				authProvider = initGHES(context, uriHandler, uriValue, nameValue);
			}
		}
	}));
}

function initGHES(context: vscode.ExtensionContext, uriHandler: UriEventHandler, uri?: string, ssoId?: string) {
	const { valid, error } = areEnterpriseSettingsValid(uri, ssoId);
	if (!valid) {
		vscode.window.showErrorMessage(error!);
		return;
	}

	const enterpriseSettings = new EnterpriseSettings(uri, ssoId);
	const githubEnterpriseAuthProvider = new GitHubAuthenticationProvider(context, uriHandler, enterpriseSettings);
	context.subscriptions.push(githubEnterpriseAuthProvider);
	return githubEnterpriseAuthProvider;
}

export function activate(context: vscode.ExtensionContext) {
	const uriHandler = new UriEventHandler();
	context.subscriptions.push(uriHandler);
	context.subscriptions.push(vscode.window.registerUriHandler(uriHandler));
	context.subscriptions.push(new GitHubAuthenticationProvider(context, uriHandler));
	setupGHES(context, uriHandler);
}
