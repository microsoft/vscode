/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Helper for obtaining and refreshing a GitHub authentication token
 * using the built-in GitHub auth provider.
 */
export class AuthHelper implements vscode.Disposable {

	private _token: string | undefined;
	private readonly _onDidChangeToken = new vscode.EventEmitter<string | undefined>();
	readonly onDidChangeToken = this._onDidChangeToken.event;

	private readonly _disposables: vscode.Disposable[] = [];

	constructor() {
		this._disposables.push(
			vscode.authentication.onDidChangeSessions(e => {
				if (e.provider.id === 'github') {
					this._token = undefined;
					this._onDidChangeToken.fire(undefined);
				}
			})
		);
	}

	/**
	 * Get a GitHub access token, prompting the user to sign in if needed.
	 */
	async getToken(options?: { createIfNone?: boolean; silent?: boolean }): Promise<string | undefined> {
		if (this._token) {
			return this._token;
		}

		try {
			const session = await vscode.authentication.getSession('github', ['user:email'], {
				createIfNone: options?.createIfNone ?? true,
				silent: options?.silent,
			});

			if (session) {
				this._token = session.accessToken;
				return this._token;
			}
		} catch {
			// User declined authentication
		}

		return undefined;
	}

	dispose(): void {
		this._onDidChangeToken.dispose();
		for (const d of this._disposables) {
			d.dispose();
		}
	}
}
