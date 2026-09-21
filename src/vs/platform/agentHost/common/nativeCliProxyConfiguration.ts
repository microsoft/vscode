/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INativeCliProxyConfiguration, NativeCliProxyKind } from './nativeCliProxy.js';

export function getNativeCliProxyEnvironment(kind: NativeCliProxyKind, configuration: INativeCliProxyConfiguration): Record<string, string | null> {
	if (kind === 'codex') {
		return { VSCODE_CLI_PROXY_TOKEN: configuration.token };
	}
	const modelForFamily = (family: string) => configuration.models?.find(model => model.id.startsWith(`claude-${family}-`))?.id;
	return {
		ANTHROPIC_BASE_URL: configuration.baseUrl,
		ANTHROPIC_AUTH_TOKEN: configuration.token,
		ANTHROPIC_API_KEY: '',
		CLAUDE_CODE_OAUTH_TOKEN: '',
		CLAUDE_CODE_USE_BEDROCK: '0',
		CLAUDE_CODE_USE_VERTEX: '0',
		CLAUDE_CODE_USE_FOUNDRY: '0',
		CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
		ANTHROPIC_DEFAULT_SONNET_MODEL: modelForFamily('sonnet') ?? '',
		ANTHROPIC_DEFAULT_OPUS_MODEL: modelForFamily('opus') ?? '',
		ANTHROPIC_DEFAULT_HAIKU_MODEL: modelForFamily('haiku') ?? '',
		ANTHROPIC_SMALL_FAST_MODEL: modelForFamily('haiku') ?? configuration.model,
	};
}

export function getNativeCliProxyArguments(kind: NativeCliProxyKind, configuration: INativeCliProxyConfiguration, useDefaultModel = true): string[] {
	const modelArgs = useDefaultModel ? ['--model', configuration.model] : [];
	if (kind === 'claude') {
		if (!configuration.settingsFile) {
			throw new Error('Claude proxy configuration is missing its private settings file');
		}
		return [...modelArgs, '--settings', configuration.settingsFile];
	}
	const provider = `{ name = "GitHub Copilot", base_url = ${JSON.stringify(`${configuration.baseUrl}/v1`)}, wire_api = "responses", env_key = "VSCODE_CLI_PROXY_TOKEN", requires_openai_auth = false, supports_websockets = false }`;
	return [
		...modelArgs,
		'-c', 'model_provider="vscode-copilot"',
		'-c', `model_providers.vscode-copilot=${provider}`,
	];
}
