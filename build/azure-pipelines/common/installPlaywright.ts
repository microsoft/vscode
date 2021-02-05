/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { retry } from './retry';
const { installBrowsersWithProgressBar } = require('playwright/lib/install/installer');
const playwrightPath = path.dirname(require.resolve('playwright'));

async function install() {
	await retry(() => installBrowsersWithProgressBar(playwrightPath));
}

install();
