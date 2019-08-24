/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution, Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { Disposable } from 'vs/base/common/lifecycle';
import { ConfigureLocaleAction } from 'vs/workbench/contrib/localizations/browser/localizationsActions';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { ILocalizationsService } from 'vs/platform/localizations/common/localizations';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import { IExtensionManagementService, DidInstallExtensionEvent, IExtensionGalleryService, IGalleryExtension, InstallOperation } from 'vs/platform/extensionManagement/common/extensionManagement';
import { INotificationService } from 'vs/platform/notification/common/notification';
import Severity from 'vs/base/common/severity';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { VIEWLET_ID as EXTENSIONS_VIEWLET_ID, IExtensionsViewlet } from 'vs/workbench/contrib/extensions/common/extensions';
import { minimumTranslatedStrings } from 'vs/workbench/contrib/localizations/browser/minimalTranslations';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ExtensionType } from 'vs/platform/extensions/common/extensions';

// Register action to configure locale and related settings
const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ConfigureLocaleAction, ConfigureLocaleAction.ID, ConfigureLocaleAction.LABEL), 'Configure Display Language');

export class LocalizationWorkbenchContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@ILocalizationsService private readonly localizationService: ILocalizationsService,
		@INotificationService private readonly notificationService: INotificationService,
		@IJSONEditingService private readonly jsonEditingService: IJSONEditingService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IWindowsService private readonly windowsService: IWindowsService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@IViewletService private readonly viewletService: IViewletService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {
		super();
		this.updateLocaleDefintionSchema();
		this.checkAndInstall();
		this._register(this.localizationService.onDidLanguagesChange(() => this.updateLocaleDefintionSchema()));
		this._register(this.extensionManagementService.onDidInstallExtension(e => this.onDidInstallExtension(e)));
	}

	private updateLocaleDefintionSchema(): void {
		this.localizationService.getLanguageIds()
			.then(languageIds => {
				let lowercaseLanguageIds: string[] = [];
				languageIds.forEach((languageId) => {
					let lowercaseLanguageId = languageId.toLowerCase();
					if (lowercaseLanguageId !== languageId) {
						lowercaseLanguageIds.push(lowercaseLanguageId);
					}
				});
				registerLocaleDefinitionSchema([...languageIds, ...lowercaseLanguageIds]);
			});
	}

	private onDidInstallExtension(e: DidInstallExtensionEvent): void {
		if (e.local && e.operation === InstallOperation.Install && e.local.manifest.contributes && e.local.manifest.contributes.localizations && e.local.manifest.contributes.localizations.length) {
			const locale = e.local.manifest.contributes.localizations[0].languageId;
			if (platform.language !== locale) {
				const updateAndRestart = platform.locale !== locale;
				this.notificationService.prompt(
					Severity.Info,
					updateAndRestart ? localize('updateLocale', "Would you like to change VS Code's UI language to {0} and restart?", e.local.manifest.contributes.localizations[0].languageName || e.local.manifest.contributes.localizations[0].languageId)
						: localize('activateLanguagePack', "In order to use VS Code in {0}, VS Code needs to restart.", e.local.manifest.contributes.localizations[0].languageName || e.local.manifest.contributes.localizations[0].languageId),
					[{
						label: updateAndRestart ? localize('yes', "Yes") : localize('restart now', "Restart Now"),
						run: () => {
							const updatePromise = updateAndRestart ? this.jsonEditingService.write(this.environmentService.localeResource, { key: 'locale', value: locale }, true) : Promise.resolve(undefined);
							updatePromise.then(() => this.windowsService.relaunch({}), e => this.notificationService.error(e));
						}
					}],
					{
						sticky: true,
						neverShowAgain: { id: 'langugage.update.donotask', isSecondary: true }
					}
				);
			}
		}
	}

	private checkAndInstall(): void {
		const language = platform.language;
		const locale = platform.locale;
		const languagePackSuggestionIgnoreList = <string[]>JSON.parse(this.storageService.get('extensionsAssistant/languagePackSuggestionIgnore', StorageScope.GLOBAL, '[]'));

		if (!this.galleryService.isEnabled()) {
			return;
		}
		if (!language || !locale || language === 'en' || language.indexOf('en-') === 0) {
			return;
		}
		if (language === locale || languagePackSuggestionIgnoreList.indexOf(language) > -1) {
			return;
		}

		this.isLanguageInstalled(locale)
			.then(installed => {
				if (installed) {
					return;
				}

				this.galleryService.query({ text: `tag:lp-${locale}` }, CancellationToken.None).then(tagResult => {
					if (tagResult.total === 0) {
						return;
					}

					const extensionToInstall = tagResult.total === 1 ? tagResult.firstPage[0] : tagResult.firstPage.filter(e => e.publisher === 'MS-CEINTL' && e.name.indexOf('vscode-language-pack') === 0)[0];
					const extensionToFetchTranslationsFrom = extensionToInstall || tagResult.firstPage[0];

					if (!extensionToFetchTranslationsFrom.assets.manifest) {
						return;
					}

					Promise.all([this.galleryService.getManifest(extensionToFetchTranslationsFrom, CancellationToken.None), this.galleryService.getCoreTranslation(extensionToFetchTranslationsFrom, locale)])
						.then(([manifest, translation]) => {
							const loc = manifest && manifest.contributes && manifest.contributes.localizations && manifest.contributes.localizations.filter(x => x.languageId.toLowerCase() === locale)[0];
							const languageName = loc ? (loc.languageName || locale) : locale;
							const languageDisplayName = loc ? (loc.localizedLanguageName || loc.languageName || locale) : locale;
							const translationsFromPack: any = translation && translation.contents ? translation.contents['vs/workbench/contrib/localizations/browser/minimalTranslations'] : {};
							const promptMessageKey = extensionToInstall ? 'installAndRestartMessage' : 'showLanguagePackExtensions';
							const useEnglish = !translationsFromPack[promptMessageKey];

							const translations: any = {};
							Object.keys(minimumTranslatedStrings).forEach(key => {
								if (!translationsFromPack[key] || useEnglish) {
									translations[key] = minimumTranslatedStrings[key].replace('{0}', languageName);
								} else {
									translations[key] = `${translationsFromPack[key].replace('{0}', languageDisplayName)} (${minimumTranslatedStrings[key].replace('{0}', languageName)})`;
								}
							});

							const logUserReaction = (userReaction: string) => {
								/* __GDPR__
									"languagePackSuggestion:popup" : {
										"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
										"language": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
									}
								*/
								this.telemetryService.publicLog('languagePackSuggestion:popup', { userReaction, language });
							};

							const searchAction = {
								label: translations['searchMarketplace'],
								run: () => {
									logUserReaction('search');
									this.viewletService.openViewlet(EXTENSIONS_VIEWLET_ID, true)
										.then(viewlet => viewlet as IExtensionsViewlet)
										.then(viewlet => {
											viewlet.search(`tag:lp-${locale}`);
											viewlet.focus();
										});
								}
							};

							const installAndRestartAction = {
								label: translations['installAndRestart'],
								run: () => {
									logUserReaction('installAndRestart');
									this.installExtension(extensionToInstall).then(() => this.windowsService.relaunch({}));
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
										languagePackSuggestionIgnoreList.push(language);
										this.storageService.store(
											'extensionsAssistant/languagePackSuggestionIgnore',
											JSON.stringify(languagePackSuggestionIgnoreList),
											StorageScope.GLOBAL
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
			});

	}

	private isLanguageInstalled(language: string | undefined): Promise<boolean> {
		return this.extensionManagementService.getInstalled(ExtensionType.User)
			.then(installed => installed.some(i =>
				!!(i.manifest
					&& i.manifest.contributes
					&& i.manifest.contributes.localizations
					&& i.manifest.contributes.localizations.length
					&& i.manifest.contributes.localizations.some(l => l.languageId.toLowerCase() === language))));
	}

	private installExtension(extension: IGalleryExtension): Promise<void> {
		return this.viewletService.openViewlet(EXTENSIONS_VIEWLET_ID)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => viewlet.search(`@id:${extension.identifier.id}`))
			.then(() => this.extensionManagementService.installFromGallery(extension))
			.then(() => undefined, err => this.notificationService.error(err));
	}
}

function registerLocaleDefinitionSchema(languages: string[]): void {
	const localeDefinitionFileSchemaId = 'vscode://schemas/locale';
	const jsonRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
	// Keep en-US since we generated files with that content.
	jsonRegistry.registerSchema(localeDefinitionFileSchemaId, {
		id: localeDefinitionFileSchemaId,
		allowComments: true,
		description: 'Locale Definition file',
		type: 'object',
		default: {
			'locale': 'en'
		},
		required: ['locale'],
		properties: {
			locale: {
				type: 'string',
				enum: languages,
				description: localize('JsonSchema.locale', 'The UI Language to use.')
			}
		}
	});
}

registerLocaleDefinitionSchema(platform.language ? [platform.language] : []);
const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(LocalizationWorkbenchContribution, LifecyclePhase.Eventually);

ExtensionsRegistry.registerExtensionPoint({
	extensionPoint: 'localizations',
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
								pattern: '^((vscode)|([a-z0-9A-Z][a-z0-9\-A-Z]*)\\.([a-z0-9A-Z][a-z0-9\-A-Z]*))$',
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
