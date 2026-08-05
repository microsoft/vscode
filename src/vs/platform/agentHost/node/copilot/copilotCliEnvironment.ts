/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AiAgentEnvValue, AiAgentEnvVar } from '../../../chat/common/aiAgentEnv.js';

export function createCopilotCliEnvironment(environment: NodeJS.ProcessEnv = process.env): Record<string, string | undefined> {
	const env: Record<string, string | undefined> = Object.assign({}, environment, { ELECTRON_RUN_AS_NODE: '1' });
	delete env['NODE_OPTIONS'];
	delete env['VSCODE_INSPECTOR_OPTIONS'];
	delete env['VSCODE_ESM_ENTRYPOINT'];
	delete env['VSCODE_HANDLES_UNCAUGHT_ERRORS'];
	for (const key of Object.keys(env)) {
		if (key === 'ELECTRON_RUN_AS_NODE' || key === 'VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE') {
			continue;
		}
		if (key.startsWith('VSCODE_') || key.startsWith('ELECTRON_')) {
			delete env[key];
		}
	}
	env['COPILOT_CLI_RUN_AS_NODE'] = '1';
	env['USE_BUILTIN_RIPGREP'] = 'false';
	env['COPILOT_MCP_APPS'] = 'true';
	env[AiAgentEnvVar] = AiAgentEnvValue;
	env['AUTO_APPROVAL'] = 'true';
	return env;
}
