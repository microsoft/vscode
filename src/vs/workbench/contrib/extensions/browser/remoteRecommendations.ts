/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionRecommendations, GalleryExtensionRecommendation } from 'vs/workbench/contrib/extensions/browser/extensionRecommendations';
import { IProductService } from 'vs/platform/product/common/productService';
import { ExtensionRecommendationReason } from 'vs/workbench/services/extensionRecommendations/common/extensionRecommendations';
import { PlatformToString, platform } from 'vs/base/common/platform';

export class RemoteRecommendations extends ExtensionRecommendations {

	private _recommendations: GalleryExtensionRecommendation[] = [];
	get recommendations(): ReadonlyArray<GalleryExtensionRecommendation> { return this._recommendations; }

	constructor(
		@IProductService private readonly productService: IProductService,
	) {
		super();
	}

	protected async doActivate(): Promise<void> {
		const extensionTips = { ...this.productService.remoteExtensionTips, ...this.productService.virtualWorkspaceExtensionTips };
		const currentPlatform = PlatformToString(platform);
		this._recommendations = Object.values(extensionTips).filter(({ supportedPlatforms }) => !supportedPlatforms || supportedPlatforms.includes(currentPlatform)).map(extension => ({
			extension: extension.extensionId.toLowerCase(),
			reason: {
				reasonId: ExtensionRecommendationReason.Application,
				reasonText: ''
			}
		}));
	}
}

