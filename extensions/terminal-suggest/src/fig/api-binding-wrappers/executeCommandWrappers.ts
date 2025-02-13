/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { executeCommandTimeout } from './executeCommand';

export const executeCommand: Fig.ExecuteCommandFunction = (args) =>
	executeCommandTimeout(args);
