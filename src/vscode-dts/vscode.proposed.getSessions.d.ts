/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/152399

	export namespace authentication {
		/**
		 * Get all authentication sessions matching the desired scopes that this extension has access to. In order to request access,
		 * use {@link getSession}. To request an additional account, specify {@link AuthenticationGetSessionOptions.clearSessionPreference}
		 * and {@link AuthenticationGetSessionOptions.createIfNone} together.
		 *
		 * Currently, there are only two authentication providers that are contributed from built in extensions
		 * to the editor that implement GitHub and Microsoft authentication: their providerId's are 'github' and 'microsoft'.
		 *
		 * @param providerId The id of the provider to use
		 * @param scopes A list of scopes representing the permissions requested. These are dependent on the authentication provider
		 * @returns A thenable that resolves to a readonly array of authentication sessions.
		 */
		export function getSessions(providerId: string, scopes: readonly string[]): Thenable<readonly AuthenticationSession[]>;
	}
}
