/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { testSettings } from './areas/preferences/settings.test';
import { testKeybindings } from './areas/preferences/keybindings.test';
import { testCSS } from './areas/css/css.test';
import { testExplorer } from './areas/explorer/explorer.test';
import { testMultiRoot } from './areas/multiroot/multiroot.test';
import { testExtensions } from './areas/extensions/extensions.test';
import { testSearch } from './areas/search/search.test';
import { testDataLoss } from './areas/workbench/data-loss.test';
// import { testDataMigration } from './areas/workbench/data-migration.test';

describe('Smoke:', () => {

	testCSS();
	testExplorer();
	testSettings();
	testKeybindings();
	testMultiRoot();
	testExtensions();
	testSearch();
	testDataLoss();
	// testDataMigration();
});