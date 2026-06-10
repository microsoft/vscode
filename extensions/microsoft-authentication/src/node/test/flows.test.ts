/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type { AccountInfo, AuthenticationResult, DeviceCodeRequest, InteractiveRequest, RefreshTokenRequest, SilentFlowRequest } from '@azure/msal-node';
import { EventEmitter, LogOutputChannel, Uri, window } from 'vscode';
import { allFlows, ExtensionHost, getMsalFlows, IMsalFlowQuery } from '../flows';
import { ICachedPublicClientApplication } from '../../common/publicClientCache';
import { UriEventHandler } from '../../UriEventHandler';

suite('getMsalFlows', () => {
	test('should return all flows for local extension host with supported client and no broker', () => {
		const query: IMsalFlowQuery = {
			extensionHost: ExtensionHost.Local,
			supportedClient: true,
			isBrokerSupported: false,
			isPortableMode: false
		};
		const flows = getMsalFlows(query);
		assert.strictEqual(flows.length, 3);
		assert.strictEqual(flows[0].label, 'default');
		assert.strictEqual(flows[1].label, 'protocol handler');
		assert.strictEqual(flows[2].label, 'device code');
	});

	test('should return only default flow for local extension host with supported client and broker', () => {
		const query: IMsalFlowQuery = {
			extensionHost: ExtensionHost.Local,
			supportedClient: true,
			isBrokerSupported: true,
			isPortableMode: false
		};
		const flows = getMsalFlows(query);
		assert.strictEqual(flows.length, 1);
		assert.strictEqual(flows[0].label, 'default');
	});

	test('should return protocol handler and device code flows for remote extension host with supported client and no broker', () => {
		const query: IMsalFlowQuery = {
			extensionHost: ExtensionHost.Remote,
			supportedClient: true,
			isBrokerSupported: false,
			isPortableMode: false
		};
		const flows = getMsalFlows(query);
		assert.strictEqual(flows.length, 2);
		assert.strictEqual(flows[0].label, 'protocol handler');
		assert.strictEqual(flows[1].label, 'device code');
	});

	test('should return only default and device code flows for local extension host with unsupported client and no broker', () => {
		const query: IMsalFlowQuery = {
			extensionHost: ExtensionHost.Local,
			supportedClient: false,
			isBrokerSupported: false,
			isPortableMode: false
		};
		const flows = getMsalFlows(query);
		assert.strictEqual(flows.length, 2);
		assert.strictEqual(flows[0].label, 'default');
		assert.strictEqual(flows[1].label, 'device code');
	});

	test('should return only device code flow for remote extension host with unsupported client and no broker', () => {
		const query: IMsalFlowQuery = {
			extensionHost: ExtensionHost.Remote,
			supportedClient: false,
			isBrokerSupported: false,
			isPortableMode: false
		};
		const flows = getMsalFlows(query);
		assert.strictEqual(flows.length, 1);
		assert.strictEqual(flows[0].label, 'device code');
	});

	test('should return default flow for local extension host with unsupported client and broker', () => {
		const query: IMsalFlowQuery = {
			extensionHost: ExtensionHost.Local,
			supportedClient: false,
			isBrokerSupported: true,
			isPortableMode: false
		};
		const flows = getMsalFlows(query);
		assert.strictEqual(flows.length, 1);
		assert.strictEqual(flows[0].label, 'default');
	});

	test('should exclude protocol handler flow in portable mode', () => {
		const query: IMsalFlowQuery = {
			extensionHost: ExtensionHost.Local,
			supportedClient: true,
			isBrokerSupported: false,
			isPortableMode: true
		};
		const flows = getMsalFlows(query);
		assert.strictEqual(flows.length, 2);
		assert.strictEqual(flows[0].label, 'default');
		assert.strictEqual(flows[1].label, 'device code');
	});
});

class RecordingCachedPca implements ICachedPublicClientApplication {
	readonly interactiveRequests: InteractiveRequest[] = [];
	readonly deviceCodeRequests: Array<Omit<DeviceCodeRequest, 'deviceCodeCallback'>> = [];

	private readonly _accountsChange = new EventEmitter<{ added: AccountInfo[]; changed: AccountInfo[]; deleted: AccountInfo[] }>();
	private readonly _removeLastAccount = new EventEmitter<void>();

	readonly onDidAccountsChange = this._accountsChange.event;
	readonly onDidRemoveLastAccount = this._removeLastAccount.event;
	readonly accounts: AccountInfo[] = [];
	readonly clientId = 'test-client';
	readonly isBrokerAvailable = false;

	async acquireTokenSilent(_request: SilentFlowRequest): Promise<AuthenticationResult> {
		return makeAuthenticationResult();
	}
	async acquireTokenInteractive(request: InteractiveRequest): Promise<AuthenticationResult> {
		this.interactiveRequests.push(request);
		return makeAuthenticationResult();
	}
	async acquireTokenByDeviceCode(request: Omit<DeviceCodeRequest, 'deviceCodeCallback'>): Promise<AuthenticationResult | null> {
		this.deviceCodeRequests.push(request);
		return makeAuthenticationResult();
	}
	async acquireTokenByRefreshToken(_request: RefreshTokenRequest): Promise<AuthenticationResult | null> {
		return null;
	}
	async removeAccount(_account: AccountInfo): Promise<void> { }

	dispose(): void {
		this._accountsChange.dispose();
		this._removeLastAccount.dispose();
	}
}

function makeAuthenticationResult(): AuthenticationResult {
	return {
		authority: '',
		uniqueId: '',
		tenantId: '',
		scopes: [],
		account: null,
		idToken: '',
		idTokenClaims: {},
		accessToken: '',
		fromCache: false,
		expiresOn: null,
		tokenType: 'Bearer',
		correlationId: ''
	};
}

suite('MSAL flow trigger', () => {
	const RESOURCE = 'https://api.example.com/';
	let cachedPca: RecordingCachedPca;
	let uriHandler: UriEventHandler;
	let logger: LogOutputChannel;
	let callbackUri: Uri;

	suiteSetup(() => {
		logger = window.createOutputChannel('msal-flow-trigger-test', { log: true });
	});

	suiteTeardown(() => {
		logger.dispose();
	});

	setup(() => {
		cachedPca = new RecordingCachedPca();
		uriHandler = new UriEventHandler();
		callbackUri = Uri.parse('http://localhost:8080/callback');
	});

	teardown(() => {
		cachedPca.dispose();
		uriHandler.dispose();
	});

	function flowFor(label: string) {
		const flow = allFlows.find(f => f.label === label);
		if (!flow) {
			throw new Error(`flow ${label} not found`);
		}
		return flow;
	}

	test('default flow forwards resource to acquireTokenInteractive', async () => {
		await flowFor('default').trigger({
			cachedPca,
			authority: 'https://login.microsoftonline.com/common',
			scopes: ['scope'],
			callbackUri,
			uriHandler,
			logger,
			resource: RESOURCE
		});

		assert.strictEqual(cachedPca.interactiveRequests[0]?.resource, RESOURCE);
	});

	test('protocol handler flow forwards resource to acquireTokenInteractive', async () => {
		await flowFor('protocol handler').trigger({
			cachedPca,
			authority: 'https://login.microsoftonline.com/common',
			scopes: ['scope'],
			callbackUri,
			uriHandler,
			logger,
			resource: RESOURCE
		});

		assert.strictEqual(cachedPca.interactiveRequests[0]?.resource, RESOURCE);
	});

	test('device code flow forwards resource to acquireTokenByDeviceCode', async () => {
		await flowFor('device code').trigger({
			cachedPca,
			authority: 'https://login.microsoftonline.com/common',
			scopes: ['scope'],
			callbackUri,
			uriHandler,
			logger,
			resource: RESOURCE
		});

		assert.strictEqual(cachedPca.deviceCodeRequests[0]?.resource, RESOURCE);
	});
});
