/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * This is the place for API experiments and proposals.
 * These API are NOT stable and subject to change. They are only available in the Insiders
 * distribution and CANNOT be used in published extensions.
 *
 * To test these API in local environment:
 * - Use Insiders release of VS Code.
 * - Add `"enableProposedApi": true` to your package.json.
 * - Copy this file to your project.
 */

declare module 'vscode' {

	export interface Account {
		readonly id: string;
		readonly accessToken: string;
		readonly displayName: string;
	}

	export interface AuthenticationProvider {
		readonly id: string;
		readonly displayName: string;

		readonly accounts: ReadonlyArray<Account>;
		readonly onDidChangeAccounts: Event<ReadonlyArray<Account>>;

		login(): Promise<Account>;
		logout(accountId: string): Promise<void>;
	}

	export namespace authentication {
		export function registerAuthenticationProvider(provider: AuthenticationProvider): Disposable;
	}

	// #region Ben - extension auth flow (desktop+web)

	export namespace env {

		export function asExternalUri(target: Uri): Thenable<Uri>
	}
}
