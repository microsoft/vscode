/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import * as paths from 'vs/base/common/paths';
import { TPromise } from 'vs/base/common/winjs.base';
import mime = require('vs/base/common/mime');
import { IFilesConfiguration } from 'vs/platform/files/common/files';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IExtensionPointUser, ExtensionMessageCollector } from 'vs/platform/extensions/common/extensionsRegistry';
import { ModesRegistry } from 'vs/editor/common/modes/modesRegistry';
import { ILanguageExtensionPoint, IValidLanguageExtensionPoint } from 'vs/editor/common/services/modeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { languagesExtPoint, ModeServiceImpl } from 'vs/editor/common/services/modeServiceImpl';

export class WorkbenchModeServiceImpl extends ModeServiceImpl {
	private _configurationService: IConfigurationService;
	private _extensionService: IExtensionService;
	private _onReadyPromise: TPromise<boolean>;

	constructor(
		@IExtensionService extensionService: IExtensionService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super();
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

		this._configurationService.onDidUpdateConfiguration(e => this.onConfigurationChange(e.config));

		this.onDidCreateMode((mode) => {
			this._extensionService.activateByEvent(`onLanguage:${mode.getId()}`).done(null, onUnexpectedError);
		});
	}

	protected _onReady(): TPromise<boolean> {
		if (!this._onReadyPromise) {
			const configuration = this._configurationService.getConfiguration<IFilesConfiguration>();
			this._onReadyPromise = this._extensionService.onReady().then(() => {
				this.onConfigurationChange(configuration);

				return true;
			});
		}

		return this._onReadyPromise;
	}

	private onConfigurationChange(configuration: IFilesConfiguration): void {

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
