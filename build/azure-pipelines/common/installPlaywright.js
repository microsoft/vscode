"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
process.env.DEBUG = 'pw:install'; // enable logging for this (https://github.com/microsoft/playwright/issues/17394)
const { installDefaultBrowsersForNpmInstall } = require('playwright-core/lib/server');
async function install() {
    await installDefaultBrowsersForNpmInstall();
}
install();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zdGFsbFBsYXl3cmlnaHQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbnN0YWxsUGxheXdyaWdodC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUMsWUFBWSxDQUFDLENBQUMsaUZBQWlGO0FBRWpILE1BQU0sRUFBRSxtQ0FBbUMsRUFBRSxHQUFHLE9BQU8sQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO0FBRXRGLEtBQUssVUFBVSxPQUFPO0lBQ3JCLE1BQU0sbUNBQW1DLEVBQUUsQ0FBQztBQUM3QyxDQUFDO0FBRUQsT0FBTyxFQUFFLENBQUMifQ==