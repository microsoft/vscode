/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { TokenizerName } from '../../../prompt/src/tokenization';
import { ConfigKey, getConfig } from '../config';

export interface CustomCompletionModelConfig {
	id: string;
	name?: string;
	model?: string;
	url: string;
	tokenizer?: TokenizerName;
	apiKey?: string;
	requestHeaders?: Record<string, string>;
}

export function getCustomCompletionModels(accessor: ServicesAccessor): CustomCompletionModelConfig[] {
	const value = getConfig<unknown>(accessor, ConfigKey.CustomCompletionModels);
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.map(toCustomCompletionModel)
		.filter(model => model !== undefined);
}

export function getCustomCompletionModel(accessor: ServicesAccessor, modelId: string): CustomCompletionModelConfig | undefined {
	return getCustomCompletionModels(accessor).find(model => model.id === modelId);
}

export function resolveCustomCompletionModelUrl(model: CustomCompletionModelConfig): string {
	const parsed = parseUrl(model.url);
	if (!parsed) {
		return resolveCustomCompletionModelUrlString(model.url);
	}

	const path = parsed.pathname.replace(/\/+$/, '');
	if (hasExplicitCompletionsPath(path)) {
		parsed.pathname = path;
		return parsed.toString();
	}

	if (/\/v\d+$/.test(path)) {
		parsed.pathname = `${path}/completions`;
	} else {
		parsed.pathname = `${path}/v1/completions`;
	}

	return parsed.toString();
}

export function getCustomCompletionModelHeaders(model: CustomCompletionModelConfig): Record<string, string> {
	const headers = { ...sanitizeHeaders(model.requestHeaders) };
	const authorization = model.apiKey ? sanitizeHeaderValue(`Bearer ${model.apiKey}`) : undefined;
	if (authorization && !hasAuthorizationHeader(headers)) {
		headers.Authorization = authorization;
	}
	return headers;
}

function toCustomCompletionModel(value: unknown): CustomCompletionModelConfig | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}

	const candidate = value as Record<string, unknown>;
	const id = readNonEmptyString(candidate.id);
	const url = readNonEmptyString(candidate.url);
	if (!id || !url) {
		return undefined;
	}

	const name = readNonEmptyString(candidate.name);
	const model = readNonEmptyString(candidate.model);
	const apiKey = readNonEmptyString(candidate.apiKey);
	const tokenizer = readTokenizer(candidate.tokenizer);
	const requestHeaders = sanitizeHeaders(candidate.requestHeaders);

	return {
		id,
		url,
		...(name ? { name } : {}),
		...(model ? { model } : {}),
		...(apiKey ? { apiKey } : {}),
		...(tokenizer ? { tokenizer } : {}),
		...(Object.keys(requestHeaders).length > 0 ? { requestHeaders } : {}),
	};
}

function readNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function readTokenizer(value: unknown): TokenizerName | undefined {
	if (value === TokenizerName.cl100k || value === TokenizerName.o200k || value === TokenizerName.mock) {
		return value;
	}
	return undefined;
}

function sanitizeHeaders(value: unknown): Record<string, string> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}

	const headers: Record<string, string> = {};
	for (const [key, headerValue] of Object.entries(value)) {
		const headerName = key.trim();
		if (!isValidHeaderName(headerName) || typeof headerValue !== 'string') {
			continue;
		}
		const sanitizedValue = sanitizeHeaderValue(headerValue);
		if (sanitizedValue === undefined) {
			continue;
		}
		headers[headerName] = sanitizedValue;
	}
	return headers;
}

function isValidHeaderName(value: string): boolean {
	return value.length > 0 && /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/.test(value);
}

function sanitizeHeaderValue(value: string): string | undefined {
	const trimmed = value.trim();
	if (trimmed.length === 0 || trimmed.length > 8192 || /[\x00-\x1F\x7F]/.test(trimmed)) {
		return undefined;
	}
	return trimmed;
}

function hasAuthorizationHeader(headers: Record<string, string>): boolean {
	return Object.keys(headers).some(key => {
		const lowerKey = key.toLowerCase();
		return lowerKey === 'authorization' || lowerKey === 'api-key' || lowerKey === 'x-api-key' || lowerKey === 'x-goog-api-key' || lowerKey === 'apikey';
	});
}

function hasExplicitCompletionsPath(url: string): boolean {
	return /\/completions\/?$/.test(url);
}

function parseUrl(url: string): URL | undefined {
	try {
		return new URL(url);
	} catch {
		return undefined;
	}
}

function resolveCustomCompletionModelUrlString(url: string): string {
	if (hasExplicitCompletionsPath(url)) {
		return url;
	}

	if (url.endsWith('/')) {
		url = url.slice(0, -1);
	}

	if (/\/v\d+$/.test(url)) {
		return `${url}/completions`;
	}

	return `${url}/v1/completions`;
}
