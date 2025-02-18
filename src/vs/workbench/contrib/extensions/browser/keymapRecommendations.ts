/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionRecommendations, ExtensionRecommendation } from './extensionRecommendations.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ExtensionRecommendationReason } from '../../../services/extensionRecommendations/common/extensionRecommendations.js';

export class KeymapRecommendations extends ExtensionRecommendations {

	private _recommendations: ExtensionRecommendation[] = [];
	get recommendations(): ReadonlyArray<ExtensionRecommendation> { return this._recommendations; }

	constructor(
		@IProductService private readonly productService: IProductService,
	) {
		super();
	}

	protected async doActivate(): Promise<void> {
		if (this.productService.keymapExtensionTips) {
			this._recommendations = this.productService.keymapExtensionTips.map(extensionId => ({
				extension: extensionId.toLowerCase(),
				reason: {
					reasonId: ExtensionRecommendationReason.Application,
					reasonText: ''
				}
			}));
		}
	}

}

