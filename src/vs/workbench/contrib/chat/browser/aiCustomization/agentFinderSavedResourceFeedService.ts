/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError, getErrorMessage, isCancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IAgentFinderRequestService, isValidAgentFinderFeedId } from '../../../../../platform/customizationMarketplace/common/agentFinderRequestService.js';
import { CustomizationMarketplaceInstallation, CustomizationMarketplaceMediaType, ICustomizationMarketplaceEntry } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { getGitHubMcpRegistryIcon, getGitHubMcpRegistryIdentity } from './githubMcpRegistryIcons.js';

const maxFeedEntries = 100;
const maxFeedNameCodePoints = 512;
const maxIdentifierLength = 512;
const maxResourceTextLength = 4096;
const maxMetadataEntries = 32;
const maxMetadataTextLength = 512;
const maxUriLength = 8192;
const agentSkillMediaType = 'application/agent-skills+md';
const immutableGitRefPattern = /^[0-9a-f]{40}$/i;

export interface IAgentFinderSavedResourceFeedIds {
	readonly editorsPicks: string;
	readonly planBuildAndShip: string;
	readonly connectYourWork: string;
}

export interface IAgentFinderSavedResourceFeed {
	readonly id: string;
	readonly name: string;
	readonly version: number;
	readonly items: readonly ICustomizationMarketplaceEntry[];
}

export type AgentFinderSavedResourceFeedResult =
	| { readonly id: string; readonly feed: IAgentFinderSavedResourceFeed; readonly error?: undefined }
	| { readonly id: string; readonly feed?: undefined; readonly error: string };

export const IAgentFinderSavedResourceFeedService = createDecorator<IAgentFinderSavedResourceFeedService>('agentFinderSavedResourceFeedService');

export interface IAgentFinderSavedResourceFeedService {
	readonly _serviceBrand: undefined;
	readonly feedIds: IAgentFinderSavedResourceFeedIds | undefined;
	readonly onDidChange: Event<void>;
	readonly authorizationRequired: boolean;
	getFeeds(feedIds: readonly string[], token: CancellationToken): Promise<readonly AgentFinderSavedResourceFeedResult[]>;
	signIn(token: CancellationToken): Promise<void>;
}

type AgentFinderSavedResourceFeedErrorKind = 'authentication' | 'response' | 'transport';

class AgentFinderSavedResourceFeedError extends Error {
	constructor(message: string, readonly kind: AgentFinderSavedResourceFeedErrorKind) {
		super(message);
	}
}

export class AgentFinderSavedResourceFeedService extends Disposable implements IAgentFinderSavedResourceFeedService {
	declare readonly _serviceBrand: undefined;

	readonly feedIds: IAgentFinderSavedResourceFeedIds | undefined;
	readonly onDidChange: Event<void>;
	private _authorizationRequired = false;

	constructor(
		@IAgentFinderRequestService private readonly requestService: IAgentFinderRequestService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IProductService productService: IProductService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.feedIds = productService.defaultChatAgent?.agentFinderCustomizationFeedIds;
		this.onDidChange = Event.any(
			Event.map(defaultAccountService.onDidChangeDefaultAccount, () => undefined),
			Event.map(Event.filter(authenticationService.onDidChangeSessions, event => {
				const account = defaultAccountService.currentDefaultAccount;
				return !!account && event.providerId === account.authenticationProvider.id &&
					[...event.event.added ?? [], ...event.event.changed ?? [], ...event.event.removed ?? []].some(session => session.id === account.sessionId);
			}), () => undefined),
		);
		this._register(this.onDidChange(() => this._authorizationRequired = false));
	}

	get authorizationRequired(): boolean {
		return this._authorizationRequired;
	}

	async getFeeds(feedIds: readonly string[], token: CancellationToken): Promise<readonly AgentFinderSavedResourceFeedResult[]> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		let authorization: string;
		try {
			authorization = await this.getAuthorization(token);
		} catch (error) {
			if (token.isCancellationRequested || isCancellationError(error)) {
				throw new CancellationError();
			}
			const message = getErrorMessage(error);
			return feedIds.map(id => ({ id, error: message }));
		}

		return Promise.all(feedIds.map(async id => {
			try {
				const feed = await this.getFeed(id, authorization, token);
				return { id, feed };
			} catch (error) {
				if (token.isCancellationRequested || isCancellationError(error)) {
					throw new CancellationError();
				}
				const message = getErrorMessage(error);
				this.logService.error(`[AgentFinderSavedResourceFeed] Failed to load feed '${id}': ${message}`);
				return { id, error: message };
			}
		}));
	}

	async signIn(token: CancellationToken): Promise<void> {
		const account = await raceCancellationError(this.defaultAccountService.signIn(), token);
		if (!account) {
			throw new CancellationError();
		}
		this._authorizationRequired = false;
	}

	private async getAuthorization(token: CancellationToken): Promise<string> {
		const account = this.defaultAccountService.currentDefaultAccount ?? await raceCancellationError(this.defaultAccountService.getDefaultAccount(), token);
		if (!account) {
			this._authorizationRequired = true;
			throw new AgentFinderSavedResourceFeedError(localize('agentFinderFeed.signInRequired', "Sign in to view curated customizations."), 'authentication');
		}
		const sessions = await raceCancellationError(this.authenticationService.getSessions(account.authenticationProvider.id, [], { silent: true }, true), token);
		const currentAccount = this.defaultAccountService.currentDefaultAccount;
		if (!currentAccount || currentAccount.authenticationProvider.id !== account.authenticationProvider.id ||
			currentAccount.sessionId !== account.sessionId || currentAccount.accountName !== account.accountName) {
			throw new CancellationError();
		}
		const session = sessions.find(candidate => candidate.id === account.sessionId);
		if (!session) {
			this._authorizationRequired = true;
			throw new AgentFinderSavedResourceFeedError(localize('agentFinderFeed.signInRequired', "Sign in to view curated customizations."), 'authentication');
		}
		this._authorizationRequired = false;
		return session.accessToken;
	}

	private async getFeed(feedId: string, authorization: string, token: CancellationToken): Promise<IAgentFinderSavedResourceFeed> {
		if (!isValidAgentFinderFeedId(feedId)) {
			throw new AgentFinderSavedResourceFeedError(localize('agentFinderFeed.invalidConfiguration', "The customization feed is not configured correctly."), 'response');
		}
		return parseFeed(await this.requestJson(feedId, authorization, token), feedId);
	}

	private async requestJson(feedId: string, authorization: string, token: CancellationToken): Promise<unknown> {
		let result;
		try {
			result = await this.requestService.request(feedId, authorization, token);
		} catch (error) {
			if (token.isCancellationRequested || isCancellationError(error)) {
				throw new CancellationError();
			}
			this.logService.error('[AgentFinderSavedResourceFeed] Request failed', error);
			throw new AgentFinderSavedResourceFeedError(localize('agentFinderFeed.unavailable', "Unable to reach the customization feed. Check your connection and try again."), 'transport');
		}
		if (result.kind === 'error') {
			switch (result.error) {
				case 'timeout':
					throw new AgentFinderSavedResourceFeedError(localize('agentFinderFeed.timeout', "The customization feed took too long to load. Try again."), 'transport');
				case 'responseTooLarge':
					throw new AgentFinderSavedResourceFeedError(localize('agentFinderFeed.responseTooLarge', "The customization feed response is too large."), 'response');
				case 'transport':
					throw new AgentFinderSavedResourceFeedError(localize('agentFinderFeed.unavailable', "Unable to reach the customization feed. Check your connection and try again."), 'transport');
			}
		}
		const status = result.statusCode;
		if (status === 401) {
			this._authorizationRequired = true;
			throw new AgentFinderSavedResourceFeedError(localize('agentFinderFeed.signInRequired', "Sign in to view curated customizations."), 'authentication');
		}
		if (status === 429) {
			throw new AgentFinderSavedResourceFeedError(localize('agentFinderFeed.rateLimited', "The customization feed is receiving too many requests. Try again later."), 'transport');
		}
		if (!status || status < 200 || status >= 300) {
			throw new AgentFinderSavedResourceFeedError(localize('agentFinderFeed.httpError', "The customization feed could not complete the request (HTTP {0}). Try again later.", status ?? '—'), 'transport');
		}
		try {
			return JSON.parse(result.body);
		} catch {
			throw new AgentFinderSavedResourceFeedError(localize('agentFinderFeed.invalidJson', "The customization feed returned invalid JSON. Try again later."), 'response');
		}
	}
}

function parseFeed(value: unknown, feedId: string): IAgentFinderSavedResourceFeed {
	if (!isRecord(value) || value.id !== feedId || typeof value.name !== 'string' || !value.name.trim() ||
		[...value.name].length > maxFeedNameCodePoints || !isPositiveInteger(value.version) ||
		!Array.isArray(value.entries) || value.entries.length > maxFeedEntries) {
		throw invalidResponse();
	}

	const identifiers = new Set<string>();
	const items: ICustomizationMarketplaceEntry[] = [];
	for (const entry of value.entries) {
		if (!isRecord(entry) || typeof entry.identifier !== 'string' || !entry.identifier ||
			entry.identifier.length > maxIdentifierLength || identifiers.has(entry.identifier) ||
			(entry.status !== 'available' && entry.status !== 'unavailable' && entry.status !== 'filtered')) {
			throw invalidResponse();
		}
		identifiers.add(entry.identifier);
		if (entry.status !== 'available') {
			if (entry.resource !== undefined) {
				throw invalidResponse();
			}
			continue;
		}
		const resource = parseResource(entry.resource, entry.identifier);
		if (resource) {
			items.push(resource);
		}
	}

	return {
		id: value.id,
		name: value.name,
		version: value.version,
		items,
	};
}

function parseResource(value: unknown, expectedIdentifier: string): ICustomizationMarketplaceEntry | undefined {
	if (!isRecord(value)) {
		throw invalidResponse();
	}
	const identifier = text(value.identifier, maxIdentifierLength);
	const displayName = text(value.displayName);
	const declaredType = text(value.type);
	const compatibilityType = text(value.mediaType);
	if (!identifier || identifier !== expectedIdentifier || !displayName || !declaredType ||
		(compatibilityType !== undefined && declaredType !== compatibilityType)) {
		throw invalidResponse();
	}
	const mediaType = normalizeMediaType(declaredType);
	if (!mediaType) {
		return undefined;
	}
	const externalUrl = httpsUrl(value.url);
	const url = externalUrl ? URI.parse(externalUrl) : undefined;
	const github = getGitHubLocation(externalUrl);
	const mcpIdentity = mediaType === CustomizationMarketplaceMediaType.McpServer
		? getGitHubMcpRegistryIdentity(externalUrl)
		: undefined;
	const publisher = github?.owner;
	const publisherUrl = publisher ? URI.from({ scheme: Schemas.https, authority: 'github.com', path: `/${publisher}` }) : undefined;
	const installation = parseInstallation(mediaType, externalUrl, github, mcpIdentity);
	const readmeUri = installation?.kind === 'plugin'
		? URI.from({
			scheme: Schemas.https,
			authority: 'raw.githubusercontent.com',
			path: `/${installation.repository}/${installation.ref}/${[installation.path, 'README.md'].filter(Boolean).join('/')}`,
		})
		: undefined;
	return {
		identifier,
		displayName,
		mediaType,
		description: optionalText(value.description) ?? '',
		tags: strings(value.tags),
		capabilities: strings(value.capabilities),
		representativeQueries: strings(value.representativeQueries),
		url,
		externalUrl,
		repository: github?.repository,
		readmeUri,
		icon: mcpIdentity
			? getGitHubMcpRegistryIcon(externalUrl, identifier)
			: publisher
				? URI.from({ scheme: Schemas.https, authority: 'github.com', path: `/${publisher}.png`, query: 'size=64' })
				: undefined,
		publisher,
		publisherUrl,
		version: optionalText(value.version),
		installation,
	};
}

function normalizeMediaType(value: string): CustomizationMarketplaceMediaType | undefined {
	switch (value) {
		case agentSkillMediaType:
		case CustomizationMarketplaceMediaType.Skill:
			return CustomizationMarketplaceMediaType.Skill;
		case CustomizationMarketplaceMediaType.McpServer:
		case CustomizationMarketplaceMediaType.CopilotPlugin:
		case CustomizationMarketplaceMediaType.ClaudePlugin:
			return value;
		default:
			return undefined;
	}
}

interface IGitHubLocation {
	readonly owner: string;
	readonly name: string;
	readonly repository: URI;
	readonly ref?: string;
	readonly path?: string;
}

function getGitHubLocation(value: string | undefined): IGitHubLocation | undefined {
	if (!value || /%2f|%5c/i.test(value)) {
		return undefined;
	}
	try {
		const url = new URL(value);
		if (url.hostname.toLowerCase() !== 'github.com' || url.search || url.hash) {
			return undefined;
		}
		const segments = url.pathname.split('/').filter(Boolean).map(segment => decodeURIComponent(segment));
		const [owner, name, view, ref, ...path] = segments;
		if (!owner || !name || !isSafeGitHubSegment(owner) || !isSafeGitHubSegment(name)) {
			return undefined;
		}
		const repository = URI.from({ scheme: Schemas.https, authority: 'github.com', path: `/${owner}/${name}` });
		if ((view !== 'tree' && view !== 'blob') || !ref || path.length === 0 || path.some(segment => !isSafePathSegment(segment))) {
			return { owner, name, repository };
		}
		return { owner, name, repository, ref, path: path.join('/') };
	} catch {
		return undefined;
	}
}

function parseInstallation(
	mediaType: CustomizationMarketplaceMediaType,
	externalUrl: string | undefined,
	github: IGitHubLocation | undefined,
	mcpIdentity: string | undefined,
): CustomizationMarketplaceInstallation | undefined {
	if (mediaType === CustomizationMarketplaceMediaType.McpServer) {
		const version = getGitHubMcpRegistryVersion(externalUrl);
		return mcpIdentity && version ? { kind: 'mcp', name: mcpIdentity, version } : undefined;
	}
	if (!github?.ref || !immutableGitRefPattern.test(github.ref) || !github.path) {
		return undefined;
	}
	const repository = `${github.owner}/${github.name}`;
	if (mediaType === CustomizationMarketplaceMediaType.Skill) {
		const path = trimManifest(github.path, 'SKILL.md');
		return path ? { kind: 'skill', repository, ref: github.ref, path } : undefined;
	}
	if (mediaType === CustomizationMarketplaceMediaType.CopilotPlugin) {
		return { kind: 'plugin', repository, ref: github.ref, path: trimManifest(github.path, 'plugin.json') };
	}
	if (mediaType === CustomizationMarketplaceMediaType.ClaudePlugin) {
		return { kind: 'plugin', repository, ref: github.ref, path: trimManifest(github.path, '.claude-plugin/plugin.json') };
	}
	return undefined;
}

function trimManifest(path: string, manifest: string): string {
	return path === manifest ? '' : path.endsWith(`/${manifest}`) ? path.slice(0, -manifest.length - 1) : path;
}

function getGitHubMcpRegistryVersion(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}
	try {
		const url = new URL(value);
		const segments = url.pathname.split('/');
		const versionsIndex = segments.lastIndexOf('versions');
		const version = decodeURIComponent(segments[versionsIndex + 1] ?? '');
		return versionsIndex >= 0 && version && version.length <= maxMetadataTextLength && isSafePathSegment(version) && version !== 'latest'
			? version
			: undefined;
	} catch {
		return undefined;
	}
}

function httpsUrl(value: unknown): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== 'string' || value.length > maxUriLength) {
		throw invalidResponse();
	}
	try {
		const url = new URL(value);
		if (url.protocol !== `${Schemas.https}:` || url.username || url.password) {
			throw invalidResponse();
		}
		return value;
	} catch (error) {
		if (error instanceof AgentFinderSavedResourceFeedError) {
			throw error;
		}
		throw invalidResponse();
	}
}

function text(value: unknown, maxLength = maxResourceTextLength): string | undefined {
	if (typeof value !== 'string' || value.length > maxLength) {
		return undefined;
	}
	return value.trim() || undefined;
}

function optionalText(value: unknown): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	const result = text(value);
	if (!result) {
		throw invalidResponse();
	}
	return result;
}

function strings(value: unknown): readonly string[] {
	if (value === undefined) {
		return [];
	}
	if (!Array.isArray(value) || value.length > maxMetadataEntries) {
		throw invalidResponse();
	}
	return value.map(item => {
		const result = text(item, maxMetadataTextLength);
		if (!result) {
			throw invalidResponse();
		}
		return result;
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isSafeGitHubSegment(value: string): boolean {
	return /^[A-Za-z0-9_.-]+$/.test(value) && value !== '.' && value !== '..';
}

function isSafePathSegment(value: string): boolean {
	return value.length > 0 && value !== '.' && value !== '..' && !value.includes('/') && !value.includes('\\');
}

function invalidResponse(): AgentFinderSavedResourceFeedError {
	return new AgentFinderSavedResourceFeedError(localize('agentFinderFeed.invalidResponse', "The customization feed returned an invalid response. Try again later."), 'response');
}
