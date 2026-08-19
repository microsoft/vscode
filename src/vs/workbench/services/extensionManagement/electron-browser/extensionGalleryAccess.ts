/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** The authentication provider that gates Private Marketplace access. */
export type ExtensionGalleryAccessProviderId = 'github' | 'microsoft';

/** The service index rejected the request on authentication grounds (401/403). */
export class MarketplaceAuthRequiredError extends Error {
	constructor(readonly statusCode: number) {
		super(`Extension gallery request requires authentication (status ${statusCode}).`);
	}
}

/** The marketplace refused this client outright — any 4xx other than 401/403. */
export class MarketplaceClientRejectedError extends Error {
	constructor(readonly statusCode: number, message: string) {
		super(message);
	}
}

/** A configured `microsoft` provider is downgraded to `github` until Entra auth ships. */
export function getEffectiveAuthProvider(configuredProvider: string | undefined, entraAuthEnabled: boolean): ExtensionGalleryAccessProviderId {
	return configuredProvider === 'microsoft' && entraAuthEnabled ? 'microsoft' : 'github';
}