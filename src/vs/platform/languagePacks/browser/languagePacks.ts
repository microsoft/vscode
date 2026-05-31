/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { URI } from '../../../base/common/uri.js';
import { IExtensionGalleryService } from '../../extensionManagement/common/extensionManagement.js';
import { IExtensionResourceLoaderService } from '../../extensionResourceLoader/common/extensionResourceLoader.js';
import { ILanguagePackItem, LanguagePackBaseService } from '../common/languagePacks.js';
import { ILogService } from '../../log/common/log.js';

export class WebLanguagePacksService extends LanguagePackBaseService {
	constructor(
		@IExtensionResourceLoaderService private readonly extensionResourceLoaderService: IExtensionResourceLoaderService,
		@IExtensionGalleryService extensionGalleryService: IExtensionGalleryService,
		@ILogService private readonly logService: ILogService
	) {
		super(extensionGalleryService);
	}

	async getBuiltInExtensionTranslationsUri(id: string, language: string): Promise<URI | undefined> {

		const queryTimeout = new CancellationTokenSource();
		setTimeout(() => queryTimeout.cancel(), 1000);

		// First get the extensions that supports the language (there should only be one but just in case let's include more results)
		let result;
		try {
			result = await this.extensionGalleryService.query({
				text: `tag:"lp-${language}"`,
				pageSize: 5
			}, queryTimeout.token);
		} catch (err) {
			this.logService.error(err);
			return undefined;
		}

		const languagePackExtensions = result.firstPage.find(e => e.properties.localizedLanguages?.length);
		if (!languagePackExtensions) {
			this.logService.trace(`No language pack found for language ${language}`);
			return undefined;
		}

		// Then get the manifest for that extension
		const manifestTimeout = new CancellationTokenSource();
		setTimeout(() => queryTimeout.cancel(), 1000);
		const manifest = await this.extensionGalleryService.getManifest(languagePackExtensions, manifestTimeout.token);

		// Find the translation from the language pack
		const localization = manifest?.contributes?.localizations?.find(l => l.languageId === language);
		const translation = localization?.translations.find(t => t.id === id);
		if (!translation) {
			this.logService.trace(`No translation found for id '${id}, in ${manifest?.name}`);
			return undefined;
		}

		// get the resource uri and return it
		const uri = await this.extensionResourceLoaderService.getExtensionGalleryResourceURL({
			// If translation is defined then manifest should have been defined.
			name: manifest!.name,
			publisher: manifest!.publisher,
			version: manifest!.version
		});
		if (!uri) {
			this.logService.trace('Gallery does not provide extension resources.');
			return undefined;
		}

		return URI.joinPath(uri, translation.path);
	}

	// Web doesn't have a concept of language packs, so we just return an empty array
	getInstalledLanguages(): Promise<ILanguagePackItem[]> {
		return Promise.resolve([]);
	}
}
