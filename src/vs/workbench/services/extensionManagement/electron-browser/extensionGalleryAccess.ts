/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IExtensionGalleryManifest, ExtensionGalleryManifestStatus } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';

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
 * Sink through which the access validator publishes the outcome of an access validation back to
 * its host (the `WorkbenchExtensionGalleryManifestService`). The validator owns the "which account
 * may access which marketplace" decision; the host owns the resulting manifest/status state and
 * its change events. Keeping this contract narrow lets the validator drive status transitions
 * without reaching into the service's manifest fields.
 */
export interface IExtensionGalleryAccessSink {
	/**
	 * The current manifest status. The validator reads this to preserve an already-`Available`
	 * marketplace across transient failures instead of flashing an error state.
	 */
	getStatus(): ExtensionGalleryManifestStatus;

	/**
	 * Publishes a new manifest (or `null` when access is revoked/denied) and, optionally, an
	 * explicit status. When `status` is omitted the host derives it from `manifest` presence.
	 */
	update(manifest: IExtensionGalleryManifest | null, status?: ExtensionGalleryManifestStatus): void;
}

/**
 * The result of resolving the account currently signed in for a provider, WITHOUT prompting.
 * `'account'` carries the account id (plus a session token for providers that present one),
 * `'none'` means the provider responded but no account is present (durable), and `'error'`
 * means the lookup failed (transient — callers must not invalidate the cache).
 */
export type AccountResolution =
	| { kind: 'account'; accountId: string; token?: string }
	| { kind: 'none' }
	| { kind: 'error' };

/**
 * The provider-agnostic machinery an {@link IExtensionGalleryAccessProvider} needs from the
 * validator core: the status sink, the shared service-index fetch, and the access cache. Exposed
 * as a narrow interface so provider strategies depend on behaviour, not on the concrete validator,
 * keeping the module graph acyclic.
 */
export interface IExtensionGalleryAccessCore {
	/** The status sink shared by the host service. */
	readonly sink: IExtensionGalleryAccessSink;

	/**
	 * Fetches and validates the service index (gallery manifest) at `serviceUrl`, optionally
	 * presenting `accessToken` so a gated index is readable. Throws {@link MarketplaceAuthRequiredError}
	 * on 401/403 and a generic error on any other non-2xx/malformed response.
	 */
	fetchServiceIndex(serviceUrl: string, token: CancellationToken, accessToken?: string): Promise<IExtensionGalleryManifest>;

	/** Persists an access verdict. */
	cacheAccess(data: ICachedAccess): void;

	/** Clears any persisted access verdict. */
	clearCache(): void;
}

/**
 * A per-auth-provider access strategy. Each provider knows how to resolve the current account for
 * its identity system and how to validate that account's Private Marketplace access, driving the
 * shared status sink through the injected {@link IExtensionGalleryAccessCore}. The validator selects
 * exactly one provider based on the effective auth provider and re-validates when
 * {@link onDidChangeAccount} fires.
 */
export interface IExtensionGalleryAccessProvider extends IDisposable {
	/** The auth provider this strategy implements. */
	readonly id: ExtensionGalleryAccessProviderId;

	/**
	 * Fires when the signed-in account/session for this provider changes, so the validator can
	 * clear the cache, revoke the previously authorized manifest, and re-validate.
	 */
	readonly onDidChangeAccount: Event<void>;

	/**
	 * Resolves the account currently signed in for this provider, WITHOUT prompting. Used to gate
	 * a cached verdict against the identity it was written for.
	 */
	resolveCurrentAccount(): Promise<AccountResolution>;

	/**
	 * Validates the current account's access to the marketplace at `serviceUrl`, driving the
	 * status sink. MUST check `token.isCancellationRequested` immediately before every mutation of
	 * status/cache/manifest so a superseded validation cannot commit a stale verdict.
	 */
	validate(serviceUrl: string, token: CancellationToken): Promise<void>;
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
