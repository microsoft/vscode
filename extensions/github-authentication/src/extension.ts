/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GitHubAuthenticationProvider, AuthProviderType } from './github';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(new GitHubAuthenticationProvider(context, AuthProviderType.github));

	let githubEnterpriseAuthProvider: GitHubAuthenticationProvider | undefined;
	if (vscode.workspace.getConfiguration().get<string>('github-enterprise.uri')) {
		githubEnterpriseAuthProvider = new GitHubAuthenticationProvider(context, AuthProviderType.githubEnterprise);
		context.subscriptions.push(githubEnterpriseAuthProvider);
	}

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async e => {
		if (e.affectsConfiguration('github-enterprise.uri')) {
			if (!githubEnterpriseAuthProvider && vscode.workspace.getConfiguration().get<string>('github-enterprise.uri')) {
				githubEnterpriseAuthProvider = new GitHubAuthenticationProvider(context, AuthProviderType.githubEnterprise);
				context.subscriptions.push(githubEnterpriseAuthProvider);
			}
		}
	}));
}
