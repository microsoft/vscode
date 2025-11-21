/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { AuthenticationSession, AuthenticationSessionAccount, IAuthenticationProvider, IAuthenticationService, IAuthenticationExtensionsService } from '../../common/authentication.js';
import { IAuthenticationUsageService } from '../../browser/authenticationUsageService.js';
import { IAuthenticationMcpUsageService } from '../../browser/authenticationMcpUsageService.js';
import { IAuthenticationAccessService } from '../../browser/authenticationAccessService.js';
import { IAuthenticationMcpAccessService } from '../../browser/authenticationMcpAccessService.js';
import { IAuthenticationMcpService } from '../../browser/authenticationMcpService.js';

/**
 * Helper function to create a mock authentication provider
 */
export function createProvider(overrides: Partial<IAuthenticationProvider> = {}): IAuthenticationProvider {
	return {
		id: 'test-provider',
		label: 'Test Provider',
		supportsMultipleAccounts: true,
		createSession: () => Promise.resolve(createSession()),
		removeSession: () => Promise.resolve(),
		getSessions: () => Promise.resolve([]),
		onDidChangeSessions: new Emitter<any>().event,
		...overrides
	};
}

/**
 * Helper function to create a mock authentication session
 */
export function createSession(): AuthenticationSession {
	return {
		id: 'test-session',
		accessToken: 'test-token',
		account: { id: 'test-account', label: 'Test Account' },
		scopes: ['read', 'write'],
		idToken: undefined
	};
}

/**
 * Interface for tracking method calls in mock services
 */
interface MethodCall {
	method: string;
	args: any[];
	timestamp: number;
}

/**
 * Base class for test services with common functionality and call tracking
 */
export abstract class BaseTestService extends Disposable {
	protected readonly data = new Map<string, any>();
	private readonly _methodCalls: MethodCall[] = [];

	protected getKey(...parts: string[]): string {
		return parts.join('::');
	}

	/**
	 * Track a method call for verification in tests
	 */
	protected trackCall(method: string, ...args: any[]): void {
		this._methodCalls.push({
			method,
			args: [...args],
			timestamp: Date.now()
		});
	}

	/**
	 * Get all method calls for verification
	 */
	getMethodCalls(): readonly MethodCall[] {
		return [...this._methodCalls];
	}

	/**
	 * Get calls for a specific method
	 */
	getCallsFor(method: string): readonly MethodCall[] {
		return this._methodCalls.filter(call => call.method === method);
	}

	/**
	 * Clear method call history
	 */
	clearCallHistory(): void {
		this._methodCalls.length = 0;
	}

	/**
	 * Get the last call for a specific method
	 */
	getLastCallFor(method: string): MethodCall | undefined {
		const calls = this.getCallsFor(method);
		return calls[calls.length - 1];
	}
}

/**
 * Test implementation that actually stores and retrieves data
 */
export class TestUsageService extends BaseTestService implements IAuthenticationUsageService {
	declare readonly _serviceBrand: undefined;

	readAccountUsages(providerId: string, accountName: string): any[] {
		this.trackCall('readAccountUsages', providerId, accountName);
		return this.data.get(this.getKey(providerId, accountName)) || [];
	}

	addAccountUsage(providerId: string, accountName: string, scopes: readonly string[], extensionId: string, extensionName: string): void {
		this.trackCall('addAccountUsage', providerId, accountName, scopes, extensionId, extensionName);
		const key = this.getKey(providerId, accountName);
		const usages = this.data.get(key) || [];
		usages.push({ extensionId, extensionName, scopes: [...scopes], lastUsed: Date.now() });
		this.data.set(key, usages);
	}

	removeAccountUsage(providerId: string, accountName: string): void {
		this.trackCall('removeAccountUsage', providerId, accountName);
		this.data.delete(this.getKey(providerId, accountName));
	}

	// Stub implementations for missing methods
	async initializeExtensionUsageCache(): Promise<void> { }
	async extensionUsesAuth(extensionId: string): Promise<boolean> { return false; }
}

export class TestMcpUsageService extends BaseTestService implements IAuthenticationMcpUsageService {
	declare readonly _serviceBrand: undefined;

	readAccountUsages(providerId: string, accountName: string): any[] {
		this.trackCall('readAccountUsages', providerId, accountName);
		return this.data.get(this.getKey(providerId, accountName)) || [];
	}

	addAccountUsage(providerId: string, accountName: string, scopes: readonly string[], mcpServerId: string, mcpServerName: string): void {
		this.trackCall('addAccountUsage', providerId, accountName, scopes, mcpServerId, mcpServerName);
		const key = this.getKey(providerId, accountName);
		const usages = this.data.get(key) || [];
		usages.push({ mcpServerId, mcpServerName, scopes: [...scopes], lastUsed: Date.now() });
		this.data.set(key, usages);
	}

	removeAccountUsage(providerId: string, accountName: string): void {
		this.trackCall('removeAccountUsage', providerId, accountName);
		this.data.delete(this.getKey(providerId, accountName));
	}

	// Stub implementations for missing methods
	async initializeUsageCache(): Promise<void> { }
	async hasUsedAuth(mcpServerId: string): Promise<boolean> { return false; }
}

export class TestAccessService extends BaseTestService implements IAuthenticationAccessService {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidChangeExtensionSessionAccess = this._register(new Emitter<any>());
	onDidChangeExtensionSessionAccess = this._onDidChangeExtensionSessionAccess.event;

	isAccessAllowed(providerId: string, accountName: string, extensionId: string): boolean | undefined {
		this.trackCall('isAccessAllowed', providerId, accountName, extensionId);
		const extensions = this.data.get(this.getKey(providerId, accountName)) || [];
		const extension = extensions.find((e: any) => e.id === extensionId);
		return extension?.allowed;
	}

	readAllowedExtensions(providerId: string, accountName: string): any[] {
		this.trackCall('readAllowedExtensions', providerId, accountName);
		return this.data.get(this.getKey(providerId, accountName)) || [];
	}

	updateAllowedExtensions(providerId: string, accountName: string, extensions: any[]): void {
		this.trackCall('updateAllowedExtensions', providerId, accountName, extensions);
		const key = this.getKey(providerId, accountName);
		const existing = this.data.get(key) || [];

		// Merge with existing data, updating or adding extensions
		const merged = [...existing];
		for (const ext of extensions) {
			const existingIndex = merged.findIndex(e => e.id === ext.id);
			if (existingIndex >= 0) {
				merged[existingIndex] = ext;
			} else {
				merged.push(ext);
			}
		}

		this.data.set(key, merged);
		this._onDidChangeExtensionSessionAccess.fire({ providerId, accountName });
	}

	removeAllowedExtensions(providerId: string, accountName: string): void {
		this.trackCall('removeAllowedExtensions', providerId, accountName);
		this.data.delete(this.getKey(providerId, accountName));
	}
}

export class TestMcpAccessService extends BaseTestService implements IAuthenticationMcpAccessService {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidChangeMcpSessionAccess = this._register(new Emitter<any>());
	onDidChangeMcpSessionAccess = this._onDidChangeMcpSessionAccess.event;

	isAccessAllowed(providerId: string, accountName: string, mcpServerId: string): boolean | undefined {
		this.trackCall('isAccessAllowed', providerId, accountName, mcpServerId);
		const servers = this.data.get(this.getKey(providerId, accountName)) || [];
		const server = servers.find((s: any) => s.id === mcpServerId);
		return server?.allowed;
	}

	readAllowedMcpServers(providerId: string, accountName: string): any[] {
		this.trackCall('readAllowedMcpServers', providerId, accountName);
		return this.data.get(this.getKey(providerId, accountName)) || [];
	}

	updateAllowedMcpServers(providerId: string, accountName: string, mcpServers: any[]): void {
		this.trackCall('updateAllowedMcpServers', providerId, accountName, mcpServers);
		const key = this.getKey(providerId, accountName);
		const existing = this.data.get(key) || [];

		// Merge with existing data, updating or adding MCP servers
		const merged = [...existing];
		for (const server of mcpServers) {
			const existingIndex = merged.findIndex(s => s.id === server.id);
			if (existingIndex >= 0) {
				merged[existingIndex] = server;
			} else {
				merged.push(server);
			}
		}

		this.data.set(key, merged);
		this._onDidChangeMcpSessionAccess.fire({ providerId, accountName });
	}

	removeAllowedMcpServers(providerId: string, accountName: string): void {
		this.trackCall('removeAllowedMcpServers', providerId, accountName);
		this.data.delete(this.getKey(providerId, accountName));
		this._onDidChangeMcpSessionAccess.fire({ providerId, accountName });
	}
}

export class TestPreferencesService extends BaseTestService {
	private readonly _onDidChangeAccountPreference = this._register(new Emitter<any>());
	onDidChangeAccountPreference = this._onDidChangeAccountPreference.event;

	getAccountPreference(clientId: string, providerId: string): string | undefined {
		return this.data.get(this.getKey(clientId, providerId));
	}

	updateAccountPreference(clientId: string, providerId: string, account: any): void {
		this.data.set(this.getKey(clientId, providerId), account.label);
	}

	removeAccountPreference(clientId: string, providerId: string): void {
		this.data.delete(this.getKey(clientId, providerId));
	}
}

export class TestExtensionsService extends TestPreferencesService implements IAuthenticationExtensionsService {
	declare readonly _serviceBrand: undefined;

	// Stub implementations for methods we don't test
	updateSessionPreference(): void { }
	getSessionPreference(): string | undefined { return undefined; }
	removeSessionPreference(): void { }
	selectSession(): Promise<any> { return Promise.resolve(createSession()); }
	requestSessionAccess(): void { }
	requestNewSession(): Promise<void> { return Promise.resolve(); }
	updateNewSessionRequests(): void { }
}

export class TestMcpService extends TestPreferencesService implements IAuthenticationMcpService {
	declare readonly _serviceBrand: undefined;

	// Stub implementations for methods we don't test
	updateSessionPreference(): void { }
	getSessionPreference(): string | undefined { return undefined; }
	removeSessionPreference(): void { }
	selectSession(): Promise<any> { return Promise.resolve(createSession()); }
	requestSessionAccess(): void { }
	requestNewSession(): Promise<void> { return Promise.resolve(); }
}

/**
 * Minimal authentication service mock that only implements what we need
 */
export class TestAuthenticationService extends BaseTestService implements IAuthenticationService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeSessions = this._register(new Emitter<any>());
	private readonly _onDidRegisterAuthenticationProvider = this._register(new Emitter<any>());
	private readonly _onDidUnregisterAuthenticationProvider = this._register(new Emitter<any>());
	private readonly _onDidChangeDeclaredProviders = this._register(new Emitter<void>());

	onDidChangeSessions = this._onDidChangeSessions.event;
	onDidRegisterAuthenticationProvider = this._onDidRegisterAuthenticationProvider.event;
	onDidUnregisterAuthenticationProvider = this._onDidUnregisterAuthenticationProvider.event;
	onDidChangeDeclaredProviders = this._onDidChangeDeclaredProviders.event;

	private readonly accountsMap = new Map<string, AuthenticationSessionAccount[]>();

	registerAuthenticationProvider(id: string, provider: IAuthenticationProvider): void {
		this.data.set(id, provider);
		this._onDidRegisterAuthenticationProvider.fire({ id, label: provider.label });
	}

	getProviderIds(): string[] {
		return Array.from(this.data.keys());
	}

	isAuthenticationProviderRegistered(id: string): boolean {
		return this.data.has(id);
	}

	getProvider(id: string): IAuthenticationProvider {
		return this.data.get(id)!;
	}

	addAccounts(providerId: string, accounts: AuthenticationSessionAccount[]): void {
		this.accountsMap.set(providerId, accounts);
	}

	async getAccounts(providerId: string): Promise<readonly AuthenticationSessionAccount[]> {
		return this.accountsMap.get(providerId) || [];
	}

	// All other methods are stubs since we don't test them
	get declaredProviders(): any[] { return []; }
	isDynamicAuthenticationProvider(): boolean { return false; }
	async getSessions(): Promise<readonly AuthenticationSession[]> { return []; }
	async createSession(): Promise<AuthenticationSession> { return createSession(); }
	async removeSession(): Promise<void> { }
	manageTrustedExtensionsForAccount(): void { }
	async removeAccountSessions(): Promise<void> { }
	registerDeclaredAuthenticationProvider(): void { }
	unregisterDeclaredAuthenticationProvider(): void { }
	unregisterAuthenticationProvider(): void { }
	registerAuthenticationProviderHostDelegate(): IDisposable { return { dispose: () => { } }; }
	createDynamicAuthenticationProvider(): Promise<any> { return Promise.resolve(undefined); }
	async requestNewSession(): Promise<AuthenticationSession> { return createSession(); }
	async getSession(): Promise<AuthenticationSession | undefined> { return createSession(); }
	getOrActivateProviderIdForServer(): Promise<string | undefined> { return Promise.resolve(undefined); }
	supportsHeimdallConnection(): boolean { return false; }
}
