/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Interface for sessions stored from the old authentication flow.
 * Used for migration purposes when upgrading to MSAL.
 */
export interface IStoredSession {
	id: string;
	refreshToken: string;
	scope: string; // Scopes are alphabetized and joined with a space
	account: {
		label: string;
		id: string;
	};
	endpoint: string | undefined;
}
