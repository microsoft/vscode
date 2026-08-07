/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IHeaders } from '../../../../base/parts/request/common/request.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IExtensionGalleryManifest } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { resolveMarketplaceHeaders } from '../../../../platform/externalServices/common/marketplace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asJson, IRequestService } from '../../../../platform/request/common/request.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { MarketplaceAuthRequiredError } from './extensionGalleryAccess.js';

/**
 * Fetches and validates the Private Marketplace service index (gallery manifest) from a
 * configured `serviceUrl`, presenting a bearer token when one is supplied so an auth-gated index
 * is readable. Successful fetches are memoized in-process, keyed by `serviceUrl` alone, so the
 * validator's separate eligibility probe and its subsequent `Available`-rendering fetch do not
 * re-request the same index. The memoized content is token-independent (the index body is the
 * same whether or not a bearer was needed to read it), so a cache hit ignores `accessToken`.
 */
export class ExtensionGalleryServiceIndexService {

	// Successful service-index fetches, keyed by serviceUrl. Cleared on `invalidate()` (called at
	// the start of every validation generation, and on sign-out/config change) so a superseded
	// account/marketplace cannot serve a stale index.
	private readonly _memo = new Map<string, IExtensionGalleryManifest>();

	private readonly commonHeadersPromise: Promise<IHeaders>;

	constructor(
		@IProductService private readonly productService: IProductService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IRequestService private readonly requestService: IRequestService,
		@ILogService private readonly logService: ILogService,
	) {
		this.commonHeadersPromise = resolveMarketplaceHeaders(
			this.productService.version,
			this.productService,
			environmentService,
			this.configurationService,
			fileService,
			this.storageService,
			this.telemetryService);
	}

	/**
	 * Returns the validated service index for `serviceUrl`. On a memo hit the cached manifest is
	 * returned without a network request (and `accessToken` is ignored — the content does not vary
	 * by token). On a miss the index is fetched (presenting `accessToken` when supplied), validated,
	 * memoized on success, and returned. Throws {@link MarketplaceAuthRequiredError} on 401/403 and a
	 * generic error on any other non-2xx/malformed response.
	 */
	async getServiceIndex(serviceUrl: string, token: CancellationToken, accessToken?: string): Promise<IExtensionGalleryManifest> {
		const cached = this._memo.get(serviceUrl);
		if (cached) {
			return cached;
		}
		const manifest = await this.fetchServiceIndex(serviceUrl, token, accessToken);
		this._memo.set(serviceUrl, manifest);
		return manifest;
	}

	/**
	 * Drops all memoized service indexes. Called at the start of each validation generation (and on
	 * sign-out/config change) so a superseded account or a repointed marketplace never observes a
	 * stale index from a previous generation.
	 */
	invalidate(): void {
		this._memo.clear();
	}

	private async fetchServiceIndex(url: string, token: CancellationToken, accessToken?: string): Promise<IExtensionGalleryManifest> {
		const commonHeaders = await this.commonHeadersPromise;
		const headers: IHeaders = {
			...commonHeaders,
			'Content-Type': 'application/json',
			'Accept-Encoding': 'gzip',
		};
		// The service index MAY be protected (admin's discretion). Present a bearer token
		// when we have one; it is harmless on a public index and required on a gated one.
		if (accessToken) {
			headers['Authorization'] = `Bearer ${accessToken}`;
		}

		try {
			const context = await this.requestService.request({
				type: 'GET',
				url,
				headers,
				// When a bearer token is attached, never follow redirects — the request service
				// would forward the Authorization header to the redirect target (possibly a
				// different origin) and leak the token. Anonymous fetches may still redirect.
				followRedirects: accessToken ? 0 : undefined,
				callSite: 'extensionGalleryManifestService.fetchManifest'
			}, token);

			if (context.res.statusCode === 401 || context.res.statusCode === 403) {
				// The service index is auth-gated and this request was not authorized.
				// Surface a typed error so the Entra path can prompt for sign-in (or treat a
				// rejected token as denied) rather than mislabeling it as unreachable.
				throw new MarketplaceAuthRequiredError(context.res.statusCode);
			}

			if (context.res.statusCode && (context.res.statusCode < 200 || context.res.statusCode >= 300)) {
				// Any other non-2xx (404/5xx/…) is an error, not a manifest. Reject before
				// parsing so a JSON error body can never be mistaken for a valid service index.
				throw new Error(`Service index returned status ${context.res.statusCode}`);
			}

			const extensionGalleryManifest = await asJson<IExtensionGalleryManifest>(context);

			if (!extensionGalleryManifest) {
				throw new Error('Unable to retrieve extension gallery manifest.');
			}

			if (!Array.isArray(extensionGalleryManifest.resources)) {
				// A 200 whose body is valid JSON but not a service index (e.g. a server error
				// object, or an HTML/JSON captive-portal page) must not be treated as a
				// manifest — `resources` is required to discover gallery endpoints (including
				// the EligibilityService). Reject here so callers classify it as a failed
				// fetch, rather than letting resource-URI discovery throw on a non-iterable
				// `resources` outside this try/catch.
				throw new Error('Service index response is not a valid extension gallery manifest.');
			}

			if (!extensionGalleryManifest.resources.every(resource => resource && typeof resource.id === 'string' && typeof resource.type === 'string')) {
				// `resources` is an array but at least one entry is malformed (missing/non-string
				// `id` or `type`). `getExtensionGalleryManifestResourceUri` calls `resource.type.split()`
				// outside this fetch's try/catch during endpoint discovery, so an undefined `type`
				// would throw there and reject initialization instead of being classified as a failed
				// fetch. Reject here so the caller surfaces `Unreachable`.
				throw new Error('Service index response contains malformed extension gallery resources.');
			}

			return extensionGalleryManifest;
		} catch (error) {
			if (error instanceof MarketplaceAuthRequiredError) {
				// Not a failure: an auth-gated service index rejected an unauthenticated (or
				// stale-token) request. Callers translate this into a RequiresSignIn/AccessDenied
				// state and the workbench surfaces the corresponding sign-in affordance, so logging
				// it at `error` would misrepresent the normal "not signed in yet" flow as a fault.
				this.logService.trace('[Marketplace] Extension gallery manifest requires authentication', error.statusCode);
			} else {
				this.logService.error('[Marketplace] Error retrieving extension gallery manifest', error);
			}
			throw error;
		}
	}
}
