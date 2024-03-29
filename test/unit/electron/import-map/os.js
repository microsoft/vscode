/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { os } from './testGlobals.js'

const { tmpdir, networkInterfaces, homedir, userInfo, release, hostname } = os

export { tmpdir, networkInterfaces, homedir, userInfo, release, hostname }
