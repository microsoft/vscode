/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import * as paths from 'vs/base/common/paths';
import { TPromise } from 'vs/base/common/winjs.base';
import * as mime from 'vs/base/common/mime';
import { IFilesConfiguration, FILES_ASSOCIATIONS_CONFIG } from 'vs/platform/files/common/files';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IExtensionPointUser, ExtensionMessageCollector, IExtensionPoint, ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { ModesRegistry } from 'vs/editor/common/modes/modesRegistry';
import { ILanguageExtensionPoint, IValidLanguageExtensionPoint } from 'vs/editor/common/services/modeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ModeServiceImpl } from 'vs/editor/common/services/modeServiceImpl';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export const languagesExtPoint: IExtensionPoint<ILanguageExtensionPoint[]> = ExtensionsRegistry.registerExtensionPoint<ILanguageExtensionPoint[]>('languages', [], {
	description: nls.localize('vscode.extension.contributes.languages', 'Contributes language declarations.'),
	type: 'array',
	items: {
		type: 'object',
		defaultSnippets: [{ body: { id: '${1:languageId}', aliases: ['${2:label}'], extensions: ['${3:extension}'], configuration: './language-configuration.json' } }],
		properties: {
			id: {
				description: nls.localize('vscode.extension.contributes.languages.id', 'ID of the language.'),
				type: 'string'
			},
			aliases: {
				description: nls.localize('vscode.extension.contributes.languages.aliases', 'Name aliases for the language.'),
				type: 'array',
				items: {
					type: 'string'
				}
			},
			extensions: {
				description: nls.localize('vscode.extension.contributes.languages.extensions', 'File extensions associated to the language.'),
				default: ['.foo'],
				type: 'array',
				items: {
					type: 'string'
				}
			},
			filenames: {
				description: nls.localize('vscode.extension.contributes.languages.filenames', 'File names associated to the language.'),
				type: 'array',
				items: {
					type: 'string'
				}
			},
			filenamePatterns: {
				description: nls.localize('vscode.extension.contributes.languages.filenamePatterns', 'File name glob patterns associated to the language.'),
				type: 'array',
				items: {
					type: 'string'
				}
			},
			mimetypes: {
				description: nls.localize('vscode.extension.contributes.languages.mimetypes', 'Mime types associated to the language.'),
				type: 'array',
				items: {
					type: 'string'
				}
			},
			firstLine: {
				description: nls.localize('vscode.extension.contributes.languages.firstLine', 'A regular expression matching the first line of a file of the language.'),
				type: 'string'
			},
			configuration: {
				description: nls.localize('vscode.extension.contributes.languages.configuration', 'A relative path to a file containing configuration options for the language.'),
				type: 'string',
				default: './language-configuration.json'
			}
		}
	}
});

export class WorkbenchModeServiceImpl extends ModeServiceImpl {
	private _configurationService: IConfigurationService;
	private _extensionService: IExtensionService;
	private _onReadyPromise: TPromise<boolean>;

	constructor(
		@IExtensionService extensionService: IExtensionService,
		@IConfigurationService configurationService: IConfigurationService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super(environmentService.verbose || environmentService.isExtensionDevelopment || !environmentService.isBuilt);
		this._configurationService = configurationService;
		this._extensionService = extensionService;

		languagesExtPoint.setHandler((extensions: IExtensionPointUser<ILanguageExtensionPoint[]>[]) => {
			let allValidLanguages: IValidLanguageExtensionPoint[] = [];

			for (let i = 0, len = extensions.length; i < len; i++) {
				let extension = extensions[i];

				if (!Array.isArray(extension.value)) {
					extension.collector.error(nls.localize('invalid', "Invalid `contributes.{0}`. Expected an array.", languagesExtPoint.name));
					continue;
				}

				for (let j = 0, lenJ = extension.value.length; j < lenJ; j++) {
					let ext = extension.value[j];
					if (isValidLanguageExtensionPoint(ext, extension.collector)) {
						let configuration = (ext.configuration ? paths.join(extension.description.extensionFolderPath, ext.configuration) : ext.configuration);
						allValidLanguages.push({
							id: ext.id,
							extensions: ext.extensions,
							filenames: ext.filenames,
							filenamePatterns: ext.filenamePatterns,
							firstLine: ext.firstLine,
							aliases: ext.aliases,
							mimetypes: ext.mimetypes,
							configuration: configuration
						});
					}
				}
			}

			ModesRegistry.registerLanguages(allValidLanguages);

		});

		this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(FILES_ASSOCIATIONS_CONFIG)) {
				this.updateMime();
			}
		});

		this.onDidCreateMode((mode) => {
			this._extensionService.activateByEvent(`onLanguage:${mode.getId()}`).done(null, onUnexpectedError);
		});
	}

	protected _onReady(): TPromise<boolean> {
		if (!this._onReadyPromise) {
			this._onReadyPromise = this._extensionService.whenInstalledExtensionsRegistered().then(() => {
				this.updateMime();
				return true;
			});
		}

		return this._onReadyPromise;
	}

	private updateMime(): void {
		const configuration = this._configurationService.getValue<IFilesConfiguration>();

		// Clear user configured mime associations
		mime.clearTextMimes(true /* user configured */);

		// Register based on settings
		if (configuration.files && configuration.files.associations) {
			Object.keys(configuration.files.associations).forEach(pattern => {
				const langId = configuration.files.associations[pattern];
				const mimetype = this.getMimeForMode(langId) || `text/x-${langId}`;

				mime.registerTextMime({ id: langId, mime: mimetype, filepattern: pattern, userConfigured: true });
			});
		}
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

function isValidLanguageExtensionPoint(value: ILanguageExtensionPoint, collector: ExtensionMessageCollector): boolean {
	if (!value) {
		collector.error(nls.localize('invalid.empty', "Empty value for `contributes.{0}`", languagesExtPoint.name));
		return false;
	}
	if (typeof value.id !== 'string') {
		collector.error(nls.localize('require.id', "property `{0}` is mandatory and must be of type `string`", 'id'));
		return false;
	}
	if (!isUndefinedOrStringArray(value.extensions)) {
		collector.error(nls.localize('opt.extensions', "property `{0}` can be omitted and must be of type `string[]`", 'extensions'));
		return false;
	}
	if (!isUndefinedOrStringArray(value.filenames)) {
		collector.error(nls.localize('opt.filenames', "property `{0}` can be omitted and must be of type `string[]`", 'filenames'));
		return false;
	}
	if (typeof value.firstLine !== 'undefined' && typeof value.firstLine !== 'string') {
		collector.error(nls.localize('opt.firstLine', "property `{0}` can be omitted and must be of type `string`", 'firstLine'));
		return false;
	}
	if (typeof value.configuration !== 'undefined' && typeof value.configuration !== 'string') {
		collector.error(nls.localize('opt.configuration', "property `{0}` can be omitted and must be of type `string`", 'configuration'));
		return false;
	}
	if (!isUndefinedOrStringArray(value.aliases)) {
		collector.error(nls.localize('opt.aliases', "property `{0}` can be omitted and must be of type `string[]`", 'aliases'));
		return false;
	}
	if (!isUndefinedOrStringArray(value.mimetypes)) {
		collector.error(nls.localize('opt.mimetypes', "property `{0}` can be omitted and must be of type `string[]`", 'mimetypes'));
		return false;
	}
	return true;
}
