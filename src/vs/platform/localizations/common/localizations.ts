/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILocalizationContribution } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ILocalizationsService = createDecorator<ILocalizationsService>('localizationsService');
export interface ILocalizationsService {
	readonly _serviceBrand: undefined;
	getLanguageIds(): Promise<string[]>;
}

export function isValidLocalization(localization: ILocalizationContribution): boolean {
	if (typeof localization.languageId !== 'string') {
		return false;
	}
	if (!Array.isArray(localization.translations) || localization.translations.length === 0) {
		return false;
	}
	for (const translation of localization.translations) {
		if (typeof translation.id !== 'string') {
			return false;
		}
		if (typeof translation.path !== 'string') {
			return false;
		}
	}
	if (localization.languageName && typeof localization.languageName !== 'string') {
		return false;
	}
	if (localization.localizedLanguageName && typeof localization.localizedLanguageName !== 'string') {
		return false;
	}
	return true;
}
