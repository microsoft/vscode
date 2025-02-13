/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { executeCommandTimeout } from './executeCommand';

export const executeCommand: Fig.ExecuteCommandFunction = (args) =>
	executeCommandTimeout(args);
