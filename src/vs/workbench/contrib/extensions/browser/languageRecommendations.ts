/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionRecommendations, ExtensionRecommendation } from 'vs/workbench/contrib/extensions/browser/extensionRecommendations';
import { IProductService } from 'vs/platform/product/common/productService';
import { ExtensionRecommendationReason } from 'vs/workbench/services/extensionRecommendations/common/extensionRecommendations';

export class LanguageRecommendations extends ExtensionRecommendations {

	private _recommendations: ExtensionRecommendation[] = [];
	get recommendations(): ReadonlyArray<ExtensionRecommendation> { return this._recommendations; }

	constructor(
		@IProductService private readonly productService: IProductService,
	) {
		super();
	}

	protected async doActivate(): Promise<void> {
		if (this.productService.languageExtensionTips) {
			this._recommendations = this.productService.languageExtensionTips.map((extensionId): ExtensionRecommendation => ({
				extension: extensionId.toLowerCase(),
				reason: {
					reasonId: ExtensionRecommendationReason.Application,
					reasonText: ''
				}
			}));
		}
	}
}
