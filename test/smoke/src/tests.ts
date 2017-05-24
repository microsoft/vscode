/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dataLoss } from "./tests/data-loss";
import { dataMigration } from "./tests/data-migration";
import { explorer } from "./tests/explorer";
import { configurationViews } from "./tests/configuration-views";
import { search } from "./tests/search";
import { css } from "./tests/css";
import { javascript } from "./tests/javascript";
import { javascriptDebug } from "./tests/javascript-debug";
import { test_git } from "./tests/git";
import { integratedTerminal } from "./tests/integrated-terminal";
import { statusBar } from "./tests/statusbar";
import { tasks } from "./tests/tasks";
import { extensions } from "./tests/extensions";
import { localization } from "./tests/localization";

describe('Smoke Test Suite', function () {
	dataMigration();
	dataLoss();
	explorer();
	configurationViews();
	search();
	css();
	javascript();
	javascriptDebug();
	test_git();
	integratedTerminal();
	statusBar();
	tasks();
	extensions();
	localization();
});