/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Matches MSAL's default token renewal offset and the id token refresh window. */
export const ACCESS_TOKEN_RENEWAL_WINDOW_MS = 5 * 60 * 1000;

/**
 * Whether an access token expires within the renewal window, or has already expired.
 * Tokens without a known expiry are left to MSAL.
 */
export function isAccessTokenNearExpiry(expiresOn: Date | null | undefined, now = Date.now()): boolean {
	return !!expiresOn && expiresOn.getTime() - ACCESS_TOKEN_RENEWAL_WINDOW_MS <= now;
}
