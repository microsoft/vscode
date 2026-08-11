/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AiAgentEnvValue, AiAgentEnvVar } from '../../../chat/common/aiAgentEnv.js';

/**
 * Identity of the surface spawning the CLI, so its GitHub telemetry attributes
 * every client-identifier field to VS Code rather than pairing our name with
 * the CLI's own versions.
 */
export interface ICopilotCliClientInfo {
	/** Host editor product name, emitted as part of `editor_version`. */
	readonly editorName: string;
	/** Host editor version, emitted as part of `editor_version`. */
	readonly editorVersion: string;
	/** Copilot surface within the host, emitted as `common_extname`. */
	readonly extensionName: string;
	/** Version of that surface, emitted as `common_extversion`. */
	readonly extensionVersion: string;
}

/**
 * Environment variable the CLI reads its telemetry attribution from. Passing it
 * through the environment (rather than the SDK handshake) keeps this working
 * with any `@github/copilot-sdk` version, since we already own the child env.
 */
export const CopilotClientInfoEnvVar = 'COPILOT_CLIENT_INFO';

export function createCopilotCliEnvironment(environment: NodeJS.ProcessEnv = process.env, clientInfo?: ICopilotCliClientInfo): Record<string, string | undefined> {
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
	// Inherited values would describe whichever process launched VS Code, so the
	// variable is always set from our own identity and otherwise cleared.
	if (clientInfo) {
		env[CopilotClientInfoEnvVar] = JSON.stringify(clientInfo);
	} else {
		delete env[CopilotClientInfoEnvVar];
	}
	return env;
}
