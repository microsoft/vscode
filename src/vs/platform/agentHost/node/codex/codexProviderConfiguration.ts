/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join, resolve } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { CODEX_AGENT_PROVIDER_ID } from '../../common/agent.js';
import type { IAgentCustomizationSettingsRegistration } from '../../common/agentCustomizationSettings.js';
import { type ICodexAppServerClient, JsonRpcError } from './codexAppServerClient.js';
import type { JsonValue } from './protocol/generated/serde_json/JsonValue.js';
import type { ConfigReadResponse } from './protocol/generated/v2/ConfigReadResponse.js';
import type { ConfigWriteResponse } from './protocol/generated/v2/ConfigWriteResponse.js';

export function createCodexProviderConfiguration(userHome: URI, codexHome?: string): IAgentCustomizationSettingsRegistration {
	return {
		provider: CODEX_AGENT_PROVIDER_ID,
		title: localize('codex.configuration.title', "Codex"),
		description: localize('codex.configuration.description', "Configure Codex defaults stored in config.toml. Project and managed configuration can override these user values."),
		properties: {
			'codex.personality': { type: 'string', title: localize('codex.configuration.personality', "Personality"), description: localize('codex.configuration.personality.description', "Controls the default communication style for Codex. Default leaves personality unset in config.toml."), default: 'default', enum: ['default', 'friendly', 'pragmatic'], enumLabels: [localize('codex.configuration.personality.default', "Default"), localize('codex.configuration.personality.friendly', "Friendly"), localize('codex.configuration.personality.pragmatic', "Pragmatic")] },
			'codex.autoReviewPolicy': { type: 'string', title: localize('codex.configuration.autoReviewPolicy', "Auto-review policy"), description: localize('codex.configuration.autoReviewPolicy.description', "Updates auto_review.policy in config.toml. Leave empty to remove the auto_review section."), default: '' },
		},
		settings: [
			{ key: 'codex.personality', group: localize('codex.configuration.personalization', "Personalization") },
			{ key: 'codex.autoReviewPolicy', group: localize('codex.configuration.review', "Review policy"), kind: 'multiline', saveLabel: localize('codex.configuration.review.save', "Save Policy") },
		],
		configurationFile: {
			resource: URI.file(join(codexHome ? resolve(process.cwd(), codexHome) : join(userHome.fsPath, '.codex'), 'config.toml')).toString(),
			title: localize('codex.configuration.file.title', "Advanced configuration"),
			description: localize('codex.configuration.file.description', "Open the Codex configuration file to customize additional agent behavior."),
			openLabel: localize('codex.configuration.file.open', "Open config.toml"),
			documentationUrl: 'https://learn.chatgpt.com/docs/config-file/config-basic',
			documentationLabel: localize('codex.configuration.file.docs', "Codex configuration documentation"),
		},
	};
}

export async function ensurePortableCodexProxyProvider(client: Pick<ICodexAppServerClient, 'request'>): Promise<void> {
	for (let attempt = 0; ; attempt++) {
		const response = await client.request<'config/read', ConfigReadResponse>('config/read', { includeLayers: true });
		const userLayer = response.layers?.find(layer => layer.name.type === 'user' && layer.name.profile === null);
		if (!userLayer || !userLayer.version || userLayer.disabledReason || !isConfigurationObject(userLayer.config)) {
			throw new Error(localize('codex.configuration.portableProvider.unavailable', "Cannot switch this ChatGPT conversation to Copilot because the Codex user configuration could not be read safely. The original conversation has not been changed."));
		}
		const providers = userLayer.config.model_providers;
		const provider = isConfigurationObject(providers) ? providers['vscode-proxy'] : undefined;
		const hasConflictingLayer = response.layers?.some(layer => {
			if (layer.disabledReason || layer.name.type === 'sessionFlags' || !isConfigurationObject(layer.config)) {
				return false;
			}
			const layerProviders = layer.config.model_providers;
			const layerProvider = isConfigurationObject(layerProviders) ? layerProviders['vscode-proxy'] : undefined;
			return layerProvider !== undefined && !isPortableCodexProxyProvider(layerProvider, true);
		});
		if (hasConflictingLayer || (providers !== undefined && !isConfigurationObject(providers)) || (provider !== undefined && !isPortableCodexProxyProvider(provider))) {
			throw new Error(localize('codex.configuration.portableProvider.conflict', "Cannot switch this ChatGPT conversation to Copilot because the Codex configuration already defines an incompatible 'model_providers.vscode-proxy'. Update that definition to use native OpenAI authentication before retrying. The existing configuration and original conversation have not been changed."));
		}
		if (provider !== undefined) {
			return;
		}
		try {
			await client.request<'config/batchWrite', ConfigWriteResponse>('config/batchWrite', {
				edits: [{
					keyPath: 'model_providers.vscode-proxy',
					value: { name: 'OpenAI', wire_api: 'responses', requires_openai_auth: true },
					mergeStrategy: 'replace',
				}],
				expectedVersion: userLayer.version,
				reloadUserConfig: false,
			});
			return;
		} catch (error) {
			if (attempt < 2 && error instanceof JsonRpcError && error.data && typeof error.data === 'object'
				&& (error.data as { config_write_error_code?: string }).config_write_error_code === 'configVersionConflict') {
				continue;
			}
			throw error;
		}
	}
}

function isConfigurationObject(value: JsonValue | undefined): value is { [key: string]: JsonValue | undefined } {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPortableCodexProxyProvider(provider: JsonValue, allowPartial = false): boolean {
	return isConfigurationObject(provider)
		&& (provider.name === 'OpenAI' || (allowPartial && provider.name === undefined))
		&& (provider.wire_api === undefined || provider.wire_api === 'responses')
		&& (provider.requires_openai_auth === true || (allowPartial && provider.requires_openai_auth === undefined))
		&& ['base_url', 'env_key', 'experimental_bearer_token', 'auth', 'http_headers', 'env_http_headers', 'query_params'].every(key => provider[key] === undefined);
}
