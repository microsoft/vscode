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
import { ConfigureLocaleAction } from 'vs/workbench/parts/localizations/browser/localizationsActions';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { ILocalizationsService } from 'vs/platform/localizations/common/localizations';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { language } from 'vs/base/common/platform';
import { IExtensionManagementService, DidInstallExtensionEvent } from 'vs/platform/extensionManagement/common/extensionManagement';
import { INotificationService } from 'vs/platform/notification/common/notification';
import Severity from 'vs/base/common/severity';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import URI from 'vs/base/common/uri';
import { join } from 'vs/base/common/paths';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IStorageService, } from 'vs/platform/storage/common/storage';

// Register action to configure locale and related settings
const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ConfigureLocaleAction, ConfigureLocaleAction.ID, ConfigureLocaleAction.LABEL), 'Configure Language');

export class LocalizationWorkbenchContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@ILocalizationsService private localizationService: ILocalizationsService,
		@INotificationService private notificationService: INotificationService,
		@IJSONEditingService private jsonEditingService: IJSONEditingService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IWindowsService private windowsService: IWindowsService,
		@IStorageService private storageService: IStorageService,
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService
	) {
		super();
		this.updateLocaleDefintionSchema();
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
		const donotAskUpdateKey = 'langugage.update.donotask';
		if (!this.storageService.getBoolean(donotAskUpdateKey) && e.local && e.local.manifest.contributes && e.local.manifest.contributes.localizations && e.local.manifest.contributes.localizations.length) {
			const locale = e.local.manifest.contributes.localizations[0].languageId;
			if (language !== locale) {
				this.notificationService.prompt(
					Severity.Info,
					localize('updateLocale', "Would you like to change VS Code's UI language to {0} and restart?", e.local.manifest.contributes.localizations[0].languageName || e.local.manifest.contributes.localizations[0].languageId),
					[{
						label: localize('yes', "Yes"),
						run: () => {
							const file = URI.file(join(this.environmentService.appSettingsHome, 'locale.json'));
							this.jsonEditingService.write(file, { key: 'locale', value: locale }, true)
								.then(() => this.windowsService.relaunch({}), e => this.notificationService.error(e));
						}
					}, {
						label: localize('no', "No"),
						run: () => { }
					}, {
						label: localize('neverAgain', "Don't Show Again"),
						isSecondary: true,
						run: () => this.storageService.store(donotAskUpdateKey, true)
					}]
				);
			}
		}
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

registerLocaleDefinitionSchema([language]);
const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(LocalizationWorkbenchContribution, LifecyclePhase.Eventually);

ExtensionsRegistry.registerExtensionPoint('localizations', [], {
	description: localize('vscode.extension.contributes.localizations', "Contributes localizations to the editor"),
	type: 'array',
	default: [],
	items: {
		type: 'object',
		required: ['languageId', 'translations'],
		defaultSnippets: [{ body: { languageId: '', languageName: '', languageNameLocalized: '', translations: [{ id: 'vscode', path: '' }] } }],
		properties: {
			languageId: {
				description: localize('vscode.extension.contributes.localizations.languageId', 'Id of the language into which the display strings are translated.'),
				type: 'string'
			},
			languageName: {
				description: localize('vscode.extension.contributes.localizations.languageName', 'Name of the language in English.'),
				type: 'string'
			},
			languageNameLocalized: {
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
});