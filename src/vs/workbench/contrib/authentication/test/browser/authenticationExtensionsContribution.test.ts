/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IExtensionDescription } from '../../../../../platform/extensions/common/extensions.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IAuthenticationQueryService } from '../../../../services/authentication/common/authenticationQuery.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { AuthenticationExtensionsContribution } from '../../browser/authentication.contribution.js';

// Mock classes for testing
class MockExtensionService implements Partial<IExtensionService> {
	_serviceBrand: undefined;
	
	private _extensions: IExtensionDescription[] = [];
	
	get extensions(): readonly IExtensionDescription[] {
		return this._extensions;
	}
	
	setExtensions(extensions: IExtensionDescription[]): void {
		this._extensions = [...extensions];
	}
	
	onDidChangeExtensions = Event.None;
	whenInstalledExtensionsRegistered = () => Promise.resolve(true);
}

class MockExtension {
	constructor(public extensionId: string) {}
	
	removeUsage = () => {};
	setAccessAllowed = (allowed: boolean) => {
		this.accessAllowed = allowed;
	};
	
	accessAllowed: boolean = true;
}

class MockAccount {
	private _extensions = new Map<string, MockExtension>();
	
	extensions() {
		return Array.from(this._extensions.values());
	}
	
	addExtension(extensionId: string): MockExtension {
		const ext = new MockExtension(extensionId);
		this._extensions.set(extensionId, ext);
		return ext;
	}
	
	getExtension(extensionId: string): MockExtension | undefined {
		return this._extensions.get(extensionId);
	}
}

class MockProvider {
	private _accounts = new Map<string, MockAccount>();
	
	forEachAccount(callback: (account: MockAccount) => void): void {
		this._accounts.forEach(callback);
	}
	
	addAccount(accountName: string): MockAccount {
		const account = new MockAccount();
		this._accounts.set(accountName, account);
		return account;
	}
}

class MockAuthenticationQueryService implements Partial<IAuthenticationQueryService> {
	_serviceBrand: undefined;
	
	private _providers = new Map<string, MockProvider>();
	
	getProviderIds(): string[] {
		return Array.from(this._providers.keys());
	}
	
	provider(providerId: string): MockProvider {
		let provider = this._providers.get(providerId);
		if (!provider) {
			provider = new MockProvider();
			this._providers.set(providerId, provider);
		}
		return provider;
	}
}

class MockAuthenticationService implements Partial<IAuthenticationService> {
	_serviceBrand: undefined;
	
	onDidChangeDeclaredProviders = Event.None;
	onDidRegisterAuthenticationProvider = Event.None;
}

// Helper to create mock extension descriptions
function createMockExtension(id: string): IExtensionDescription {
	return {
		identifier: { value: id },
		name: id,
		displayName: id,
		description: '',
		version: '1.0.0',
		publisher: 'test',
		engines: { vscode: '*' },
		extensionLocation: undefined as any,
		isBuiltin: false,
		isUserBuiltin: false,
		isUnderDevelopment: false,
		extensionKind: undefined as any,
	};
}

suite('AuthenticationExtensionsContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let mockExtensionService: MockExtensionService;
	let mockAuthQueryService: MockAuthenticationQueryService;
	let mockAuthService: MockAuthenticationService;

	setup(() => {
		instantiationService = disposables.add(new TestInstantiationService());

		mockExtensionService = new MockExtensionService();
		mockAuthQueryService = new MockAuthenticationQueryService();
		mockAuthService = new MockAuthenticationService();

		instantiationService.stub(IExtensionService, mockExtensionService);
		instantiationService.stub(IAuthenticationQueryService, mockAuthQueryService);
		instantiationService.stub(IAuthenticationService, mockAuthService);
	});

	test('_cleanupRemovedExtensions should remove only uninstalled extensions when called without parameters', () => {
		// Set up installed extensions
		const installedExtensions = [
			createMockExtension('extension1'),
			createMockExtension('extension2')
		];
		mockExtensionService.setExtensions(installedExtensions);

		// Set up authentication data with both installed and uninstalled extensions
		const provider = mockAuthQueryService.provider('github');
		const account = provider.addAccount('user@example.com');
		const ext1 = account.addExtension('extension1'); // This extension is installed
		const ext2 = account.addExtension('extension2'); // This extension is installed
		const ext3 = account.addExtension('extension3'); // This extension is NOT installed

		// Create the contribution instance
		const contribution = instantiationService.createInstance(AuthenticationExtensionsContribution);

		// Call cleanup without parameters (general cleanup)
		contribution._cleanupRemovedExtensions();

		// Verify: only the uninstalled extension should have access removed
		assert.strictEqual(ext1.accessAllowed, true, 'Installed extension1 should still have access');
		assert.strictEqual(ext2.accessAllowed, true, 'Installed extension2 should still have access');
		assert.strictEqual(ext3.accessAllowed, false, 'Uninstalled extension3 should have access removed');
	});

	test('_cleanupRemovedExtensions should remove only specified extensions when called with specific extensions', () => {
		// Set up installed extensions
		const installedExtensions = [
			createMockExtension('extension1'),
			createMockExtension('extension2'),
			createMockExtension('extension3')
		];
		mockExtensionService.setExtensions(installedExtensions);

		// Set up authentication data
		const provider = mockAuthQueryService.provider('github');
		const account = provider.addAccount('user@example.com');
		const ext1 = account.addExtension('extension1');
		const ext2 = account.addExtension('extension2');
		const ext3 = account.addExtension('extension3');

		// Create the contribution instance
		const contribution = instantiationService.createInstance(AuthenticationExtensionsContribution);

		// Call cleanup with specific extensions to remove
		const removedExtensions = [createMockExtension('extension2')];
		contribution._cleanupRemovedExtensions(removedExtensions);

		// Verify: only the specified extension should have access removed
		assert.strictEqual(ext1.accessAllowed, true, 'extension1 should still have access');
		assert.strictEqual(ext2.accessAllowed, false, 'extension2 should have access removed');
		assert.strictEqual(ext3.accessAllowed, true, 'extension3 should still have access');
	});

	test('_cleanupRemovedExtensions should handle multiple providers and accounts', () => {
		// Set up installed extensions
		const installedExtensions = [createMockExtension('extension1')];
		mockExtensionService.setExtensions(installedExtensions);

		// Set up authentication data across multiple providers and accounts
		const githubProvider = mockAuthQueryService.provider('github');
		const githubAccount1 = githubProvider.addAccount('user1@example.com');
		const githubAccount2 = githubProvider.addAccount('user2@example.com');
		
		const msProvider = mockAuthQueryService.provider('microsoft');
		const msAccount = msProvider.addAccount('user@microsoft.com');

		// Add extensions to each account
		const ext1_gh1 = githubAccount1.addExtension('extension1'); // installed
		const ext2_gh1 = githubAccount1.addExtension('extension2'); // not installed
		const ext1_gh2 = githubAccount2.addExtension('extension1'); // installed
		const ext3_gh2 = githubAccount2.addExtension('extension3'); // not installed
		const ext1_ms = msAccount.addExtension('extension1'); // installed
		const ext4_ms = msAccount.addExtension('extension4'); // not installed

		// Create the contribution instance
		const contribution = instantiationService.createInstance(AuthenticationExtensionsContribution);

		// Call general cleanup
		contribution._cleanupRemovedExtensions();

		// Verify: only uninstalled extensions should have access removed
		assert.strictEqual(ext1_gh1.accessAllowed, true, 'extension1 in github account1 should keep access');
		assert.strictEqual(ext2_gh1.accessAllowed, false, 'extension2 in github account1 should lose access');
		assert.strictEqual(ext1_gh2.accessAllowed, true, 'extension1 in github account2 should keep access');
		assert.strictEqual(ext3_gh2.accessAllowed, false, 'extension3 in github account2 should lose access');
		assert.strictEqual(ext1_ms.accessAllowed, true, 'extension1 in microsoft account should keep access');
		assert.strictEqual(ext4_ms.accessAllowed, false, 'extension4 in microsoft account should lose access');
	});

	test('_cleanupRemovedExtensions should handle empty installed extensions list', () => {
		// No installed extensions
		mockExtensionService.setExtensions([]);

		// Set up authentication data
		const provider = mockAuthQueryService.provider('github');
		const account = provider.addAccount('user@example.com');
		const ext1 = account.addExtension('extension1');
		const ext2 = account.addExtension('extension2');

		// Create the contribution instance
		const contribution = instantiationService.createInstance(AuthenticationExtensionsContribution);

		// Call general cleanup
		contribution._cleanupRemovedExtensions();

		// Verify: all extensions should have access removed since none are installed
		assert.strictEqual(ext1.accessAllowed, false, 'extension1 should have access removed');
		assert.strictEqual(ext2.accessAllowed, false, 'extension2 should have access removed');
	});
});