/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { connectionTokenQueryName } from '../../../base/common/network.js';

export const enum RemoteAgentHostInputValidationError {
	Empty = 'empty',
	Invalid = 'invalid',
}

export interface IParsedRemoteAgentHostInput {
	readonly address: string;
	readonly connectionToken?: string;
	readonly suggestedName: string;
}

export type RemoteAgentHostInputParseResult =
	| { readonly parsed: IParsedRemoteAgentHostInput; readonly error?: undefined }
	| { readonly parsed?: undefined; readonly error: RemoteAgentHostInputValidationError };

export function parseRemoteAgentHostInput(input: string): RemoteAgentHostInputParseResult {
	const trimmedInput = input.trim();
	if (!trimmedInput) {
		return { error: RemoteAgentHostInputValidationError.Empty };
	}

	const candidate = extractRemoteAgentHostCandidate(trimmedInput);
	if (!candidate) {
		return { error: RemoteAgentHostInputValidationError.Invalid };
	}

	const hasExplicitScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(candidate);
	try {
		const url = new URL(hasExplicitScheme ? candidate : `ws://${candidate}`);
		const normalizedProtocol = normalizeRemoteAgentHostProtocol(url.protocol);
		if (!normalizedProtocol || !url.host) {
			return { error: RemoteAgentHostInputValidationError.Invalid };
		}

		const connectionToken = url.searchParams.get(connectionTokenQueryName) ?? undefined;
		url.searchParams.delete(connectionTokenQueryName);

		// Only preserve wss: in the address - the transport defaults to ws:
		const address = formatRemoteAgentHostAddress(url, normalizedProtocol === 'wss:' ? normalizedProtocol : undefined);
		if (!address) {
			return { error: RemoteAgentHostInputValidationError.Invalid };
		}

		return {
			parsed: {
				address,
				connectionToken,
				suggestedName: url.host,
			},
		};
	} catch {
		return { error: RemoteAgentHostInputValidationError.Invalid };
	}
}

function extractRemoteAgentHostCandidate(input: string): string | undefined {
	const urlMatch = input.match(/(?<url>(?:https?|wss?):\/\/\S+)/i);
	const candidate = urlMatch?.groups?.url ?? input;
	const trimmedCandidate = candidate.trim().replace(/[),.;\]]+$/, '');
	return trimmedCandidate || undefined;
}

function normalizeRemoteAgentHostProtocol(protocol: string): 'ws:' | 'wss:' | undefined {
	switch (protocol.toLowerCase()) {
		case 'ws:':
		case 'http:':
			return 'ws:';
		case 'wss:':
		case 'https:':
			return 'wss:';
		default:
			return undefined;
	}
}

function formatRemoteAgentHostAddress(url: URL, protocol: 'ws:' | 'wss:' | undefined): string | undefined {
	if (!url.host) {
		return undefined;
	}

	const path = url.pathname !== '/' ? url.pathname : '';
	const query = url.search;
	const base = protocol ? `${protocol}//${url.host}` : url.host;
	return `${base}${path}${query}`;
}
