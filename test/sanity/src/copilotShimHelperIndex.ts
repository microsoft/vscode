/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Mocha from 'mocha';
import { fileURLToPath } from 'url';

const mocha = new Mocha({ color: true, retries: 0 });
mocha.addFile(fileURLToPath(new URL('./copilotShimHelper.test.js', import.meta.url)));
await mocha.loadFilesAsync();
mocha.run(failures => {
	process.exitCode = failures > 0 ? 1 : 0;
});
