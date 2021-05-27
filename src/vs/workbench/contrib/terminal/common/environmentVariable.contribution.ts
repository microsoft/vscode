/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EnvironmentVariableService } from 'vs/workbench/contrib/terminal/common/environmentVariableService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IEnvironmentVariableService } from 'vs/workbench/contrib/terminal/common/environmentVariable';

registerSingleton(IEnvironmentVariableService, EnvironmentVariableService, true);
