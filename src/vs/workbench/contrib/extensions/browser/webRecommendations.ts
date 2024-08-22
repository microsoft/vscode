/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionRecommendations, ExtensionRecommendation } from './extensionRecommendations';
import { IProductService } from '../../../../platform/product/common/productService';
import { ExtensionRecommendationReason } from '../../../services/extensionRecommendations/common/extensionRecommendations';
import { localize } from '../../../../nls';
import { IExtensionManagementServerService } from '../../../services/extensionManagement/common/extensionManagement';

export class WebRecommendations extends ExtensionRecommendations {

	private _recommendations: ExtensionRecommendation[] = [];
	get recommendations(): ReadonlyArray<ExtensionRecommendation> { return this._recommendations; }

	constructor(
		@IProductService private readonly productService: IProductService,
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
	) {
		super();
	}

	protected async doActivate(): Promise<void> {
		const isOnlyWeb = this.extensionManagementServerService.webExtensionManagementServer && !this.extensionManagementServerService.localExtensionManagementServer && !this.extensionManagementServerService.remoteExtensionManagementServer;
		if (isOnlyWeb && Array.isArray(this.productService.webExtensionTips)) {
			this._recommendations = this.productService.webExtensionTips.map((extensionId): ExtensionRecommendation => ({
				extension: extensionId.toLowerCase(),
				reason: {
					reasonId: ExtensionRecommendationReason.Application,
					reasonText: localize('reason', "This extension is recommended for {0} for the Web", this.productService.nameLong)
				}
			}));
		}
	}
}

