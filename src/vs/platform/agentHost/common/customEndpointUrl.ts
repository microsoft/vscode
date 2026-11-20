/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 * The request URL and auth rules of the Custom Endpoint BYOK provider. The
 * Copilot extension's provider and the agent host both route Custom Endpoint
 * models, so this module is their single source of truth. The extension uses a
 * copy made by `extensions/copilot/script/setup/copySources.ts`, so this file
 * must not import anything.
 */

/** Request and response format of a Custom Endpoint model (its `apiType` setting). */
export type CustomEndpointApiType = 'chat-completions' | 'responses' | 'messages';

const customEndpointApiTypes: ReadonlySet<string> = new Set<CustomEndpointApiType>(['chat-completions', 'responses', 'messages']);

/** Whether `value` is a known {@link CustomEndpointApiType}. */
export function isCustomEndpointApiType(value: unknown): value is CustomEndpointApiType {
	return typeof value === 'string' && customEndpointApiTypes.has(value);
}

/** Whether `url` already names an API path, so it is used as is. */
export function hasExplicitApiPath(url: string): boolean {
	return url.includes('/responses') || url.includes('/chat/completions') || url.includes('/messages');
}

/**
 * The URL a Custom Endpoint model sends requests to. A URL naming an API path
 * is used as is; a base URL gets `/v1` (unless it already ends in a version
 * segment) and the path for `apiType`, which defaults to Chat Completions.
 */
export function resolveCustomEndpointUrl(url: string, apiType?: CustomEndpointApiType): string {
	if (hasExplicitApiPath(url)) {
		return url;
	}

	if (url.endsWith('/')) {
		url = url.slice(0, -1);
	}

	const apiPath = customEndpointApiPath(apiType);
	if (/\/v\d+$/.test(url)) {
		return `${url}${apiPath}`;
	}
	return `${url}/v1${apiPath}`;
}

function customEndpointApiPath(apiType: CustomEndpointApiType | undefined): string {
	switch (apiType) {
		case 'responses': return '/responses';
		case 'messages': return '/messages';
		case 'chat-completions':
		default:
			return '/chat/completions';
	}
}

/** The request format implied by a resolved URL's API path, for a model that sets no `apiType`. */
export function inferCustomEndpointApiType(url: string): CustomEndpointApiType {
	if (url.includes('/messages')) {
		return 'messages';
	}
	if (url.includes('/responses')) {
		return 'responses';
	}
	return 'chat-completions';
}

/**
 * Whether a Chat Completions or Responses request to `url` authenticates with
 * an Azure OpenAI `api-key` header rather than `Authorization: Bearer`.
 * Messages requests always use `x-api-key`.
 */
export function customEndpointUsesAzureApiKey(url: string): boolean {
	return url.includes('openai.azure');
}
