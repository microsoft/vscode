/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILanguagePackItem } from 'vs/platform/languagePacks/common/languagePacks';

export const ILocaleService = createDecorator<ILocaleService>('localizationService');

export interface ILocaleService {
	readonly _serviceBrand: undefined;
	setLocale(languagePackItem: ILanguagePackItem): Promise<boolean>;
	clearLocalePreference(): Promise<boolean>;
}
