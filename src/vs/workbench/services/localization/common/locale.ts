/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILanguagePackItem } from '../../../../platform/languagePacks/common/languagePacks.js';

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
