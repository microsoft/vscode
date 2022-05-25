/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILanguagePackItem, LanguagePackBaseService } from 'vs/platform/languagePacks/common/languagePack';

export class WebLanguagePackService extends LanguagePackBaseService {
	// For web, there is no concept of an "installed" language since
	// we load language packs from the unpkg service directly.
	getInstalledLanguages(): Promise<ILanguagePackItem[]> {
		return Promise.resolve([]);
	}
}
