/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { localize } from '../../../../nls.js';
import { Language, LANGUAGE_DEFAULT } from '../../../../base/common/platform.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IActiveLanguagePackService, ILocaleService } from '../common/locale.js';
import { IHostService } from '../../host/browser/host.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IExtensionGalleryService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ILogService } from '../../../../platform/log/common/log.js';
const localeStorage = new class LocaleStorage {
    static { this.LOCAL_STORAGE_LOCALE_KEY = 'vscode.nls.locale'; }
    static { this.LOCAL_STORAGE_EXTENSION_ID_KEY = 'vscode.nls.languagePackExtensionId'; }
    setLocale(locale) {
        localStorage.setItem(LocaleStorage.LOCAL_STORAGE_LOCALE_KEY, locale);
        this.doSetLocaleToCookie(locale);
    }
    doSetLocaleToCookie(locale) {
        document.cookie = `${LocaleStorage.LOCAL_STORAGE_LOCALE_KEY}=${locale};path=/;max-age=3153600000`;
    }
    clearLocale() {
        localStorage.removeItem(LocaleStorage.LOCAL_STORAGE_LOCALE_KEY);
        this.doClearLocaleToCookie();
    }
    doClearLocaleToCookie() {
        document.cookie = `${LocaleStorage.LOCAL_STORAGE_LOCALE_KEY}=;path=/;max-age=0`;
    }
    setExtensionId(extensionId) {
        localStorage.setItem(LocaleStorage.LOCAL_STORAGE_EXTENSION_ID_KEY, extensionId);
    }
    getExtensionId() {
        return localStorage.getItem(LocaleStorage.LOCAL_STORAGE_EXTENSION_ID_KEY);
    }
    clearExtensionId() {
        localStorage.removeItem(LocaleStorage.LOCAL_STORAGE_EXTENSION_ID_KEY);
    }
};
let WebLocaleService = class WebLocaleService {
    constructor(dialogService, hostService, productService) {
        this.dialogService = dialogService;
        this.hostService = hostService;
        this.productService = productService;
    }
    async setLocale(languagePackItem, _skipDialog = false) {
        const locale = languagePackItem.id;
        if (locale === Language.value() || (!locale && Language.value() === navigator.language.toLowerCase())) {
            return;
        }
        if (locale) {
            localeStorage.setLocale(locale);
            if (languagePackItem.extensionId) {
                localeStorage.setExtensionId(languagePackItem.extensionId);
            }
        }
        else {
            localeStorage.clearLocale();
            localeStorage.clearExtensionId();
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
    async clearLocalePreference() {
        localeStorage.clearLocale();
        localeStorage.clearExtensionId();
        if (Language.value() === navigator.language.toLowerCase()) {
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
};
WebLocaleService = __decorate([
    __param(0, IDialogService),
    __param(1, IHostService),
    __param(2, IProductService)
], WebLocaleService);
export { WebLocaleService };
let WebActiveLanguagePackService = class WebActiveLanguagePackService {
    constructor(galleryService, logService) {
        this.galleryService = galleryService;
        this.logService = logService;
    }
    async getExtensionIdProvidingCurrentLocale() {
        const language = Language.value();
        if (language === LANGUAGE_DEFAULT) {
            return undefined;
        }
        const extensionId = localeStorage.getExtensionId();
        if (extensionId) {
            return extensionId;
        }
        if (!this.galleryService.isEnabled()) {
            return undefined;
        }
        try {
            const tagResult = await this.galleryService.query({ text: `tag:lp-${language}` }, CancellationToken.None);
            // Only install extensions that are published by Microsoft and start with vscode-language-pack for extra certainty
            const extensionToInstall = tagResult.firstPage.find(e => e.publisher === 'MS-CEINTL' && e.name.startsWith('vscode-language-pack'));
            if (extensionToInstall) {
                localeStorage.setExtensionId(extensionToInstall.identifier.id);
                return extensionToInstall.identifier.id;
            }
            // TODO: If a non-Microsoft language pack is installed, we should prompt the user asking if they want to install that.
            // Since no such language packs exist yet, we can wait until that happens to implement this.
        }
        catch (e) {
            // Best effort
            this.logService.error(e);
        }
        return undefined;
    }
};
WebActiveLanguagePackService = __decorate([
    __param(0, IExtensionGalleryService),
    __param(1, ILogService)
], WebActiveLanguagePackService);
registerSingleton(ILocaleService, WebLocaleService, 1 /* InstantiationType.Delayed */);
registerSingleton(IActiveLanguagePackService, WebActiveLanguagePackService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9jYWxlU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9sb2NhbGl6YXRpb24vYnJvd3Nlci9sb2NhbGVTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsUUFBUSxFQUFFLGdCQUFnQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDakYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRWhGLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxjQUFjLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUNqRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDMUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3hGLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx3RUFBd0UsQ0FBQztBQUNsSCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFckUsTUFBTSxhQUFhLEdBQUcsSUFBSSxNQUFNLGFBQWE7YUFFcEIsNkJBQXdCLEdBQUcsbUJBQW1CLENBQUM7YUFDL0MsbUNBQThCLEdBQUcsb0NBQW9DLENBQUM7SUFFOUYsU0FBUyxDQUFDLE1BQWM7UUFDdkIsWUFBWSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsd0JBQXdCLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDckUsSUFBSSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxDQUFDO0lB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