/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from '../../../base/common/path.js';
import { IProcessEnvironment } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const ICopilotHomeService = createDecorator<ICopilotHomeService>('copilotHomeService');

/** The resolved Copilot home for this execution environment. */
export interface ICopilotHomeService {
	readonly _serviceBrand: undefined;
	readonly home: URI;
	readonly source: 'environment' | 'userHome';
}

export function getCopilotHomePath(userHomePath: string, environment: IProcessEnvironment): string {
	return environment.COPILOT_HOME || join(userHomePath, '.copilot');
}

export function getCopilotMcpConfigurationPath(userHomePath: string, environment: IProcessEnvironment): string {
	return join(getCopilotHomePath(userHomePath, environment), 'mcp-config.json');
}

export function getCopilotRootPaths(userHomePath: string, copilotHomePath: string): string[] {
	return [...new Set([
		copilotHomePath,
		join(userHomePath, '.copilot'),
	])];
}
