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

// Register action to configure locale and related settings
const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ConfigureLocaleAction, ConfigureLocaleAction.ID, ConfigureLocaleAction.LABEL), 'Configure Language');

export class LocalesSchemaUpdater extends Disposable implements IWorkbenchContribution {
	constructor(
		@ILocalizationsService private localizationService: ILocalizationsService
	) {
		super();
		this.update();
		this._register(this.localizationService.onDidLanguagesChange(() => this.update()));
	}

	private update(): void {
		this.localizationService.getLanguageIds()
			.then(languageIds => registerLocaleDefinitionSchema([...languageIds, 'zh-cn', 'zh-tw']));
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
workbenchRegistry.registerWorkbenchContribution(LocalesSchemaUpdater, LifecyclePhase.Eventually);

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