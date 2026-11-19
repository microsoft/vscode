/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { raceCancellationError } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { IHeaders, IRequestContext, IRequestOptions } from '../../../base/parts/request/common/request.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { parseWWWAuthenticateHeader } from '../../../base/common/oauth.js';
import { IProductService } from '../../product/common/productService.js';
import { IRequestService } from '../../request/common/request.js';
import { localize } from '../../../nls.js';
import { ExtensionGalleryResourceType, Flag, IExtensionGalleryManifest, IExtensionGalleryManifestService, ExtensionGalleryManifestStatus } from './extensionGalleryManifest.js';
import { FilterType, SortBy } from './extensionManagement.js';

type ExtensionGalleryConfig = {
	readonly serviceUrl: string;
	readonly itemUrl: string;
	readonly publisherUrl: string;
	readonly resourceUrlTemplate: string;
	readonly extensionUrlTemplate: string;
	readonly controlUrl: string;
	readonly nlsBaseUrl: string;
};

export class ExtensionGalleryAuthenticationError extends Error {
	constructor() {
		super(localize('marketplace.authenticationRejected', "The Extensions Marketplace rejected its authentication token. Sign in again or contact your administrator."));
	}
}

/** Preserve repeated header fields without depending on transport-specific header casing. */
export function getExtensionGalleryAuthenticationHeader(headers: IHeaders): string | undefined {
	const values = Object.entries(headers).filter(([name]) => name.toLowerCase() === 'www-authenticate').flatMap(([, value]) => value ?? []);
	return values.length ? values.join(', ') : undefined;
}

/** Interpret a single Bearer challenge; malformed, non-Bearer and multiple challenges retain legacy behavior. */
export function getExtensionGalleryAuthenticationError(wwwAuthenticate: string | undefined): string | undefined {
	if (!wwwAuthenticate || wwwAuthenticate.length > 16_384 || /[\r\n]/.test(wwwAuthenticate)) {
		return undefined;
	}
	const header = wwwAuthenticate.trim();
	const scheme = /^Bearer[ \t]+/i.exec(header);
	if (!scheme) {
		return undefined;
	}
	let remaining = header.slice(scheme[0].length);
	const names = new Set<string>();
	const parameters: string[] = [];
	const parameter = /^(?<name>[!#$%&'*+.^_`|~\w-]+)[ \t]*=[ \t]*(?<value>"(?:[^"\\\r\n]|\\[^\r\n])*"|[!#$%&'*+.^_`|~\w-]+)[ \t]*(?<separator>,[ \t]*)?/;
	while (remaining) {
		const match = parameter.exec(remaining);
		const name = match?.groups?.name.toLowerCase();
		const value = match?.groups?.value;
		if (!match || !name || value === undefined || names.has(name)) {
			return undefined;
		}
		names.add(name);
		parameters.push(`${name}=${value}`);
		remaining = remaining.slice(match[0].length);
		if (!!remaining !== !!match.groups?.separator) {
			return undefined;
		}
	}
	const challenge = parseWWWAuthenticateHeader(`Bearer ${parameters.join(', ')}`)[0];
	return challenge?.params.error;
}

/** Renew only a proven same-origin bearer rejection and replay at most one explicitly safe request. */
export async function requestWithExtensionGalleryAuthorization(requestService: IRequestService, manifestService: IExtensionGalleryManifestService, options: IRequestOptions & { url: string }, token: CancellationToken, canReplay: boolean): Promise<IRequestContext> {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	const url = options.url;
	const accessToken = await raceCancellationError(manifestService.getAccessToken(url), token);
	const getHeaders = (bearer: string | undefined): IHeaders | undefined => {
		if (!bearer) {
			return options.headers;
		}
		const headers = { ...options.headers };
		for (const name of Object.keys(headers)) {
			if (name.toLowerCase() === 'authorization') {
				delete headers[name];
			}
		}
		headers.Authorization = `Bearer ${bearer}`;
		return headers;
	};
	const context = await requestService.request({ ...options, headers: getHeaders(accessToken) }, token);
	if (context.res.statusCode !== 401 || !accessToken || context.requestHasAuthorization !== true || !context.url || new URL(context.url).origin !== new URL(url).origin) {
		return context;
	}
	let refreshed: boolean;
	try {
		refreshed = await raceCancellationError(manifestService.refreshAccessToken(context.url, accessToken, getExtensionGalleryAuthenticationHeader(context.res.headers)), token);
	} catch (error) {
		context.stream.destroy();
		throw error;
	}
	if (canReplay && refreshed) {
		const nextToken = await raceCancellationError(manifestService.getAccessToken(url), token);
		if (nextToken && nextToken !== accessToken) {
			context.stream.destroy();
			const retried = await requestService.request({ ...options, headers: getHeaders(nextToken) }, token);
			if (retried.res.statusCode !== 401) {
				return retried;
			}
			retried.stream.destroy();
			if (retried.requestHasAuthorization === true && retried.url && new URL(retried.url).origin === new URL(url).origin) {
				await raceCancellationError(manifestService.refreshAccessToken(retried.url, nextToken, getExtensionGalleryAuthenticationHeader(retried.res.headers), false), token);
			}
		}
	}
	context.stream.destroy();
	throw new ExtensionGalleryAuthenticationError();
}

export class ExtensionGalleryManifestService extends Disposable implements IExtensionGalleryManifestService {

	readonly _serviceBrand: undefined;
	readonly onDidChangeExtensionGalleryManifest = Event.None;
	readonly onDidChangeExtensionGalleryManifestStatus = Event.None;
	protected extensionGalleryAccessToken: string | undefined;
	protected extensionGalleryServiceIndexUrl: string | undefined;

	get extensionGalleryManifestStatus(): ExtensionGalleryManifestStatus {
		return !!this.productService.extensionsGallery?.serviceUrl ? ExtensionGalleryManifestStatus.Available : ExtensionGalleryManifestStatus.Unavailable;
	}

	constructor(
		@IProductService protected readonly productService: IProductService,
	) {
		super();
	}

	async getExtensionGalleryManifest(): Promise<IExtensionGalleryManifest | null> {
		const extensionsGallery = this.productService.extensionsGallery as ExtensionGalleryConfig | undefined;
		if (!extensionsGallery?.serviceUrl) {
			return null;
		}

		const resources = [
			{
				id: `${extensionsGallery.serviceUrl}/extensionquery`,
				type: ExtensionGalleryResourceType.ExtensionQueryService
			},
			{
				id: `${extensionsGallery.serviceUrl}/vscode/{publisher}/{name}/latest`,
				type: ExtensionGalleryResourceType.ExtensionLatestVersionUri
			},
			{
				id: `${extensionsGallery.serviceUrl}/publishers/{publisher}/extensions/{name}/{version}/stats?statType={statTypeName}`,
				type: ExtensionGalleryResourceType.ExtensionStatisticsUri
			},
		];

		if (extensionsGallery.publisherUrl) {
			resources.push({
				id: `${extensionsGallery.publisherUrl}/{publisher}`,
				type: ExtensionGalleryResourceType.PublisherViewUri
			});
		}

		if (extensionsGallery.itemUrl) {
			resources.push({
				id: `${extensionsGallery.itemUrl}?itemName={publisher}.{name}`,
				type: ExtensionGalleryResourceType.ExtensionDetailsViewUri
			});
			resources.push({
				id: `${extensionsGallery.itemUrl}?itemName={publisher}.{name}&ssr=false#review-details`,
				type: ExtensionGalleryResourceType.ExtensionRatingViewUri
			});
		}

		if (extensionsGallery.resourceUrlTemplate) {
			resources.push({
				id: extensionsGallery.resourceUrlTemplate,
				type: ExtensionGalleryResourceType.ExtensionResourceUri
			});
		}

		const filtering = [
			{
				name: FilterType.Tag,
				value: 1,
			},
			{
				name: FilterType.ExtensionId,
				value: 4,
			},
			{
				name: FilterType.Category,
				value: 5,
			},
			{
				name: FilterType.ExtensionName,
				value: 7,
			},
			{
				name: FilterType.Target,
				value: 8,
			},
			{
				name: FilterType.Featured,
				value: 9,
			},
			{
				name: FilterType.SearchText,
				value: 10,
			},
			{
				name: FilterType.ExcludeWithFlags,
				value: 12,
			},
		];

		const sorting = [
			{
				name: SortBy.NoneOrRelevance,
				value: 0,
			},
			{
				name: SortBy.LastUpdatedDate,
				value: 1,
			},
			{
				name: SortBy.Title,
				value: 2,
			},
			{
				name: SortBy.PublisherName,
				value: 3,
			},
			{
				name: SortBy.InstallCount,
				value: 4,
			},
			{
				name: SortBy.AverageRating,
				value: 6,
			},
			{
				name: SortBy.PublishedDate,
				value: 10,
			},
			{
				name: SortBy.WeightedRating,
				value: 12,
			},
		];

		const flags = [
			{
				name: Flag.None,
				value: 0x0,
			},
			{
				name: Flag.IncludeVersions,
				value: 0x1,
			},
			{
				name: Flag.IncludeFiles,
				value: 0x2,
			},
			{
				name: Flag.IncludeCategoryAndTags,
				value: 0x4,
			},
			{
				name: Flag.IncludeSharedAccounts,
				value: 0x8,
			},
			{
				name: Flag.IncludeVersionProperties,
				value: 0x10,
			},
			{
				name: Flag.ExcludeNonValidated,
				value: 0x20,
			},
			{
				name: Flag.IncludeInstallationTargets,
				value: 0x40,
			},
			{
				name: Flag.IncludeAssetUri,
				value: 0x80,
			},
			{
				name: Flag.IncludeStatistics,
				value: 0x100,
			},
			{
				name: Flag.IncludeLatestVersionOnly,
				value: 0x200,
			},
			{
				name: Flag.Unpublished,
				value: 0x1000,
			},
			{
				name: Flag.IncludeNameConflictInfo,
				value: 0x8000,
			},
			{
				name: Flag.IncludeLatestPrereleaseAndStableVersionOnly,
				value: 0x10000,
			},
		];

		return {
			version: '',
			resources,
			capabilities: {
				extensionQuery: {
					filtering,
					sorting,
					flags,
				},
				signing: {
					allPublicRepositorySigned: true,
				}
			}
		};
	}

	async getAccessToken(targetUrl: string): Promise<string | undefined> {
		const accessToken = this.extensionGalleryAccessToken;
		const serviceIndexUrl = this.extensionGalleryServiceIndexUrl;
		if (!accessToken || !serviceIndexUrl) {
			return undefined;
		}
		try {
			const target = URI.parse(targetUrl);
			const serviceIndex = URI.parse(serviceIndexUrl);
			return target.scheme === 'https'
				&& serviceIndex.scheme === 'https'
				&& target.authority.toLowerCase() === serviceIndex.authority.toLowerCase()
				? accessToken
				: undefined;
		} catch {
			return undefined;
		}
	}

	protected setAuthorization(accessToken: string | undefined, serviceIndexUrl: string | undefined): void {
		this.extensionGalleryAccessToken = accessToken;
		this.extensionGalleryServiceIndexUrl = serviceIndexUrl;
	}

	async refreshAccessToken(_targetUrl: string, _rejectedAccessToken: string, _wwwAuthenticate?: string, _canRefresh?: boolean): Promise<boolean> {
		return false;
	}
}
