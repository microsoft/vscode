/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDisposable } from '../../../../base/common/lifecycle.js';
import type { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import type { ILogService } from '../../../log/common/log.js';
import { AgentHostAcpAgentsConfigKey, platformRootSchema, type IAgentHostAcpAgentConfig } from '../../common/agentHostSchema.js';
import type { IAgentConfigurationService } from '../agentConfigurationService.js';
import type { IAgentHostProviderService } from '../agentHostProviderService.js';
import { AcpAgent, acpProviderId } from './acpAgent.js';

const ACP_AGENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

/**
 * Returns the well-formed entries of `chat.agentHost.acpAgents`, dropping
 * (and logging) malformed ones and later duplicates of an id.
 */
export function validateAcpAgentConfigs(value: unknown, logService: Pick<ILogService, 'warn'>): IAgentHostAcpAgentConfig[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const valid: IAgentHostAcpAgentConfig[] = [];
	const seen = new Set<string>();
	for (const entry of value as unknown[]) {
		const config = entry as Partial<IAgentHostAcpAgentConfig> | undefined;
		const id = config?.id;
		if (typeof id !== 'string' || !ACP_AGENT_ID_PATTERN.test(id)) {
			logService.warn(`[ACP] ignoring agent with invalid id ${JSON.stringify(id)}`);
			continue;
		}
		if (typeof config!.command !== 'string' || !config!.command.trim()) {
			logService.warn(`[ACP] ignoring agent "${id}" without a command`);
			continue;
		}
		if (config!.args !== undefined && !(Array.isArray(config!.args) && config!.args.every(a => typeof a === 'string'))) {
			logService.warn(`[ACP] ignoring agent "${id}": args must be strings`);
			continue;
		}
		if (config!.env !== undefined && !(typeof config!.env === 'object' && config!.env !== null && Object.values(config!.env).every(v => typeof v === 'string'))) {
			logService.warn(`[ACP] ignoring agent "${id}": env values must be strings`);
			continue;
		}
		if (seen.has(id)) {
			logService.warn(`[ACP] ignoring duplicate agent "${id}"`);
			continue;
		}
		seen.add(id);
		valid.push({
			id,
			command: config!.command,
			...(typeof config!.displayName === 'string' && config!.displayName ? { displayName: config!.displayName } : {}),
			...(config!.args ? { args: config!.args } : {}),
			...(config!.env ? { env: config!.env } : {}),
		});
	}
	return valid;
}

/**
 * Registers an {@link AcpAgent} for every configured ACP agent and for agents
 * added later. Registration is one-way like the Codex provider's: the provider
 * service cannot unregister, so removed or edited entries take effect on the
 * next agent host restart.
 */
export function registerConfiguredAcpAgents(
	providerService: Pick<IAgentHostProviderService, 'registerProvider' | 'getProvider'>,
	configurationService: Pick<IAgentConfigurationService, 'getRootValue' | 'onDidRootConfigChange'>,
	instantiationService: Pick<IInstantiationService, 'createInstance'>,
	logService: Pick<ILogService, 'info' | 'warn'>,
): IDisposable {
	const registered = new Set<string>();
	const registerNew = () => {
		const configs = validateAcpAgentConfigs(configurationService.getRootValue(platformRootSchema, AgentHostAcpAgentsConfigKey), logService);
		for (const config of configs) {
			const providerId = acpProviderId(config);
			if (registered.has(providerId)) {
				continue;
			}
			if (providerService.getProvider(providerId)) {
				logService.warn(`[ACP] provider id ${providerId} is already registered; ignoring agent "${config.id}"`);
				continue;
			}
			registered.add(providerId);
			providerService.registerProvider(instantiationService.createInstance(AcpAgent, config, undefined));
			logService.info(`[ACP] registered agent "${config.id}" as ${providerId}`);
		}
	};
	registerNew();
	return configurationService.onDidRootConfigChange(registerNew);
}
