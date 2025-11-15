/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event, EventEmitter, SecretStorage, SecretStorageChangeEvent } from 'vscode';
import { ScopedAccountAccess } from '../accountAccess';
import { AccountInfo } from '@azure/msal-node';

class MockSecretStorage implements SecretStorage {
	private readonly _onDidChangeEmitter = new EventEmitter<SecretStorageChangeEvent>();
	readonly onDidChange: Event<SecretStorageChangeEvent> = this._onDidChangeEmitter.event;
	private storage = new Map<string, string>();

	keys(): Thenable<string[]> {
		return Promise.resolve(Array.from(this.storage.keys()));
	}

	async get(key: string): Promise<string | undefined> {
		return this.storage.get(key);
	}

	async store(key: string, value: string): Promise<void> {
		this.storage.set(key, value);
		this._onDidChangeEmitter.fire({ key });
	}

	async delete(key: string): Promise<void> {
		this.storage.delete(key);
		this._onDidChangeEmitter.fire({ key });
	}

	dispose(): void {
		this._onDidChangeEmitter.dispose();
	}

	// Test helpers
	triggerChange(key: string): void {
		this._onDidChangeEmitter.fire({ key });
	}

	clear(): void {
		this.storage.clear();
	}
}

function createMockAccount(homeAccountId: string): AccountInfo {
	return {
		homeAccountId,
		environment: 'login.windows.net',
		tenantId: 'test-tenant',
		username: `user${homeAccountId}@example.com`,
		localAccountId: 'local-account-id',
		name: 'Test User',
		idTokenClaims: {}
	};
}

suite('ScopedAccountAccess', () => {
	let mockSecretStorage: MockSecretStorage;
	const cloudName = 'test-cloud';

	setup(() => {
		mockSecretStorage = new MockSecretStorage();
	});

	teardown(() => {
		mockSecretStorage.dispose();
	});

	test('should initialize with empty access list', async () => {
		const accountAccess = await ScopedAccountAccess.create(mockSecretStorage, cloudName);
		const account = createMockAccount('account1');

		assert.strictEqual(accountAccess.isAllowedAccess(account), false);
		accountAccess.dispose();
	});

	test('should initialize with existing access list from storage', async () => {
		const accountIds = ['account1', 'account2'];
		await mockSecretStorage.store(`accounts-${cloudName}`, JSON.stringify(accountIds));

		const accountAccess = await ScopedAccountAccess.create(mockSecretStorage, cloudName);
		const account1 = createMockAccount('account1');
		const account2 = createMockAccount('account2');
		const account3 = createMockAccount('account3');

		assert.strictEqual(accountAccess.isAllowedAccess(account1), true);
		assert.strictEqual(accountAccess.isAllowedAccess(account2), true);
		assert.strictEqual(accountAccess.isAllowedAccess(account3), false);
		accountAccess.dispose();
	});

	test('should allow access for an account', async () => {
		const accountAccess = await ScopedAccountAccess.create(mockSecretStorage, cloudName);
		const account = createMockAccount('account1');

		assert.strictEqual(accountAccess.isAllowedAccess(account), false);

		await accountAccess.setAllowedAccess(account, true);

		assert.strictEqual(accountAccess.isAllowedAccess(account), true);
		accountAccess.dispose();
	});

	test('should persist allowed access to storage', async () => {
		const accountAccess = await ScopedAccountAccess.create(mockSecretStorage, cloudName);
		const account = createMockAccount('account1');

		await accountAccess.setAllowedAccess(account, true);

		const storedValue = await mockSecretStorage.get(`accounts-${cloudName}`);
		assert.strictEqual(storedValue, JSON.stringify(['account1']));
		accountAccess.dispose();
	});

	test('should deny access for an account', async () => {
		const accountIds = ['account1', 'account2'];
		await mockSecretStorage.store(`accounts-${cloudName}`, JSON.stringify(accountIds));

		const accountAccess = await ScopedAccountAccess.create(mockSecretStorage, cloudName);
		const account1 = createMockAccount('account1');

		assert.strictEqual(accountAccess.isAllowedAccess(account1), true);

		await accountAccess.setAllowedAccess(account1, false);

		assert.strictEqual(accountAccess.isAllowedAccess(account1), false);
		accountAccess.dispose();
	});

	test('should persist denied access to storage', async () => {
		const accountIds = ['account1', 'account2'];
		await mockSecretStorage.store(`accounts-${cloudName}`, JSON.stringify(accountIds));

		const accountAccess = await ScopedAccountAccess.create(mockSecretStorage, cloudName);
		const account1 = createMockAccount('account1');

		await accountAccess.setAllowedAccess(account1, false);

		const storedValue = await mockSecretStorage.get(`accounts-${cloudName}`);
		assert.strictEqual(storedValue, JSON.stringify(['account2']));
		accountAccess.dispose();
	});

	test('should not duplicate account when setting allowed access multiple times', async () => {
		const accountAccess = await ScopedAccountAccess.create(mockSecretStorage, cloudName);
		const account = createMockAccount('account1');

		await accountAccess.setAllowedAccess(account, true);
		await accountAccess.setAllowedAccess(account, true);
		await accountAccess.setAllowedAccess(account, true);

		const storedValue = await mockSecretStorage.get(`accounts-${cloudName}`);
		assert.strictEqual(storedValue, JSON.stringify(['account1']));
		accountAccess.dispose();
	});

	test('should handle multiple accounts', async () => {
		const accountAccess = await ScopedAccountAccess.create(mockSecretStorage, cloudName);
		const account1 = createMockAccount('account1');
		const account2 = createMockAccount('account2');
		const account3 = createMockAccount('account3');

		await accountAccess.setAllowedAccess(account1, true);
		await accountAccess.setAllowedAccess(account2, true);
		await accountAccess.setAllowedAccess(account3, true);

		assert.strictEqual(accountAccess.isAllowedAccess(account1), true);
		assert.strictEqual(accountAccess.isAllowedAccess(account2), true);
		assert.strictEqual(accountAccess.isAllowedAccess(account3), true);

		await accountAccess.setAllowedAccess(account2, false);

		assert.strictEqual(accountAccess.isAllowedAccess(account1), true);
		assert.strictEqual(accountAccess.isAllowedAccess(account2), false);
		assert.strictEqual(accountAccess.isAllowedAccess(account3), true);
		accountAccess.dispose();
	});

	test('should fire onDidAccountAccessChange when access is granted', async () => {
		const accountAccess = await ScopedAccountAccess.create(mockSecretStorage, cloudName);
		const account = createMockAccount('account1');

		let changeCount = 0;
		accountAccess.onDidAccountAccessChange(() => {
			changeCount++;
		});

		await accountAccess.setAllowedAccess(account, true);

		assert.strictEqual(changeCount, 1);
		accountAccess.dispose();
	});

	test('should fire onDidAccountAccessChange when access is revoked', async () => {
		const accountIds = ['account1'];
		await mockSecretStorage.store(`accounts-${cloudName}`, JSON.stringify(accountIds));

		const accountAccess = await ScopedAccountAccess.create(mockSecretStorage, cloudName);
		const account = createMockAccount('account1');

		let changeCount = 0;
		accountAccess.onDidAccountAccessChange(() => {
			changeCount++;
		});

		await accountAccess.setAllowedAccess(account, false);

		assert.strictEqual(changeCount, 1);
		accountAccess.dispose();
	});

	test('should not fire onDidAccountAccessChange when setting same access state', async () => {
		const accountAccess = await ScopedAccountAccess.create(mockSecretStorage, cloudName);
		const account = createMockAccount('account1');

		await accountAccess.setAllowedAccess(account, true);

		let changeCount = 0;
		accountAccess.onDidAccountAccessChange(() => {
			changeCount++;
		});

		await accountAccess.setAllowedAccess(account, true);

		assert.strictEqual(changeCount, 0);
		accountAccess.dispose();
	});

	test('should react to external storage changes', async () => {
		const accountAccess = await ScopedAccountAccess.create(mockSecretStorage, cloudName);
		const account = createMockAccount('account1');

		assert.strictEqual(accountAccess.isAllowedAccess(account), false);

		// Simulate external change to storage
		await mockSecretStorage.store(`accounts-${cloudName}`, JSON.stringify(['account1']));

		// Give time for event to propagate
		await new Promise(resolve => setTimeout(resolve, 10));

		assert.strictEqual(accountAccess.isAllowedAccess(account), true);
		accountAccess.dispose();
	});

	test('should fire onDidAccountAccessChange on external storage changes', async () => {
		const accountAccess = await ScopedAccountAccess.create(mockSecretStorage, cloudName);

		let changeCount = 0;
		accountAccess.onDidAccountAccessChange(() => {
			changeCount++;
		});

		// Simulate external change to storage
		await mockSecretStorage.store(`accounts-${cloudName}`, JSON.stringify(['account1']));

		// Give time for event to propagate
		await new Promise(resolve => setTimeout(resolve, 10));

		assert.strictEqual(changeCount, 1);
		accountAccess.dispose();
	});

	test('should not fire onDidAccountAccessChange if storage changes with same values', async () => {
		const accountIds = ['account1', 'account2'];
		await mockSecretStorage.store(`accounts-${cloudName}`, JSON.stringify(accountIds));

		const accountAccess = await ScopedAccountAccess.create(mockSecretStorage, cloudName);

		let changeCount = 0;
		accountAccess.onDidAccountAccessChange(() => {
			changeCount++;
		});

		// Trigger storage change with same values
		await mockSecretStorage.store(`accounts-${cloudName}`, JSON.stringify(accountIds));

		// Give time for event to propagate
		await new Promise(resolve => setTimeout(resolve, 10));

		assert.strictEqual(changeCount, 0);
		accountAccess.dispose();
	});

	test('should handle different cloud names independently', async () => {
		const cloud1 = 'cloud1';
		const cloud2 = 'cloud2';

		const accountAccess1 = await ScopedAccountAccess.create(mockSecretStorage, cloud1);
		const accountAccess2 = await ScopedAccountAccess.create(mockSecretStorage, cloud2);

		const account = createMockAccount('account1');

		await accountAccess1.setAllowedAccess(account, true);

		assert.strictEqual(accountAccess1.isAllowedAccess(account), true);
		assert.strictEqual(accountAccess2.isAllowedAccess(account), false);

		accountAccess1.dispose();
		accountAccess2.dispose();
	});

	test('should not react to storage changes for different keys', async () => {
		const accountAccess = await ScopedAccountAccess.create(mockSecretStorage, cloudName);

		let changeCount = 0;
		accountAccess.onDidAccountAccessChange(() => {
			changeCount++;
		});

		// Change unrelated key
		await mockSecretStorage.store('some-other-key', 'value');

		// Give time for event to propagate
		await new Promise(resolve => setTimeout(resolve, 10));

		assert.strictEqual(changeCount, 0);
		accountAccess.dispose();
	});

	test('should handle undefined storage value', async () => {
		const accountAccess = await ScopedAccountAccess.create(mockSecretStorage, cloudName);
		const account = createMockAccount('account1');

		await accountAccess.setAllowedAccess(account, true);
		assert.strictEqual(accountAccess.isAllowedAccess(account), true);

		// Simulate storage deletion
		await mockSecretStorage.delete(`accounts-${cloudName}`);

		// Give time for event to propagate
		await new Promise(resolve => setTimeout(resolve, 10));

		assert.strictEqual(accountAccess.isAllowedAccess(account), false);
		accountAccess.dispose();
	});

	test('should properly dispose all resources', async () => {
		const accountAccess = await ScopedAccountAccess.create(mockSecretStorage, cloudName);
		const account = createMockAccount('account1');

		let changeCount = 0;
		accountAccess.onDidAccountAccessChange(() => {
			changeCount++;
		});

		accountAccess.dispose();

		// After disposal, events should not fire
		await mockSecretStorage.store(`accounts-${cloudName}`, JSON.stringify(['account1']));
		await new Promise(resolve => setTimeout(resolve, 10));

		assert.strictEqual(changeCount, 0);
	});
});
