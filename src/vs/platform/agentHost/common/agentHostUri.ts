/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, encodeBase64, encodeHex, VSBuffer } from '../../../base/common/buffer.js';
import { Schemas } from '../../../base/common/network.js';
import { OperatingSystem } from '../../../base/common/platform.js';
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
 * Maps resource URIs between the Agent Host and its client.
 */
export interface IAgentHostResourceUriMapper {
	fromAgentHost(resource: URI): URI;
	toAgentHost(resource: URI): URI;
}

export const identityAgentHostResourceUriMapper: IAgentHostResourceUriMapper = {
	fromAgentHost: resource => resource,
	toAgentHost: resource => resource,
};

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
	/**
	 * Set when the wrapped URI came from a protocol `ContentRef` rather than
	 * from the host's filesystem. Omitted otherwise. See
	 * {@link toAgentHostContentUri}.
	 */
	readonly contentRef?: true;
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
	return wrapAgentHostUri(originalUri, connectionAuthority, false);
}

/**
 * Wraps a protocol `ContentRef` URI, marking it so the filesystem provider
 * reads it with `resourceRead` instead of resolving it as a filesystem entry.
 * Hosts choose their own content URI shapes, so the scheme cannot identify one.
 *
 * A content ref that is already a plain `file:` URI on the local connection
 * stays unwrapped: it addresses a real file and resolves normally.
 */
export function toAgentHostContentUri(originalUri: URI, connectionAuthority: string): URI {
	return wrapAgentHostUri(originalUri, connectionAuthority, true);
}

/**
 * Maps a host-side URI into client space.
 *
 * `options.contentRef` marks a URI read out of a protocol `ContentRef`, so it
 * is wrapped with {@link toAgentHostContentUri} rather than
 * {@link toAgentHostUri}.
 */
export type AgentHostUriMapper = (uri: URI, options?: { readonly contentRef?: boolean }) => URI;

function wrapAgentHostUri(originalUri: URI, connectionAuthority: string, contentRef: boolean): URI {
	if (connectionAuthority === 'local' && originalUri.scheme === Schemas.file) {
		return originalUri;
	}

	const meta: IAgentHostUriMeta = {
		scheme: originalUri.scheme,
		...(originalUri.authority ? { authority: originalUri.authority } : {}),
		...(originalUri.query ? { query: originalUri.query } : {}),
		...(contentRef ? { contentRef: true } as const : {}),
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
 * Reads the {@link IAgentHostUriMeta} payload off a {@link AGENT_HOST_SCHEME}
 * URI, or `undefined` when it is absent or malformed.
 */
function readAgentHostUriMeta(agentHostUri: URI): Partial<IAgentHostUriMeta> | undefined {
	const encoded = agentHostUri.query ? new URLSearchParams(agentHostUri.query).get(AGENT_HOST_META_PARAM) : null;
	if (!encoded) {
		return undefined;
	}
	try {
		return JSON.parse(decodeBase64(encoded).toString()) as Partial<IAgentHostUriMeta>;
	} catch {
		return undefined;
	}
}

/**
 * Whether the URI wraps a protocol `ContentRef` — content read with
 * `resourceRead`, never resolved with `resourceResolve`.
 *
 * See {@link toAgentHostContentUri}.
 */
export function isAgentHostContentRefUri(agentHostUri: URI): boolean {
	if (agentHostUri.scheme !== AGENT_HOST_SCHEME) {
		return false;
	}
	return readAgentHostUriMeta(agentHostUri)?.contentRef === true;
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

	const meta = readAgentHostUriMeta(agentHostUri);

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

export function createAgentHostResourceUriMapper(connectionAuthority: string): IAgentHostResourceUriMapper {
	return {
		fromAgentHost: resource => toAgentHostUri(resource, connectionAuthority),
		toAgentHost: resource => fromAgentHostUri(resource),
	};
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

const REMOTE_LOCAL_AGENT_HOST_AUTHORITY = 'remote_local';
const HEX_AGENT_HOST_AUTHORITY_PREFIX = 'hex-';

/**
 * Encode a remote address into an identifier that is safe for use in
 * both URI schemes and case-insensitive URI authorities without collisions.
 *
 * The reserved `local` name becomes `remote_local`; lowercase alphanumeric
 * addresses pass through; lowercase host-like addresses replace `:` with `__`;
 * all other values use lowercase hex with a reserved `hex-` prefix.
 */
export function agentHostAuthority(address: string): string {
	const normalized = normalizeRemoteAgentHostAddress(address);
	if (normalized === 'local') {
		return REMOTE_LOCAL_AGENT_HOST_AUTHORITY;
	}
	if (/^[a-z0-9]+$/.test(normalized)) {
		return normalized;
	}
	if (/^[a-z0-9.:\-]+$/.test(normalized) && !/^hex-/i.test(normalized)) {
		return normalized.replaceAll(':', '__');
	}
	return `${HEX_AGENT_HOST_AUTHORITY_PREFIX}${encodeHex(VSBuffer.fromString(normalized))}`;
}

/**
 * Authority of the in-process agent host. It always runs on the same
 * machine — and therefore the same operating system — as the client.
 */
export const LOCAL_AGENT_HOST_AUTHORITY = 'local';

/**
 * Fallback label formatter for {@link AGENT_HOST_SCHEME} URIs of hosts
 * whose operating system is unknown. The URI path is already the original
 * resource path, so the label is the path verbatim.
 *
 * Deliberately lossless: without knowing the host's operating system,
 * neither `\` separators nor drive letter normalization can be applied
 * safely, since `/c:/repo/a.ts` is a valid POSIX path too and rendering it
 * as `C:/repo/a.ts` would name a different resource. Hosts whose operating
 * system is known get {@link agentHostLabelFormatter} instead.
 */
export const AGENT_HOST_LABEL_FORMATTER: ResourceLabelFormatter = {
	scheme: AGENT_HOST_SCHEME,
	formatting: {
		label: '${path}',
		separator: '/',
	},
};

/**
 * Label formatter for {@link AGENT_HOST_SCHEME} URIs of an agent host whose
 * operating system is known, so its paths render the way they do natively
 * on that host (`C:\a\b` instead of `/c:/a/b`). This matters because such
 * URIs are shown side by side with plain `file:` URIs — for example as the
 * original side of a diff — which are always rendered natively.
 *
 * Registered per authority since the operating system cannot be derived
 * from the client: a Windows client may be connected to a POSIX host.
 */
export function agentHostLabelFormatter(authority: string, os: OperatingSystem): ResourceLabelFormatter {
	const isWindows = os === OperatingSystem.Windows;
	return {
		scheme: AGENT_HOST_SCHEME,
		authority,
		formatting: {
			label: '${path}',
			separator: isWindows ? '\\' : '/',
			normalizeDriveLetter: isWindows,
		},
	};
}
