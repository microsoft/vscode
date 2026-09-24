/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, raceCancellationError } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../base/common/errors.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { IRequestOptions } from '../../../base/parts/request/common/request.js';
import { localize } from '../../../nls.js';
import { agentFinderMcpRegistryManifest, getAgentFinderMcpServerUrl, isValidAgentFinderMcpIdentity } from './agentFinderMcpRegistry.js';
import { CustomizationMarketplaceInstallation, CustomizationMarketplaceMediaType, ICustomizationMarketplaceEntry, ICustomizationMarketplaceProvider, ICustomizationMarketplaceSourcePage, ICustomizationMarketplaceSourceQuery } from '../../customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceSources } from '../../customizationMarketplace/common/customizationMarketplaceSources.js';
import { IRequestService, readBoundedResponse } from '../../request/common/request.js';

const endpoint = 'https://agentfinder.github.com/api/v1';
const requestTimeout = 30_000;
const maxResponseBytes = 5 * 1024 * 1024;
const defaultPageSize = 30;
const maxPageSize = 100;
const maxQueryLength = 4096;
const maxUnsupportedOnlyPages = 32;
const maxUriLength = 8192;
const maxPageTokenLength = 8192;
// JSON escaping can expand each token character to six characters; allow room for the cursor envelope.
const maxCursorLength = maxPageTokenLength * 6 + 64;
const maxResourceTextLength = 4096;
const maxMetadataEntries = 32;
const maxMetadataTextLength = 512;
const maxSourcePathLength = 4096;
const maxGitRefLength = 1024;

class AgentFinderError extends Error { }

export class AgentFinderRestProvider implements ICustomizationMarketplaceProvider {
	readonly id = CustomizationMarketplaceSources.AgentFinderPublicFeed.id;

	constructor(
		@IRequestService private readonly requestService: IRequestService,
	) { }

	async query(options: ICustomizationMarketplaceSourceQuery, token: CancellationToken): Promise<ICustomizationMarketplaceSourcePage> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		const query = options.query?.trim() ?? '';
		const requestedPageSize = options.pageSize ?? defaultPageSize;
		if (query.length > maxQueryLength || !isNonNegativeInteger(requestedPageSize) || requestedPageSize === 0 ||
			options.mediaType === CustomizationMarketplaceMediaType.CursorPlugin ||
			(options.mediaType !== undefined && !Object.values(CustomizationMarketplaceMediaType).includes(options.mediaType))) {
			throw new AgentFinderError(localize('agentFinder.invalidQuery', "The customization catalog query is invalid."));
		}
		const pageSize = Math.min(requestedPageSize, maxPageSize);
		let cursor = options.cursor === undefined ? undefined : parseCursor(options.cursor, !!query);

		const store = new DisposableStore();
		const cancellation = store.add(new CancellationTokenSource(token));
		let timedOut = false;
		disposableTimeout(() => {
			timedOut = true;
			cancellation.cancel();
		}, requestTimeout, store);

		try {
			for (let unsupportedOnlyPages = 0; ; unsupportedOnlyPages++) {
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
				const response = await raceCancellationError(this.requestPage(request, cancellation.token), cancellation.token);
				const page = parsePage(response, pageSize, query ? { kind: 'search', pageToken } : { kind: 'browse', offset });
				const items = page.items.filter(item => item.mediaType !== CustomizationMarketplaceMediaType.CursorPlugin);
				if (items.length || !page.nextCursor) {
					return { ...page, items, total: options.mediaType !== undefined && items.length === page.items.length ? page.total : undefined };
				}
				if (unsupportedOnlyPages >= maxUnsupportedOnlyPages) {
					throw new AgentFinderError(localize('agentFinder.unsupportedPages', "The customization catalog returned too many unsupported entries. Try a different search."));
				}
				cursor = parseCursor(page.nextCursor, !!query);
			}
		} catch (error) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			if (timedOut) {
				throw new AgentFinderError(localize('agentFinder.timeout', "The customization catalog took too long to respond. Try again."));
			}
			if (error instanceof AgentFinderError || isCancellationError(error)) {
				throw error;
			}
			throw new AgentFinderError(localize('agentFinder.unavailable', "Unable to reach the customization catalog. Check your connection and try again."));
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
				throw new AgentFinderError(localize('agentFinder.rateLimited', "The customization catalog is receiving too many requests. Try again later."));
			}
			if (!status || status < 200 || status >= 300) {
				throw new AgentFinderError(localize('agentFinder.httpError', "The customization catalog could not complete the request (HTTP {0}). Try again later.", status ?? '—'));
			}
			const text = await raceCancellationError(readBoundedResponse(context, maxResponseBytes, () => new AgentFinderError(localize('agentFinder.responseTooLarge', "The customization catalog response is too large. Try a smaller page."))), token);
			try {
				return JSON.parse(text);
			} catch {
				throw new AgentFinderError(localize('agentFinder.invalidJson', "The customization catalog returned invalid JSON. Try again later."));
			}
		} finally {
			context.stream.destroy();
		}
	}
}

function invalidResponse(): AgentFinderError {
	return new AgentFinderError(localize('agentFinder.invalidResponse', "The customization catalog returned an invalid response. Try again later."));
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

function parseCursor(value: string, search: boolean): { kind: 'browse'; offset: number } | { kind: 'search'; pageToken: string } {
	const invalidCursor = () => new AgentFinderError(localize('agentFinder.invalidCursor', "The customization catalog page is invalid. Start a new search."));
	if (typeof value !== 'string' || value.length > maxCursorLength) {
		throw invalidCursor();
	}
	let cursor: unknown;
	try {
		cursor = JSON.parse(value);
	} catch {
		throw invalidCursor();
	}
	if (isRecord(cursor)) {
		if (!search && cursor.kind === 'browse' && isNonNegativeInteger(cursor.offset)) {
			return { kind: 'browse', offset: cursor.offset };
		}
		if (search && cursor.kind === 'search' && isPageToken(cursor.pageToken)) {
			return { kind: 'search', pageToken: cursor.pageToken };
		}
	}
	throw invalidCursor();
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

function parsePage(value: unknown, pageSize: number, cursor: { kind: 'browse'; offset: number } | { kind: 'search'; pageToken?: string }): ICustomizationMarketplaceSourcePage {
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
		return { items, total: value.total, nextCursor: nextOffset < value.total ? JSON.stringify({ kind: 'browse', offset: nextOffset }) : undefined };
	}
	if ((value.total !== undefined && !isNonNegativeInteger(value.total)) ||
		(value.pageToken !== undefined && value.pageToken !== '' &&
			(!isPageToken(value.pageToken) || value.pageToken === cursor.pageToken || items.length === 0))) {
		throw invalidResponse();
	}
	return {
		items,
		total: value.total,
		nextCursor: isPageToken(value.pageToken) ? JSON.stringify({ kind: 'search', pageToken: value.pageToken }) : undefined,
	};
}

function parseResource(value: unknown): ICustomizationMarketplaceEntry {
	if (!isRecord(value)) {
		throw invalidResponse();
	}
	const identifier = text(value.identifier);
	const displayName = text(value.displayName);
	const mediaType = text(value.type ?? value.mediaType);
	if (!identifier || !displayName || !mediaType ||
		(value.score !== undefined && (typeof value.score !== 'number' || !Number.isFinite(value.score) || value.score < 0 || value.score > 100)) ||
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
		score: value.score,
		installation: parseInstallation(mediaType, metadata, url, externalUrl),
	};
}

function parseInstallation(mediaType: string, metadata: Record<string, unknown> | undefined, url: URI | undefined, externalUrl: string | undefined): CustomizationMarketplaceInstallation | undefined {
	if (!metadata || !url || !externalUrl || url.scheme !== Schemas.https || url.query || url.fragment) {
		return undefined;
	}
	if (mediaType === CustomizationMarketplaceMediaType.McpServer) {
		const name = metadata.serverName;
		const version = metadata.version;
		if (typeof name === 'string' && typeof version === 'string' && isValidAgentFinderMcpIdentity(name, version) &&
			(externalUrl === `${agentFinderMcpRegistryManifest.url}/${encodeURIComponent(name)}/versions/latest` ||
				externalUrl === getAgentFinderMcpServerUrl(name, version))) {
			return { kind: 'mcp', name, version };
		}
		return undefined;
	}

	const kind = mediaType === CustomizationMarketplaceMediaType.Skill ? 'skill' : 'plugin';
	const manifest = mediaType === CustomizationMarketplaceMediaType.Skill ? 'SKILL.md'
		: mediaType === CustomizationMarketplaceMediaType.CopilotPlugin ? 'plugin.json'
			: mediaType === CustomizationMarketplaceMediaType.ClaudePlugin ? '.claude-plugin/plugin.json'
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
	if (mediaType === CustomizationMarketplaceMediaType.CopilotPlugin && ['.claude-plugin', '.cursor-plugin', '.plugin'].includes(path.split('/').at(-1) ?? '')) {
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
	return path.length > 0 && path.length <= maxSourcePathLength && /^[a-z0-9._+-]+(?:\/[a-z0-9._+-]+)*$/i.test(path) &&
		path.split('/').every(part => part !== '.' && part !== '..' && part.toLowerCase() !== '.git' && !part.startsWith('-') && !part.endsWith('.'));
}

function isSafeGitRef(ref: string): boolean {
	return ref.length <= maxGitRefLength && isSafeSourcePath(ref) && !ref.includes('..') &&
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
