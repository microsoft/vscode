/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { ILanguagePackItem, LanguagePackBaseService } from 'vs/platform/languagePacks/common/languagePacks';

export class WebLanguagePacksService extends LanguagePackBaseService {
	// TODO: support builtin extensions using unpkg service
	// constructor(
	// 	@IExtensionResourceLoaderService extensionResourceLoaderService: IExtensionResourceLoaderService,
	// 	@IExtensionGalleryService extensionGalleryService: IExtensionGalleryService,
	// 	@ILogService private readonly logService: ILogService
	// ) {
	// 	super(extensionGalleryService);
	// }

	getTranslationsUri(id: string): Promise<URI | undefined> {
		return Promise.resolve(undefined);
	}

	// Web doesn't have a concept of language packs, so we just return an empty array
	getInstalledLanguages(): Promise<ILanguagePackItem[]> {
		return Promise.resolve([]);
	}
}
