/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { testGlobals } from './testGlobals.js';

const { getProcessList, getProcessCpuUsage, getProcessTree } = testGlobals['@vscode/windows-process-tree'];

export { getProcessList, getProcessCpuUsage, getProcessTree };
