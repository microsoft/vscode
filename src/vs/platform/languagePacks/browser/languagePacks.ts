/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILanguagePackItem, LanguagePackBaseService } from 'vs/platform/languagePacks/common/languagePacks';

export class WebLanguagePacksService extends LanguagePackBaseService {
	// Web doesn't have a concept of language packs, so we just return an empty array
	getInstalledLanguages(): Promise<ILanguagePackItem[]> {
		return Promise.resolve([]);
	}
}
