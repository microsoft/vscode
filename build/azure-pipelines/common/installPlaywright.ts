/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

process.env.DEBUG='pw:install'; // enable logging for this (https://github.com/microsoft/playwright/issues/17394)

import { retry } from './retry';
const { installDefaultBrowsersForNpmInstall } = require('playwright-core/lib/server');

async function install() {
	await retry(() => installDefaultBrowsersForNpmInstall());
}

install();
