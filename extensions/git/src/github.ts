/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CredentialsProvider, Credentials } from './api/git';

export class GitHubCredentialProvider implements CredentialsProvider {

	async getCredentials(host: vscode.Uri): Promise<Credentials | undefined> {
		if (!/github\.com/i.test(host.authority)) {
			return;
		}

		const session = await this.getSession();
		return { username: session.account.id, password: await session.getAccessToken() };
	}

	private async getSession(): Promise<vscode.AuthenticationSession> {
		const authenticationSessions = await vscode.authentication.getSessions('github', ['repo']);

		if (authenticationSessions.length) {
			return await authenticationSessions[0];
		} else {
			return await vscode.authentication.login('github', ['repo']);
		}
	}
}
