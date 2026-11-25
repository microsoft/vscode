/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { resolveCustomEndpointRuntimeEndpoint, type CustomEndpointRuntimeEndpointResolution, type ICustomEndpointModelSettings } from './byokCustomEndpoint.js';
import type { IByokEndpoint } from './byokModelSource.js';

/*
 * The endpoints of the Copilot extension's other BYOK vendors. The runtime
 * calls each in the API format the vendor's provider in the extension uses,
 * with its own request settings: Custom Endpoint-style vendors mirror their
 * provider's URL rules and reuse the Custom Endpoint resolver for the auth
 * header, and the others call the vendor's public API.
 */

/** The OpenAI API. */
const OPENAI_BYOK_BASE_URL = 'https://api.openai.com/v1';

/**
 * The OpenAI API for a model. The extension calls every model with Responses,
 * but leaves out the encrypted reasoning a model without reasoning rejects,
 * which the runtime always asks Responses for. Those models are called with
 * Chat Completions instead, which the API serves for them too.
 */
export function getOpenAIByokEndpoint(reasoning: boolean): IByokEndpoint {
	return { type: 'openai', wireApi: reasoning ? 'responses' : 'completions', baseUrl: OPENAI_BYOK_BASE_URL };
}

/** The Anthropic API, which the extension calls with Messages. */
export const ANTHROPIC_BYOK_ENDPOINT: IByokEndpoint = { type: 'anthropic', baseUrl: 'https://api.anthropic.com' };

/** The Gemini API, which the runtime calls with the Interactions API rather than the extension's `generateContent`. */
export const GEMINI_BYOK_ENDPOINT: IByokEndpoint = { type: 'google', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' };

/** The id the Gemini API is called with, without the `models/` prefix of its model names. */
export function getGeminiByokModelId(modelId: string): string {
	return modelId.startsWith('models/') ? modelId.slice('models/'.length) : modelId;
}

/** The xAI API, which the extension calls with Chat Completions. */
export const XAI_BYOK_ENDPOINT: IByokEndpoint = { type: 'openai', wireApi: 'completions', baseUrl: 'https://api.x.ai/v1' };

/** The OpenRouter API, which the extension calls with Chat Completions for all but Anthropic models. */
export const OPENROUTER_BYOK_ENDPOINT: IByokEndpoint = { type: 'openai', wireApi: 'completions', baseUrl: 'https://openrouter.ai/api/v1' };

/** The extension's default Ollama server. */
const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

/** The Ollama server of a provider group with `url`, which the extension calls with Chat Completions and no key. */
export function getOllamaByokEndpoint(url: unknown): IByokEndpoint {
	// The extension appends the API path without trimming a trailing slash.
	return { type: 'openai', wireApi: 'completions', baseUrl: `${typeof url === 'string' && url ? url : DEFAULT_OLLAMA_URL}/v1` };
}

/**
 * The runtime endpoint of a Custom OpenAI Compatible model. Its provider has no
 * `apiType` and no key template: it picks Responses from the URL, and sends
 * `requestHeaders` as extra headers, which the runtime can't.
 */
export function resolveCustomOAIRuntimeEndpoint(settings: ICustomEndpointModelSettings): CustomEndpointRuntimeEndpointResolution {
	if (isNonEmptyRecord(settings.requestHeaders)) {
		return { bridgeReason: 'requestHeaders' };
	}
	// The provider doesn't treat `/messages` as an API path, so it sends Chat Completions to a different URL.
	if (settings.url.includes('/messages')) {
		return { bridgeReason: 'apiPath' };
	}
	return resolveCustomEndpointRuntimeEndpoint({ ...settings, apiType: undefined, requestHeaders: undefined });
}

/**
 * The runtime endpoint of an Azure model, from the URL the extension's Azure
 * provider resolves: an Azure OpenAI deployment, an Azure AI model inference
 * endpoint, or a URL naming its API path.
 */
export function resolveAzureRuntimeEndpoint(modelId: string, settings: ICustomEndpointModelSettings): CustomEndpointRuntimeEndpointResolution {
	if (isNonEmptyRecord(settings.requestHeaders)) {
		return { bridgeReason: 'requestHeaders' };
	}
	const url = resolveAzureUrl(modelId, settings.url);
	if (!url) {
		return { bridgeReason: 'url' };
	}
	return resolveCustomEndpointRuntimeEndpoint({ ...settings, url, apiType: undefined, requestHeaders: undefined });
}

function resolveAzureUrl(modelId: string, url: string): string | undefined {
	if (url.includes('/messages')) {
		return undefined;
	}
	if (url.includes('/responses') || url.includes('/chat/completions')) {
		return url;
	}
	if (url.endsWith('/')) {
		url = url.slice(0, -1);
	}
	if (url.endsWith('/v1')) {
		url = url.slice(0, -3);
	}
	if (url.includes('models.ai.azure.com') || url.includes('inference.ml.azure.com')) {
		return `${url}/v1/chat/completions`;
	}
	if (url.includes('openai.azure.com')) {
		return `${url}/openai/deployments/${modelId}/chat/completions?api-version=2025-01-01-preview`;
	}
	return undefined;
}

function isNonEmptyRecord(value: unknown): boolean {
	return typeof value === 'object' && value !== null && Object.keys(value).length > 0;
}
