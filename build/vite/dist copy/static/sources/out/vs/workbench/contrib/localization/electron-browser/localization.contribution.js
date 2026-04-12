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
var NativeLocalizationWorkbenchContribution_1;
import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import * as platform from '../../../../base/common/platform.js';
import { IExtensionManagementService, IExtensionGalleryService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { INotificationService, NeverShowAgainScope, NotificationPriority } from '../../../../platform/notification/common/notification.js';
import Severity from '../../../../base/common/severity.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { minimumTranslatedStrings } from './minimalTranslations.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ILocaleService } from '../../../services/localization/common/locale.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { BaseLocalizationWorkbenchContribution } from '../common/localization.contribution.js';
let NativeLocalizationWorkbenchContribution = class NativeLocalizationWorkbenchContribution extends BaseLocalizationWorkbenchContribution {
    static { NativeLocalizationWorkbenchContribution_1 = this; }
    static { this.LANGUAGEPACK_SUGGESTION_IGNORE_STORAGE_KEY = 'extensionsAssistant/languagePackSuggestionIgnore'; }
    constructor(notificationService, localeService, productService, storageService, extensionManagementService, galleryService, extensionsWorkbenchService, telemetryService) {
        super();
        this.notificationService = notificationService;
        this.localeService = localeService;
        this.productService = productService;
        this.storageService = storageService;
        this.extensionManagementService = extensionManagementService;
        this.galleryService = galleryService;
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.telemetryService = telemetryService;
        this.checkAndInstall();
        this._register(this.extensionManagementService.onDidInstallExtensions(e => this.onDidInstallExtensions(e)));
        this._register(this.extensionManagementService.onDidUninstallExtension(e => this.onDidUninstallExtension(e)));
    }
    async onDidInstallExtensions(results) {
        for (const result of results) {
            if (result.operation === 2 /* InstallOperation.Install */ && result.local) {
                await this.onDidInstallExtension(result.local, !!result.context?.extensionsSync);
            }
        }
    }
    async onDidInstallExtension(localExtension, fromSettingsSync) {
        const localization = localExtension.manifest.contributes?.localizations?.[0];
        if (!localization || platform.language === localization.languageId) {
            return;
        }
        const { languageId, languageName } = localization;
        this.notificationService.prompt(Severity.Info, localize('updateLocale', "Would you like to change {0}'s display language to {1} and restart?", this.productService.nameLong, languageName || languageId), [{
                label: localize('changeAndRestart', "Change Language and Restart"),
                run: async () => {
                    await this.localeService.setLocale({
                        id: languageId,
                        label: languageName ?? languageId,
                        extensionId: localExtension.identifier.id,
                        // If settings sync installs the language pack, then we would have just shown the notification so no
                        // need to show the dialog.
                    }, true);
                }
            }], {
            sticky: true,
            priority: NotificationPriority.URGENT,
            neverShowAgain: { id: 'langugage.update.donotask', isSecondary: true, scope: NeverShowAgainScope.APPLICATION }
        });
    }
    async onDidUninstallExtension(_event) {
        if (!await this.isLocaleInstalled(platform.language)) {
            this.localeService.setLocale({
                id: 'en',
                label: 'English'
            });
        }
    }
    async checkAndInstall() {
        const language = platform.language;
        let locale = platform.locale ?? '';
        const languagePackSuggestionIgnoreList = JSON.parse(this.storageService.get(NativeLocalizationWorkbenchContribution_1.LANGUAGEPACK_SUGGESTION_IGNORE_STORAGE_KEY, -1 /* StorageScope.APPLICATION */, '[]'));
        if (!this.galleryService.isEnabled()) {
            return;
        }
        if (!language || !locale || platform.Language.isDefaultVariant()) {
            return;
        }
        if (locale.startsWith(language) || languagePackSuggestionIgnoreList.includes(locale)) {
            return;
        }
        const installed = await this.isLocaleInstalled(locale);
        if (installed) {
            return;
        }
        const fullLocale = locale;
        let tagResult = await this.galleryService.query({ text: `tag:lp-${locale}` }, CancellationToken.None);
        if (tagResult.total === 0) {
            // Trim the locale and try again.
            locale = locale.split('-')[0];
            tagResult = await this.galleryService.query({ text: `tag:lp-${locale}` }, CancellationToken.None);
            if (tagResult.total === 0) {
                return;
            }
        }
        const extensionToInstall = tagResult.total === 1 ? tagResult.firstPage[0] : tagResult.firstPage.find(e => e.publisher === 'MS-CEINTL' && e.name.startsWith('vscode-language-pack'));
        const extensionToFetchTranslationsFrom = extensionToInstall ?? tagResult.firstPage[0];
        if (!extensionToFetchTranslationsFrom.assets.manifest) {
            return;
        }
        const [manifest, translation] = await Promise.all([
            this.galleryService.getManifest(extensionToFetchTranslationsFrom, CancellationToken.None),
            this.galleryService.getCoreTranslation(extensionToFetchTranslationsFrom, locale)
        ]);
        const loc = manifest?.contributes?.localizations?.find(x => locale.startsWith(x.languageId.toLowerCase()));
        const languageName = loc ? (loc.languageName || locale) : locale;
        const languageDisplayName = loc ? (loc.localizedLanguageName || loc.languageName || locale) : locale;
        const translationsFromPack = translation?.contents?.['vs/workbench/contrib/localization/electron-browser/minimalTranslations'] ?? {};
        const promptMessageKey = extensionToInstall ? 'installAndRestartMessage' : 'showLanguagePackExtensions';
        const useEnglish = !translationsFromPack[promptMessageKey];
        const translations = {};
        Object.keys(minimumTranslatedStrings).forEach(key => {
            if (!translationsFromPack[key] || useEnglish) {
                translations[key] = minimumTranslatedStrings[key].replace('{0}', () => languageName);
            }
            else {
                translations[key] = `${translationsFromPack[key].replace('{0}', () => languageDisplayName)} (${minimumTranslatedStrings[key].replace('{0}', () => languageName)})`;
            }
        });
        const logUserReaction = (userReaction) => {
            /* __GDPR__
                "languagePackSuggestion:popup" : {
                    "owner": "TylerLeonhardt",
                    "userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
                    "language": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
                }
            */
            this.telemetryService.publicLog('languagePackSuggestion:popup', { userReaction, language: locale });
        };
        const searchAction = {
            label: translations['searchMarketplace'],
            run: async () => {
                logUserReaction('search');
                await this.extensionsWorkbenchService.openSearch(`tag:lp-${locale}`);
            }
        };
        const installAndRestartAction = {
            label: translations['installAndRestart'],
            run: async () => {
                logUserReaction('installAndRestart');
                await this.localeService.setLocale({
                    id: locale,
                    label: languageName,
                    extensionId: extensionToInstall?.identifier.id,
                    galleryExtension: extensionToInstall
                    // The user will be prompted if they want to install the language pack before this.
                }, true);
            }
        };
        const promptMessage = translations[promptMessageKey];
        this.notificationService.prompt(Severity.Info, promptMessage, [extensionToInstall ? installAndRestartAction : searchAction,
            {
                label: localize('neverAgain', "Don't Show Again"),
                isSecondary: true,
                run: () => {
                    languagePackSuggestionIgnoreList.push(fullLocale);
                    this.storageService.store(NativeLocalizationWorkbenchContribution_1.LANGUAGEPACK_SUGGESTION_IGNORE_STORAGE_KEY, JSON.stringify(languagePackSuggestionIgnoreList), -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
                    logUserReaction('neverShowAgain');
                }
            }], {
            priority: NotificationPriority.OPTIONAL,
            onCancel: () => {
                logUserReaction('cancelled');
            }
        });
    }
    async isLocaleInstalled(locale) {
        const installed = await this.extensionManagementService.getInstalled();
        return installed.some(i => !!i.manifest.contributes?.localizations?.length
            && i.manifest.contributes.localizations.some(l => locale.startsWith(l.languageId.toLowerCase())));
    }
};
NativeLocalizationWorkbenchContribution = NativeLocalizationWorkbenchContribution_1 = __decorate([
    __param(0, INotificationService),
    __param(1, ILocaleService),
    __param(2, IProductService),
    __param(3, IStorageService),
    __param(4, IExtensionManagementService),
    __param(5, IExtensionGalleryService),
    __param(6, IExtensionsWorkbenchService),
    __param(7, ITelemetryService)
], NativeLocalizationWorkbenchContribution);
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(NativeLocalizationWorkbenchContribution, 4 /* LifecyclePhase.Eventually */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9jYWxpemF0aW9uLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2xvY2FsaXphdGlvbi9lbGVjdHJvbi1icm93c2VyL2xvY2FsaXphdGlvbi5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLFVBQVUsSUFBSSxtQkFBbUIsRUFBbUMsTUFBTSxrQ0FBa0MsQ0FBQztBQUV0SCxPQUFPLEtBQUssUUFBUSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSx3QkFBd0IsRUFBeUYsTUFBTSx3RUFBd0UsQ0FBQztBQUN0TyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsbUJBQW1CLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMzSSxPQUFPLFFBQVEsTUFBTSxxQ0FBcUMsQ0FBQztBQUMzRCxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFD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