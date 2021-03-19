"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const retry_1 = require("./retry");
const { installBrowsersWithProgressBar } = require('playwright/lib/install/installer');
const playwrightPath = path.dirname(require.resolve('playwright'));
async function install() {
    await retry_1.retry(() => installBrowsersWithProgressBar(playwrightPath));
}
install();
