/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AiAgentEnvValue, AiAgentEnvVar } from '../../../chat/common/aiAgentEnv.js';
import { isWindows } from '../../../../base/common/platform.js';
import { DEFAULT_COPILOT_SKILL_CHAR_BUDGET } from '../../common/copilotCliConfig.js';

const HYDRAFUSION_ENV_KEYS = new Set(['HYDRAFUSION', 'HYDRAFUSION_ROLLOUT']);
const ENABLED_FEATURE_FLAGS_ENV_KEY = 'COPILOT_CLI_ENABLED_FEATURE_FLAGS';

export function createCopilotCliEnvironment(environment: NodeJS.ProcessEnv = process.env, omittedKeys: readonly string[] = [], claudeAdvisorEnabled = false, skillCharBudget = DEFAULT_COPILOT_SKILL_CHAR_BUDGET): Record<string, string | undefined> {
	const normalizedOmittedKeys = new Set(omittedKeys.map(key => isWindows ? key.toLowerCase() : key));
	const env: Record<string, string | undefined> = {};
	for (const [key, value] of Object.entries(environment)) {
		const normalizedKey = isWindows ? key.toUpperCase() : key;
		if (!normalizedOmittedKeys.has(isWindows ? key.toLowerCase() : key) && !HYDRAFUSION_ENV_KEYS.has(normalizedKey)) {
			env[key] = value;
		}
	}
	const enabledFeatureFlagsKey = Object.keys(env).find(key => (isWindows ? key.toUpperCase() : key) === ENABLED_FEATURE_FLAGS_ENV_KEY);
	if (enabledFeatureFlagsKey) {
		const enabledFeatureFlags = env[enabledFeatureFlagsKey]
			?.split(',')
			.map(flag => flag.trim())
			.filter(flag => flag.length > 0 && !HYDRAFUSION_ENV_KEYS.has(flag.toUpperCase()));
		if (enabledFeatureFlags?.length) {
			env[enabledFeatureFlagsKey] = enabledFeatureFlags.join(',');
		} else {
			delete env[enabledFeatureFlagsKey];
		}
	}
	env['ELECTRON_RUN_AS_NODE'] = '1';
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
	env['SKILL_CHAR_BUDGET'] = String(skillCharBudget);
	env['ANTHROPIC_ADVISOR'] = String(claudeAdvisorEnabled);
	return env;
}
