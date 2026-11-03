/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference path="../../../../../../../src/vscode-dts/vscode.d.ts" />

import * as fs from 'fs';
import * as vscode from 'vscode';

interface IAuthenticationFixture {
	token?: string;
	account?: { id?: string; label?: string };
}

export function activate(context: vscode.ExtensionContext): void {
	const file = process.env.VSCODE_SMOKE_TEST_TUNNEL_AUTH_FILE;
	if (!file) {
		throw new Error('The isolated tunnel smoke authentication file is required.');
	}
	const data = JSON.parse(fs.readFileSync(file, 'utf8')) as IAuthenticationFixture;
	if (typeof data.token !== 'string' || typeof data.account?.id !== 'string' || typeof data.account?.label !== 'string') {
		throw new Error('Invalid tunnel smoke authentication fixture.');
	}
	const accessToken = data.token;
	const account: vscode.AuthenticationSessionAccountInformation = { id: data.account.id, label: data.account.label };
	const changed = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	context.subscriptions.push(changed);
	const session = (scopes?: readonly string[]): vscode.AuthenticationSession => ({
		id: 'remote-devcontainer-smoke',
		accessToken,
		account,
		scopes: scopes ? [...scopes] : ['read:user', 'user:email', 'read:org'],
	});
	context.subscriptions.push(vscode.authentication.registerAuthenticationProvider('github', 'GitHub', {
		onDidChangeSessions: changed.event,
		getSessions: async scopes => [session(scopes)],
		createSession: async scopes => session(scopes),
		removeSession: async () => {
			throw new Error('The tunnel smoke account is owned by the test fixture.');
		},
	}, { supportsMultipleAccounts: false }));
}
