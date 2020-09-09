/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNonEmptyArray } from 'vs/base/common/arrays';
import { ExtensionRecommendations, ExtensionRecommendation, PromptedExtensionRecommendations } from 'vs/workbench/contrib/extensions/browser/extensionRecommendations';
import { ExtensionRecommendationReason } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IExperimentService, ExperimentActionType, ExperimentState } from 'vs/workbench/contrib/experiments/common/experimentService';

export class ExperimentalRecommendations extends ExtensionRecommendations {

	private _recommendations: ExtensionRecommendation[] = [];
	get recommendations(): ReadonlyArray<ExtensionRecommendation> { return this._recommendations; }

	constructor(
		promptedExtensionRecommendations: PromptedExtensionRecommendations,
		@IExperimentService private readonly experimentService: IExperimentService,
	) {
		super(promptedExtensionRecommendations);
	}

	/**
	 * Fetch extensions used by others on the same workspace as recommendations
	 */
	protected async doActivate(): Promise<void> {
		const experiments = await this.experimentService.getExperimentsByType(ExperimentActionType.AddToRecommendations);
		for (const { action, state } of experiments) {
			if (state === ExperimentState.Run && isNonEmptyArray(action?.properties?.recommendations) && action?.properties?.recommendationReason) {
				action.properties.recommendations.forEach((extensionId: string) => this._recommendations.push({
					extensionId: extensionId.toLowerCase(),
					source: 'experimental',
					reason: {
						reasonId: ExtensionRecommendationReason.Experimental,
						reasonText: action.properties.recommendationReason
					}
				}));
			}
		}
	}

}

