/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { testDataLoss } from "./tests/data-loss";
import { testDataMigration } from "./tests/data-migration";
import { testExplorer } from "./tests/explorer";
import { testConfigViews } from "./tests/configuration-views";
import { testSearch } from "./tests/search";
import { testCSS } from "./tests/css";
import { testJavaScript } from "./tests/javascript";
import { testJavaScriptDebug } from "./tests/javascript-debug";
import { testGit } from "./tests/git";
import { testIntegratedTerminal } from "./tests/integrated-terminal";
import { testStatusbar } from "./tests/statusbar";
import { testTasks } from "./tests/tasks";
import { testExtensions } from "./tests/extensions";
import { testLocalization } from "./tests/localization";

describe('Smoke Test Suite', () => {
	testDataMigration();
	testDataLoss();
	testExplorer();
	testConfigViews();
	testSearch();
	testCSS();
	testJavaScript();
	testJavaScriptDebug();
	testGit();
	testIntegratedTerminal();
	testStatusbar();
	testTasks();
	testExtensions();
	testLocalization();
});