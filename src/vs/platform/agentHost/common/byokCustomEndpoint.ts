/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { customEndpointUsesAzureApiKey, inferCustomEndpointApiType, isCustomEndpointApiType, resolveCustomEndpointUrl, type CustomEndpointApiType } from './customEndpointUrl.js';
import type { IByokEndpoint } from './byokModelSource.js';

/** The language model vendor of the Copilot extension's Custom Endpoint BYOK provider. */
export const CUSTOM_ENDPOINT_BYOK_VENDOR = 'customendpoint';

/** The literal a Custom Endpoint `requestHeaders` value uses to insert the group's API key. */
const API_KEY_TEMPLATE = '${apiKey}';

/** The settings of one Custom Endpoint model that the agent host's runtime needs to call it. */
export interface ICustomEndpointModelSettings {
	/** The model's `url`. */
	readonly url: string;
	/** The model's `apiType`, else its provider group's. */
	readonly apiType?: unknown;
	/** The model's `requestHeaders`. Values are only compared with the `${apiKey}` template, never copied. */
	readonly requestHeaders?: unknown;
	/** The model's `streaming` setting. */
	readonly streaming?: unknown;
	/** The model's `toolCalling` setting. */
	readonly toolCalling?: unknown;
	/** The model's `vision` setting. */
	readonly vision?: unknown;
	/** The model's `modelOptions`, which the extension applies to each request. */
	readonly modelOptions?: unknown;
	/** The model's `thinking` setting. */
	readonly thinking?: unknown;
	/** The model's `adaptiveThinking` setting, for Messages. */
	readonly adaptiveThinking?: unknown;
	/** The model's `minThinkingBudget` setting, for Messages. */
	readonly minThinkingBudget?: unknown;
	/** The model's `maxThinkingBudget` setting, for Messages. */
	readonly maxThinkingBudget?: unknown;
	/** The model's `reasoningEffortFormat`: how the extension sends the reasoning effort. */
	readonly reasoningEffortFormat?: unknown;
}

/** Why a Custom Endpoint model cannot be called by the runtime and keeps using the bridge. */
export type CustomEndpointBridgeReason =
	/** The `apiType` is not a known value. */
	| 'apiType'
	/** Streaming is turned off, and the runtime always streams. */
	| 'streaming'
	/** The model sets `modelOptions` (such as `temperature`), which the runtime cannot apply. */
	| 'modelOptions'
	/** The headers carry more than one auth header the runtime can send itself. */
	| 'requestHeaders'
	/** The URL is not a plain http(s) URL. */
	| 'url'
	/** The runtime would build a different request URL from the endpoint's path. */
	| 'apiPath'
	/** The URL has query parameters the runtime would drop. */
	| 'query'
	/**
	 * The extension's thinking settings differ from the runtime's: it sends no reasoning fields to a Responses
	 * model without `thinking`, and applies its own thinking settings to Messages models.
	 */
	| 'thinking'
	/** The reasoning effort is sent in another format than the runtime uses for the API. */
	| 'reasoningEffortFormat';

export type CustomEndpointRuntimeEndpointResolution =
	| { readonly endpoint: IByokEndpoint; readonly bridgeReason?: undefined }
	| { readonly endpoint?: undefined; readonly bridgeReason: CustomEndpointBridgeReason };

type CustomEndpointAuth = 'bearer' | 'azureApiKey' | 'anthropicApiKey';

/**
 * Finds the settings of the model `modelId` in a Custom Endpoint provider
 * group's raw configuration. Returns `undefined` for a model the group does not
 * declare in its `models` list, and for every model of a group with a `url`:
 * the extension then discovers the group's models at that URL and ignores the
 * URLs in `models`.
 */
export function findCustomEndpointModelSettings(group: { readonly [key: string]: unknown }, modelId: string): ICustomEndpointModelSettings | undefined {
	if (group.url || !Array.isArray(group.models)) {
		return undefined;
	}
	const model: unknown = group.models.find(candidate => isRecord(candidate) && candidate.id === modelId);
	if (!isRecord(model) || typeof model.url !== 'string') {
		return undefined;
	}
	return {
		url: model.url,
		apiType: model.apiType ?? group.apiType,
		requestHeaders: model.requestHeaders,
		streaming: model.streaming,
		toolCalling: model.toolCalling,
		vision: model.vision,
		modelOptions: model.modelOptions,
		thinking: model.thinking,
		adaptiveThinking: model.adaptiveThinking,
		minThinkingBudget: model.minThinkingBudget,
		maxThinkingBudget: model.maxThinkingBudget,
		reasoningEffortFormat: model.reasoningEffortFormat,
	};
}

/**
 * Maps a Custom Endpoint model to the runtime provider endpoint that sends the
 * same request: the URL the Copilot extension resolves, authenticated with the
 * header the extension would choose. A model the runtime cannot reach the same
 * way gets a {@link CustomEndpointBridgeReason} and stays on the bridge.
 */
export function resolveCustomEndpointRuntimeEndpoint(route: ICustomEndpointModelSettings): CustomEndpointRuntimeEndpointResolution {
	if (route.apiType !== undefined && !isCustomEndpointApiType(route.apiType)) {
		return { bridgeReason: 'apiType' };
	}
	if (route.streaming === false) {
		return { bridgeReason: 'streaming' };
	}
	if (route.modelOptions !== undefined && !(isRecord(route.modelOptions) && Object.keys(route.modelOptions).length === 0)) {
		return { bridgeReason: 'modelOptions' };
	}
	const url = resolveCustomEndpointUrl(route.url, route.apiType);
	const apiType = route.apiType ?? inferCustomEndpointApiType(url);
	if (route.reasoningEffortFormat !== undefined && route.reasoningEffortFormat !== apiType) {
		return { bridgeReason: 'reasoningEffortFormat' };
	}
	// The runtime always sends Responses reasoning fields, and decides Messages thinking from the model ID.
	if (apiType === 'responses' ? route.thinking !== true : apiType === 'messages' && (route.thinking === true || route.adaptiveThinking === true || route.minThinkingBudget !== undefined || route.maxThinkingBudget !== undefined)) {
		return { bridgeReason: 'thinking' };
	}
	const auth = resolveAuth(route.requestHeaders, apiType, url);
	if (!auth) {
		return { bridgeReason: 'requestHeaders' };
	}

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return { bridgeReason: 'url' };
	}
	if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || parsed.username || parsed.password || parsed.hash) {
		return { bridgeReason: 'url' };
	}

	// The paths the runtime appends to the base URL.
	const apiPath = apiType === 'messages' ? '/v1/messages' : apiType === 'responses' ? '/responses' : '/chat/completions';
	if (!parsed.pathname.endsWith(apiPath)) {
		return { bridgeReason: 'apiPath' };
	}
	const basePath = parsed.pathname.slice(0, -apiPath.length);
	const baseUrl = `${parsed.origin}${basePath}`;
	const wireApi = apiType === 'responses' ? 'responses' : 'completions';
	switch (auth) {
		case 'anthropicApiKey':
			return parsed.search ? { bridgeReason: 'query' } : { endpoint: { type: 'anthropic', baseUrl } };
		case 'bearer':
			return parsed.search ? { bridgeReason: 'query' } : { endpoint: { type: 'openai', wireApi, baseUrl } };
		case 'azureApiKey':
			return resolveAzureEndpoint(parsed, basePath, baseUrl, wireApi);
	}
}

/**
 * The auth header the extension sends: one named in `requestHeaders` whose
 * value is just the API key, else the default for the format and URL.
 * Other headers would have to carry the key in the runtime's `headers`, so
 * they are not supported.
 */
function resolveAuth(requestHeaders: unknown, apiType: CustomEndpointApiType, url: string): CustomEndpointAuth | undefined {
	const defaultAuth: CustomEndpointAuth = apiType === 'messages' ? 'anthropicApiKey' : customEndpointUsesAzureApiKey(url) ? 'azureApiKey' : 'bearer';
	if (requestHeaders === undefined) {
		return defaultAuth;
	}
	if (!isRecord(requestHeaders)) {
		return undefined;
	}
	const headers = Object.entries(requestHeaders);
	if (headers.length === 0) {
		return defaultAuth;
	}
	if (headers.length > 1) {
		return undefined;
	}
	const [name, value] = headers[0];
	const header = name.toLowerCase();
	if (apiType === 'messages') {
		return header === 'x-api-key' && value === API_KEY_TEMPLATE ? 'anthropicApiKey' : undefined;
	}
	if (header === 'api-key' && value === API_KEY_TEMPLATE) {
		return 'azureApiKey';
	}
	if (header === 'authorization' && value === `Bearer ${API_KEY_TEMPLATE}`) {
		return 'bearer';
	}
	return undefined;
}

/**
 * Azure OpenAI routes keep the base path verbatim only when it already has the
 * runtime's API root (`/openai` with an `api-version`, else `/openai/v1`), and a
 * versioned Chat Completions route names its deployment. The runtime rewrites
 * any other path, so those endpoints stay on the bridge.
 */
function resolveAzureEndpoint(parsed: URL, basePath: string, baseUrl: string, wireApi: 'completions' | 'responses'): CustomEndpointRuntimeEndpointResolution {
	const apiVersion = parsed.searchParams.get('api-version') || undefined;
	if (parsed.search && (!apiVersion || [...parsed.searchParams.keys()].some(key => key !== 'api-version') || parsed.searchParams.getAll('api-version').length > 1)) {
		return { bridgeReason: 'query' };
	}
	// The runtime decodes some escaped path segments before matching them.
	if (basePath.includes('%')) {
		return { bridgeReason: 'apiPath' };
	}
	const apiPath = withoutAzureProjectPrefix(basePath);
	if (!hasPathSegments(apiPath, apiVersion ? '/openai' : '/openai/v1')) {
		return { bridgeReason: 'apiPath' };
	}
	if (apiVersion && wireApi === 'completions' && !apiPath.includes('/openai/deployments/')) {
		return { bridgeReason: 'apiPath' };
	}
	return { endpoint: { type: 'azure', wireApi, baseUrl, ...(apiVersion ? { azureApiVersion: apiVersion } : {}) } };
}

/** An Azure AI Foundry project path (`/api/projects/<name>`) is a prefix, not part of the API path. */
function withoutAzureProjectPrefix(path: string): string {
	const marker = '/api/projects/';
	const index = path.indexOf(marker);
	if (index < 0) {
		return path;
	}
	const project = path.slice(index + marker.length);
	const slash = project.indexOf('/');
	return slash < 0 ? '' : project.slice(slash);
}

/** Whether `path` contains `segments` as whole path segments. */
function hasPathSegments(path: string, segments: string): boolean {
	return path.split(segments).slice(1).some(rest => rest === '' || rest.startsWith('/'));
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
