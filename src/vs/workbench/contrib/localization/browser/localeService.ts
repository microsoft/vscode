/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Language } from 'vs/base/common/platform';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ILanguagePackItem } from 'vs/platform/languagePacks/common/languagePacks';
import { ILocaleService } from 'vs/workbench/contrib/localization/common/locale';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IProductService } from 'vs/platform/product/common/productService';

export class WebLocaleService implements ILocaleService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IDialogService private readonly dialogService: IDialogService,
		@IHostService private readonly hostService: IHostService,
		@IProductService private readonly productService: IProductService
	) { }

	async setLocale(languagePackItem: ILanguagePackItem): Promise<void> {
		const locale = languagePackItem.id;
		if (locale === Language.value() || (!locale && Language.value() === navigator.language)) {
			return;
		}
		if (locale) {
			window.localStorage.setItem('vscode.nls.locale', locale);
		} else {
			window.localStorage.removeItem('vscode.nls.locale');
		}

		const restartDialog = await this.dialogService.confirm({
			type: 'info',
			message: localize('relaunchDisplayLanguageMessage', "{0} needs to reload to change the display language", this.productService.nameLong),
			detail: localize('relaunchDisplayLanguageDetail', "Press the reload button to refresh the page and set the display language to {0}.", languagePackItem.label),
			primaryButton: localize({ key: 'reload', comment: ['&& denotes a mnemonic character'] }, "&&Reload"),
		});

		if (restartDialog.confirmed) {
			this.hostService.restart();
		}
	}

	async clearLocalePreference(): Promise<void> {
		window.localStorage.removeItem('vscode.nls.locale');

		if (Language.value() === navigator.language) {
			return;
		}

		const restartDialog = await this.dialogService.confirm({
			type: 'info',
			message: localize('clearDisplayLanguageMessage', "{0} needs to reload to change the display language", this.productService.nameLong),
			detail: localize('clearDisplayLanguageDetail', "Press the reload button to refresh the page and use your browser's language."),
			primaryButton: localize({ key: 'reload', comment: ['&& denotes a mnemonic character'] }, "&&Reload"),
		});

		if (restartDialog.confirmed) {
			this.hostService.restart();
		}
	}
}
