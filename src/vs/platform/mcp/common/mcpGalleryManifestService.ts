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
		return !!this.productService.extensionsGallery?.mcpUrl ? McpGalleryManifestStatus.Available : McpGalleryManifestStatus.Unavailable;
	}

	constructor(
		@IProductService protected readonly productService: IProductService,
	) {
		super();
	}

	async getMcpGalleryManifest(): Promise<IMcpGalleryManifest | null> {
		return null;
	}

	protected createMcpGalleryManifest(mcpUrl: string): IMcpGalleryManifest {
		const resources = [
			{
				id: mcpUrl,
				type: McpGalleryResourceType.McpQueryService
			},
			{
				id: `${mcpUrl}/{id}`,
				type: McpGalleryResourceType.McpServerManifestUri
			}
		];

		return {
			resources
		};
	}
}
