/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';

/** The authentication provider that gates Private Marketplace access. */
export type ExtensionGalleryAccessProviderId = 'github' | 'microsoft';

/** A persisted access verdict for one account against one marketplace. */
export interface ICachedAccess {
	authProvider: ExtensionGalleryAccessProviderId;
	accountId: string;
	eligible: boolean;
	/** Scopes the verdict: it must not be reused after an admin repoints the client elsewhere. */
	serviceUrl: string;
}

/**
 * The service index rejected the request on authentication grounds (401/403). Distinct from a
 * transient failure so an auth-gated index is not reported as unreachable.
 */
export class MarketplaceAuthRequiredError extends Error {
	constructor(readonly statusCode: number) {
		super(`Extension gallery request requires authentication (status ${statusCode}).`);
	}
}

/**
 * The deployment cannot work as configured — e.g. a non-HTTPS service index under Entra auth, so
 * the token cannot be safely transmitted. Durable, unlike a transient failure.
 */
export class MarketplaceMisconfiguredError extends Error {
	constructor(message: string) {
		super(message);
	}
}

/**
 * The marketplace refused this client outright — any 4xx other than 401/403, such as a minimum
 * client version. Durable, so callers report a denial rather than an unreachable network.
 */
export class MarketplaceClientRejectedError extends Error {
	constructor(readonly statusCode: number, message: string) {
		super(message);
	}
}

/**
 * The effective auth provider, applying the Entra product gate: a configured `microsoft` provider
 * is downgraded to `github` until Entra auth is enabled in the product.
 */
export function getEffectiveAuthProvider(configuredProvider: string | undefined, entraAuthEnabled: boolean): ExtensionGalleryAccessProviderId {
	return configuredProvider === 'microsoft' && entraAuthEnabled ? 'microsoft' : 'github';
}

/**
 * A bearer token may only be sent to an HTTPS target that is same-origin with the configured
 * service index, so a tampered manifest cannot redirect it elsewhere. Fails closed.
 */
export function isSafeTokenTarget(targetUrl: string, baseUrl: string): boolean {
	let target: URI;
	let base: URI;
	try {
		target = URI.parse(targetUrl, true);
		base = URI.parse(baseUrl, true);
	} catch {
		return false;
	}
	if (target.scheme !== 'https') {
		return false;
	}
	// Same-origin: scheme + authority (host:port) must match exactly.
	return target.scheme === base.scheme && target.authority.toLowerCase() === base.authority.toLowerCase();
}
