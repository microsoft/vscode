/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, raceCancellationError } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../base/common/errors.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { listenStream } from '../../../base/common/stream.js';
import { URI } from '../../../base/common/uri.js';
import { IRequestContext, IRequestOptions } from '../../../base/parts/request/common/request.js';
import { localize } from '../../../nls.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IRequestService } from '../../request/common/request.js';

export const enum AgentFinderConfiguration {
	Enabled = 'chat.agentFinder.enabled',
}

export const AgentFinderMediaType = {
	Skill: 'application/ai-skill',
	McpServer: 'application/mcp-server+json',
	ClaudePlugin: 'application/vnd.anthropic.claude-plugin+json',
	CopilotPlugin: 'application/vnd.github.copilot-plugin',
	CursorPlugin: 'application/vnd.cursor.cursor-plugin+json',
} as const;

export type AgentFinderMediaType = typeof AgentFinderMediaType[keyof typeof AgentFinderMediaType];

/** Validated installation provenance; GitHub paths name the resource directory, not its manifest. */
export type AgentFinderInstallation =
	| { readonly kind: 'skill' | 'plugin'; readonly repository: string; readonly ref: string; readonly path: string }
	| { readonly kind: 'mcp'; readonly name: string };

export interface IAgentFinderResource {
	readonly identifier: string;
	readonly displayName: string;
	readonly description: string;
	readonly mediaType: string;
	readonly tags: readonly string[];
	readonly capabilities: readonly string[];
	readonly representativeQueries: readonly string[];
	readonly url?: URI;
	/** Validated original URL for external opening, preserving escaped path separators. */
	readonly externalUrl?: string;
	readonly repository?: URI;
	/** The repository owner's GitHub avatar, not a verified product logo. */
	readonly icon?: URI;
	readonly publisher?: string;
	readonly version?: string;
	readonly stars?: number;
	readonly installation?: AgentFinderInstallation;
}

export type IAgentFinderCursor =
	| { readonly kind: 'browse'; readonly offset: number }
	| { readonly kind: 'search'; readonly pageToken: string };

export interface IAgentFinderQuery {
	readonly query?: string;
	readonly mediaType?: AgentFinderMediaType;
	readonly pageSize?: number;
	/** Continue with the same query, media type, and page size that produced this cursor. */
	readonly cursor?: IAgentFinderCursor;
}

export interface IAgentFinderPage {
	readonly items: readonly IAgentFinderResource[];
	readonly total?: number;
	readonly nextCursor?: IAgentFinderCursor;
}

export const IAgentFinderService = createDecorator<IAgentFinderService>('agentFinderService');

export interface IAgentFinderService {
	readonly _serviceBrand: undefined;
	query(options: IAgentFinderQuery, token: CancellationToken): Promise<IAgentFinderPage>;
}

const endpoint = 'https://agentfinder.github.com/api/v1';
const requestTimeout = 30_000;
const maxResponseBytes = 5 * 1024 * 1024;
const maxUriLength = 8192;
const maxPageTokenLength = 8192;
const maxResourceTextLength = 4096;
const maxMetadataEntries = 32;
const maxMetadataTextLength = 512;

class AgentFinderError extends Error { }

export class AgentFinderService implements IAgentFinderService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IRequestService private readonly requestService: IRequestService,
	) { }

	async query(options: IAgentFinderQuery, token: CancellationToken): Promise<IAgentFinderPage> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		const query = options.query?.trim() ?? '';
		const requestedPageSize = options.pageSize ?? 30;
		if (query.length > 4096 || !isNonNegativeInteger(requestedPageSize) || requestedPageSize === 0 ||
			(options.mediaType !== undefined && !Object.values(AgentFinderMediaType).includes(options.mediaType))) {
			throw new AgentFinderError(localize('agentFinder.invalidQuery', "The Agent Finder query is invalid."));
		}
		const pageSize = Math.min(requestedPageSize, 100);
		const cursor = options.cursor;
		if (cursor && (query
			? cursor.kind !== 'search' || !isPageToken(cursor.pageToken)
			: cursor.kind !== 'browse' || !isNonNegativeInteger(cursor.offset))) {
			throw new AgentFinderError(localize('agentFinder.invalidCursor', "The Agent Finder page is invalid. Start a new search."));
		}

		const offset = cursor?.kind === 'browse' ? cursor.offset : 0;
		const pageToken = cursor?.kind === 'search' ? cursor.pageToken : undefined;
		const request: IRequestOptions = {
			url: query ? `${endpoint}/search` : `${endpoint}/agents?pageSize=${pageSize}&offset=${offset}${options.mediaType ? `&type=${encodeURIComponent(options.mediaType)}` : ''}`,
			type: query ? 'POST' : 'GET',
			headers: query ? { Accept: 'application/json', 'Content-Type': 'application/json' } : { Accept: 'application/json' },
			data: query ? JSON.stringify({
				query: { text: query, ...(options.mediaType ? { filter: { type: [options.mediaType] } } : {}) },
				pageSize,
				...(pageToken ? { pageToken } : {}),
			}) : undefined,
			timeout: requestTimeout,
			followRedirects: 0,
			callSite: 'agentFinder.query',
		};

		const store = new DisposableStore();
		const cancellation = store.add(new CancellationTokenSource(token));
		let timedOut = false;
		disposableTimeout(() => {
			timedOut = true;
			cancellation.cancel();
		}, requestTimeout, store);

		try {
			const response = await raceCancellationError(this.requestPage(request, cancellation.token), cancellation.token);
			return parsePage(response, pageSize, query ? { kind: 'search', pageToken } : { kind: 'browse', offset });
		} catch (error) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			if (timedOut) {
				throw new AgentFinderError(localize('agentFinder.timeout', "Agent Finder took too long to respond. Try again."));
			}
			if (error instanceof AgentFinderError || isCancellationError(error)) {
				throw error;
			}
			throw new AgentFinderError(localize('agentFinder.unavailable', "Unable to reach Agent Finder. Check your connection and try again."));
		} finally {
			cancellation.cancel();
			store.dispose();
		}
	}

	private async requestPage(options: IRequestOptions, token: CancellationToken): Promise<unknown> {
		const context = await this.requestService.request(options, token);
		try {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			const status = context.res.statusCode;
			if (status === 429) {
				throw new AgentFinderError(localize('agentFinder.rateLimited', "Agent Finder is receiving too many requests. Try again later."));
			}
			if (!status || status < 200 || status >= 300) {
				throw new AgentFinderError(localize('agentFinder.httpError', "Agent Finder could not complete the request (HTTP {0}). Try again later.", status ?? '—'));
			}
			const text = await raceCancellationError(readResponse(context), token);
			try {
				return JSON.parse(text);
			} catch {
				throw new AgentFinderError(localize('agentFinder.invalidJson', "Agent Finder returned invalid JSON. Try again later."));
			}
		} finally {
			context.stream.destroy();
		}
	}
}

function readResponse(context: IRequestContext): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: VSBuffer[] = [];
		let bytes = 0;
		listenStream(context.stream, {
			onData: chunk => {
				bytes += chunk.byteLength;
				if (bytes > maxResponseBytes) {
					reject(new AgentFinderError(localize('agentFinder.responseTooLarge', "The Agent Finder response is too large. Try a smaller page.")));
					context.stream.destroy();
				} else {
					chunks.push(chunk);
				}
			},
			onError: reject,
			onEnd: () => resolve(VSBuffer.concat(chunks).toString()),
		});
	});
}

function invalidResponse(): AgentFinderError {
	return new AgentFinderError(localize('agentFinder.invalidResponse', "Agent Finder returned an invalid response. Try again later."));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPageToken(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= maxPageTokenLength;
}

function text(value: unknown, maxLength = maxResourceTextLength): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	if (value.length > maxLength) {
		throw invalidResponse();
	}
	return value.trim() || undefined;
}

function strings(value: unknown): readonly string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	if (value.length > maxMetadataEntries) {
		throw invalidResponse();
	}
	return value.filter((item): item is string => !!text(item, maxMetadataTextLength));
}

function parsePage(value: unknown, pageSize: number, cursor: { kind: 'browse'; offset: number } | { kind: 'search'; pageToken?: string }): IAgentFinderPage {
	if (!isRecord(value) || !Array.isArray(value.results) || value.results.length > pageSize) {
		throw invalidResponse();
	}
	const items = value.results.map(parseResource);
	if (cursor.kind === 'browse') {
		if (!isNonNegativeInteger(value.total) || value.offset !== cursor.offset || value.pageSize !== pageSize ||
			(items.length > 0 && cursor.offset + items.length > value.total) || (items.length === 0 && cursor.offset < value.total)) {
			throw invalidResponse();
		}
		const nextOffset = cursor.offset + items.length;
		return { items, total: value.total, nextCursor: nextOffset < value.total ? { kind: 'browse', offset: nextOffset } : undefined };
	}
	if ((value.total !== undefined && !isNonNegativeInteger(value.total)) ||
		(value.pageToken !== undefined && value.pageToken !== '' &&
			(!isPageToken(value.pageToken) || value.pageToken === cursor.pageToken || items.length === 0))) {
		throw invalidResponse();
	}
	return {
		items,
		total: value.total,
		nextCursor: isPageToken(value.pageToken) ? { kind: 'search', pageToken: value.pageToken } : undefined,
	};
}

function parseResource(value: unknown): IAgentFinderResource {
	if (!isRecord(value)) {
		throw invalidResponse();
	}
	const identifier = text(value.identifier);
	const displayName = text(value.displayName);
	const mediaType = text(value.type ?? value.mediaType);
	if (!identifier || !displayName || !mediaType ||
		(value.type !== undefined && value.mediaType !== undefined && value.type !== value.mediaType)) {
		throw invalidResponse();
	}
	const metadata = isRecord(value.metadata) ? value.metadata : undefined;
	const url = parseHttpUri(value.url);
	const externalUrl = url && typeof value.url === 'string' ? value.url : undefined;
	const sourceSet = text(metadata?.sourceSet);
	const repository = (sourceSet && !sourceSet.includes('://') ? githubRepository(parseHttpUri(`https://github.com/${sourceSet}`), true) : undefined) ?? githubRepository(url);
	const publisher = repository?.path.split('/')[1];
	return {
		identifier,
		displayName,
		mediaType,
		description: text(value.description) ?? '',
		tags: strings(value.tags),
		capabilities: strings(value.capabilities),
		representativeQueries: strings(value.representativeQueries),
		url,
		externalUrl,
		repository,
		icon: publisher ? URI.from({ scheme: Schemas.https, authority: 'github.com', path: `/${publisher}.png`, query: 'size=64' }) : undefined,
		publisher,
		version: text(value.version) ?? text(metadata?.version),
		installation: parseInstallation(mediaType, metadata, url, externalUrl),
	};
}

function parseInstallation(mediaType: string, metadata: Record<string, unknown> | undefined, url: URI | undefined, externalUrl: string | undefined): AgentFinderInstallation | undefined {
	if (!metadata || !url || !externalUrl || url.scheme !== Schemas.https || url.query || url.fragment) {
		return undefined;
	}
	if (mediaType === AgentFinderMediaType.McpServer) {
		const name = metadata.serverName;
		if (typeof name !== 'string' || name.length > 512 || !/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i.test(name) || !isSafeSourcePath(name)) {
			return undefined;
		}
		const prefix = `https://api.mcp.github.com/oss/v0.1/servers/${encodeURIComponent(name)}/versions/`;
		const version = metadata.version;
		if (externalUrl === `${prefix}latest` || (typeof version === 'string' && version.length <= 128 &&
			!version.includes('/') && isSafeSourcePath(version) && externalUrl === `${prefix}${encodeURIComponent(version)}`)) {
			return { kind: 'mcp', name };
		}
		return undefined;
	}

	const kind = mediaType === AgentFinderMediaType.Skill ? 'skill' : 'plugin';
	const manifest = mediaType === AgentFinderMediaType.Skill ? 'SKILL.md'
		: mediaType === AgentFinderMediaType.CopilotPlugin ? 'plugin.json'
			: mediaType === AgentFinderMediaType.ClaudePlugin ? '.claude-plugin/plugin.json'
				: undefined;
	const sourceSet = metadata.sourceSet;
	const repoPath = metadata.repoPath;
	if (!manifest || url.authority.toLowerCase() !== 'github.com' || /%2f|%5c/i.test(externalUrl) ||
		typeof sourceSet !== 'string' || typeof repoPath !== 'string' || !isSafeSourcePath(repoPath) || !isSafeSourcePath(url.path.slice(1))) {
		return undefined;
	}
	const repository = githubRepository(parseHttpUri(`https://github.com/${sourceSet}`), true);
	if (repository?.path !== `/${sourceSet}` || (repoPath !== manifest && !repoPath.endsWith(`/${manifest}`))) {
		return undefined;
	}
	const [, owner, name, view, ...parts] = url.path.split('/');
	if (`${owner}/${name}`.toLowerCase() !== sourceSet.toLowerCase() || (view !== 'blob' && view !== 'tree')) {
		return undefined;
	}
	const path = repoPath === manifest ? '' : repoPath.slice(0, -manifest.length - 1);
	if (mediaType === AgentFinderMediaType.CopilotPlugin && ['.claude-plugin', '.cursor-plugin', '.plugin'].includes(path.split('/').at(-1) ?? '')) {
		return undefined;
	}
	const refAndPath = parts.join('/');
	const refs = [refBeforePath(refAndPath, repoPath)];
	if (kind === 'plugin') {
		refs.push(path ? refBeforePath(refAndPath, path) : !refAndPath.includes('/') ? refAndPath : undefined);
	}
	const validRefs = refs.filter((ref): ref is string => ref !== undefined && isSafeGitRef(ref));
	return validRefs.length === 1 ? { kind, repository: sourceSet, ref: validRefs[0], path } : undefined;
}

function refBeforePath(refAndPath: string, path: string): string | undefined {
	return refAndPath.endsWith(`/${path}`) ? refAndPath.slice(0, -path.length - 1) : undefined;
}

function isSafeSourcePath(path: string): boolean {
	return path.length > 0 && path.length <= 4096 && /^[a-z0-9._+-]+(?:\/[a-z0-9._+-]+)*$/i.test(path) &&
		path.split('/').every(part => part !== '.' && part !== '..' && part.toLowerCase() !== '.git' && !part.startsWith('-') && !part.endsWith('.'));
}

function isSafeGitRef(ref: string): boolean {
	return ref.length <= 1024 && isSafeSourcePath(ref) && !ref.includes('..') &&
		ref.split('/').every(part => !part.startsWith('.') && !part.toLowerCase().endsWith('.lock'));
}

function parseHttpUri(value: unknown): URI | undefined {
	if (typeof value !== 'string' || value.length > maxUriLength || /[\s\\\u0000-\u001f\u007f]/.test(value)) {
		return undefined;
	}
	try {
		const uri = URI.parse(value, true);
		const scheme = uri.scheme.toLowerCase();
		const authority = /^(?:[a-z0-9][a-z0-9.-]*|\[[0-9a-f:]+\])(?::(?<port>\d{1,5}))?$/i.exec(uri.authority);
		if ((scheme !== Schemas.http && scheme !== Schemas.https) || !authority ||
			/[\u0000-\u001f\u007f\\]/.test(uri.path + uri.query + uri.fragment) ||
			(authority.groups?.port !== undefined && Number(authority.groups.port) > 65535)) {
			return undefined;
		}
		return uri.with({ scheme });
	} catch {
		return undefined;
	}
}

function githubRepository(uri: URI | undefined, rootOnly = false): URI | undefined {
	if (uri?.authority.toLowerCase() !== 'github.com') {
		return undefined;
	}
	const [, owner, name, ...rest] = uri.path.split('/');
	const repository = name?.replace(/\.git$/i, '');
	if (!owner || !repository || !/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i.test(owner) ||
		!/^[a-z0-9._-]{1,100}$/i.test(repository) || [owner, repository, ...rest].some(part => part === '.' || part === '..') ||
		(rootOnly && (rest.length > 0 || !!uri.query || !!uri.fragment))) {
		return undefined;
	}
	return URI.from({ scheme: Schemas.https, authority: 'github.com', path: `/${owner}/${repository}` });
}
