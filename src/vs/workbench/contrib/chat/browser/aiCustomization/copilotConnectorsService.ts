/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { equals } from '../../../../../base/common/objects.js';
import { listenStream } from '../../../../../base/common/stream.js';
import { URI } from '../../../../../base/common/uri.js';
import { IRequestContext, IRequestOptions } from '../../../../../base/parts/request/common/request.js';
import { localize } from '../../../../../nls.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceEntry, ICustomizationMarketplaceSource, ICustomizationMarketplaceSourcePage, ICustomizationMarketplaceSourceQuery } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { ChatConfiguration } from '../../common/constants.js';

const sourceId = 'copilotConnectors';
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
}

export interface ICopilotConnector {
	readonly name: string;
	readonly displayName: string;
	readonly description: string;
	readonly icon?: URI;
	readonly documentation?: URI;
	readonly tags: readonly string[];
	readonly capabilities: readonly string[];
	readonly representativeQueries: readonly string[];
	readonly connectionStatus: string;
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
}

class CopilotConnectorsError extends Error { }

export class CopilotConnectorsService extends Disposable implements ICopilotConnectorsService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	private readonly enabledCancellation = this._register(new MutableDisposable<CancellationTokenSource>());
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

	private updateEnablement(): void {
		this.enabledCancellation.value?.cancel();
		const cancellation = new CancellationTokenSource();
		if (!this.isEnabled()) {
			cancellation.cancel();
			this._lastRefreshTime = 0;
			this.setConnectors([]);
		}
		this.enabledCancellation.value = cancellation;
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

	private async request(method: 'GET' | 'PUT', path: string, data: object | undefined, token: CancellationToken, requireAuthentication = false): Promise<unknown | undefined> {
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
			callSite: `copilotConnectors.${method === 'GET' ? 'query' : 'connect'}`,
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
	readonly id = sourceId;

	constructor(
		private readonly service: ICopilotConnectorsService,
		private readonly configurationService: IConfigurationService,
	) { }

	async query(options: ICustomizationMarketplaceSourceQuery, token: CancellationToken): Promise<ICustomizationMarketplaceSourcePage> {
		if (this.configurationService.getValue<boolean>(ChatConfiguration.ChatCustomizationsCopilotConnectorsEnabled) !== true ||
			(options.mediaType !== undefined && options.mediaType !== CustomizationMarketplaceMediaType.McpServer)) {
			return { items: [], total: 0 };
		}
		const connectors = await this.service.getConnectors(token);
		const query = options.query?.trim().toLowerCase() ?? '';
		const matches = connectors.filter(connector => !query || [
			connector.name,
			connector.displayName,
			connector.description,
			...connector.tags,
			...connector.capabilities,
		].some(value => value.toLowerCase().includes(query)));
		const pageSize = Math.min(options.pageSize ?? 30, 100);
		const offset = parseOffset(options.cursor);
		const page = matches.slice(offset, offset + pageSize);
		return {
			items: page.map(connector => toMarketplaceEntry(connector)),
			total: matches.length,
			nextCursor: offset + page.length < matches.length ? String(offset + page.length) : undefined,
		};
	}
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
			tags: strings(metadata?.tags),
			capabilities: strings(metadata?.capabilities),
			representativeQueries: strings(metadata?.representativeQueries),
			connectionStatus: text(connection?.status, 128) ?? 'unknown',
			protectedResourceMetadataUrl: text(connection?.protectedResourceMetadataUrl),
			scopes: strings(connection?.scopes),
			mcpServers: mcpServerEntries.flatMap(([serverName, serverValue]) => {
				const server = asRecord(serverValue);
				return serverName.length <= 512 && server?.type === 'http' && typeof server.url === 'string' && isHttpsUrl(server.url)
					? [{ name: serverName }]
					: [];
			}),
		});
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
