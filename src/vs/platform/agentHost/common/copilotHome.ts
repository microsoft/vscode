/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from '../../../base/common/path.js';
import { IProcessEnvironment } from '../../../base/common/platform.js';

export function getCopilotHomePath(userHomePath: string, environment: IProcessEnvironment): string {
	return environment['COPILOT_HOME'] || join(userHomePath, '.copilot');
}

export function getCopilotRootPaths(userHomePath: string, environment: IProcessEnvironment): string[] {
	return [...new Set([
		getCopilotHomePath(userHomePath, environment),
		join(userHomePath, '.copilot'),
	])];
}
