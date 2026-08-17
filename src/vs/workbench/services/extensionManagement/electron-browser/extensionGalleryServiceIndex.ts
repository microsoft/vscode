/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IHeaders, IRequestContext } from '../../../../base/parts/request/common/request.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IExtensionGalleryManifest } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { resolveMarketplaceHeaders } from '../../../../platform/externalServices/common/marketplace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asJson, asText, IRequestService } from '../../../../platform/request/common/request.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { MarketplaceAuthRequiredError, MarketplaceClientRejectedError } from './extensionGalleryAccess.js';

/**
 * Fetches and validates the service index for a configured `serviceUrl`, presenting a bearer token
 * when supplied. Memoized per `serviceUrl`; the body does not vary by token, so a hit ignores it.
 */
export class ExtensionGalleryServiceIndexFetcher {

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
	 * The validated service index for `serviceUrl`, from the memo when present. Throws
	 * {@link MarketplaceAuthRequiredError} on 401/403, {@link MarketplaceClientRejectedError} on other
	 * 4xx, and a generic error otherwise.
	 */
	async getServiceIndex(serviceUrl: string, token: CancellationToken, accessToken?: string): Promise<IExtensionGalleryManifest> {
		const cached = this._memo.get(serviceUrl);
		if (cached) {
			return cached;
		}
		const manifest = await this.fetchServiceIndex(serviceUrl, token, accessToken);
		if (!token.isCancellationRequested) {
			// Do not repopulate the memo for a superseded generation: `invalidate()` may have already
			// run for a newer validation, and a late set would resurrect an entry the new generation
			// intended to drop. The live caller checks the token immediately after this returns.
			this._memo.set(serviceUrl, manifest);
		}
		return manifest;
	}

	/** Drops all memoized indexes, so a new resolution never observes a stale one. */
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
				// Reject before parsing so a JSON error body is never mistaken for a service index. The
				// body is included because a marketplace rejecting the client explains why there.
				const detail = await this.readErrorDetail(context);
				const message = `Service index returned status ${context.res.statusCode}${detail ? `: ${detail}` : ''}`;
				if (context.res.statusCode >= 400 && context.res.statusCode < 500) {
					// A 4xx is the server refusing this client outright — durable, so retrying cannot
					// help. Surface it as a denial rather than a transient failure.
					throw new MarketplaceClientRejectedError(context.res.statusCode, message);
				}
				throw new Error(message);
			}

			const extensionGalleryManifest = await asJson<IExtensionGalleryManifest>(context);

			if (!extensionGalleryManifest) {
				throw new Error('Unable to retrieve extension gallery manifest.');
			}

			if (!Array.isArray(extensionGalleryManifest.resources)) {
				// Valid JSON but not a service index (e.g. a captive-portal page). Reject here so it is
				// classified as a failed fetch rather than throwing later during endpoint discovery.
				throw new Error('Service index response is not a valid extension gallery manifest.');
			}

			if (!extensionGalleryManifest.resources.every(resource => resource && typeof resource.id === 'string' && typeof resource.type === 'string')) {
				// A malformed entry would throw later in endpoint discovery, outside this try/catch.
				throw new Error('Service index response contains malformed extension gallery resources.');
			}

			return extensionGalleryManifest;
		} catch (error) {
			if (error instanceof MarketplaceAuthRequiredError) {
				// Not a fault: the normal "not signed in yet" flow, which callers turn into a sign-in
				// affordance. Logging it at `error` would misrepresent it.
				this.logService.trace('[Marketplace] Extension gallery manifest requires authentication', error.statusCode);
			} else {
				this.logService.error('[Marketplace] Error retrieving extension gallery manifest', error);
			}
			throw error;
		}
	}

	/** Best-effort, truncated read of an error body for diagnostics. Never throws. */
	private async readErrorDetail(context: IRequestContext): Promise<string | undefined> {
		try {
			const text = await asText(context);
			const trimmed = text?.trim();
			if (!trimmed) {
				return undefined;
			}
			return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
		} catch {
			return undefined;
		}
	}
}
