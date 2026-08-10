/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';

/**
 * Identifies which authentication provider gates Private Marketplace access.
 */
export type ExtensionGalleryAccessProviderId = 'github' | 'microsoft';

/**
 * A persisted access verdict for a single account against a single marketplace.
 */
export interface ICachedAccess {
	authProvider: ExtensionGalleryAccessProviderId;
	accountId: string;
	eligible: boolean;
	/**
	 * The `extensions.gallery.serviceUrl` the verdict was computed against. A verdict is scoped
	 * to a specific marketplace (the eligibility endpoint is discovered per-marketplace), so a
	 * cache written for one service URL must never be applied after the admin points the client
	 * at a different marketplace.
	 */
	serviceUrl: string;
}

/**
 * Thrown by the service-index (gallery manifest) fetch when the request is rejected for
 * authentication/authorization reasons (HTTP 401/403). The service index MAY be protected
 * at the administrator's discretion, so this is kept distinct from transient/network
 * failures: callers on the Entra path use it to decide whether to prompt for sign-in
 * (no token was presented) or to treat the identity as denied (a token was rejected),
 * rather than mislabeling an auth-gated index as "unreachable".
 */
export class MarketplaceAuthRequiredError extends Error {
	constructor(readonly statusCode: number) {
		super(`Extension gallery request requires authentication (status ${statusCode}).`);
	}
}

/**
 * Thrown when the Private Marketplace deployment is misconfigured for the effective auth
 * provider (e.g. a non-HTTPS service index under Entra auth, or a manifest that advertises no
 * EligibilityService). Distinct from {@link MarketplaceAuthRequiredError} and transient failures
 * so the validator can surface a durable "misconfigured" status rather than a sign-in prompt or
 * an "unreachable" flash.
 */
export class MarketplaceMisconfiguredError extends Error {
	constructor(message: string) {
		super(message);
	}
}

/**
 * Resolves the effective marketplace auth provider, applying the Entra (microsoft) product gate.
 * When Entra auth is not enabled in the product, a configured `microsoft` provider is downgraded to
 * the GitHub/default provider so the Entra path stays dormant until the Private Marketplace is
 * publicly released. Kept dependency-free (primitives in, verdict out) so it never reaches into a
 * service; callers read `extensions.gallery.authProvider` and `product.enableExtensionGalleryEntraAuth`.
 */
export function getEffectiveAuthProvider(configuredProvider: string | undefined, entraAuthEnabled: boolean): ExtensionGalleryAccessProviderId {
	return configuredProvider === 'microsoft' && entraAuthEnabled ? 'microsoft' : 'github';
}

/**
 * Guards bearer-token transport. A token must only ever be attached to a request whose target is
 * (a) HTTPS and (b) same-origin as the admin-configured service index URL. This prevents a
 * compromised or misconfigured gallery manifest from redirecting a resource URL (e.g. the
 * EligibilityService) at a foreign or cleartext endpoint and exfiltrating the token. Returns false
 * on any parse failure so callers fail closed.
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
