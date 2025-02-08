/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	/**
	 * Represents a session of a currently logged in user.
	 */
	export interface AuthenticationSession {
		/**
		 * An optional ID token that may be included in the session.
		 */
		readonly idToken?: string;
	}
}
