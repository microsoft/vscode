/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import type { ResourceLabelFormatter } from '../../label/common/label.js';

/**
 * The URI scheme for accessing files on a remote agent host.
 *
 * The original file path is kept verbatim as the URI path so resource
 * labels, language detection, and path comparisons see a real path. The
 * original scheme, authority, and query are carried in a single
 * url-safe-base64 `_ah` query parameter so any remote resource can be
 * represented without assuming `file://`:
 *
 * ```
 * vscode-agent-host://[connectionAuthority][originalPath]?_ah=[meta]#[originalFragment]
 * ```
 *
 * where `meta` is {@link IAgentHostUriMeta} as url-safe-base64-encoded
 * JSON. Encoding the metadata as a single opaque parameter (rather than
 * raw JSON) keeps the query a well-formed parameter list, so unrelated
 * query parameters such as `vscodeLinkType` can coexist on the wrapped
 * URI without corrupting the metadata. For example,
 * `file:///home/user/foo.ts` on remote `my-server` becomes:
 * ```
 * vscode-agent-host://my-server/home/user/foo.ts?_ah=eyJzY2hlbWUiOiJmaWxlIn0
 * ```
 */
export const AGENT_HOST_SCHEME = 'vscode-agent-host';

/**
 * Query parameter that carries the {@link IAgentHostUriMeta} payload.
 */
const AGENT_HOST_META_PARAM = '_ah';

/**
 * Metadata carried in the query of a {@link AGENT_HOST_SCHEME} URI so the
 * original URI can be reconstructed while keeping the path label-friendly.
 */
interface IAgentHostUriMeta {
	/** Original URI scheme (e.g. `file`, `git-blob`). */
	readonly scheme: string;
	/** Original URI authority, omitted when empty. */
	readonly authority?: string;
	/** Original URI query, omitted when empty. */
	readonly query?: string;
}

/**
 * Wraps a remote URI into a {@link AGENT_HOST_SCHEME} URI that can be
 * resolved through the agent host filesystem provider.
 *
 * @param originalUri The URI on the remote (e.g. `file:///path` or
 *   `agenthost-content:///sessionId/...`)
 * @param connectionAuthority The sanitized connection identifier used as
 *   the URI authority (from {@link agentHostAuthority}).
 */
export function toAgentHostUri(originalUri: URI, connectionAuthority: string): URI {
	if (connectionAuthority === 'local' && originalUri.scheme === Schemas.file) {
		return originalUri;
	}

	const meta: IAgentHostUriMeta = {
		scheme: originalUri.scheme,
		...(originalUri.authority ? { authority: originalUri.authority } : {}),
		...(originalUri.query ? { query: originalUri.query } : {}),
	};
	const params = new URLSearchParams();
	params.set(AGENT_HOST_META_PARAM, encodeBase64(VSBuffer.fromString(JSON.stringify(meta)), false, true));
	return URI.from({
		scheme: AGENT_HOST_SCHEME,
		authority: connectionAuthority,
		path: originalUri.path || '/',
		query: params.toString(),
		fragment: originalUri.fragment,
	});
}

/**
 * Extracts the original URI from a {@link AGENT_HOST_SCHEME} URI.
 *
 * The inverse of {@link toAgentHostUri}.
 */
export function fromAgentHostUri(agentHostUri: URI): URI {
	if (agentHostUri.scheme !== AGENT_HOST_SCHEME) {
		return agentHostUri;
	}

	let meta: Partial<IAgentHostUriMeta> | undefined;
	const encoded = agentHostUri.query ? new URLSearchParams(agentHostUri.query).get(AGENT_HOST_META_PARAM) : null;
	if (encoded) {
		try {
			meta = JSON.parse(decodeBase64(encoded).toString()) as Partial<IAgentHostUriMeta>;
		} catch {
			meta = undefined;
		}
	}

	if (!meta || typeof meta.scheme !== 'string') {
		// Missing/invalid metadata — fall back to treating the path as a
		// file path so callers get a usable URI instead of an exception.
		return URI.from({ scheme: Schemas.file, path: agentHostUri.path, fragment: agentHostUri.fragment });
	}

	return URI.from({
		scheme: meta.scheme,
		authority: meta.authority || undefined,
		path: agentHostUri.path,
		query: meta.query || '',
		fragment: agentHostUri.fragment,
	});
}

/**
 * Strips the redundant `ws://` scheme from an address. The transport layer
 * already defaults to `ws://`, so only `wss://` needs to be preserved.
 */
export function normalizeRemoteAgentHostAddress(address: string): string {
	if (address.startsWith('ws://')) {
		return address.slice('ws://'.length);
	}
	return address;
}

/**
 * Encode a remote address into an identifier that is safe for use in
 * both URI schemes and URI authorities, and is collision-free.
 *
 * Three tiers:
 * 1. Purely alphanumeric addresses are returned as-is.
 * 2. "Normal" addresses containing only `[a-zA-Z0-9.:-]` get colons
 *    replaced with `__` (double underscore) for human readability.
 *    Addresses containing `_` skip this tier to keep the encoding
 *    collision-free (`__` can only appear from colon replacement).
 * 3. Everything else is url-safe base64-encoded with a `b64-` prefix.
 */
export function agentHostAuthority(address: string): string {
	const normalized = normalizeRemoteAgentHostAddress(address);
	if (/^[a-zA-Z0-9]+$/.test(normalized)) {
		return normalized;
	}
	if (/^[a-zA-Z0-9.:\-]+$/.test(normalized)) {
		return normalized.replaceAll(':', '__');
	}
	return `b64-${encodeBase64(VSBuffer.fromString(normalized), false, true)}`;
}

/**
 * Label formatter for {@link AGENT_HOST_SCHEME} URIs. The URI path is
 * already the original resource path, so the label is the path verbatim.
 */
export const AGENT_HOST_LABEL_FORMATTER: ResourceLabelFormatter = {
	scheme: AGENT_HOST_SCHEME,
	formatting: {
		label: '${path}',
		separator: '/',
	},
};
