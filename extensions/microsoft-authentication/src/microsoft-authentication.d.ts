/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthenticationSession } from 'vscode';

/**
 * Represents a session of a currently logged in Microsoft user.
 */
export interface MicrosoftAuthenticationSession extends AuthenticationSession {
	/**
	 * The id token.
	 */
	idToken?: string;
}