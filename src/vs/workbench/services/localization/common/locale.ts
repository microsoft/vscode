/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILanguagePackItem } from 'vs/platform/languagePacks/common/languagePacks';

export const ILocaleService = createDecorator<ILocaleService>('localizationService');

export interface ILocaleService {
	readonly _serviceBrand: undefined;
	setLocale(languagePackItem: ILanguagePackItem, skipDialog?: boolean): Promise<void>;
	clearLocalePreference(): Promise<void>;
}

export const IActiveLanguagePackService = createDecorator<IActiveLanguagePackService>('activeLanguageService');

export interface IActiveLanguagePackService {
	readonly _serviceBrand: undefined;
	getExtensionIdProvidingCurrentLocale(): Promise<string | undefined>;
}
