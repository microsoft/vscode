/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { customEndpointUsesAzureApiKey, inferCustomEndpointApiType, isCustomEndpointApiType, resolveCustomEndpointUrl, type CustomEndpointApiType } from './customEndpointUrl.js';
import type { ProtectedResourceMetadata } from './state/protocol/state.js';

/** The language model vendor of the Copilot extension's Custom Endpoint BYOK provider. */
export const CUSTOM_ENDPOINT_BYOK_VENDOR = 'customendpoint';

/** The literal a Custom Endpoint `requestHeaders` value uses to insert the group's API key. */
const API_KEY_TEMPLATE = '${apiKey}';

/**
 * A runtime provider endpoint that sends a Custom Endpoint model's requests:
 * the provider `type`, wire format, and base URL the runtime appends the API
 * path to. The runtime chooses the auth header from `type`.
 */
export interface ICustomEndpointRuntimeEndpoint {
	readonly type: 'openai' | 'azure' | 'anthropic';
	/** For `openai` and `azure`: whether requests use Chat Completions or Responses. */
	readonly wireApi?: 'completions' | 'responses';
	readonly baseUrl: string;
	/** For `azure`: the `api-version` query parameter the runtime adds. */
	readonly azureApiVersion?: string;
}

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
	| 'query';

export type CustomEndpointRuntimeEndpointResolution =
	| { readonly endpoint: ICustomEndpointRuntimeEndpoint; readonly bridgeReason?: undefined }
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

// #region Model source definition

/**
 * The definition format of a Custom Endpoint provider group registered with an
 * agent host as a model source (see {@link CustomEndpointModelSourceDefinition}).
 */
export const CUSTOM_ENDPOINT_MODEL_SOURCE_FORMAT = 'code.visualstudio.com/custom-endpoint@1';

/** A Custom Endpoint model in a {@link CustomEndpointModelSourceDefinition}. */
export type CustomEndpointModelSourceModel = {
	/** The model id the endpoint is called with. */
	readonly id: string;
	readonly name?: string;
	/** The model's `url`, as configured. */
	readonly url: string;
	/** The model's `apiType`, else its group's. */
	readonly apiType?: CustomEndpointApiType;
	/** The model's `requestHeaders`, which only name the header that carries the API key. */
	readonly requestHeaders?: { readonly [name: string]: string };
	readonly toolCalling?: boolean;
	/** Whether the model accepts images. Absent when unknown. */
	readonly vision?: boolean;
	readonly maxInputTokens?: number;
	readonly maxOutputTokens?: number;
	readonly maxContextWindowTokens?: number;
	readonly reasoningEfforts?: readonly string[];
	readonly defaultReasoningEffort?: string;
};

/**
 * A Custom Endpoint provider group, in {@link CUSTOM_ENDPOINT_MODEL_SOURCE_FORMAT}:
 * the models the runtime can call the same way the Copilot extension does. It
 * never contains the group's API key, which a client delivers separately.
 */
export type CustomEndpointModelSourceDefinition = {
	readonly models: readonly CustomEndpointModelSourceModel[];
	/** Whether requests carry the group's API key. */
	readonly requiresApiKey: boolean;
};

/** A {@link CustomEndpointModelSourceModel} and the runtime endpoint that serves it. */
export interface ICustomEndpointModelSourceEndpoint {
	readonly model: CustomEndpointModelSourceModel;
	readonly endpoint: ICustomEndpointRuntimeEndpoint;
}

/** The model details a Custom Endpoint model source carries beyond its group's settings. */
export interface ICustomEndpointModelSourceModelInfo {
	readonly name?: string;
	readonly maxInputTokens?: number;
	readonly maxOutputTokens?: number;
	readonly maxContextWindowTokens?: number;
	readonly reasoningEfforts?: readonly string[];
	readonly defaultReasoningEffort?: string;
}

/**
 * The model source entry of the Custom Endpoint model `id`, or why the runtime
 * can't call it the way the Copilot extension does.
 */
export function toCustomEndpointModelSourceModel(id: string, settings: ICustomEndpointModelSettings, info: ICustomEndpointModelSourceModelInfo): { readonly model: CustomEndpointModelSourceModel; readonly bridgeReason?: undefined } | { readonly model?: undefined; readonly bridgeReason: CustomEndpointBridgeReason } {
	const resolution = resolveCustomEndpointRuntimeEndpoint(settings);
	if (resolution.bridgeReason) {
		return { bridgeReason: resolution.bridgeReason };
	}
	const requestHeaders = isRecord(settings.requestHeaders) && Object.keys(settings.requestHeaders).length
		? Object.fromEntries(Object.entries(settings.requestHeaders).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
		: undefined;
	return {
		model: {
			id,
			...(info.name !== undefined ? { name: info.name } : {}),
			url: settings.url,
			...(isCustomEndpointApiType(settings.apiType) ? { apiType: settings.apiType } : {}),
			...(requestHeaders ? { requestHeaders } : {}),
			...(typeof settings.toolCalling === 'boolean' ? { toolCalling: settings.toolCalling } : {}),
			...(typeof settings.vision === 'boolean' ? { vision: settings.vision } : {}),
			...(info.maxInputTokens !== undefined ? { maxInputTokens: info.maxInputTokens } : {}),
			...(info.maxOutputTokens !== undefined ? { maxOutputTokens: info.maxOutputTokens } : {}),
			...(info.maxContextWindowTokens !== undefined ? { maxContextWindowTokens: info.maxContextWindowTokens } : {}),
			...(info.reasoningEfforts?.length ? { reasoningEfforts: [...info.reasoningEfforts] } : {}),
			...(info.defaultReasoningEffort !== undefined ? { defaultReasoningEffort: info.defaultReasoningEffort } : {}),
		},
	};
}

/**
 * Reads a {@link CustomEndpointModelSourceDefinition} and maps each model to its
 * runtime endpoint. Throws, with a message for the user, when the definition is
 * malformed or names a model the runtime can't call the way the extension does.
 */
export function readCustomEndpointModelSource(definition: unknown): { readonly models: readonly ICustomEndpointModelSourceEndpoint[]; readonly requiresApiKey: boolean } {
	if (!isRecord(definition) || !Array.isArray(definition.models) || definition.models.length === 0 || typeof definition.requiresApiKey !== 'boolean') {
		throw new Error(localize('customEndpointModelSource.invalid', "The Custom Endpoint model source definition is not valid."));
	}
	const models: ICustomEndpointModelSourceEndpoint[] = [];
	const ids = new Set<string>();
	for (const candidate of definition.models) {
		const model = readModelSourceModel(candidate);
		if (!model || ids.has(model.id)) {
			throw new Error(localize('customEndpointModelSource.invalidModel', "The Custom Endpoint model source definition has a model that is not valid."));
		}
		ids.add(model.id);
		const resolution = resolveCustomEndpointRuntimeEndpoint(model);
		if (resolution.bridgeReason) {
			throw new Error(localize('customEndpointModelSource.unsupportedModel', "The Custom Endpoint model {0} can't be called directly ({1}).", model.id, resolution.bridgeReason));
		}
		models.push({ model, endpoint: resolution.endpoint });
	}
	return { models, requiresApiKey: definition.requiresApiKey };
}

/**
 * The resource a Custom Endpoint model source's API key is for: the first
 * model's `url`, as the definition names it. A client checks it against its
 * own copy of the definition before it sends the key.
 */
export function getCustomEndpointModelSourceCredentialResource(definition: CustomEndpointModelSourceDefinition): ProtectedResourceMetadata | undefined {
	return definition.requiresApiKey && definition.models.length ? { resource: definition.models[0].url } : undefined;
}

function readModelSourceModel(value: unknown): CustomEndpointModelSourceModel | undefined {
	if (!isRecord(value) || typeof value.id !== 'string' || !value.id || typeof value.url !== 'string') {
		return undefined;
	}
	// Keys the format doesn't define, such as `streaming` or `modelOptions`, would change how requests are sent.
	const knownKeys = new Set(['id', 'name', 'url', 'apiType', 'requestHeaders', 'toolCalling', 'vision', 'maxInputTokens', 'maxOutputTokens', 'maxContextWindowTokens', 'reasoningEfforts', 'defaultReasoningEffort']);
	if (Object.keys(value).some(key => !knownKeys.has(key))) {
		return undefined;
	}
	const { name, apiType, requestHeaders, toolCalling, vision, maxInputTokens, maxOutputTokens, maxContextWindowTokens, reasoningEfforts, defaultReasoningEffort } = value;
	const isOptional = (field: unknown, type: 'string' | 'boolean') => field === undefined || typeof field === type;
	const isOptionalTokenCount = (field: unknown) => field === undefined || (typeof field === 'number' && Number.isSafeInteger(field) && field > 0);
	if (!isOptional(name, 'string') || !isOptional(defaultReasoningEffort, 'string') || !isOptional(toolCalling, 'boolean') || !isOptional(vision, 'boolean')
		|| !isOptionalTokenCount(maxInputTokens) || !isOptionalTokenCount(maxOutputTokens) || !isOptionalTokenCount(maxContextWindowTokens)
		|| (apiType !== undefined && !isCustomEndpointApiType(apiType))
		|| (requestHeaders !== undefined && !(isRecord(requestHeaders) && Object.values(requestHeaders).every(header => typeof header === 'string')))
		|| (reasoningEfforts !== undefined && !(Array.isArray(reasoningEfforts) && reasoningEfforts.every(effort => typeof effort === 'string')))) {
		return undefined;
	}
	return {
		id: value.id,
		...(typeof name === 'string' ? { name } : {}),
		url: value.url,
		...(isCustomEndpointApiType(apiType) ? { apiType } : {}),
		...(isRecord(requestHeaders) ? { requestHeaders: requestHeaders as { readonly [name: string]: string } } : {}),
		...(typeof toolCalling === 'boolean' ? { toolCalling } : {}),
		...(typeof vision === 'boolean' ? { vision } : {}),
		...(typeof maxInputTokens === 'number' ? { maxInputTokens } : {}),
		...(typeof maxOutputTokens === 'number' ? { maxOutputTokens } : {}),
		...(typeof maxContextWindowTokens === 'number' ? { maxContextWindowTokens } : {}),
		...(Array.isArray(reasoningEfforts) ? { reasoningEfforts: reasoningEfforts as string[] } : {}),
		...(typeof defaultReasoningEffort === 'string' ? { defaultReasoningEffort } : {}),
	};
}

// #endregion
