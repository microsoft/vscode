/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';

// The strings localized in this file will get pulled into the manifest of the language packs.
// So that they are available for VS Code to use without downloading the entire language pack.

export const minimumTranslatedStrings = {
	showLanguagePackExtensions: localize('showLanguagePackExtensions', "VS Code is available in {0}. Search for language packs in the Marketplace to get started."),
	searchMarketplace: localize('searchMarketplace', "Search Marketplace"),
	installAndRestartMessage: localize('installAndRestartMessage', "VS Code is available in {0}. Please install the language pack to change the display language."),
	installAndRestart: localize('installAndRestart', "Install and Restart")
};

