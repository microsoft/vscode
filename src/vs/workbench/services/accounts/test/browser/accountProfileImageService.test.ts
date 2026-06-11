/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { IDefaultAccount, IDefaultAccountAuthenticationProvider, IPolicyData } from '../../../../../base/common/defaultAccount.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService, ManagedSettingsFetchStatus } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRequestContext, IRequestOptions } from '../../../../../base/parts/request/common/request.js';
import { IRequestCompleteEvent, IRequestService } from '../../../../../platform/request/common/request.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { AuthenticationProviderInformation, AuthenticationSession, AuthenticationSessionAccount, AuthenticationSessionsChangeEvent, IAuthenticationCreateSessionOptions, IAuthenticationGetSessionsOptions, IAuthenticationProvider, IAuthenticationService, IAuthenticationWwwAuthenticateRequest } from '../../../authentication/common/authentication.js';
import { TestProductService } from '../../../../test/common/workbenchTestServices.js';
import { AccountProfileImageService } from '../../common/accountProfileImageService.js';

suite('AccountProfileImageService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns static GitHub.com profile image URL for github accounts', async () => {
		const service = createService({
			defaultAccountService: new TestDefaultAccountService({
				accountName: 'mona lisa',
				authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false },
				sessionId: 'session',
				enterprise: false,
			}),
		});

		assert.strictEqual(
			await service.getDefaultProfileImageUrl(),
			'https://github.com/mona%20lisa.png?size=64'
		);
	});

	test('fetches and caches GitHub Enterprise avatar URL from API', async () => {
		const requestService = new TestRequestService({ avatar_url: 'https://ghe.example.com/avatar.png' });
		const service = createService({
			requestService,
			defaultAccountService: new TestDefaultAccountService({
				accountName: 'mona',
				authenticationProvider: { id: 'github-enterprise', name: 'GitHub Enterprise', enterprise: true },
				sessionId: 'session',
				enterprise: true,
			}),
			configurationService: new TestConfigurationService({ 'github-enterprise.uri': 'https://ghe.example.com' }),
			authService: new TestAuthenticationService([{
				id: 'session',
				accessToken: 'token',
				account: { label: 'mona', id: '1' },
				scopes: ['read:user'],
			}])
		});

		assert.strictEqual(
			await service.getDefaultProfileImageUrl(),
			'https://ghe.example.com/avatar.png'
		);
		assert.strictEqual(
			await service.getDefaultProfileImageUrl(),
			'https://ghe.example.com/avatar.png'
		);
		assert.deepStrictEqual(requestService.requests.map(request => request.url), ['https://api.ghe.example.com/user']);
	});

	test('handles missing default chat agent when resolving enterprise profile image', async () => {
		const requestService = new TestRequestService({ avatar_url: 'https://api.github.com/avatar.png' });
		const service = createService({
			requestService,
			defaultAccountService: new TestDefaultAccountService({
				accountName: 'mona',
				authenticationProvider: { id: 'github-enterprise', name: 'GitHub Enterprise', enterprise: true },
				sessionId: 'session',
				enterprise: true,
			}),
			productService: { ...TestProductService, defaultChatAgent: undefined } as unknown as IProductService,
			authService: new TestAuthenticationService([{
				id: 'session',
				accessToken: 'token',
				account: { label: 'mona', id: '1' },
				scopes: ['read:user'],
			}])
		});

		assert.strictEqual(
			await service.getDefaultProfileImageUrl(),
			'https://api.github.com/avatar.png'
		);
		assert.deepStrictEqual(requestService.requests.map(request => request.url), ['https://api.github.com/user']);
	});
});

function createService(options: {
	authService?: IAuthenticationService;
	defaultAccountService?: IDefaultAccountService;
	configurationService?: IConfigurationService;
	logService?: ILogService;
	productService?: IProductService;
	requestService?: IRequestService;
} = {}): AccountProfileImageService {
	return new AccountProfileImageService(
		options.authService ?? new TestAuthenticationService(),
		options.defaultAccountService ?? new TestDefaultAccountService(),
		options.configurationService ?? new TestConfigurationService(),
		options.logService ?? new NullLogService(),
		options.productService ?? TestProductService,
		options.requestService ?? new TestRequestService({}),
	);
}

class TestRequestService implements IRequestService {
	declare readonly _serviceBrand: undefined;
	readonly onDidCompleteRequest: Event<IRequestCompleteEvent> = Event.None;
	readonly requests: IRequestOptions[] = [];

	constructor(private readonly responseBody: object) { }

	async request(options: IRequestOptions, _token: CancellationToken): Promise<IRequestContext> {
		this.requests.push(options);
		return {
			res: { headers: {}, statusCode: 200 },
			stream: bufferToStream(VSBuffer.fromString(JSON.stringify(this.responseBody)))
		};
	}

	async resolveProxy(_url: string): Promise<string | undefined> { return undefined; }
	async lookupAuthorization(): Promise<undefined> { return undefined; }
	async lookupKerberosAuthorization(_url: string): Promise<string | undefined> { return undefined; }
	async loadCertificates(): Promise<string[]> { return []; }
}

class TestDefaultAccountService implements IDefaultAccountService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeDefaultAccount: Event<IDefaultAccount | null> = Event.None;
	readonly onDidChangePolicyData: Event<IPolicyData | null> = Event.None;
	readonly onDidChangeCopilotTokenInfo: Event<null> = Event.None;
	readonly policyData = null;
	readonly currentDefaultAccount = null;
	readonly copilotTokenInfo = null;
	readonly managedSettingsFetchStatus: ManagedSettingsFetchStatus = null;
	readonly managedSettingsFetchedAt = null;

	constructor(private readonly defaultAccount: IDefaultAccount | null = null) { }

	async getDefaultAccount(): Promise<IDefaultAccount | null> { return this.defaultAccount; }
	getDefaultAccountAuthenticationProvider(): IDefaultAccountAuthenticationProvider {
		return { id: 'github', name: 'GitHub', enterprise: false };
	}
	setDefaultAccountProvider(): void { }
	async refresh(): Promise<IDefaultAccount | null> { return null; }
	async signIn(): Promise<IDefaultAccount | null> { return null; }
	async signOut(): Promise<void> { }
	resolveGitHubUrl(path: string): string { return `https://github.com/${path}`; }
}

class TestAuthenticationService implements IAuthenticationService {
	declare readonly _serviceBrand: undefined;
	readonly onDidRegisterAuthenticationProvider: Event<AuthenticationProviderInformation> = Event.None;
	readonly onDidUnregisterAuthenticationProvider: Event<AuthenticationProviderInformation> = Event.None;
	readonly onDidChangeSessions: Event<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }> = Event.None;
	readonly onDidChangeDeclaredProviders: Event<void> = Event.None;
	readonly declaredProviders = [];

	constructor(private readonly sessions: readonly AuthenticationSession[] = []) { }

	registerDeclaredAuthenticationProvider(): void { }
	unregisterDeclaredAuthenticationProvider(): void { }
	isAuthenticationProviderRegistered(): boolean { return true; }
	isDynamicAuthenticationProvider(): boolean { return false; }
	registerAuthenticationProvider(): void { }
	unregisterAuthenticationProvider(): void { }
	getProviderIds(): string[] { return ['github-enterprise']; }
	getProvider(): IAuthenticationProvider { throw new Error('Not implemented'); }
	async getAccounts(): Promise<ReadonlyArray<AuthenticationSessionAccount>> { return this.sessions.map(session => session.account); }
	async getSessions(_id: string, _scopeListOrRequest?: ReadonlyArray<string> | IAuthenticationWwwAuthenticateRequest, options?: IAuthenticationGetSessionsOptions): Promise<ReadonlyArray<AuthenticationSession>> {
		return options?.account
			? this.sessions.filter(session => session.account.label === options.account?.label)
			: this.sessions;
	}
	async createSession(_providerId: string, _scopeListOrRequest: ReadonlyArray<string> | IAuthenticationWwwAuthenticateRequest, _options?: IAuthenticationCreateSessionOptions): Promise<AuthenticationSession> { throw new Error('Not implemented'); }
	async removeSession(): Promise<void> { }
	async getOrActivateProviderIdForServer(): Promise<string | undefined> { return undefined; }
	registerAuthenticationProviderHostDelegate(): { dispose(): void } { return { dispose() { } }; }
	async createDynamicAuthenticationProvider(): Promise<IAuthenticationProvider | undefined> { return undefined; }
	async createOrGetXaaProvider(): Promise<string | undefined> { return undefined; }
}
