/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Uri } from 'vscode';
import { AuthProviderType, EnterpriseSettings } from '../github';
import { GitHubTarget } from '../flows';

const VALID_DESKTOP_CALLBACK_SCHEMES = [
	'vscode',
	'vscode-insiders',
	// On Windows, some browsers don't seem to redirect back to OSS properly.
	// As a result, you get stuck in the auth flow. We exclude this from the
	// list until we can figure out a way to fix this behavior in browsers.
	// 'code-oss',
	'vscode-wsl',
	'vscode-exploration'
];

export function isSupportedClient(uri: Uri): boolean {
	return (
		VALID_DESKTOP_CALLBACK_SCHEMES.includes(uri.scheme) ||
		// vscode.dev & insiders.vscode.dev
		/(?:^|\.)vscode\.dev$/.test(uri.authority) ||
		// github.dev & codespaces
		/(?:^|\.)github\.dev$/.test(uri.authority)
	);
}

export function isSupportedTarget(type: AuthProviderType, enterpriseSettings?: EnterpriseSettings): boolean {
	return (
		type === AuthProviderType.github || enterpriseSettings?.ssoId !== undefined ||
		isHostedGitHubEnterprise(enterpriseSettings?.uri!)
	);
}

export function isHostedGitHubEnterprise(uri: Uri): boolean {
	return /\.ghe\.com$/.test(uri.authority);
}

export function getTarget(enterpriseSettings?: EnterpriseSettings): GitHubTarget {
	if (!enterpriseSettings) {
		return GitHubTarget.DotCom;
	}

	if (enterpriseSettings.uri) {
		return isHostedGitHubEnterprise(enterpriseSettings.uri!) ? GitHubTarget.HostedEnterprise : GitHubTarget.Enterprise;
	}

	return GitHubTarget.EnterpriseSSO;

}
