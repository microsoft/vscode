"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const retry_1 = require("./retry");
const { installBrowsersWithProgressBar } = require('playwright/lib/install/installer');
async function install() {
    await retry_1.retry(() => installBrowsersWithProgressBar());
}
install();
