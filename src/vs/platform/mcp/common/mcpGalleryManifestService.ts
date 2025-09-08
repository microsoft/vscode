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
		@IProductService protected readonly productService: IProductService,
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
		const isVSCodeGalleryUrl = this.productService.extensionsGallery?.mcpUrl === url;
		const version = isVSCodeGalleryUrl ? undefined : 'v0';
		const serversUrl = isVSCodeGalleryUrl ? url : `${url}/${version}/servers`;
		const resources = [
			{
				id: serversUrl,
				type: McpGalleryResourceType.McpQueryService
			}
		];
		if (!isVSCodeGalleryUrl) {
			resources.push({
				id: `${serversUrl}/{id}`,
				type: McpGalleryResourceType.McpServerManifestUri
			});
		}
		return {
			version,
			url,
			resources
		};
	}
}
