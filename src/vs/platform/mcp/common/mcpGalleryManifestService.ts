/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IRequestService, isSuccess } from '../../request/common/request.js';
import { McpGalleryResourceType, IMcpGalleryManifest, IMcpGalleryManifestService, McpGalleryManifestStatus } from './mcpGalleryManifest.js';

const SUPPORTED_VERSIONS = [
	'v0.1',
	'v0',
];

export class McpGalleryManifestService extends Disposable implements IMcpGalleryManifestService {

	readonly _serviceBrand: undefined;
	readonly onDidChangeMcpGalleryManifest = Event.None;
	readonly onDidChangeMcpGalleryManifestStatus = Event.None;

	private readonly versionByUrl = new Map<string, Promise<string>>();

	get mcpGalleryManifestStatus(): McpGalleryManifestStatus {
		return !!this.productService.mcpGallery?.serviceUrl ? McpGalleryManifestStatus.Available : McpGalleryManifestStatus.Unavailable;
	}

	constructor(
		@IProductService private readonly productService: IProductService,
		@IRequestService private readonly requestService: IRequestService,
		@ILogService protected readonly logService: ILogService,
	) {
		super();
	}

	async getMcpGalleryManifest(): Promise<IMcpGalleryManifest | null> {
		if (!this.productService.mcpGallery) {
			return null;
		}
		return this.createMcpGalleryManifest(this.productService.mcpGallery.serviceUrl, SUPPORTED_VERSIONS[0]);
	}

	protected async createMcpGalleryManifest(url: string, version?: string): Promise<IMcpGalleryManifest> {
		url = url.endsWith('/') ? url.slice(0, -1) : url;

		if (!version) {
			let versionPromise = this.versionByUrl.get(url);
			if (!versionPromise) {
				this.versionByUrl.set(url, versionPromise = this.getVersion(url));
			}
			version = await versionPromise;
		}

		const isProductGalleryUrl = this.productService.mcpGallery?.serviceUrl === url;
		const serversUrl = `${url}/${version}/servers`;
		const resources = [
			{
				id: serversUrl,
				type: McpGalleryResourceType.McpServersQueryService
			},
			{
				id: `${serversUrl}/{name}/versions/{version}`,
				type: McpGalleryResourceType.McpServerVersionUri
			},
			{
				id: `${serversUrl}/{name}/versions/latest`,
				type: McpGalleryResourceType.McpServerLatestVersionUri
			}
		];

		if (isProductGalleryUrl) {
			resources.push({
				id: `${serversUrl}/by-name/{name}`,
				type: McpGalleryResourceType.McpServerNamedResourceUri
			});
			resources.push({
				id: this.productService.mcpGallery.itemWebUrl,
				type: McpGalleryResourceType.McpServerWebUri
			});
			resources.push({
				id: this.productService.mcpGallery.publisherUrl,
				type: McpGalleryResourceType.PublisherUriTemplate
			});
			resources.push({
				id: this.productService.mcpGallery.supportUrl,
				type: McpGalleryResourceType.ContactSupportUri
			});
			resources.push({
				id: this.productService.mcpGallery.supportUrl,
				type: McpGalleryResourceType.ContactSupportUri
			});
			resources.push({
				id: this.productService.mcpGallery.privacyPolicyUrl,
				type: McpGalleryResourceType.PrivacyPolicyUri
			});
			resources.push({
				id: this.productService.mcpGallery.termsOfServiceUrl,
				type: McpGalleryResourceType.TermsOfServiceUri
			});
			resources.push({
				id: this.productService.mcpGallery.reportUrl,
				type: McpGalleryResourceType.ReportUri
			});
		}

		if (version === 'v0') {
			resources.push({
				id: `${serversUrl}/{id}`,
				type: McpGalleryResourceType.McpServerIdUri
			});
		}

		return {
			version,
			url,
			resources
		};
	}

	private async getVersion(url: string): Promise<string> {
		for (const version of SUPPORTED_VERSIONS) {
			if (await this.checkVersion(url, version)) {
				return version;
			}
		}
		return SUPPORTED_VERSIONS[0];
	}

	private async checkVersion(url: string, version: string): Promise<boolean> {
		try {
			const context = await this.requestService.request({
				type: 'GET',
				url: `${url}/${version}/servers?limit=1`,
			}, CancellationToken.None);
			if (isSuccess(context)) {
				return true;
			}
			this.logService.info(`The service at ${url} does not support version ${version}. Service returned status ${context.res.statusCode}.`);
		} catch (error) {
			this.logService.error(error);
		}
		return false;
	}
}
