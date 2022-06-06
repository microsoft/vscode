/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { language } from 'vs/base/common/platform';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILocaleService } from 'vs/workbench/services/localization/common/locale';

export class WebLocaleService implements ILocaleService {
	declare readonly _serviceBrand: undefined;

	async setLocale(locale: string | undefined): Promise<boolean> {
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
}

registerSingleton(ILocaleService, WebLocaleService, true);
