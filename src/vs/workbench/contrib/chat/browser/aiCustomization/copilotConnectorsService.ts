/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { matchesFuzzy2 } from '../../../../../base/common/filters.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { equals } from '../../../../../base/common/objects.js';
import { listenStream } from '../../../../../base/common/stream.js';
import { URI } from '../../../../../base/common/uri.js';
import { IRequestContext, IRequestOptions } from '../../../../../base/parts/request/common/request.js';
import { localize } from '../../../../../nls.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceEntry, ICustomizationMarketplaceSource, ICustomizationMarketplaceSourcePage, ICustomizationMarketplaceSourceQuery } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { ChatConfiguration } from '../../common/constants.js';

const maxSearchQueryLength = 256;
const maxSearchWords = 16;
const fuzzyWindowSize = 128;
const requestTimeout = 30_000;
const maxResponseBytes = 5 * 1024 * 1024;
const maxTextLength = 4096;
const maxMetadataEntries = 32;
const maxConnectors = 1000;
const maxMcpServersPerConnector = 64;
const refreshInterval = 60_000;
const connectionPollInterval = 2_000;
const connectionTimeout = 5 * 60_000;

export interface ICopilotConnectorMcpServer {
	readonly name: string;
	readonly type: string;
	readonly url?: URI;
}

export type CopilotConnectorConnectionStatus = 'not_connected' | 'pending' | 'connected' | 'error';
export type CopilotConnectorConnectionStatusDetail = 'sign_in_required' | 'reconnect_required' | 'review_required' | 'retryable_error' | 'unavailable';

export interface ICopilotConnectorAuthor {
	readonly name?: string;
	readonly email?: string;
	readonly url?: URI;
}

export interface ICopilotConnector {
	readonly name: string;
	readonly displayName: string;
	readonly description: string;
	readonly icon?: URI;
	readonly documentation?: URI;
	readonly homepage?: URI;
	readonly version?: string;
	readonly author?: ICopilotConnectorAuthor;
	readonly repository?: URI;
	readonly license?: string;
	readonly tags: readonly string[];
	readonly keywords: readonly string[];
	readonly capabilities: readonly string[];
	readonly representativeQueries: readonly string[];
	readonly tier?: string;
	readonly releaseTag?: string;
	readonly isExportSupported?: boolean;
	readonly agents: readonly string[];
	readonly commands: readonly string[];
	readonly skills: readonly string[];
	readonly connectionStatus: CopilotConnectorConnectionStatus;
	readonly connectionStatusDetail?: CopilotConnectorConnectionStatusDetail;
	readonly connectionErrorMessage?: string;
	readonly protectedResourceMetadataUrl?: string;
	readonly scopes: readonly string[];
	readonly mcpServers: readonly ICopilotConnectorMcpServer[];
}

export interface IConnectedCopilotConnectorMcpServer {
	readonly connector: ICopilotConnector;
	readonly serverName: string;
}

export const ICopilotConnectorsService = createDecorator<ICopilotConnectorsService>('copilotConnectorsService');

export interface ICopilotConnectorsService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	readonly connectors: readonly ICopilotConnector[];
	readonly connectedMcpServers: readonly IConnectedCopilotConnectorMcpServer[];
	getConnectors(token: CancellationToken): Promise<readonly ICopilotConnector[]>;
	refresh(token: CancellationToken): Promise<readonly ICopilotConnector[]>;
	connect(name: string, token: CancellationToken): Promise<void>;
	disconnect(name: string, token: CancellationToken): Promise<void>;
}

class CopilotConnectorsError extends Error { }

export class CopilotConnectorsService extends Disposable implements ICopilotConnectorsService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	private readonly enabledCancellation = this._register(new MutableDisposable<CancellationTokenSource>());
	private enabled = false;
	private _connectors: readonly ICopilotConnector[] = [];
	private _lastRefreshTime = 0;

	constructor(
		@IRequestService private readonly requestService: IRequestService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IProductService private readonly productService: IProductService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.updateEnablement();
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(ChatConfiguration.ChatCustomizationsCopilotConnectorsEnabled)) {
				this.updateEnablement();
			}
		}));
	}

	get connectors(): readonly ICopilotConnector[] {
		return this._connectors;
	}

	get connectedMcpServers(): readonly IConnectedCopilotConnectorMcpServer[] {
		const result: IConnectedCopilotConnectorMcpServer[] = [];
		const serverNames = new Set<string>();
		for (const connector of this._connectors) {
			if (connector.connectionStatus !== 'connected') {
				continue;
			}
			for (const server of connector.mcpServers) {
				if (!serverNames.has(server.name)) {
					serverNames.add(server.name);
					result.push({ connector, serverName: server.name });
				}
			}
		}
		return result;
	}

	async getConnectors(token: CancellationToken): Promise<readonly ICopilotConnector[]> {
		if (this._lastRefreshTime > 0 && Date.now() - this._lastRefreshTime < refreshInterval) {
			return this._connectors;
		}
		return this.refresh(token);
	}

	async refresh(token: CancellationToken): Promise<readonly ICopilotConnector[]> {
		if (!this.isEnabled()) {
			return [];
		}
		const operation = this.createOperation(token);
		try {
			const document = await this.request('GET', '/plugins', undefined, operation.token);
			if (document === undefined) {
				this.setConnectors([]);
				return this._connectors;
			}
			const connectors = parseConnectors(document);
			if (operation.token.isCancellationRequested || !this.isEnabled()) {
				throw new CancellationError();
			}
			this._lastRefreshTime = Date.now();
			this.setConnectors(connectors);
			return this._connectors;
		} finally {
			operation.dispose();
		}
	}

	async connect(name: string, token: CancellationToken): Promise<void> {
		const operation = this.createOperation(token);
		try {
			const connectors = await this.refresh(operation.token);
			if (connectors.some(connector => connector.name === name && connector.connectionStatus === 'connected')) {
				return;
			}
			const response = await this.request('PUT', `/connectors/managed/${encodeURIComponent(name)}/connection`, { client_source: 'VS_CODE' }, operation.token, true);
			const consentLink = parseHttpsUri(asRecord(response)?.consent_link);
			if (consentLink && !await this.openerService.open(consentLink)) {
				throw new CopilotConnectorsError(localize('copilotConnectors.openConsentFailed', "The connector authorization page could not be opened."));
			}

			const deadline = Date.now() + connectionTimeout;
			while (Date.now() < deadline) {
				const refreshed = await this.refresh(operation.token);
				if (refreshed.some(connector => connector.name === name && connector.connectionStatus === 'connected')) {
					return;
				}
				await timeout(connectionPollInterval, operation.token);
			}
			throw new CopilotConnectorsError(localize('copilotConnectors.connectionTimedOut', "Connector authorization did not finish in time. Complete authorization in the browser, then try again."));
		} finally {
			operation.dispose();
		}
	}

	async disconnect(name: string, token: CancellationToken): Promise<void> {
		const operation = this.createOperation(token);
		try {
			await this.request('DELETE', `/connectors/managed/${encodeURIComponent(name)}/connection`, undefined, operation.token, true);
			const deadline = Date.now() + connectionTimeout;
			while (Date.now() < deadline) {
				const connectors = await this.refresh(operation.token);
				if (!connectors.some(connector => connector.name === name && connector.connectionStatus === 'connected')) {
					return;
				}
				await timeout(connectionPollInterval, operation.token);
			}
			throw new CopilotConnectorsError(localize('copilotConnectors.disconnectionTimedOut', "The connector did not disconnect in time. Try again."));
		} finally {
			operation.dispose();
		}
	}

	private updateEnablement(): void {
		const enabled = this.isEnabled();
		if (enabled === this.enabled) {
			return;
		}
		this.enabled = enabled;
		this.enabledCancellation.value?.cancel();
		const cancellation = this.enabledCancellation.value = new CancellationTokenSource();
		if (!enabled) {
			cancellation.cancel();
			this._lastRefreshTime = 0;
			this.setConnectors([]);
		}
	}

	private isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(ChatConfiguration.ChatCustomizationsCopilotConnectorsEnabled) === true;
	}

	private createOperation(token: CancellationToken): { readonly token: CancellationToken; dispose(): void } {
		if (!this.isEnabled() || token.isCancellationRequested) {
			throw new CancellationError();
		}
		const store = new DisposableStore();
		const cancellation = store.add(new CancellationTokenSource(token));
		const enabledToken = this.enabledCancellation.value?.token;
		if (enabledToken?.isCancellationRequested) {
			cancellation.cancel();
		} else if (enabledToken) {
			store.add(enabledToken.onCancellationRequested(() => cancellation.cancel()));
		}
		return {
			token: cancellation.token,
			dispose: () => store.dispose(),
		};
	}

	private async request(method: 'DELETE' | 'GET' | 'PUT', path: string, data: object | undefined, token: CancellationToken, requireAuthentication = false): Promise<unknown | undefined> {
		const endpoint = this.productService.defaultChatAgent?.mcpConnectorsUrl;
		if (!endpoint || !isHttpsUrl(endpoint)) {
			if (requireAuthentication) {
				throw new CopilotConnectorsError(localize('copilotConnectors.unavailable', "Copilot connectors are not available in this product."));
			}
			return undefined;
		}
		const provider = this.defaultAccountService.getDefaultAccountAuthenticationProvider();
		if (provider.enterprise) {
			if (requireAuthentication) {
				throw new CopilotConnectorsError(localize('copilotConnectors.enterpriseUnavailable', "Copilot connectors are not available for this GitHub Enterprise account."));
			}
			return undefined;
		}
		const account = this.defaultAccountService.currentDefaultAccount ?? await this.defaultAccountService.getDefaultAccount();
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const sessions = await this.authenticationService.getSessions(provider.id, [], { silent: true }, true);
		const session = account ? sessions.find(candidate => candidate.id === account.sessionId) : undefined;
		if (!session) {
			if (requireAuthentication) {
				throw new CopilotConnectorsError(localize('copilotConnectors.signInRequired', "Sign in to GitHub Copilot before connecting this service."));
			}
			return undefined;
		}

		const options: IRequestOptions = {
			url: `${endpoint.replace(/\/+$/, '')}${path}`,
			type: method,
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${session.accessToken}`,
				...(data ? { 'Content-Type': 'application/json' } : {}),
			},
			data: data ? JSON.stringify(data) : undefined,
			timeout: requestTimeout,
			followRedirects: 0,
			disableCache: true,
			callSite: `copilotConnectors.${method === 'GET' ? 'query' : method === 'PUT' ? 'connect' : 'disconnect'}`,
		};
		let context: IRequestContext;
		try {
			context = await this.requestService.request(options, token);
		} catch (error) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			this.logService.error('[CopilotConnectorsService] Request failed', error);
			throw new CopilotConnectorsError(localize('copilotConnectors.requestFailed', "Copilot connectors could not be reached. Check your connection and try again."));
		}
		try {
			const status = context.res.statusCode ?? 0;
			if (status < 200 || status >= 300) {
				throw new CopilotConnectorsError(localize('copilotConnectors.httpError', "Copilot connectors could not complete the request (HTTP {0}).", status));
			}
			if (status === 204) {
				return undefined;
			}
			const text = await raceCancellationError(readResponse(context), token);
			try {
				return text ? JSON.parse(text) : undefined;
			} catch {
				throw new CopilotConnectorsError(localize('copilotConnectors.invalidJson', "Copilot connectors returned an invalid response."));
			}
		} catch (error) {
			if (!(error instanceof CancellationError)) {
				this.logService.error('[CopilotConnectorsService] Request failed', error);
			}
			throw error;
		} finally {
			context.stream.destroy();
		}
	}

	private setConnectors(connectors: readonly ICopilotConnector[]): void {
		if (equals(this._connectors, connectors)) {
			return;
		}
		this._connectors = connectors;
		this._onDidChange.fire();
	}

	override dispose(): void {
		this.enabledCancellation.value?.cancel();
		super.dispose();
	}
}

export class CopilotConnectorsMarketplaceSource implements ICustomizationMarketplaceSource {
	readonly id = CustomizationMarketplaceSources.CopilotConnectors.id;

	constructor(
		private readonly service: ICopilotConnectorsService,
		private readonly configurationService: IConfigurationService,
	) { }

	async query(options: ICustomizationMarketplaceSourceQuery, token: CancellationToken): Promise<ICustomizationMarketplaceSourcePage> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (this.configurationService.getValue<boolean>(ChatConfiguration.ChatCustomizationsCopilotConnectorsEnabled) !== true ||
			(options.mediaType !== undefined && options.mediaType !== CustomizationMarketplaceMediaType.McpServer)) {
			return { items: [], total: 0 };
		}
		const text = options.query?.trim() ?? '';
		const words = text ? text.toLowerCase().split(/\s+/) : [];
		const requestedPageSize = options.pageSize ?? 30;
		if (text.length > maxSearchQueryLength || words.length > maxSearchWords || !Number.isSafeInteger(requestedPageSize) || requestedPageSize <= 0) {
			throw new CopilotConnectorsError(localize('copilotConnectors.invalidQuery', "Use a positive page size and at most {0} characters and {1} words to search Copilot connectors.", maxSearchQueryLength, maxSearchWords));
		}
		const pageSize = Math.min(requestedPageSize, 100);
		const offset = parseOffset(options.cursor);
		const connectors = await raceCancellationError(this.service.getConnectors(token), token);
		const matches = words.length ? connectors.flatMap(connector => {
			const score = scoreConnector(connector, words);
			return score === undefined ? [] : [{ ...toMarketplaceEntry(connector), score }];
		}).sort((a, b) => b.score - a.score) : connectors.map(connector => toMarketplaceEntry(connector));
		const page = matches.slice(offset, offset + pageSize);
		return {
			items: page,
			total: matches.length,
			nextCursor: offset + page.length < matches.length ? String(offset + page.length) : undefined,
		};
	}
}

/** Exact names score 100; otherwise average each word's best name (70-95), keyword (40-65), or descriptive (10-35) match. */
function scoreConnector(connector: ICopilotConnector, words: readonly string[]): number | undefined {
	const names = [connector.name, connector.displayName];
	if (names.some(name => name.toLowerCase().replace(/\s+/g, ' ') === words.join(' '))) {
		return 100;
	}
	const fields = [
		{ values: names, weight: 70 },
		{ values: [...connector.keywords, ...connector.capabilities, ...connector.tags], weight: 40 },
		{ values: [connector.description, ...connector.representativeQueries], weight: 10 },
	];
	let total = 0;
	for (const word of words) {
		let best: number | undefined;
		for (const { values, weight } of fields) {
			for (const value of values) {
				const score = scoreConnectorField(word, value);
				if (score !== undefined) {
					best = Math.max(best ?? 0, weight + score);
				}
			}
			if (best !== undefined) {
				break;
			}
		}
		if (best === undefined) {
			return undefined;
		}
		total += best;
	}
	return Math.round(total / words.length);
}

function scoreConnectorField(word: string, value: string): number | undefined {
	const index = value.toLowerCase().indexOf(word);
	if (index >= 0) {
		return value.length === word.length ? 25 : index === 0 ? 20 : 15;
	}
	// The fuzzy helper truncates at 128 characters; longer words must match contiguously, never by a truncated prefix.
	if (word.length > fuzzyWindowSize) {
		return undefined;
	}
	let best: number | undefined;
	for (let start = 0; start < value.length; start += fuzzyWindowSize / 2) {
		const matches = matchesFuzzy2(word, value.slice(start, start + fuzzyWindowSize));
		if (matches?.length) {
			const span = matches[matches.length - 1].end - matches[0].start;
			best = Math.max(best ?? 0, Math.round(10 * word.length / span));
		}
	}
	return best;
}

function toMarketplaceEntry(connector: ICopilotConnector): ICustomizationMarketplaceEntry {
	return {
		identifier: connector.name,
		displayName: connector.displayName,
		description: connector.description,
		mediaType: CustomizationMarketplaceMediaType.McpServer,
		tags: connector.tags,
		capabilities: connector.capabilities,
		representativeQueries: connector.representativeQueries,
		url: connector.documentation,
		externalUrl: connector.documentation?.toString(true),
		icon: connector.icon,
		publisher: localize('copilotConnectors.publisher', "GitHub Copilot"),
		installation: { kind: 'copilotConnector', name: connector.name },
	};
}

function parseConnectors(value: unknown): readonly ICopilotConnector[] {
	const plugins = asRecord(value)?.plugins;
	if (!Array.isArray(plugins) || plugins.length > maxConnectors) {
		throw new CopilotConnectorsError(localize('copilotConnectors.invalidResponse', "Copilot connectors returned an invalid response."));
	}
	const connectors: ICopilotConnector[] = [];
	for (const value of plugins) {
		const plugin = asRecord(value);
		const name = text(plugin?.name, 512);
		if (!plugin || !name) {
			continue;
		}
		const metadata = asRecord(plugin.metadata);
		const connection = asRecord(plugin.connection);
		const displayName = text(metadata?.displayName) ?? name;
		const description = text(metadata?.description) ?? text(plugin.description) ?? localize('copilotConnectors.defaultDescription', "Connect {0} to GitHub Copilot.", displayName);
		const mcpServers = asRecord(asRecord(plugin.mcpServers)?.mcpServers);
		const mcpServerEntries = Object.entries(mcpServers ?? {});
		if (mcpServerEntries.length > maxMcpServersPerConnector) {
			throw new CopilotConnectorsError(localize('copilotConnectors.invalidResponse', "Copilot connectors returned an invalid response."));
		}
		connectors.push({
			name,
			displayName,
			description,
			icon: parseHttpsUri(metadata?.iconUrl ?? metadata?.icon),
			documentation: parseHttpsUri(metadata?.documentationUrl ?? metadata?.documentation),
			homepage: parseHttpsUri(metadata?.homepage),
			version: text(metadata?.version, 512),
			author: parseAuthor(metadata?.author),
			repository: parseHttpsUri(metadata?.repository),
			license: text(metadata?.license, 512),
			tags: strings(metadata?.tags),
			keywords: strings(metadata?.keywords),
			capabilities: strings(metadata?.capabilities),
			representativeQueries: strings(metadata?.representativeQueries),
			tier: text(metadata?.tier, 128),
			releaseTag: text(metadata?.releaseTag, 128),
			isExportSupported: typeof metadata?.isExportSupported === 'boolean' ? metadata.isExportSupported : undefined,
			agents: strings(plugin.agents),
			commands: strings(plugin.commands),
			skills: strings(plugin.skills),
			connectionStatus: parseConnectionStatus(connection?.status),
			connectionStatusDetail: parseConnectionStatusDetail(connection?.statusDetail),
			connectionErrorMessage: text(connection?.errorMessage) ?? text(asRecord(connection?.error)?.message),
			protectedResourceMetadataUrl: text(connection?.protectedResourceMetadataUrl),
			scopes: strings(connection?.scopes),
			mcpServers: mcpServerEntries.flatMap(([serverName, serverValue]) => {
				const server = asRecord(serverValue);
				return serverName.length <= 512 && server?.type === 'http' && typeof server.url === 'string' && isHttpsUrl(server.url)
					? [{ name: serverName, type: server.type, url: parseHttpsUri(server.url) }]
					: [];
			}),
		});
	}

	function parseAuthor(value: unknown): ICopilotConnectorAuthor | undefined {
		const name = text(value, 512);
		if (name) {
			return { name };
		}
		const author = asRecord(value);
		if (!author) {
			return undefined;
		}
		const result: ICopilotConnectorAuthor = {
			name: text(author.name, 512),
			email: text(author.email, 512),
			url: parseHttpsUri(author.url),
		};
		return result.name || result.email || result.url ? result : undefined;
	}

	function parseConnectionStatus(value: unknown): CopilotConnectorConnectionStatus {
		switch (value) {
			case 'connected':
			case 'error':
			case 'pending':
				return value;
			default:
				return 'not_connected';
		}
	}

	function parseConnectionStatusDetail(value: unknown): CopilotConnectorConnectionStatusDetail | undefined {
		switch (value) {
			case 'reconnect_required':
			case 'retryable_error':
			case 'review_required':
			case 'sign_in_required':
			case 'unavailable':
				return value;
			default:
				return undefined;
		}
	}
	return connectors;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function text(value: unknown, maxLength = maxTextLength): string | undefined {
	if (typeof value !== 'string' || value.length > maxLength) {
		return undefined;
	}
	return value.trim() || undefined;
}

function strings(value: unknown): readonly string[] {
	if (!Array.isArray(value) || value.length > maxMetadataEntries) {
		return [];
	}
	return value.map(item => text(item, 512)).filter((item): item is string => item !== undefined);
}

function parseHttpsUri(value: unknown): URI | undefined {
	const raw = text(value, 8192);
	if (!raw || !isHttpsUrl(raw)) {
		return undefined;
	}
	try {
		return URI.parse(raw, true);
	} catch {
		return undefined;
	}
}

function isHttpsUrl(value: string): boolean {
	if (!value || value.trim() !== value) {
		return false;
	}
	try {
		const url = new URL(value);
		return url.protocol === `${Schemas.https}:` && !!url.hostname;
	} catch {
		return false;
	}
}

function parseOffset(value: string | undefined): number {
	if (value === undefined) {
		return 0;
	}
	const offset = Number(value);
	if (!Number.isSafeInteger(offset) || offset < 0 || String(offset) !== value) {
		throw new CopilotConnectorsError(localize('copilotConnectors.invalidCursor', "The Copilot connectors page is invalid. Start a new search."));
	}
	return offset;
}

function readResponse(context: IRequestContext): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: VSBuffer[] = [];
		let bytes = 0;
		listenStream(context.stream, {
			onData: chunk => {
				bytes += chunk.byteLength;
				if (bytes > maxResponseBytes) {
					reject(new CopilotConnectorsError(localize('copilotConnectors.responseTooLarge', "The Copilot connectors response is too large.")));
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
