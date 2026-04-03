/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IAuthorizationProtectedResourceMetadata, IAuthorizationServerMetadata } from '../../../../../base/common/oauth.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDialogService, IConfirmation } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { SignOutOfAccountAction } from '../../browser/actions/signOutOfAccountAction.js';
import { IAuthenticationAccessService } from '../../../../services/authentication/browser/authenticationAccessService.js';
import { IAccountUsage, IAuthenticationUsageService } from '../../../../services/authentication/browser/authenticationUsageService.js';
import { AllowedExtension, AuthenticationProviderInformation, AuthenticationSession, AuthenticationSessionAccount, IAuthenticationCreateSessionOptions, IAuthenticationGetSessionsOptions, IAuthenticationProvider, IAuthenticationProviderHostDelegate, IAuthenticationService, IAuthenticationWwwAuthenticateRequest } from '../../../../services/authentication/common/authentication.js';

class CapturingDialogService extends TestDialogService {
	lastConfirmation: IConfirmation | undefined;

	override async confirm(confirmation: IConfirmation) {
		this.lastConfirmation = confirmation;
		return super.confirm(confirmation);
	}
}

class TestAuthenticationService implements IAuthenticationService {
	declare readonly _serviceBrand: undefined;
	readonly onDidRegisterAuthenticationProvider = Event.None;
	readonly onDidUnregisterAuthenticationProvider = Event.None;
	readonly onDidChangeSessions = Event.None;
	readonly onDidChangeDeclaredProviders = Event.None;
	readonly declaredProviders: AuthenticationProviderInformation[] = [];

	constructor(private readonly sessions: ReadonlyArray<AuthenticationSession> = []) { }

	registerDeclaredAuthenticationProvider(_provider: AuthenticationProviderInformation): void { }
	unregisterDeclaredAuthenticationProvider(_id: string): void { }
	isAuthenticationProviderRegistered(_id: string): boolean { return true; }
	isDynamicAuthenticationProvider(_id: string): boolean { return false; }
	registerAuthenticationProvider(_id: string, _provider: IAuthenticationProvider): void { }
	unregisterAuthenticationProvider(_id: string): void { }
	getProviderIds(): string[] { return []; }
	getProvider(_id: string): IAuthenticationProvider { throw new Error('Method not implemented.'); }
	async getAccounts(_id: string): Promise<ReadonlyArray<AuthenticationSessionAccount>> { return []; }
	async getSessions(_id: string, _scopeListOrRequest?: ReadonlyArray<string> | IAuthenticationWwwAuthenticateRequest, _options?: IAuthenticationGetSessionsOptions, _activateImmediate?: boolean): Promise<ReadonlyArray<AuthenticationSession>> { return this.sessions; }
	createSession(_providerId: string, _scopeListOrRequest: ReadonlyArray<string> | IAuthenticationWwwAuthenticateRequest, _options?: IAuthenticationCreateSessionOptions): Promise<AuthenticationSession> { throw new Error('Method not implemented.'); }
	async removeSession(_providerId: string, _sessionId: string): Promise<void> { }
	getOrActivateProviderIdForServer(_authorizationServer: URI, _resourceServer?: URI): Promise<string | undefined> { throw new Error('Method not implemented.'); }
	registerAuthenticationProviderHostDelegate(_delegate: IAuthenticationProviderHostDelegate): IDisposable { throw new Error('Method not implemented.'); }
	createDynamicAuthenticationProvider(_authorizationServer: URI, _serverMetadata: IAuthorizationServerMetadata, _resourceMetadata: IAuthorizationProtectedResourceMetadata | undefined): Promise<IAuthenticationProvider | undefined> { throw new Error('Method not implemented.'); }
}

class TestAuthenticationUsageService implements IAuthenticationUsageService {
	declare readonly _serviceBrand: undefined;

	constructor(private readonly usages: IAccountUsage[] = []) { }

	async initializeExtensionUsageCache(): Promise<void> { }
	async extensionUsesAuth(_extensionId: string): Promise<boolean> { return false; }
	readAccountUsages(_providerId: string, _accountName: string): IAccountUsage[] { return this.usages; }
	removeAccountUsage(_providerId: string, _accountName: string): void { }
	addAccountUsage(_providerId: string, _accountName: string, _scopes: ReadonlyArray<string> | undefined, _extensionId: string, _extensionName: string): void { }
}

class TestAuthenticationAccessService implements IAuthenticationAccessService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeExtensionSessionAccess = Event.None;

	isAccessAllowed(_providerId: string, _accountName: string, _extensionId: string): boolean | undefined { return undefined; }
	readAllowedExtensions(_providerId: string, _accountName: string): AllowedExtension[] { return []; }
	updateAllowedExtensions(_providerId: string, _accountName: string, _extensions: AllowedExtension[]): void { }
	removeAllowedExtensions(_providerId: string, _accountName: string): void { }
}

suite('SignOutOfAccountAction', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let dialogService: CapturingDialogService;

	setup(() => {
		instantiationService = disposables.add(new TestInstantiationService());
		dialogService = new CapturingDialogService();

		instantiationService.stub(IDialogService, dialogService);
		instantiationService.stub(IAuthenticationService, new TestAuthenticationService());
		instantiationService.stub(IAuthenticationUsageService, new TestAuthenticationUsageService([{ extensionId: 'github.copilot-chat', extensionName: 'GitHub Copilot Chat', lastUsed: 1 }]));
		instantiationService.stub(IAuthenticationAccessService, new TestAuthenticationAccessService());
	});

	test('uses custom confirmation copy when provided', async () => {
		const action = new SignOutOfAccountAction();

		await instantiationService.invokeFunction((accessor: ServicesAccessor) => action.run(accessor, {
			providerId: 'github',
			accountLabel: 'octocat',
			dialogMessage: 'Sign out of the Agents app?',
			dialogDetail: 'This will sign out \'octocat\' from the Agents app.'
		}));

		assert.deepStrictEqual(dialogService.lastConfirmation && {
			message: dialogService.lastConfirmation.message,
			detail: dialogService.lastConfirmation.detail
		}, {
			message: 'Sign out of the Agents app?',
			detail: 'This will sign out \'octocat\' from the Agents app.'
		});
	});

	test('falls back to extension usage confirmation copy by default', async () => {
		const action = new SignOutOfAccountAction();

		await instantiationService.invokeFunction((accessor: ServicesAccessor) => action.run(accessor, {
			providerId: 'github',
			accountLabel: 'octocat'
		}));

		assert.strictEqual(dialogService.lastConfirmation?.message, 'The account \'octocat\' has been used by: \n\nGitHub Copilot Chat\n\n Sign out from these extensions?');
		assert.strictEqual(dialogService.lastConfirmation?.detail, undefined);
	});
});
