/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * WebDriverIO 4.8.0 outputs all kinds of "deprecation" warnings
 * for common commands like `keys` and `moveToObject`.
 * According to https://github.com/Codeception/CodeceptJS/issues/531,
 * these deprecation warnings are for Firefox, and have no alternative replacements.
 * Since we can't downgrade WDIO as suggested (it's Spectron's dep, not ours),
 * we must suppress the warning with a classic monkey-patch.
 *
 * @see webdriverio/lib/helpers/depcrecationWarning.js
 * @see https://github.com/webdriverio/webdriverio/issues/2076
 */
// Filter out the following messages:
const wdioDeprecationWarning = /^WARNING: the "\w+" command will be depcrecated soon./; // [sic]
// Monkey patch:
const warn = console.warn;
console.warn = function suppressWebdriverWarnings(message) {
	if (wdioDeprecationWarning.test(message)) { return; }
	warn.apply(console, arguments);
};

import './areas/css/css.test';
import './areas/explorer/explorer.test';
import './areas/preferences/settings.test';
import './areas/preferences/keybindings.test';
import './areas/multiroot/multiroot.test';
import './areas/extensions/extensions.test';
import './areas/search/search.test';
import './areas/workbench/data-loss.test';
// import './areas/workbench/data-migration.test';
	// testDataMigration();