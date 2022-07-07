/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { language } from 'vs/base/common/platform';
import { ILanguagePackItem } from 'vs/platform/languagePacks/common/languagePacks';
import { ILocaleService } from 'vs/workbench/contrib/localization/common/locale';

export class WebLocaleService implements ILocaleService {
	declare readonly _serviceBrand: undefined;

	async setLocale(languagePackItem: ILanguagePackItem): Promise<boolean> {
		const locale = languagePackItem.id;
		if (locale === language || (!locale && language === navigator.language)) {
			return false;
		}
		if (locale) {
			window.localStorage.setItem('vscode.nls.locale', locale);
		} else {
			window.localStorage.removeItem('vscode.nls.locale');
		}
		return true;
	}

	async clearLocalePreference(): Promise<boolean> {
		if (language === navigator.language) {
			return false;
		}
		window.localStorage.removeItem('vscode.nls.locale');
		return true;
	}
}
