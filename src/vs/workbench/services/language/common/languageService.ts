/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { clearConfiguredLanguageAssociations, registerConfiguredLanguageAssociation } from 'vs/editor/common/services/languagesAssociations';
import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ILanguageExtensionPoint, ILanguageService } from 'vs/editor/common/languages/language';
import { LanguageService } from 'vs/editor/common/services/languageService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { FILES_ASSOCIATIONS_CONFIG, IFilesConfiguration } from 'vs/platform/files/common/files';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionMessageCollector, ExtensionsRegistry, IExtensionPoint, IExtensionPointUser } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IExtensionDescription, IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { Disposable } from 'vs/base/common/lifecycle';
import { Extensions, IExtensionFeatureTableRenderer, IExtensionFeaturesRegistry, IRenderedData, IRowData, ITableData } from 'vs/workbench/services/extensionManagement/common/extensionFeatures';
import { Registry } from 'vs/platform/registry/common/platform';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { index } from 'vs/base/common/arrays';
import { MarkdownString } from 'vs/base/common/htmlContent';

export interface IRawLanguageExtensionPoint {
	id: string;
	extensions: string[];
	filenames: string[];
	filenamePatterns: string[];
	firstLine: string;
	aliases: string[];
	mimetypes: string[];
	configuration: string;
	icon: { light: string; dark: string };
}

export const languagesExtPoint: IExtensionPoint<IRawLanguageExtensionPoint[]> = ExtensionsRegistry.registerExtensionPoint<IRawLanguageExtensionPoint[]>({
	extensionPoint: 'languages',
	jsonSchema: {
		description: localize('vscode.extension.contributes.languages', 'Contributes language declarations.'),
		type: 'array',
		items: {
			type: 'object',
			defaultSnippets: [{ body: { id: '${1:languageId}', aliases: ['${2:label}'], extensions: ['${3:extension}'], configuration: './language-configuration.json' } }],
			properties: {
				id: {
					description: localize('vscode.extension.contributes.languages.id', 'ID of the language.'),
					type: 'string'
				},
				aliases: {
					description: localize('vscode.extension.contributes.languages.aliases', 'Name aliases for the language.'),
					type: 'array',
					items: {
						type: 'string'
					}
				},
				extensions: {
					description: localize('vscode.extension.contributes.languages.extensions', 'File extensions associated to the language.'),
					default: ['.foo'],
					type: 'array',
					items: {
						type: 'string'
					}
				},
				filenames: {
					description: localize('vscode.extension.contributes.languages.filenames', 'File names associated to the language.'),
					type: 'array',
					items: {
						type: 'string'
					}
				},
				filenamePatterns: {
					description: localize('vscode.extension.contributes.languages.filenamePatterns', 'File name glob patterns associated to the language.'),
					type: 'array',
					items: {
						type: 'string'
					}
				},
				mimetypes: {
					description: localize('vscode.extension.contributes.languages.mimetypes', 'Mime types associated to the language.'),
					type: 'array',
					items: {
						type: 'string'
					}
				},
				firstLine: {
					description: localize('vscode.extension.contributes.languages.firstLine', 'A regular expression matching the first line of a file of the language.'),
					type: 'string'
				},
				configuration: {
					description: localize('vscode.extension.contributes.languages.configuration', 'A relative path to a file containing configuration options for the language.'),
					type: 'string',
					default: './language-configuration.json'
				},
				icon: {
					type: 'object',
					description: localize('vscode.extension.contributes.languages.icon', 'A icon to use as file icon, if no icon theme provides one for the language.'),
					properties: {
						light: {
							description: localize('vscode.extension.contributes.languages.icon.light', 'Icon path when a light theme is used'),
							type: 'string'
						},
						dark: {
							description: localize('vscode.extension.contributes.languages.icon.dark', 'Icon path when a dark theme is used'),
							type: 'string'
						}
					}
				}
			}
		}
	},
	activationEventsGenerator: (languageContributions, result) => {
		for (const languageContribution of languageContributions) {
			if (languageContribution.id && languageContribution.configuration) {
				result.push(`onLanguage:${languageContribution.id}`);
			}
		}
	}
});

class LanguageTableRenderer extends Disposable implements IExtensionFeatureTableRenderer {

	readonly type = 'table';

	shouldRender(manifest: IExtensionManifest): boolean {
		return !!manifest.contributes?.languages;
	}

	render(manifest: IExtensionManifest): IRenderedData<ITableData> {
		const contributes = manifest.contributes;
		const rawLanguages = contributes?.languages || [];
		const languages = rawLanguages.map(l => ({
			id: l.id,
			name: (l.aliases || [])[0] || l.id,
			extensions: l.extensions || [],
			hasGrammar: false,
			hasSnippets: false
		}));

		const byId = index(languages, l => l.id);

		const grammars = contributes?.grammars || [];
		grammars.forEach(grammar => {
			let language = byId[grammar.language];

			if (language) {
				language.hasGrammar = true;
			} else {
				language = { id: grammar.language, name: grammar.language, extensions: [], hasGrammar: true, hasSnippets: false };
				byId[language.id] = language;
				languages.push(language);
			}
		});

		const snippets = contributes?.snippets || [];
		snippets.forEach(snippet => {
			let language = byId[snippet.language];

			if (language) {
				language.hasSnippets = true;
			} else {
				language = { id: snippet.language, name: snippet.language, extensions: [], hasGrammar: false, hasSnippets: true };
				byId[language.id] = language;
				languages.push(language);
			}
		});

		if (!languages.length) {
			return { data: { headers: [], rows: [] }, dispose: () => { } };
		}

		const headers = [
			localize('language id', "ID"),
			localize('language name', "Name"),
			localize('file extensions', "File Extensions"),
			localize('grammar', "Grammar"),
			localize('snippets', "Snippets")
		];
		const rows: IRowData[][] = languages.sort((a, b) => a.id.localeCompare(b.id))
			.map(l => {
				return [
					l.id, l.name,
					new MarkdownString().appendMarkdown(`${l.extensions.map(e => `\`${e}\``).join('&nbsp;')}`),
					l.hasGrammar ? '✔︎' : '\u2014',
					l.hasSnippets ? '✔︎' : '\u2014'
				];
			});

		return {
			data: {
				headers,
				rows
			},
			dispose: () => { }
		};
	}
}

Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: 'languages',
	label: localize('languages', "Programming Languages"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(LanguageTableRenderer),
});

export class WorkbenchLanguageService extends LanguageService {
	private _configurationService: IConfigurationService;
	private _extensionService: IExtensionService;

	constructor(
		@IExtensionService extensionService: IExtensionService,
		@IConfigurationService configurationService: IConfigurationService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ILogService private readonly logService: ILogService
	) {
		super(environmentService.verbose || environmentService.isExtensionDevelopment || !environmentService.isBuilt);
		this._configurationService = configurationService;
		this._extensionService = extensionService;

		languagesExtPoint.setHandler((extensions: readonly IExtensionPointUser<IRawLanguageExtensionPoint[]>[]) => {
			const allValidLanguages: ILanguageExtensionPoint[] = [];

			for (let i = 0, len = extensions.length; i < len; i++) {
				const extension = extensions[i];

				if (!Array.isArray(extension.value)) {
					extension.collector.error(localize('invalid', "Invalid `contributes.{0}`. Expected an array.", languagesExtPoint.name));
					continue;
				}

				for (let j = 0, lenJ = extension.value.length; j < lenJ; j++) {
					const ext = extension.value[j];
					if (isValidLanguageExtensionPoint(ext, extension.description, extension.collector)) {
						let configuration: URI | undefined = undefined;
						if (ext.configuration) {
							configuration = joinPath(extension.description.extensionLocation, ext.configuration);
						}
						allValidLanguages.push({
							id: ext.id,
							extensions: ext.extensions,
							filenames: ext.filenames,
							filenamePatterns: ext.filenamePatterns,
							firstLine: ext.firstLine,
							aliases: ext.aliases,
							mimetypes: ext.mimetypes,
							configuration: configuration,
							icon: ext.icon && {
								light: joinPath(extension.description.extensionLocation, ext.icon.light),
								dark: joinPath(extension.description.extensionLocation, ext.icon.dark)
							}
						});
					}
				}
			}

			this._registry.setDynamicLanguages(allValidLanguages);

		});

		this.updateMime();
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(FILES_ASSOCIATIONS_CONFIG)) {
				this.updateMime();
			}
		}));
		this._extensionService.whenInstalledExtensionsRegistered().then(() => {
			this.updateMime();
		});

		this._register(this.onDidRequestRichLanguageFeatures((languageId) => {
			// extension activation
			this._extensionService.activateByEvent(`onLanguage:${languageId}`);
			this._extensionService.activateByEvent(`onLanguage`);
		}));
	}

	private updateMime(): void {
		const configuration = this._configurationService.getValue<IFilesConfiguration>();

		// Clear user configured mime associations
		clearConfiguredLanguageAssociations();

		// Register based on settings
		if (configuration.files?.associations) {
			Object.keys(configuration.files.associations).forEach(pattern => {
				const langId = configuration.files.associations[pattern];
				if (typeof langId !== 'string') {
					this.logService.warn(`Ignoring configured 'files.associations' for '${pattern}' because its type is not a string but '${typeof langId}'`);

					return; // https://github.com/microsoft/vscode/issues/147284
				}

				const mimeType = this.getMimeType(langId) || `text/x-${langId}`;

				registerConfiguredLanguageAssociation({ id: langId, mime: mimeType, filepattern: pattern });
			});
		}

		this._onDidChange.fire();
	}
}

function isUndefinedOrStringArray(value: string[]): boolean {
	if (typeof value === 'undefined') {
		return true;
	}
	if (!Array.isArray(value)) {
		return false;
	}
	return value.every(item => typeof item === 'string');
}

function isValidLanguageExtensionPoint(value: IRawLanguageExtensionPoint, extension: IExtensionDescription, collector: ExtensionMessageCollector): boolean {
	if (!value) {
		collector.error(localize('invalid.empty', "Empty value for `contributes.{0}`", languagesExtPoint.name));
		return false;
	}
	if (typeof value.id !== 'string') {
		collector.error(localize('require.id', "property `{0}` is mandatory and must be of type `string`", 'id'));
		return false;
	}
	if (!isUndefinedOrStringArray(value.extensions)) {
		collector.error(localize('opt.extensions', "property `{0}` can be omitted and must be of type `string[]`", 'extensions'));
		return false;
	}
	if (!isUndefinedOrStringArray(value.filenames)) {
		collector.error(localize('opt.filenames', "property `{0}` can be omitted and must be of type `string[]`", 'filenames'));
		return false;
	}
	if (typeof value.firstLine !== 'undefined' && typeof value.firstLine !== 'string') {
		collector.error(localize('opt.firstLine', "property `{0}` can be omitted and must be of type `string`", 'firstLine'));
		return false;
	}
	if (typeof value.configuration !== 'undefined' && typeof value.configuration !== 'string') {
		collector.error(localize('opt.configuration', "property `{0}` can be omitted and must be of type `string`", 'configuration'));
		return false;
	}
	if (!isUndefinedOrStringArray(value.aliases)) {
		collector.error(localize('opt.aliases', "property `{0}` can be omitted and must be of type `string[]`", 'aliases'));
		return false;
	}
	if (!isUndefinedOrStringArray(value.mimetypes)) {
		collector.error(localize('opt.mimetypes', "property `{0}` can be omitted and must be of type `string[]`", 'mimetypes'));
		return false;
	}
	if (typeof value.icon !== 'undefined') {
		if (typeof value.icon !== 'object' || typeof value.icon.light !== 'string' || typeof value.icon.dark !== 'string') {
			collector.error(localize('opt.icon', "property `{0}` can be omitted and must be of type `object` with properties `{1}` and `{2}` of type `string`", 'icon', 'light', 'dark'));
			return false;
		}
	}
	return true;
}

registerSingleton(ILanguageService, WorkbenchLanguageService, InstantiationType.Eager);
