/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWindows } from '../../../../base/common/platform.js';
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
	// An inherited value would describe whichever process launched VS Code, so
	// every spelling is cleared before we optionally declare our own identity.
	// Windows treats environment variables case-insensitively while this copy is
	// a plain case-sensitive object, so an inherited `Copilot_Client_Info` would
	// otherwise survive alongside the canonical key and could win the
	// case-insensitive de-duplication that happens when the child is spawned.
	for (const key of Object.keys(env)) {
		if (key === CopilotClientInfoEnvVar || (isWindows && key.toLowerCase() === CopilotClientInfoEnvVar.toLowerCase())) {
			delete env[key];
		}
	}
	if (clientInfo) {
		env[CopilotClientInfoEnvVar] = JSON.stringify(clientInfo);
	}
	return env;
}
