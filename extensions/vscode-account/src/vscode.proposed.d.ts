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

	export interface Session {
		id: string;
		accessToken: string;
		displayName: string;
		scopes: string[]
	}

	export interface AuthenticationProvider {
		readonly id: string;
		readonly displayName: string;
		readonly onDidChangeSessions: Event<void>;

		/**
		 * Returns an array of current sessions.
		 */
		getSessions(): Promise<ReadonlyArray<Session>>;

		/**
		 * Prompts a user to login.
		 */
		login(scopes: string[]): Promise<Session>;
		logout(sessionId: string): Promise<void>;
	}

	export namespace authentication {
		export function registerAuthenticationProvider(provider: AuthenticationProvider): Disposable;

		/**
		 * Fires with the provider id that was registered or unregistered.
		 */
		export const onDidRegisterAuthenticationProvider: Event<string>;
		export const onDidUnregisterAuthenticationProvider: Event<string>;

		export const providers: ReadonlyArray<AuthenticationProvider>;
	}

	// #region Ben - extension auth flow (desktop+web)

	export namespace env {

		export function asExternalUri(target: Uri): Thenable<Uri>
	}
}
