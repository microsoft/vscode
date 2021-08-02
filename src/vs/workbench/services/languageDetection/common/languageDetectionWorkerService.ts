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
	 * @param modeId The modeId to check if language detection is currently enabled.
	 * @returns whether or not language detection is on for this language mode.
	 */
	isEnabledForMode(modeId: string): boolean;

	/**
	 * @param resource The resource to detect the language for.
	 * @returns the language mode for the given resource or undefined if the model is not confident enough.
	 */
	detectLanguage(resource: URI): Promise<string | undefined>;

	/**
	 * @param resource The resource to detect the language for.
	 * @returns all possible language modes detected in this resource.
	 */
	detectLanguages(resource: URI): Promise<string[]>;
}
