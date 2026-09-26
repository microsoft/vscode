/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
"use strict";
process.env.DEBUG = 'pw:install'; // enable logging for this (https://github.com/microsoft/playwright/issues/17394)
const { registry: { installBrowsersForNpmInstall, registry } } = require('playwright-core/lib/coreBundle');
async function install() {
	await installBrowsersForNpmInstall(registry.defaultExecutables().map(executable => executable.name));
}
install();
//# sourceMappingURL=installPlaywright.js.map
