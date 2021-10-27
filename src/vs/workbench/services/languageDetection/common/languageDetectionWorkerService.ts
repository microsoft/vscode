/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ILanguageDetectionService = createDecorator<ILanguageDetectionService>('ILanguageDetectionService');

export interface ILanguageDetectionService {
	readonly _serviceBrand: undefined;

	/**
	 * @param languageId The languageId to check if language detection is currently enabled.
	 * @returns whether or not language detection is on for this language mode.
	 */
	isEnabledForMode(languageId: string): boolean;

	/**
	 * @param resource The resource to detect the language for.
	 * @returns the language mode for the given resource or undefined if the model is not confident enough.
	 */
	detectLanguage(resource: URI): Promise<string | undefined>;
}

//#region Telemetry events

export const AutomaticLanguageDetectionLikelyWrongId = 'automaticlanguagedetection.likelywrong';

export interface IAutomaticLanguageDetectionLikelyWrongData {
	currentLanguageId: string;
	nextLanguageId: string;
}

export type AutomaticLanguageDetectionLikelyWrongClassification = {
	currentLanguageId: { classification: 'SystemMetaData', purpose: 'FeatureInsight' },
	nextLanguageId: { classification: 'SystemMetaData', purpose: 'FeatureInsight' }
};

export const LanguageDetectionStatsId = 'automaticlanguagedetection.stats';

export interface ILanguageDetectionStats {
	languages: string;
	confidences: string;
	timeSpent: number;
}

export type LanguageDetectionStatsClassification = {
	languages: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
	confidences: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
	timeSpent: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
};

//#endregion
