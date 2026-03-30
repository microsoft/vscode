/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { TestSecretStorageService } from '../../../../../../platform/secrets/test/common/testSecretStorageService.js';
import { MultiAgentProviderServiceImpl } from '../../common/multiAgentProviderServiceImpl.js';

suite('MultiAgentProviderService', () => {

	const store = new DisposableStore();
	let service: MultiAgentProviderServiceImpl;

	setup(() => {
		service = store.add(new MultiAgentProviderServiceImpl(
			new TestStorageService(),
			new TestSecretStorageService(),
			new NullLogService(),
		));
	});

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	// --- Provider CRUD ---

	test('loads built-in providers on init', () => {
		const providers = service.getProviders();
		assert.ok(providers.length >= 4, 'Should have at least 4 built-in providers');
		assert.ok(service.getProvider('anthropic'));
		assert.ok(service.getProvider('openai'));
		assert.ok(service.getProvider('google'));
		assert.ok(service.getProvider('openrouter'));
	});

	test('registers custom provider', () => {
		const before = service.getProviders().length;
		service.registerProvider({
			id: 'custom-test',
			name: 'Custom Test',
			baseUrl: 'https://test.api.com',
			supportedModels: ['test-model'],
			authMethods: ['apiKey'],
			apiFormat: 'openai',
		});
		assert.strictEqual(service.getProviders().length, before + 1);
		assert.ok(service.getProvider('custom-test'));
	});

	test('removes provider and its accounts', async () => {
		service.registerProvider({
			id: 'to-remove',
			name: 'Remove Me',
			baseUrl: 'https://remove.api.com',
			supportedModels: [],
			authMethods: ['apiKey'],
			apiFormat: 'openai',
		});
		await service.addAccount('to-remove', 'test-key', 'apiKey');
		assert.strictEqual(service.getAccounts('to-remove').length, 1);

		service.removeProvider('to-remove');
		assert.strictEqual(service.getProvider('to-remove'), undefined);
		assert.strictEqual(service.getAccounts('to-remove').length, 0);
	});

	// --- Account CRUD ---

	test('adds account to provider', async () => {
		const account = await service.addAccount('anthropic', 'My Key', 'apiKey');
		assert.ok(account.id);
		assert.strictEqual(account.providerId, 'anthropic');
		assert.strictEqual(account.label, 'My Key');
		assert.strictEqual(account.isActive, true);
	});

	test('throws on adding account to non-existent provider', async () => {
		await assert.rejects(() => service.addAccount('nonexistent', 'key', 'apiKey'));
	});

	test('updates account properties', async () => {
		const account = await service.addAccount('anthropic', 'Original', 'apiKey');
		await service.updateAccount(account.id, { label: 'Updated', isActive: false });
		const updated = service.getAccount(account.id);
		assert.strictEqual(updated?.label, 'Updated');
		assert.strictEqual(updated?.isActive, false);
	});

	test('removes account', async () => {
		const account = await service.addAccount('anthropic', 'Temp', 'apiKey');
		await service.removeAccount(account.id);
		assert.strictEqual(service.getAccount(account.id), undefined);
	});

	// --- Model-provider mapping ---

	test('returns models list', () => {
		const models = service.getModels();
		assert.ok(models.length >= 9, 'Should have at least 9 built-in models');
	});

	test('gets compatible providers for model', () => {
		const providers = service.getCompatibleProviders('claude-sonnet-4');
		const ids = providers.map(p => p.id);
		assert.ok(ids.includes('anthropic'));
		assert.ok(ids.includes('openrouter'));
		assert.ok(!ids.includes('openai'), 'OpenAI should not support Claude models');
	});

	test('gets compatible models for provider', () => {
		const models = service.getCompatibleModels('anthropic');
		const ids = models.map(m => m.id);
		assert.ok(ids.includes('claude-opus-4'));
		assert.ok(!ids.includes('gpt-4o'), 'Anthropic should not list GPT models');
	});

	// --- Health & quota ---

	test('updates account quota', async () => {
		const account = await service.addAccount('anthropic', 'Quota Test', 'apiKey');
		service.updateAccountQuota(account.id, { remaining: 5000, limit: 10000, resetAt: Date.now() + 3600000 });
		const updated = service.getAccount(account.id);
		assert.strictEqual(updated?.quotaRemaining, 5000);
		assert.strictEqual(updated?.quotaLimit, 10000);
	});

	test('marks account degraded', async () => {
		const account = await service.addAccount('anthropic', 'Degrade Test', 'apiKey');
		service.markAccountDegraded(account.id, { code: 429, message: 'Rate limited' });
		const updated = service.getAccount(account.id);
		assert.strictEqual(updated?.lastError?.code, 429);
		assert.strictEqual(updated?.quotaRemaining, 0);
	});

	test('resets account health', async () => {
		const account = await service.addAccount('anthropic', 'Reset Test', 'apiKey');
		service.markAccountDegraded(account.id, { code: 429, message: 'Rate limited' });
		service.resetAccountHealth(account.id);
		const updated = service.getAccount(account.id);
		assert.strictEqual(updated?.lastError, undefined);
	});

	// --- Events ---

	test('fires onDidChangeAccounts when account added', async () => {
		let fired = false;
		store.add(service.onDidChangeAccounts(() => { fired = true; }));
		await service.addAccount('anthropic', 'Event Test', 'apiKey');
		assert.ok(fired);
	});

	test('fires onDidChangeHealth when quota updated', async () => {
		const account = await service.addAccount('anthropic', 'Health Event', 'apiKey');
		let firedId = '';
		store.add(service.onDidChangeHealth((id) => { firedId = id; }));
		service.updateAccountQuota(account.id, { remaining: 100 });
		assert.strictEqual(firedId, account.id);
	});
});
