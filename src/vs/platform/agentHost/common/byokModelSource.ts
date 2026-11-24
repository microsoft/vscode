/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StringSHA1 } from '../../../base/common/hash.js';
import { localize } from '../../../nls.js';
import type { ProtectedResourceMetadata } from './state/protocol/state.js';

/**
 * The definition format of a BYOK provider group that VS Code registers with an
 * agent host as a model source (see {@link IByokEndpointsDefinition}). It is
 * private to VS Code and its agent host: the protocol treats it as opaque.
 */
export const BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT = 'code.visualstudio.com/byok-endpoints@1';

/**
 * The endpoint that serves a model: the runtime provider `type`, the wire
 * format, and the base URL the runtime appends its API path to. The runtime
 * chooses the auth header from `type`.
 */
export type IByokEndpoint = {
	readonly type: 'openai' | 'azure' | 'anthropic';
	/** For `openai` and `azure`: whether requests use Chat Completions or Responses. */
	readonly wireApi?: 'completions' | 'responses';
	readonly baseUrl: string;
	/** For `azure`: the `api-version` query parameter the runtime adds. */
	readonly azureApiVersion?: string;
};

/** A model of a {@link IByokEndpointsDefinition}. */
export type IByokEndpointModel = {
	/** The model id the endpoint is called with. */
	readonly id: string;
	readonly name?: string;
	readonly endpoint: IByokEndpoint;
	/** Whether the model calls tools. Absent when unknown. */
	readonly toolCalling?: boolean;
	/** Whether the model accepts images. Absent when unknown. */
	readonly vision?: boolean;
	readonly maxInputTokens?: number;
	readonly maxOutputTokens?: number;
	readonly maxContextWindowTokens?: number;
	readonly reasoningEfforts?: readonly string[];
	readonly defaultReasoningEffort?: string;
	/**
	 * Other selection ids of the same model, such as the id it had while VS Code
	 * served it through the agent host's BYOK bridge. An agent selects this model
	 * in their place, so saved chats keep their model.
	 */
	readonly aliases?: readonly string[];
};

/**
 * A BYOK provider group in {@link BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT}: the
 * models a runtime can call the same way VS Code's own BYOK provider does. It
 * never contains the group's API key, which the client delivers separately.
 */
// A type rather than an interface, so it is a registration's `Record<string, unknown>` definition.
export type IByokEndpointsDefinition = {
	readonly models: readonly IByokEndpointModel[];
	/** Whether requests carry the group's API key. */
	readonly requiresCredential: boolean;
};

const MODEL_SOURCE_ID_PREFIX = 'vscode.byok/';

/**
 * The registration ID of a BYOK provider group for one agent provider. It is
 * derived from the group's configuration key alone, so every window and device
 * that has the group shares one registration.
 */
export function getByokModelSourceId(provider: string, source: { readonly vendor: string; readonly group: string }): string {
	return `${MODEL_SOURCE_ID_PREFIX}${encodeURIComponent(provider)}/${encodeURIComponent(source.vendor)}/${encodeURIComponent(source.group)}`;
}

/** Whether `id` is a registration ID from {@link getByokModelSourceId}. */
export function isByokModelSourceId(id: string): boolean {
	return parseByokModelSourceId(id) !== undefined;
}

/** The BYOK vendor and provider group of a registration ID from {@link getByokModelSourceId}. */
export function parseByokModelSourceId(id: string): { readonly vendor: string; readonly group: string } | undefined {
	if (!id.startsWith(MODEL_SOURCE_ID_PREFIX)) {
		return undefined;
	}
	const segments = id.slice(MODEL_SOURCE_ID_PREFIX.length).split('/');
	if (segments.length !== 3 || segments.some(segment => !segment)) {
		return undefined;
	}
	try {
		return { vendor: decodeURIComponent(segments[1]), group: decodeURIComponent(segments[2]) };
	} catch {
		return undefined;
	}
}

const MAX_MODELS = 256;
const MAX_STRING_LENGTH = 256;
const MAX_URL_LENGTH = 2048;
const MAX_REASONING_EFFORTS = 16;
const MAX_ALIASES = 8;

/**
 * The resource a definition's API key is sent to: the first model's endpoint. A
 * client compares the host's copy with its own before it sends the key.
 */
export function getByokEndpointsCredentialResource(definition: IByokEndpointsDefinition): ProtectedResourceMetadata | undefined {
	return definition.requiresCredential && definition.models.length ? { resource: definition.models[0].endpoint.baseUrl } : undefined;
}

/**
 * The model source `nonce` of a definition: a hash of its canonical JSON, with
 * object keys sorted. Equal definitions get the same nonce in every window and
 * on every device, so registering an unchanged source again keeps its key.
 */
export function getByokEndpointsNonce(definition: IByokEndpointsDefinition): string {
	const sha = new StringSHA1();
	sha.update(canonicalJson(definition));
	return `sha1-${sha.digest()}`;
}

function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(canonicalJson).join(',')}]`;
	}
	if (typeof value === 'object' && value !== null) {
		return `{${Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
	}
	return JSON.stringify(value);
}

/** Every origin a definition's API key is sent to, in model order. */
export function getByokEndpointsCredentialOrigins(definition: IByokEndpointsDefinition): string[] {
	return [...new Set(definition.models.map(model => new URL(model.endpoint.baseUrl).origin))];
}

/**
 * Validates a definition in {@link BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT}. Throws,
 * with a message for the user, for anything the format doesn't define, since an
 * unknown setting could change where requests go or what they carry.
 */
export function readByokEndpointsDefinition(definition: unknown): IByokEndpointsDefinition {
	if (!isRecord(definition) || !hasOnlyKeys(definition, ['models', 'requiresCredential'])
		|| !Array.isArray(definition.models) || definition.models.length === 0 || definition.models.length > MAX_MODELS
		|| typeof definition.requiresCredential !== 'boolean') {
		throw new Error(localize('byokModelSource.invalid', "The model source definition is not valid."));
	}
	const models: IByokEndpointModel[] = [];
	const ids = new Set<string>();
	for (const candidate of definition.models) {
		const model = readModel(candidate);
		if (!model || ids.has(model.id)) {
			throw new Error(localize('byokModelSource.invalidModel', "The model source definition has a model that is not valid."));
		}
		// Without a key, the runtime authenticates Azure requests with the machine's Azure identity.
		if (model.endpoint.type === 'azure' && !definition.requiresCredential) {
			throw new Error(localize('byokModelSource.azureWithoutKey', "The Azure model {0} requires an API key.", model.id));
		}
		ids.add(model.id);
		models.push(model);
	}
	return { models, requiresCredential: definition.requiresCredential };
}

function readModel(value: unknown): IByokEndpointModel | undefined {
	if (!isRecord(value) || !hasOnlyKeys(value, ['id', 'name', 'endpoint', 'toolCalling', 'vision', 'maxInputTokens', 'maxOutputTokens', 'maxContextWindowTokens', 'reasoningEfforts', 'defaultReasoningEffort', 'aliases'])) {
		return undefined;
	}
	const { id, name, toolCalling, vision, maxInputTokens, maxOutputTokens, maxContextWindowTokens, reasoningEfforts, defaultReasoningEffort, aliases } = value;
	const endpoint = readEndpoint(value.endpoint);
	if (!endpoint || !isString(id) || !isOptional(name, isString) || !isOptional(defaultReasoningEffort, isString)
		|| !isOptional(toolCalling, isBoolean) || !isOptional(vision, isBoolean)
		|| !isOptional(maxInputTokens, isTokenCount) || !isOptional(maxOutputTokens, isTokenCount) || !isOptional(maxContextWindowTokens, isTokenCount)
		|| !isOptional(reasoningEfforts, isReasoningEfforts) || !isOptional(aliases, isAliases)) {
		return undefined;
	}
	return {
		id,
		...(name !== undefined ? { name } : {}),
		endpoint,
		...(toolCalling !== undefined ? { toolCalling } : {}),
		...(vision !== undefined ? { vision } : {}),
		...(maxInputTokens !== undefined ? { maxInputTokens } : {}),
		...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
		...(maxContextWindowTokens !== undefined ? { maxContextWindowTokens } : {}),
		...(reasoningEfforts !== undefined ? { reasoningEfforts: [...reasoningEfforts] } : {}),
		...(defaultReasoningEffort !== undefined ? { defaultReasoningEffort } : {}),
		...(aliases !== undefined ? { aliases: [...aliases] } : {}),
	};
}

function readEndpoint(value: unknown): IByokEndpoint | undefined {
	if (!isRecord(value) || !hasOnlyKeys(value, ['type', 'wireApi', 'baseUrl', 'azureApiVersion'])) {
		return undefined;
	}
	const { type, wireApi, baseUrl, azureApiVersion } = value;
	if ((type !== 'openai' && type !== 'azure' && type !== 'anthropic') || typeof baseUrl !== 'string' || !isBaseUrl(baseUrl)) {
		return undefined;
	}
	// The runtime picks the Messages API from the `anthropic` type, and only Azure takes an API version.
	if (!isOptional(wireApi, isWireApi) || (type === 'anthropic' && wireApi !== undefined)
		|| !isOptional(azureApiVersion, isApiVersion) || (type !== 'azure' && azureApiVersion !== undefined)) {
		return undefined;
	}
	return {
		type,
		...(wireApi !== undefined ? { wireApi } : {}),
		baseUrl,
		...(azureApiVersion !== undefined ? { azureApiVersion } : {}),
	};
}

/** An http(s) URL with nothing the runtime would drop or send elsewhere: no credentials, query, or fragment. */
function isBaseUrl(value: string): boolean {
	if (value.length > MAX_URL_LENGTH) {
		return false;
	}
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password && !url.search && !url.hash && !value.includes('?') && !value.includes('#');
}

function isWireApi(value: unknown): value is 'completions' | 'responses' {
	return value === 'completions' || value === 'responses';
}

function isApiVersion(value: unknown): value is string {
	return typeof value === 'string' && /^[\w.-]{1,64}$/.test(value);
}

function isReasoningEfforts(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.length <= MAX_REASONING_EFFORTS && value.every(isString);
}

function isAliases(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.length <= MAX_ALIASES && value.every(isString);
}

function isString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= MAX_STRING_LENGTH;
}

function isBoolean(value: unknown): value is boolean {
	return typeof value === 'boolean';
}

function isTokenCount(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isOptional<T>(value: unknown, is: (value: unknown) => value is T): value is T | undefined {
	return value === undefined || is(value);
}

function hasOnlyKeys(value: { readonly [key: string]: unknown }, keys: readonly string[]): boolean {
	return Object.keys(value).every(key => keys.includes(key));
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
