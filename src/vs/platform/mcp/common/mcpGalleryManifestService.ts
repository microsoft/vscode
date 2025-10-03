/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IProductService } from '../../product/common/productService.js';
import { McpGalleryResourceType, IMcpGalleryManifest, IMcpGalleryManifestService, McpGalleryManifestStatus } from './mcpGalleryManifest.js';

export class McpGalleryManifestService extends Disposable implements IMcpGalleryManifestService {

	readonly _serviceBrand: undefined;
	readonly onDidChangeMcpGalleryManifest = Event.None;
	readonly onDidChangeMcpGalleryManifestStatus = Event.None;

	get mcpGalleryManifestStatus(): McpGalleryManifestStatus {
		return !!this.productService.mcpGallery?.serviceUrl ? McpGalleryManifestStatus.Available : McpGalleryManifestStatus.Unavailable;
	}

	constructor(
		@IProductService private readonly productService: IProductService,
	) {
		super();
	}

	async getMcpGalleryManifest(): Promise<IMcpGalleryManifest | null> {
		if (!this.productService.mcpGallery) {
			return null;
		}
		return this.createMcpGalleryManifest(this.productService.mcpGallery.serviceUrl);
	}

	protected createMcpGalleryManifest(url: string): IMcpGalleryManifest {
		url = url.endsWith('/') ? url.slice(0, -1) : url;
		const isProductGalleryUrl = this.productService.mcpGallery?.serviceUrl === url;
		const version = 'v0';
		const serversUrl = `${url}/${version}/servers`;
		const resources = [
			{
				id: serversUrl,
				type: McpGalleryResourceType.McpServersQueryService
			},
			{
				id: `${serversUrl}/{id}`,
				type: McpGalleryResourceType.McpServerResourceUri
			}
		];

		if (isProductGalleryUrl) {
			resources.push({
				id: `${serversUrl}/search`,
				type: McpGalleryResourceType.McpServersSearchService
			});
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

		return {
			version,
			url,
			resources
		};
	}
}
