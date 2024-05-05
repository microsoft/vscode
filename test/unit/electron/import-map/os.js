/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { testGlobals } from './testGlobals.js';

const { tmpdir, networkInterfaces, homedir, userInfo, release, hostname } = testGlobals.os;

export { homedir, hostname, networkInterfaces, release, tmpdir, userInfo };
