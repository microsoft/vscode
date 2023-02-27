/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Language, LANGUAGE_DEFAULT } from 'vs/base/common/platform';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ILanguagePackItem } from 'vs/platform/languagePacks/common/languagePacks';
import { IActiveLanguagePackService, ILocaleService } from 'vs/workbench/services/localization/common/locale';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IProductService } from 'vs/platform/product/common/productService';
import { withNullAsUndefined } from 'vs/base/common/types';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class WebLocaleService implements ILocaleService {
	declare readonly _serviceBrand: undefined;
	static readonly _LOCAL_STORAGE_EXTENSION_ID_KEY = 'vscode.nls.languagePackExtensionId';
	static readonly _LOCAL_STORAGE_LOCALE_KEY = 'vscode.nls.locale';

	constructor(
		@IDialogService private readonly dialogService: IDialogService,
		@IHostService private readonly hostService: IHostService,
		@IProductService private readonly productService: IProductService
	) { }

	async setLocale(languagePackItem: ILanguagePackItem, _skipDialog = false): Promise<void> {
		const locale = languagePackItem.id;
		if (locale === Language.value() || (!locale && Language.value() === navigator.language)) {
			return;
		}
		if (locale) {
			window.localStorage.setItem(WebLocaleService._LOCAL_STORAGE_LOCALE_KEY, locale);
			if (languagePackItem.extensionId) {
				window.localStorage.setItem(WebLocaleService._LOCAL_STORAGE_EXTENSION_ID_KEY, languagePackItem.extensionId);
			}
		} else {
			window.localStorage.removeItem(WebLocaleService._LOCAL_STORAGE_LOCALE_KEY);
			window.localStorage.removeItem(WebLocaleService._LOCAL_STORAGE_EXTENSION_ID_KEY);
		}

		const restartDialog = await this.dialogService.confirm({
			type: 'info',
			message: localize('relaunchDisplayLanguageMessage', "To change the display language, {0} needs to reload", this.productService.nameLong),
			detail: localize('relaunchDisplayLanguageDetail', "Press the reload button to refresh the page and set the display language to {0}.", languagePackItem.label),
			primaryButton: localize({ key: 'reload', comment: ['&& denotes a mnemonic character'] }, "&&Reload"),
		});

		if (restartDialog.confirmed) {
			this.hostService.restart();
		}
	}

	async clearLocalePreference(): Promise<void> {
		window.localStorage.removeItem(WebLocaleService._LOCAL_STORAGE_LOCALE_KEY);
		window.localStorage.removeItem(WebLocaleService._LOCAL_STORAGE_EXTENSION_ID_KEY);

		if (Language.value() === navigator.language) {
			return;
		}

		const restartDialog = await this.dialogService.confirm({
			type: 'info',
			message: localize('clearDisplayLanguageMessage', "To change the display language, {0} needs to reload", this.productService.nameLong),
			detail: localize('clearDisplayLanguageDetail', "Press the reload button to refresh the page and use your browser's language."),
			primaryButton: localize({ key: 'reload', comment: ['&& denotes a mnemonic character'] }, "&&Reload"),
		});

		if (restartDialog.confirmed) {
			this.hostService.restart();
		}
	}
}

class WebActiveLanguagePackService implements IActiveLanguagePackService {
	_serviceBrand: undefined;

	async getExtensionIdProvidingCurrentLocale(): Promise<string | undefined> {
		const language = Language.value();
		if (language === LANGUAGE_DEFAULT) {
			return undefined;
		}
		const extensionId = window.localStorage.getItem(WebLocaleService._LOCAL_STORAGE_EXTENSION_ID_KEY);
		return withNullAsUndefined(extensionId);
	}
}

registerSingleton(ILocaleService, WebLocaleService, InstantiationType.Delayed);
registerSingleton(IActiveLanguagePackService, WebActiveLanguagePackService, InstantiationType.Delayed);
