/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionRecommendations, ExtensionRecommendation, PromptedExtensionRecommendations } from 'vs/workbench/contrib/extensions/browser/extensionRecommendations';
import { IProductService } from 'vs/platform/product/common/productService';
import { ExtensionRecommendationReason } from 'vs/workbench/services/extensionManagement/common/extensionManagement';

export class KeymapRecommendations extends ExtensionRecommendations {

	private _recommendations: ExtensionRecommendation[] = [];
	get recommendations(): ReadonlyArray<ExtensionRecommendation> { return this._recommendations; }

	constructor(
		promptedExtensionRecommendations: PromptedExtensionRecommendations,
		@IProductService private readonly productService: IProductService,
	) {
		super(promptedExtensionRecommendations);
	}

	protected async doActivate(): Promise<void> {
		if (this.productService.keymapExtensionTips) {
			this._recommendations = this.productService.keymapExtensionTips.map(extensionId => (<ExtensionRecommendation>{
				extensionId: extensionId.toLowerCase(),
				source: 'application',
				reason: {
					reasonId: ExtensionRecommendationReason.Application,
					reasonText: ''
				}
			}));
		}
	}

}

