/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';

// The strings localized in this file will get pulled into the manifest of the language packs.
// So that they are available for VS Code to use without downloading the entire language pack.

export const minimumTranslatedStrings = {
	showLanguagePackExtensions: localize('showLanguagePackExtensions', "The Marketplace has extensions that can localize VS Code in the {0} language"),
	searchMarketplace: localize('searchMarketplace', "Search Marketplace"),
	installAndRestartMessage: localize('installAndRestartMessage', "Install language pack to localize VS Code in {0} language. Restart VS Code after installing for the language to take effect."),
	installAndRestart: localize('installAndRestart', "Install and Restart"),
	install: localize('install', 'Install')
};

