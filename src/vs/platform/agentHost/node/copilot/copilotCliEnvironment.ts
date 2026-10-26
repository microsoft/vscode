/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AiAgentEnvValue, AiAgentEnvVar } from '../../../chat/common/aiAgentEnv.js';
import { isWindows } from '../../../../base/common/platform.js';
import { DEFAULT_COPILOT_EXECUTION_SUBAGENT_MODEL, DEFAULT_COPILOT_SKILL_CHAR_BUDGET } from '../../common/copilotCliConfig.js';
import { DynamicAutoTiersFeatureFlag } from '../../common/autoModeTiers.js';

const HYDRAFUSION_ENV_KEYS = new Set(['HYDRAFUSION', 'HYDRAFUSION_ROLLOUT', 'HYDRAFUSION_PLAN_V2', 'HYDRAFUSION_STICKY_ROOT']);
/** Copilot CLI runtime flags that would make it declare on-device models to Auto and start its own `llama-server`; VS Code serves them itself, so they are forced off. */
const RUNTIME_LOCAL_MODEL_FLAG_KEYS = ['AUTO_LOCAL_ROUTING', 'WINML_LOCAL_MODELS'] as const;
/** An environment declaration of on-device Auto models the Copilot CLI runtime reads; never inherited. */
const RUNTIME_LOCAL_MODELS_ENV_KEY = 'COPILOT_LOCAL_MODELS';
/** Dynamic Auto tiers decide what Auto offers, so only `chat.copilot.dynamicAutoTiers.enabled` may turn them on. */
const RUNTIME_DYNAMIC_AUTO_TIERS_KEYS = [DynamicAutoTiersFeatureFlag] as const;
const STRIPPED_ENV_KEYS = new Set<string>([...HYDRAFUSION_ENV_KEYS, ...RUNTIME_LOCAL_MODEL_FLAG_KEYS, ...RUNTIME_DYNAMIC_AUTO_TIERS_KEYS, RUNTIME_LOCAL_MODELS_ENV_KEY]);
const STRIPPED_FEATURE_FLAGS = new Set<string>([...HYDRAFUSION_ENV_KEYS, ...RUNTIME_LOCAL_MODEL_FLAG_KEYS, ...RUNTIME_DYNAMIC_AUTO_TIERS_KEYS]);
const ENABLED_FEATURE_FLAGS_ENV_KEY = 'COPILOT_CLI_ENABLED_FEATURE_FLAGS';
const EXECUTION_SUBAGENT_ENV_KEYS = new Set([
	'COPILOT_EXP_COPILOT_CLI_EXECUTION_SUBAGENT',
	'COPILOT_EXP_COPILOT_CLI_EXECUTION_SUBAGENT_MODEL',
	'EXECUTION_SUBAGENT_MODEL',
]);

export function createCopilotCliEnvironment(environment: NodeJS.ProcessEnv = process.env, omittedKeys: readonly string[] = [], claudeAdvisorEnabled = false, skillCharBudget = DEFAULT_COPILOT_SKILL_CHAR_BUDGET, searchSubagentModel = '', omitAmbientAuthentication = false, executionSubagent: { enabled: boolean; model: string } = { enabled: false, model: DEFAULT_COPILOT_EXECUTION_SUBAGENT_MODEL }): Record<string, string | undefined> {
	const normalizedOmittedKeys = new Set([...omittedKeys, 'SEARCH_SUBAGENT_MODEL'].map(key => isWindows ? key.toLowerCase() : key));
	const env: Record<string, string | undefined> = {};
	for (const [key, value] of Object.entries(environment)) {
		const normalizedKey = isWindows ? key.toUpperCase() : key;
		if (!normalizedOmittedKeys.has(isWindows ? key.toLowerCase() : key) && !STRIPPED_ENV_KEYS.has(normalizedKey) && !EXECUTION_SUBAGENT_ENV_KEYS.has(normalizedKey)
			&& (!omitAmbientAuthentication || /^GIT_CONFIG_/i.test(key) || !/(?:TOKEN|_KEY|SECRET|PASSWORD)|^(?:COPILOT_|GITHUB_|GH_|ANTHROPIC_|OPENAI_|AZURE_OPENAI_|VSCODE_AGENT_HOST_CAPI_)/i.test(key))) {
			env[key] = value;
		}
	}
	const enabledFeatureFlagsKey = Object.keys(env).find(key => (isWindows ? key.toUpperCase() : key) === ENABLED_FEATURE_FLAGS_ENV_KEY);
	if (enabledFeatureFlagsKey) {
		const enabledFeatureFlags = env[enabledFeatureFlagsKey]
			?.split(',')
			.map(flag => flag.trim())
			.filter(flag => flag.length > 0 && !STRIPPED_FEATURE_FLAGS.has(flag.toUpperCase()));
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
	if (searchSubagentModel) {
		env['SEARCH_SUBAGENT_MODEL'] = searchSubagentModel;
	}
	// Supply VS Code's defaults through ExP, so runtime assignments can override
	// either setting. Do not inherit the direct model override, which bypasses ExP.
	env['COPILOT_EXP_COPILOT_CLI_EXECUTION_SUBAGENT'] = String(executionSubagent.enabled);
	const executionSubagentModel = executionSubagent.model.trim();
	env['COPILOT_EXP_COPILOT_CLI_EXECUTION_SUBAGENT_MODEL'] = executionSubagentModel || 'null';
	for (const flag of RUNTIME_LOCAL_MODEL_FLAG_KEYS) {
		env[flag] = 'false';
	}
	return env;
}

/** Temporary host-tool lookup workaround pending the planned upstream fix in https://github.com/microsoft/mxc/issues/1545; remove once the bundled runtime includes it.
 * Applies to the CLI subprocess and its children, not the agent host's environment.
 */
export function addCopilotSandboxPath(env: Record<string, string | undefined>, platform: NodeJS.Platform = process.platform): void {
	if (platform !== 'linux') {
		return;
	}

	const directories = env['PATH'] ? env['PATH'].split(':') : [];
	for (const directory of ['/usr/local/sbin', '/usr/local/bin', '/usr/sbin', '/usr/bin', '/sbin', '/bin']) {
		if (!directories.includes(directory)) {
			directories.push(directory);
		}
	}
	env['PATH'] = directories.join(':');
}

/** The SDK's default WebSocket forwarder drops `Authorization`, so while the on-device handler is installed the runtime uses HTTP Responses for CAPI; otherwise nothing changes. */
export function setLocalModelRequestHandlerEnvironment(env: Record<string, string | undefined>, requestHandlerInstalled: boolean): void {
	if (requestHandlerInstalled) {
		env['COPILOT_CLI_DISABLE_WEBSOCKET_RESPONSES'] = 'true';
	}
}
