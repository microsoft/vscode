/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { AUTH_SCOPE_SEPARATOR, fetchAuthorizationServerMetadata, fetchResourceMetadata, GRANT_TYPE_TOKEN_EXCHANGE, IAuthorizationTokenResponse, isAuthorizationTokenResponse, parseWWWAuthenticateHeader, TOKEN_TYPE_ACCESS_TOKEN } from '../../../base/common/oauth.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { RawContextKey } from '../../contextkey/common/contextkey.js';
import { asJson, asText, IRequestService } from '../../request/common/request.js';

/**
 * Context key exposing the effective Marketplace authentication provider (e.g. `github` or
 * `microsoft`) for `when`-clause driven welcome content. Defined here in the platform layer so
 * both the workbench service that sets it and the Extensions contribution that reads it can
 * depend on it without a service-to-contribution dependency.
 */
export const CONTEXT_MARKETPLACE_AUTH_PROVIDER = new RawContextKey<string>('marketplaceAuthProvider', '');

export const enum ExtensionGalleryResourceType {
	ExtensionQueryService = 'ExtensionQueryService',
	ExtensionLatestVersionUri = 'ExtensionLatestVersionUriTemplate',
	ExtensionStatisticsUri = 'ExtensionStatisticsUriTemplate',
	PublisherViewUri = 'PublisherViewUriTemplate',
	ExtensionDetailsViewUri = 'ExtensionDetailsViewUriTemplate',
	ExtensionRatingViewUri = 'ExtensionRatingViewUriTemplate',
	ExtensionResourceUri = 'ExtensionResourceUriTemplate',
	ContactSupportUri = 'ContactSupportUri',
	EligibilityService = 'EligibilityService',
}

export const enum Flag {
	None = 'None',
	IncludeVersions = 'IncludeVersions',
	IncludeFiles = 'IncludeFiles',
	IncludeCategoryAndTags = 'IncludeCategoryAndTags',
	IncludeSharedAccounts = 'IncludeSharedAccounts',
	IncludeVersionProperties = 'IncludeVersionProperties',
	ExcludeNonValidated = 'ExcludeNonValidated',
	IncludeInstallationTargets = 'IncludeInstallationTargets',
	IncludeAssetUri = 'IncludeAssetUri',
	IncludeStatistics = 'IncludeStatistics',
	IncludeLatestVersionOnly = 'IncludeLatestVersionOnly',
	Unpublished = 'Unpublished',
	IncludeNameConflictInfo = 'IncludeNameConflictInfo',
	IncludeLatestPrereleaseAndStableVersionOnly = 'IncludeLatestPrereleaseAndStableVersionOnly',
}

export type ExtensionGalleryManifestResource = {
	readonly id: string;
	readonly type: string;
};

export type ExtensionQueryCapabilityValue = {
	readonly name: string;
	readonly value: number;
};

export interface IExtensionGalleryManifest {
	readonly version: string;
	readonly resources: readonly ExtensionGalleryManifestResource[];
	readonly capabilities: {
		readonly extensionQuery: {
			readonly filtering?: readonly ExtensionQueryCapabilityValue[];
			readonly sorting?: readonly ExtensionQueryCapabilityValue[];
			readonly flags?: readonly ExtensionQueryCapabilityValue[];
		};
		readonly signing?: {
			readonly allPublicRepositorySigned: boolean;
			readonly allPrivateRepositorySigned?: boolean;
		};
		readonly extensions?: {
			readonly includePublicExtensions?: boolean;
			readonly includePrivateExtensions?: boolean;
		};
	};
}

export const enum ExtensionGalleryManifestStatus {
	Available = 'available',
	RequiresSignIn = 'requiresSignIn',
	AccessDenied = 'accessDenied',
	Unavailable = 'unavailable',
	/**
	 * A marketplace is configured, and the user is (or is presumed) eligible, but its
	 * gallery manifest could not be fetched — a transient network/server error. Unlike
	 * {@link Unavailable} (which also means "no gallery configured"), this state is only
	 * ever set after a failed fetch of a configured marketplace, so it is safe to surface
	 * an informative message without affecting builds that have no gallery at all.
	 */
	Unreachable = 'unreachable',
	/**
	 * The marketplace is configured for Microsoft (Entra ID) authentication, but the
	 * gallery manifest does not advertise an EligibilityService resource. Access is
	 * refused (no silent fallback to another provider) until the server is corrected.
	 */
	Misconfigured = 'misconfigured'
}

export const IExtensionGalleryManifestService = createDecorator<IExtensionGalleryManifestService>('IExtensionGalleryManifestService');

export interface IExtensionGalleryManifestService {
	readonly _serviceBrand: undefined;

	readonly extensionGalleryManifestStatus: ExtensionGalleryManifestStatus;
	readonly onDidChangeExtensionGalleryManifestStatus: Event<ExtensionGalleryManifestStatus>;
	readonly onDidChangeExtensionGalleryManifest: Event<IExtensionGalleryManifest | null>;
	getExtensionGalleryManifest(): Promise<IExtensionGalleryManifest | null>;

	/**
	 * Returns the bearer token to attach to authenticated marketplace API requests
	 * (e.g. `extensionquery`, asset download), or `undefined` when the marketplace does
	 * not require authentication. When the marketplace service index is `[Authorize]`-gated,
	 * this is a resource-scoped token negotiated via RFC 9728 Protected Resource Metadata.
	 * Consumers MUST only attach the token to requests whose target is same-origin HTTPS with
	 * the marketplace service index to avoid leaking it to foreign or cleartext endpoints.
	 */
	getAccessToken(): Promise<string | undefined>;
}

export function getExtensionGalleryManifestResourceUri(manifest: IExtensionGalleryManifest, type: string): string | undefined {
	const [name, version] = type.split('/');
	for (const resource of manifest.resources) {
		const [r, v] = resource.type.split('/');
		if (r !== name) {
			continue;
		}
		if (!version || v === version) {
			return resource.id;
		}
		break;
	}
	return undefined;
}

export const ExtensionGalleryServiceUrlConfigKey = 'extensions.gallery.serviceUrl';

export const ExtensionGalleryAuthProviderConfigKey = 'extensions.gallery.authProvider';

/**
 * Scopes requested when signing in with Microsoft (Entra ID) to establish the
 * user's identity for the Private Marketplace eligibility check.
 *
 * Only standard OpenID Connect sign-in scopes are requested — enough to obtain a
 * Microsoft session that identifies the user. This intentionally does NOT request a
 * resource-scoped token (e.g. `api://<client-id>/access_as_user`) up front. When the
 * marketplace service index is `[Authorize]`-gated, a resource-bound token is instead
 * negotiated on demand from the server's `WWW-Authenticate` challenge (Protected
 * Resource Metadata, RFC 9728); these scopes serve as the fallback sign-in scopes for
 * that negotiation.
 */
export const PRIVATE_MARKETPLACE_SCOPES: string[] = ['openid', 'profile', 'email', 'offline_access'];

/**
 * The subset of RFC 9728 Protected Resource Metadata the marketplace negotiation needs: the
 * authorization server to acquire a token from and the resource-scoped scopes to request.
 */
export interface IMarketplaceProtectedResource {
	/** The authorization server (`authorization_servers[0]`) to acquire the resource token from. */
	readonly authorizationServer: string;
	/** The resource-scoped scopes (`scopes_supported`) to request for the marketplace resource. */
	readonly scopes: readonly string[];
	/** The protected resource identifier (`resource`) the metadata describes. */
	readonly resource: string;
}

/**
 * Discovers the marketplace's Protected Resource Metadata (RFC 9728) so a resource-scoped token
 * can be minted for an `[Authorize]`-gated marketplace index.
 *
 * Discovery is driven by the well-known endpoint (`/.well-known/oauth-protected-resource`) rather
 * than the server's `WWW-Authenticate` challenge: `WWW-Authenticate` is not a CORS-safelisted
 * response header, so the renderer's cross-origin index fetch frequently cannot read it. The
 * metadata *body*, however, is CORS-readable, so well-known discovery is robust where the challenge
 * header is not. The optional `wwwAuthenticate` string is used only as a best-effort hint for the
 * explicit `resource_metadata` URL when the header happens to be readable.
 *
 * Returns `undefined` (never throws) when discovery fails or the metadata omits an authorization
 * server, so callers can fall back to their existing sign-in / unreachable handling.
 */
export async function discoverMarketplaceProtectedResource(
	requestService: IRequestService,
	serviceIndexUrl: string,
	wwwAuthenticate: string | undefined,
	token: CancellationToken,
): Promise<IMarketplaceProtectedResource | undefined> {
	let resourceMetadataUrl: string | undefined;
	if (wwwAuthenticate) {
		for (const challenge of parseWWWAuthenticateHeader(wwwAuthenticate)) {
			if (challenge.scheme.toLowerCase() === 'bearer' && challenge.params.resource_metadata) {
				resourceMetadataUrl = challenge.params.resource_metadata;
				break;
			}
		}
	}
	const fetcher = async (input: string, init: { method: string; headers: Record<string, string> }) => {
		const context = await requestService.request({ type: init.method, url: input, headers: init.headers, callSite: 'extensionGalleryManifest.discoverMarketplaceProtectedResource' }, token);
		return {
			status: context.res.statusCode ?? 0,
			statusText: '',
			json: async (): Promise<unknown> => await asJson(context),
			text: async (): Promise<string> => (await asText(context)) ?? '',
		};
	};
	try {
		const { metadata } = await fetchResourceMetadata(serviceIndexUrl, resourceMetadataUrl, { fetch: fetcher });
		const authorizationServer = metadata.authorization_servers?.[0];
		if (!authorizationServer) {
			return undefined;
		}
		return {
			authorizationServer,
			scopes: metadata.scopes_supported ?? [],
			resource: metadata.resource,
		};
	} catch {
		return undefined;
	}
}

/**
 * Exchanges an authentication provider's access token (e.g. a GitHub session token the client
 * already holds) for a first-party, audience-bound marketplace access token, using the RFC 8693
 * token-exchange grant at the marketplace's advertised authorization server.
 *
 * This is the GitHub auth-enabled scheme's token acquisition. Unlike the Entra scheme — where the
 * Microsoft/MSAL provider mints a resource-scoped token directly via `getSessions(...,
 * { authorizationServer })` — VS Code's GitHub provider has no resource-token support, so the
 * marketplace's embedded Authorization Server performs a token exchange: it converts the caller's
 * GitHub token into an `at+jwt` bound to the marketplace resource (`aud = resource`).
 *
 * The raw `subjectToken` is transmitted ONLY to the advertised authorization server's token
 * endpoint — never to the resource server. Both the authorization server and its discovered token
 * endpoint are validated with `isSafeTarget` (fail-closed) before the token is sent, so a
 * compromised or misconfigured PRM cannot exfiltrate the GitHub token to a foreign/cleartext
 * origin. On success returns the minted `accessToken` together with its advertised lifetime
 * (`expiresInSeconds`, from the token response's `expires_in`) so the caller can schedule a
 * proactive re-mint before it expires. Returns `undefined` (never throws) when discovery or the
 * exchange fails, so callers fall back to their existing sign-in handling.
 *
 * `isCurrent` lets the caller abort just before the subject token is POSTed if its validation has
 * been superseded (e.g. a sign-out / account switch while the authorization-server metadata GET was
 * in flight). The desktop caller drives currentness this way because it passes
 * `CancellationToken.None` — so this predicate, not `token`, is what actually guards that path.
 */
export async function exchangeMarketplaceResourceToken(
	requestService: IRequestService,
	protectedResource: IMarketplaceProtectedResource,
	subjectToken: string,
	isSafeTarget: (targetUrl: string) => boolean,
	token: CancellationToken,
	isCurrent: () => boolean = () => true,
): Promise<{ accessToken: string; expiresInSeconds?: number } | undefined> {
	if (!isSafeTarget(protectedResource.authorizationServer)) {
		return undefined;
	}
	const fetcher = async (input: string, init: { method: string; headers: Record<string, string> }) => {
		const context = await requestService.request({ type: init.method, url: input, headers: init.headers, callSite: 'extensionGalleryManifest.exchangeMarketplaceResourceToken' }, token);
		return {
			status: context.res.statusCode ?? 0,
			statusText: '',
			json: async (): Promise<unknown> => await asJson(context),
			text: async (): Promise<string> => (await asText(context)) ?? '',
		};
	};
	try {
		const { metadata } = await fetchAuthorizationServerMetadata(protectedResource.authorizationServer, { fetch: fetcher, validateIssuer: true });
		const tokenEndpoint = metadata.token_endpoint;
		if (!tokenEndpoint || !isSafeTarget(tokenEndpoint)) {
			return undefined;
		}
		// A sign-out / account switch can occur while the AS-metadata GET above is in flight. If the
		// caller cancelled — or its validation has been superseded (`isCurrent()` is false) — do not
		// POST the (now potentially revoked) subject token.
		if (token.isCancellationRequested || !isCurrent()) {
			return undefined;
		}
		const body = new URLSearchParams();
		body.append('grant_type', GRANT_TYPE_TOKEN_EXCHANGE);
		body.append('subject_token', subjectToken);
		body.append('subject_token_type', TOKEN_TYPE_ACCESS_TOKEN);
		body.append('resource', protectedResource.resource);
		if (protectedResource.scopes.length) {
			body.append('scope', protectedResource.scopes.join(AUTH_SCOPE_SEPARATOR));
		}
		const context = await requestService.request({
			type: 'POST',
			url: tokenEndpoint,
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			data: body.toString(),
			callSite: 'extensionGalleryManifest.exchangeMarketplaceResourceToken',
			// A bearer/subject token is in the body; never follow redirects so the request service
			// can't forward it to a (possibly cross-origin) redirect target and leak it.
			followRedirects: 0,
		}, token);
		if (context.res.statusCode !== 200) {
			return undefined;
		}
		const response = await asJson<IAuthorizationTokenResponse>(context);
		if (response && isAuthorizationTokenResponse(response) && response.access_token) {
			return { accessToken: response.access_token, expiresInSeconds: response.expires_in };
		}
		return undefined;
	} catch {
		return undefined;
	}
}
