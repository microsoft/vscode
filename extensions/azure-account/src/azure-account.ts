/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const adal = require('adal-node');
const MemoryCache = adal.MemoryCache;
const AuthenticationContext = adal.AuthenticationContext;
const CacheDriver = require('adal-node/lib/cache-driver');
const createLogContext = require('adal-node/lib/log').createLogContext;

import { DeviceTokenCredentials, AzureEnvironment } from 'ms-rest-azure';
import { SubscriptionClient, ResourceManagementClient, SubscriptionModels } from 'azure-arm-resource';
import * as opn from 'opn';
import * as copypaste from 'copy-paste';
import * as nls from 'vscode-nls';

import { window, commands, credentials, EventEmitter, MessageItem, ExtensionContext, workspace, ConfigurationTarget } from 'vscode';
import { AzureAccount, AzureSession, AzureLoginStatus, AzureResourceFilter } from './typings/azure-account.api';

const localize = nls.loadMessageBundle();

const defaultEnvironment = (<any>AzureEnvironment).Azure;
const commonTenantId = 'common';
const authorityHostUrl = defaultEnvironment.activeDirectoryEndpointUrl;
const clientId = '04b07795-8ddb-461a-bbee-02f9e1bf7b46';
const authorityUrl = `${authorityHostUrl}${commonTenantId}`;
const resource = defaultEnvironment.activeDirectoryResourceId;

const credentialsService = 'VSCode Public Azure';
const credentialsAccount = 'Refresh Token';

interface DeviceLogin {
	userCode: string;
	deviceCode: string;
	verificationUrl: string;
	expiresIn: number;
	interval: number;
	message: string;
}

interface TokenResponse {
	tokenType: string;
	expiresIn: number;
	expiresOn: string;
	resource: string;
	accessToken: string;
	refreshToken: string;
	userId: string;
	isUserIdDisplayable: boolean;
	familyName: string;
	givenName: string;
	oid: string;
	tenantId: string;
	isMRRT: boolean;
	_clientId: string;
	_authority: string;
}

interface AzureAccountWriteable extends AzureAccount {
	status: AzureLoginStatus;
}

class AzureLoginError extends Error {
	constructor(message: string, public _reason: any) {
		super(message);
	}
}

export class AzureLoginHelper {

	private onStatusChanged = new EventEmitter<AzureLoginStatus>();
	private onSessionsChanged = new EventEmitter<void>();
	private onFiltersChanged = new EventEmitter<void>();
	private tokenCache = new MemoryCache();
	private oldResourceFilter: string;

	constructor(context: ExtensionContext) {
		const subscriptions = context.subscriptions;
		subscriptions.push(commands.registerCommand('azure-account.login', () => this.login().catch(console.error)));
		subscriptions.push(commands.registerCommand('azure-account.logout', () => this.logout().catch(console.error)));
		subscriptions.push(commands.registerCommand('azure-account.askForLogin', () => this.askForLogin().catch(console.error)));
		subscriptions.push(commands.registerCommand('azure-account.addFilter', () => this.addFilter().catch(console.error)));
		subscriptions.push(commands.registerCommand('azure-account.removeFilter', () => this.removeFilter().catch(console.error)));
		subscriptions.push(this.api.onSessionsChanged(() => this.updateFilters().catch(console.error)));
		subscriptions.push(workspace.onDidChangeConfiguration(() => this.updateFilters(true).catch(console.error)));
		this.initialize()
			.catch(console.error);
	}

	api: AzureAccount = {
		status: 'Initializing',
		onStatusChanged: this.onStatusChanged.event,
		sessions: [],
		onSessionsChanged: this.onSessionsChanged.event,
		filters: [],
		onFiltersChanged: this.onFiltersChanged.event,
		credentials
	};

	async login() {
		try {
			this.beginLoggingIn();
			const deviceLogin = await deviceLogin1();
			const copyAndOpen: MessageItem = { title: localize('azure-account.copyAndOpen', "Copy & Open") };
			const close: MessageItem = { title: localize('azure-account.close', "Close"), isCloseAffordance: true };
			const response = await window.showInformationMessage(deviceLogin.message, copyAndOpen, close);
			if (response === copyAndOpen) {
				copypaste.copy(deviceLogin.userCode);
				opn(deviceLogin.verificationUrl);
			}
			const tokenResponse = await deviceLogin2(deviceLogin);
			const refreshToken = tokenResponse.refreshToken;
			const tokenResponses = await tokensFromToken(tokenResponse);
			await credentials.writeSecret(credentialsService, credentialsAccount, refreshToken);
			await this.updateSessions(tokenResponses);
		} finally {
			this.updateStatus();
		}
	}

	async logout() {
		await credentials.deleteSecret(credentialsService, credentialsAccount);
		await this.updateSessions([]);
		this.updateStatus();
	}

	private async initialize() {
		try {
			const refreshToken = await credentials.readSecret(credentialsService, credentialsAccount);
			if (refreshToken) {
				this.beginLoggingIn();
				const tokenResponse = await tokenFromRefreshToken(refreshToken);
				const tokenResponses = await tokensFromToken(tokenResponse);
				await this.updateSessions(tokenResponses);
			}
		} catch (err) {
			if (!(err instanceof AzureLoginError)) {
				throw err;
			}
		} finally {
			this.updateStatus();
		}
	}

	private beginLoggingIn() {
		if (this.api.status !== 'LoggedIn') {
			(<AzureAccountWriteable>this.api).status = 'LoggingIn';
			this.onStatusChanged.fire(this.api.status);
		}
	}

	private updateStatus() {
		const status = this.api.sessions.length ? 'LoggedIn' : 'LoggedOut';
		if (this.api.status !== status) {
			(<AzureAccountWriteable>this.api).status = status;
			this.onStatusChanged.fire(this.api.status);
		}
	}

	private async updateSessions(tokenResponses: TokenResponse[]) {
		await clearTokenCache(this.tokenCache);
		for (const tokenResponse of tokenResponses) {
			await addTokenToCache(this.tokenCache, tokenResponse);
		}
		const sessions = this.api.sessions;
		sessions.splice(0, sessions.length, ...tokenResponses.map<AzureSession>(tokenResponse => ({
			environment: defaultEnvironment,
			userId: tokenResponse.userId,
			tenantId: tokenResponse.tenantId,
			credentials: new DeviceTokenCredentials({ username: tokenResponse.userId, clientId, tokenCache: this.tokenCache, domain: tokenResponse.tenantId })
		})));
		this.onSessionsChanged.fire();
	}

	private async askForLogin() {
		if (this.api.status === 'LoggedIn') {
			return;
		}
		const login = { title: localize('azure-account.login', "Login") };
		const cancel = { title: 'Cancel', isCloseAffordance: true };
		const result = await window.showInformationMessage(localize('azure-account.loginFirst', "Not logged in, log in first."), login, cancel);
		return result === login && commands.executeCommand('azure-account.login');
	}

	private async addFilter() {
		if (this.api.status !== 'LoggedIn') {
			return commands.executeCommand('azure-account.askForLogin');
		}

		const azureConfig = workspace.getConfiguration('azure');
		const resourceFilter = azureConfig.get<string[]>('resourceFilter') || [];

		const subscriptionItems: { session: AzureSession; subscription: SubscriptionModels.Subscription }[] = [];
		for (const session of this.api.sessions) {
			const credentials = session.credentials;
			const client = new SubscriptionClient(credentials);
			const subscriptions = await listAll(client.subscriptions, client.subscriptions.list());
			subscriptionItems.push(...subscriptions.filter(subscription => resourceFilter.indexOf(`${session.tenantId}/${subscription.subscriptionId}`) === -1)
				.map(subscription => ({
					session,
					subscription
				})));
		}
		subscriptionItems.sort((a, b) => a.subscription.displayName!.localeCompare(b.subscription.displayName!));
		const subscriptionResult = await window.showQuickPick(subscriptionItems.map(subscription => ({
			label: subscription.subscription.displayName!,
			description: subscription.subscription.subscriptionId!,
			subscription
		})));
		if (!subscriptionResult) {
			return;
		}

		const { session, subscription } = subscriptionResult.subscription;
		const client = new ResourceManagementClient(session.credentials, subscription.subscriptionId!);
		const resourceGroups = await listAll(client.resourceGroups, client.resourceGroups.list());
		const resourceGroupFilters: AzureResourceFilter[] = [
			{
				...subscriptionResult.subscription,
				allResourceGroups: true,
				resourceGroups
			}
		];
		resourceGroupFilters.push(...resourceGroups.filter(resourceGroup => resourceFilter.indexOf(`${session.tenantId}/${subscription.subscriptionId}/${resourceGroup.name}`) === -1)
			.map(resourceGroup => ({
				session,
				subscription,
				allResourceGroups: false,
				resourceGroups: [resourceGroup]
			})));
		resourceGroupFilters.sort((a, b) => (!a.allResourceGroups ? a.resourceGroups[0].name! : '').localeCompare(!b.allResourceGroups ? b.resourceGroups[0].name! : ''));
		const resourceGroupResult = await window.showQuickPick(resourceGroupFilters.map(resourceGroup => (!resourceGroup.allResourceGroups ? {
			label: resourceGroup.resourceGroups[0].name!,
			description: resourceGroup.resourceGroups[0].location,
			resourceGroup
		} : {
				label: localize('azure-account.entireSubscription', "Entire Subscription"),
				description: '',
				resourceGroup
			})));
		if (!resourceGroupResult) {
			return;
		}

		const resourceGroup = resourceGroupResult.resourceGroup;
		if (!resourceGroup.allResourceGroups) {
			resourceFilter.push(`${resourceGroup.session.tenantId}/${resourceGroup.subscription.subscriptionId}/${resourceGroup.resourceGroups[0].name}`);
		} else {
			resourceFilter.splice(0, resourceFilter.length, ...resourceFilter.filter(c => !c.startsWith(`${resourceGroup.session.tenantId}/${resourceGroup.subscription.subscriptionId}/`)));
			resourceFilter.push(`${resourceGroup.session.tenantId}/${resourceGroup.subscription.subscriptionId}`);
		}

		const resourceFilterConfig = azureConfig.inspect<string[]>('resourceFilter');
		let target = ConfigurationTarget.Global;
		if (resourceFilterConfig) {
			if (resourceFilterConfig.workspaceFolderValue) {
				target = ConfigurationTarget.WorkspaceFolder;
			} else if (resourceFilterConfig.workspaceValue) {
				target = ConfigurationTarget.Workspace;
			} else if (resourceFilterConfig.globalValue) {
				target = ConfigurationTarget.Global;
			}
		}
		await azureConfig.update('resourceFilter', resourceFilter, target);
	}

	private async removeFilter() {
		if (this.api.status !== 'LoggedIn') {
			return commands.executeCommand('azure-account.askForLogin');
		}

		const azureConfig = workspace.getConfiguration('azure');
		let resourceFilter = azureConfig.get<string[]>('resourceFilter') || [];

		const filters = resourceFilter.length ? this.api.filters.reduce((list, filter) => {
			if (filter.allResourceGroups) {
				list.push(filter);
			} else {
				list.push(...filter.resourceGroups.map(resourceGroup => ({
					...filter,
					resourceGroups: [resourceGroup]
				})));
			}
			return list;
		}, <AzureResourceFilter[]>[]) : [];
		filters.sort((a, b) => (!a.allResourceGroups ? a.resourceGroups[0].name! : `/${a.subscription.displayName}`).localeCompare(!b.allResourceGroups ? b.resourceGroups[0].name! : `/${b.subscription.displayName}`));
		const filterResult = await window.showQuickPick(filters.map(filter => (!filter.allResourceGroups ? {
			label: filter.resourceGroups[0].name!,
			description: filter.subscription.displayName!,
			filter
		} : {
				label: filter.subscription.displayName!,
				description: filter.subscription.subscriptionId!,
				filter
			})));
		if (!filterResult) {
			return;
		}

		const filter = filterResult.filter;
		const remove = !filter.allResourceGroups ?
			`${filter.session.tenantId}/${filter.subscription.subscriptionId}/${filter.resourceGroups[0].name}` :
			`${filter.session.tenantId}/${filter.subscription.subscriptionId}`;
		resourceFilter = resourceFilter.filter(e => e !== remove);

		const resourceFilterConfig = azureConfig.inspect<string[]>('resourceFilter');
		let target = ConfigurationTarget.Global;
		if (resourceFilterConfig) {
			if (resourceFilterConfig.workspaceFolderValue) {
				target = ConfigurationTarget.WorkspaceFolder;
			} else if (resourceFilterConfig.workspaceValue) {
				target = ConfigurationTarget.Workspace;
			} else if (resourceFilterConfig.globalValue) {
				target = ConfigurationTarget.Global;
			}
		}
		await azureConfig.update('resourceFilter', resourceFilter.length ? resourceFilter : undefined, target);
	}

	private async updateFilters(configChange = false) {
		const azureConfig = workspace.getConfiguration('azure');
		let resourceFilter = azureConfig.get<string[]>('resourceFilter');
		if (configChange && JSON.stringify(resourceFilter) === this.oldResourceFilter) {
			return;
		}
		this.oldResourceFilter = JSON.stringify(resourceFilter);
		if (resourceFilter && !Array.isArray(resourceFilter)) {
			resourceFilter = [];
		}
		const filters = resourceFilter && resourceFilter.map(s => typeof s === 'string' ? s.split('/') : [])
			.filter(s => s.length === 2 || s.length === 3)
			.map(([tenantId, subscriptionId, resourceGroup]) => ({ tenantId, subscriptionId, resourceGroup }));
		const tenantIds = filters && filters.reduce<Record<string, Record<string, Record<string, boolean> | boolean>>>((result, filter) => {
			const tenant = result[filter.tenantId] || (result[filter.tenantId] = {});
			const resourceGroups = tenant[filter.subscriptionId] || (tenant[filter.subscriptionId] = (filter.resourceGroup ? {} : true));
			if (typeof resourceGroups === 'object' && filter.resourceGroup) {
				resourceGroups[filter.resourceGroup] = true;
			}
			return result;
		}, {});

		const newFilters: AzureResourceFilter[] = [];
		const sessions = tenantIds ? this.api.sessions.filter(session => tenantIds[session.tenantId]) : this.api.sessions;
		for (const session of sessions) {
			const client = new SubscriptionClient(session.credentials);
			const subscriptionIds = tenantIds && tenantIds[session.tenantId];
			const subscriptions = await listAll(client.subscriptions, client.subscriptions.list());
			const filteredSubscriptions = subscriptionIds ? subscriptions.filter(subscription => subscriptionIds[subscription.subscriptionId!]) : subscriptions;
			for (const subscription of filteredSubscriptions) {
				const client = new ResourceManagementClient(session.credentials, subscription.subscriptionId!);
				const resourceGroupNames = subscriptionIds && subscriptionIds[subscription.subscriptionId!];
				const allResourceGroups = !(resourceGroupNames && typeof resourceGroupNames === 'object');
				const unfilteredResourceGroups = await listAll(client.resourceGroups, client.resourceGroups.list());
				const resourceGroups = allResourceGroups ? unfilteredResourceGroups : unfilteredResourceGroups.filter(resourceGroup => (<Record<string, boolean>>resourceGroupNames!)[resourceGroup.name!]);
				newFilters.push({ session, subscription, allResourceGroups, resourceGroups });
			}
		}
		this.api.filters.splice(0, this.api.filters.length, ...newFilters);
		this.onFiltersChanged.fire();
	}
}

async function deviceLogin1(): Promise<DeviceLogin> {
	return new Promise<DeviceLogin>((resolve, reject) => {
		const cache = new MemoryCache();
		const context = new AuthenticationContext(authorityUrl, null, cache);
		context.acquireUserCode(resource, clientId, 'en-us', function (err: any, response: any) {
			if (err) {
				reject(new AzureLoginError(localize('azure-account.userCodeFailed', "Aquiring user code failed"), err));
			} else {
				resolve(response);
			}
		});
	});
}

async function deviceLogin2(deviceLogin: DeviceLogin) {
	return new Promise<TokenResponse>((resolve, reject) => {
		const tokenCache = new MemoryCache();
		const context = new AuthenticationContext(authorityUrl, null, tokenCache);
		context.acquireTokenWithDeviceCode(resource, clientId, deviceLogin, function (err: any, tokenResponse: TokenResponse) {
			if (err) {
				reject(new AzureLoginError(localize('azure-account.tokenFailed', "Aquiring token with device code"), err));
			} else {
				resolve(tokenResponse);
			}
		});
	});
}

async function tokenFromRefreshToken(refreshToken: string, tenantId = commonTenantId) {
	return new Promise<TokenResponse>((resolve, reject) => {
		const tokenCache = new MemoryCache();
		const context = new AuthenticationContext(`${authorityHostUrl}${tenantId}`, null, tokenCache);
		context.acquireTokenWithRefreshToken(refreshToken, clientId, null, function (err: any, tokenResponse: TokenResponse) {
			if (err) {
				reject(new AzureLoginError(localize('azure-account.tokenFromRefreshTokenFailed', "Aquiring token with refresh token"), err));
			} else {
				resolve(tokenResponse);
			}
		});
	});
}

async function tokensFromToken(firstTokenResponse: TokenResponse) {
	const tokenResponses = [firstTokenResponse];
	const tokenCache = new MemoryCache();
	await addTokenToCache(tokenCache, firstTokenResponse);
	const credentials = new DeviceTokenCredentials({ username: firstTokenResponse.userId, clientId, tokenCache });
	const client = new SubscriptionClient(credentials);
	const tenants = await listAll(client.tenants, client.tenants.list());
	for (const tenant of tenants) {
		if (tenant.tenantId !== firstTokenResponse.tenantId) {
			const tokenResponse = await tokenFromRefreshToken(firstTokenResponse.refreshToken, tenant.tenantId);
			tokenResponses.push(tokenResponse);
		}
	}
	return tokenResponses;
}

async function addTokenToCache(tokenCache: any, tokenResponse: TokenResponse) {
	return new Promise<any>((resolve, reject) => {
		const driver = new CacheDriver(
			{ _logContext: createLogContext('') },
			`${authorityHostUrl}${tokenResponse.tenantId}`,
			tokenResponse.resource,
			clientId,
			tokenCache,
			(entry: any, resource: any, callback: (err: any, response: any) => {}) => {
				callback(null, entry);
			}
		);
		driver.add(tokenResponse, function (err: any) {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
}

async function clearTokenCache(tokenCache: any) {
	await new Promise<void>((resolve, reject) => {
		tokenCache.find({}, (err: any, entries: any[]) => {
			if (err) {
				reject(err);
			} else {
				tokenCache.remove(entries, (err: any) => {
					if (err) {
						reject(err);
					} else {
						resolve();
					}
				});
			}
		});
	});
}

export interface PartialList<T> extends Array<T> {
	nextLink?: string;
}

export async function listAll<T>(client: { listNext(nextPageLink: string): Promise<PartialList<T>>; }, first: Promise<PartialList<T>>): Promise<T[]> {
	const all: T[] = [];
	for (let list = await first; list.length || list.nextLink; list = list.nextLink ? await client.listNext(list.nextLink) : []) {
		all.push(...list);
	}
	return all;
}