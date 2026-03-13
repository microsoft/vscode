/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import * as platform from '../../../../base/common/platform.js';
import { IExtensionManagementService, IExtensionGalleryService, InstallOperation, ILocalExtension, InstallExtensionResult, DidUninstallExtensionEvent } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { INotificationService, NeverShowAgainScope, NotificationPriority } from '../../../../platform/notification/common/notification.js';
import Severity from '../../../../base/common/severity.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { minimumTranslatedStrings } from './minimalTranslations.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ILocaleService } from '../../../services/localization/common/locale.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { BaseLocalizationWorkbenchContribution } from '../common/localization.contribution.js';

class NativeLocalizationWorkbenchContribution extends BaseLocalizationWorkbenchContribution {
	private static LANGUAGEPACK_SUGGESTION_IGNORE_STORAGE_KEY = 'extensionsAssistant/languagePackSuggestionIgnore';

	constructor(
		@INotificationService private readonly notificationService: INotificationService,
		@ILocaleService private readonly localeService: ILocaleService,
		@IProductService private readonly productService: IProductService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this.checkAndInstall();
		this._register(this.extensionManagementService.onDidInstallExtensions(e => this.onDidInstallExtensions(e)));
		this._register(this.extensionManagementService.onDidUninstallExtension(e => this.onDidUninstallExtension(e)));
	}

	private async onDidInstallExtensions(results: readonly InstallExtensionResult[]): Promise<void> {
		for (const result of results) {
			if (result.operation === InstallOperation.Install && result.local) {
				await this.onDidInstallExtension(result.local, !!result.context?.extensionsSync);
			}
		}

	}

	private async onDidInstallExtension(localExtension: ILocalExtension, fromSettingsSync: boolean): Promise<void> {
		const localization = localExtension.manifest.contributes?.localizations?.[0];
		if (!localization || platform.language === localization.languageId) {
			return;
		}
		const { languageId, languageName } = localization;

		this.notificationService.prompt(
			Severity.Info,
			localize('updateLocale', "Would you like to change {0}'s display language to {1} and restart?", this.productService.nameLong, languageName || languageId),
			[{
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
			}],
			{
				sticky: true,
				priority: NotificationPriority.URGENT,
				neverShowAgain: { id: 'langugage.update.donotask', isSecondary: true, scope: NeverShowAgainScope.APPLICATION }
			}
		);
	}

	private async onDidUninstallExtension(_event: DidUninstallExtensionEvent): Promise<void> {
		if (!await this.isLocaleInstalled(platform.language)) {
			this.localeService.setLocale({
				id: 'en',
				label: 'English'
			});
		}
	}

	private async checkAndInstall(): Promise<void> {
		const language = platform.language;
		let locale = platform.locale ?? '';
		const languagePackSuggestionIgnoreList: string[] = JSON.parse(
			this.storageService.get(
				NativeLocalizationWorkbenchContribution.LANGUAGEPACK_SUGGESTION_IGNORE_STORAGE_KEY,
				StorageScope.APPLICATION,
				'[]'
			)
		);

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
		const translationsFromPack: { [key: string]: string } = translation?.contents?.['vs/workbench/contrib/localization/electron-browser/minimalTranslations'] ?? {};
		const promptMessageKey = extensionToInstall ? 'installAndRestartMessage' : 'showLanguagePackExtensions';
		const useEnglish = !translationsFromPack[promptMessageKey];

		const translations: { [key: string]: string } = {};
		Object.keys(minimumTranslatedStrings).forEach(key => {
			if (!translationsFromPack[key] || useEnglish) {
				translations[key] = minimumTranslatedStrings[key].replace('{0}', () => languageName);
			} else {
				translations[key] = `${translationsFromPack[key].replace('{0}', () => languageDisplayName)} (${minimumTranslatedStrings[key].replace('{0}', () => languageName)})`;
			}
		});

		const logUserReaction = (userReaction: string) => {
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

		this.notificationService.prompt(
			Severity.Info,
			promptMessage,
			[extensionToInstall ? installAndRestartAction : searchAction,
			{
				label: localize('neverAgain', "Don't Show Again"),
				isSecondary: true,
				run: () => {
					languagePackSuggestionIgnoreList.push(fullLocale);
					this.storageService.store(
						NativeLocalizationWorkbenchContribution.LANGUAGEPACK_SUGGESTION_IGNORE_STORAGE_KEY,
						JSON.stringify(languagePackSuggestionIgnoreList),
						StorageScope.APPLICATION,
						StorageTarget.USER
					);
					logUserReaction('neverShowAgain');
				}
			}],
			{
				priority: NotificationPriority.OPTIONAL,
				onCancel: () => {
					logUserReaction('cancelled');
				}
			}
		);
	}

	private async isLocaleInstalled(locale: string): Promise<boolean> {
		const installed = await this.extensionManagementService.getInstalled();
		return installed.some(i => !!i.manifest.contributes?.localizations?.length
			&& i.manifest.contributes.localizations.some(l => locale.startsWith(l.languageId.toLowerCase())));
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(NativeLocalizationWorkbenchContribution, LifecyclePhase.Eventually);
