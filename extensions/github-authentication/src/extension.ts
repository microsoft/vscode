/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GitHubAuthenticationProvider, AuthProviderType } from './github';

export async function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(new GitHubAuthenticationProvider(context, AuthProviderType.github));
	context.subscriptions.push(new GitHubAuthenticationProvider(context, AuthProviderType.githubEnterprise));
}
