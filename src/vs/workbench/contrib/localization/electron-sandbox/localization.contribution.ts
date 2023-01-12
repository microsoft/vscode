/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution, Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { Disposable } from 'vs/base/common/lifecycle';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import { IExtensionManagementService, IExtensionGalleryService, IGalleryExtension, InstallOperation, InstallExtensionResult } from 'vs/platform/extensionManagement/common/extensionManagement';
import { INotificationService, NeverShowAgainScope } from 'vs/platform/notification/common/notification';
import Severity from 'vs/base/common/severity';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { VIEWLET_ID as EXTENSIONS_VIEWLET_ID, IExtensionsViewPaneContainer } from 'vs/workbench/contrib/extensions/common/extensions';
import { minimumTranslatedStrings } from 'vs/workbench/contrib/localization/electron-sandbox/minimalTranslations';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { ViewContainerLocation } from 'vs/workbench/common/views';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { ClearDisplayLanguageAction, ConfigureDisplayLanguageAction } from 'vs/workbench/contrib/localization/browser/localizationsActions';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILocaleService } from 'vs/workbench/contrib/localization/common/locale';
import { NativeLocaleService } from 'vs/workbench/contrib/localization/electron-sandbox/localeService';

registerSingleton(ILocaleService, NativeLocaleService, InstantiationType.Delayed);

// Register action to configure locale and related settings
registerAction2(ConfigureDisplayLanguageAction);
registerAction2(ClearDisplayLanguageAction);

const LANGUAGEPACK_SUGGESTION_IGNORE_STORAGE_KEY = 'extensionsAssistant/languagePackSuggestionIgnore';

export class LocalizationWorkbenchContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@INotificationService private readonly notificationService: INotificationService,
		@IJSONEditingService private readonly jsonEditingService: IJSONEditingService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IHostService private readonly hostService: IHostService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this.checkAndInstall();
		this._register(this.extensionManagementService.onDidInstallExtensions(e => this.onDidInstallExtensions(e)));
	}

	private onDidInstallExtensions(results: readonly InstallExtensionResult[]): void {
		for (const e of results) {
			if (e.operation !== InstallOperation.Install || !e.local?.manifest?.contributes?.localizations?.length) {
				continue;
			}
			const languageId = e.local.manifest.contributes.localizations[0].languageId;
			if (platform.language === languageId) {
				continue;
			}

			this.notificationService.prompt(
				Severity.Info,
				localize('updateLocale', "Would you like to change VS Code's UI language to {0} and restart?", e.local.manifest.contributes.localizations[0].languageName || e.local.manifest.contributes.localizations[0].languageId),
				[{
					label: localize('changeAndRestart', "Change Language and Restart"),
					run: async () => {
						try {
							await this.jsonEditingService.write(this.environmentService.argvResource, [{ path: ['locale'], value: languageId }], true);
							await this.hostService.restart();
						} catch (e) {
							this.notificationService.error(e);
						}
					}
				}],
				{
					sticky: true,
					neverShowAgain: { id: 'langugage.update.donotask', isSecondary: true, scope: NeverShowAgainScope.APPLICATION }
				}
			);
		}
	}

	private checkAndInstall(): void {
		const language = platform.language;
		let locale = platform.locale ?? '';
		if (locale.startsWith('zh-hans')) {
			locale = 'zh-cn';
		} else if (locale.startsWith('zh-hant')) {
			locale = 'zh-tw';
		}
		const languagePackSuggestionIgnoreList = <string[]>JSON.parse(this.storageService.get(LANGUAGEPACK_SUGGESTION_IGNORE_STORAGE_KEY, StorageScope.APPLICATION, '[]'));

		if (!this.galleryService.isEnabled()) {
			return;
		}
		if (!language || !locale || locale === 'en' || locale.indexOf('en-') === 0) {
			return;
		}
		if (locale.startsWith(language) || languagePackSuggestionIgnoreList.includes(locale)) {
			return;
		}

		this.isLocaleInstalled(locale)
			.then(async (installed) => {
				if (installed) {
					return;
				}

				let searchLocale = locale;
				let tagResult = await this.galleryService.query({ text: `tag:lp-${searchLocale}` }, CancellationToken.None);
				if (tagResult.total === 0) {
					// Trim the locale and try again.
					searchLocale = locale.split('-')[0];
					tagResult = await this.galleryService.query({ text: `tag:lp-${searchLocale}` }, CancellationToken.None);
					if (tagResult.total === 0) {
						return;
					}
				}

				const extensionToInstall = tagResult.total === 1 ? tagResult.firstPage[0] : tagResult.firstPage.find(e => e.publisher === 'MS-CEINTL' && e.name.startsWith('vscode-language-pack'));
				const extensionToFetchTranslationsFrom = extensionToInstall ?? tagResult.firstPage[0];

				if (!extensionToFetchTranslationsFrom.assets.manifest) {
					return;
				}

				Promise.all([this.galleryService.getManifest(extensionToFetchTranslationsFrom, CancellationToken.None), this.galleryService.getCoreTranslation(extensionToFetchTranslationsFrom, searchLocale)])
					.then(([manifest, translation]) => {
						const loc = manifest && manifest.contributes && manifest.contributes.localizations && manifest.contributes.localizations.find(x => locale.startsWith(x.languageId.toLowerCase()));
						const languageName = loc ? (loc.languageName || locale) : locale;
						const languageDisplayName = loc ? (loc.localizedLanguageName || loc.languageName || locale) : locale;
						const translationsFromPack: { [key: string]: string } = translation?.contents?.['vs/workbench/contrib/localization/electron-sandbox/minimalTranslations'] ?? {};
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
							run: () => {
								logUserReaction('search');
								this.paneCompositeService.openPaneComposite(EXTENSIONS_VIEWLET_ID, ViewContainerLocation.Sidebar, true)
									.then(viewlet => viewlet?.getViewPaneContainer() as IExtensionsViewPaneContainer)
									.then(viewlet => {
										viewlet.search(`tag:lp-${searchLocale}`);
										viewlet.focus();
									});
							}
						};

						const installAndRestartAction = {
							label: translations['installAndRestart'],
							run: async () => {
								logUserReaction('installAndRestart');
								await this.installExtension(extensionToInstall!);
								await this.jsonEditingService.write(this.environmentService.argvResource, [{ path: ['locale'], value: locale }], true);
								await this.hostService.restart();
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
									languagePackSuggestionIgnoreList.push(locale);
									this.storageService.store(
										LANGUAGEPACK_SUGGESTION_IGNORE_STORAGE_KEY,
										JSON.stringify(languagePackSuggestionIgnoreList),
										StorageScope.APPLICATION,
										StorageTarget.USER
									);
									logUserReaction('neverShowAgain');
								}
							}],
							{
								onCancel: () => {
									logUserReaction('cancelled');
								}
							}
						);
					});
			});
	}

	private async isLocaleInstalled(locale: string): Promise<boolean> {
		const installed = await this.extensionManagementService.getInstalled();
		return installed.some(i => !!(i.manifest
			&& i.manifest.contributes
			&& i.manifest.contributes.localizations
			&& i.manifest.contributes.localizations.length
			&& i.manifest.contributes.localizations.some(l => locale.startsWith(l.languageId.toLowerCase()))));
	}

	private installExtension(extension: IGalleryExtension): Promise<void> {
		return this.paneCompositeService.openPaneComposite(EXTENSIONS_VIEWLET_ID, ViewContainerLocation.Sidebar)
			.then(viewlet => viewlet?.getViewPaneContainer() as IExtensionsViewPaneContainer)
			.then(viewlet => viewlet.search(`@id:${extension.identifier.id}`))
			.then(() => this.extensionManagementService.installFromGallery(extension))
			.then(() => undefined, err => this.notificationService.error(err));
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(LocalizationWorkbenchContribution, LifecyclePhase.Eventually);

ExtensionsRegistry.registerExtensionPoint({
	extensionPoint: 'localizations',
	defaultExtensionKind: ['ui', 'workspace'],
	jsonSchema: {
		description: localize('vscode.extension.contributes.localizations', "Contributes localizations to the editor"),
		type: 'array',
		default: [],
		items: {
			type: 'object',
			required: ['languageId', 'translations'],
			defaultSnippets: [{ body: { languageId: '', languageName: '', localizedLanguageName: '', translations: [{ id: 'vscode', path: '' }] } }],
			properties: {
				languageId: {
					description: localize('vscode.extension.contributes.localizations.languageId', 'Id of the language into which the display strings are translated.'),
					type: 'string'
				},
				languageName: {
					description: localize('vscode.extension.contributes.localizations.languageName', 'Name of the language in English.'),
					type: 'string'
				},
				localizedLanguageName: {
					description: localize('vscode.extension.contributes.localizations.languageNameLocalized', 'Name of the language in contributed language.'),
					type: 'string'
				},
				translations: {
					description: localize('vscode.extension.contributes.localizations.translations', 'List of translations associated to the language.'),
					type: 'array',
					default: [{ id: 'vscode', path: '' }],
					items: {
						type: 'object',
						required: ['id', 'path'],
						properties: {
							id: {
								type: 'string',
								description: localize('vscode.extension.contributes.localizations.translations.id', "Id of VS Code or Extension for which this translation is contributed to. Id of VS Code is always `vscode` and of extension should be in format `publisherId.extensionName`."),
								pattern: '^((vscode)|([a-z0-9A-Z][a-z0-9A-Z-]*)\\.([a-z0-9A-Z][a-z0-9A-Z-]*))$',
								patternErrorMessage: localize('vscode.extension.contributes.localizations.translations.id.pattern', "Id should be `vscode` or in format `publisherId.extensionName` for translating VS code or an extension respectively.")
							},
							path: {
								type: 'string',
								description: localize('vscode.extension.contributes.localizations.translations.path', "A relative path to a file containing translations for the language.")
							}
						},
						defaultSnippets: [{ body: { id: '', path: '' } }],
					},
				}
			}
		}
	}
});
