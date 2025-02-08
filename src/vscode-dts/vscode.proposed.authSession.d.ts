/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export namespace authentication {
		/**
		 * @deprecated Use {@link getSession()} {@link AuthenticationGetSessionOptions.silent} instead.
		 */
		export function hasSession(providerId: string, scopes: readonly string[]): Thenable<boolean>;
	}
}
