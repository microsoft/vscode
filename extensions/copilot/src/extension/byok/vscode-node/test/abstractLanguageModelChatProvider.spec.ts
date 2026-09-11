/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { DeferredPromise } from '../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { AbstractLanguageModelChatProvider, LanguageModelChatConfiguration } from '../abstractLanguageModelChatProvider';
import { IBYOKStorageService, StoredModelConfig } from '../byokStorageService';

class TestCredentialStorage implements IBYOKStorageService {
	private readonly keys = new Map<string, string>();
	async getAPIKey(provider: string) { return this.keys.get(provider); }
	async storeAPIKey(provider: string, key: string) { this.keys.set(provider, key); }
	async deleteAPIKey(provider: string) { this.keys.delete(provider); }
	async getStoredModelConfigs(): Promise<Record<string, StoredModelConfig>> { return {}; }
	async saveModelConfig() { }
	async removeModelConfig() { }
}

class TestMigrationProvider extends AbstractLanguageModelChatProvider {
	constructor(storage: IBYOKStorageService, log: TestLogService, private readonly migrate: (configuration: LanguageModelChatConfiguration) => Promise<void>) {
		super('test', 'Test', undefined, storage, log);
	}
	protected override async configureDefaultGroupIfExists(_name: string, configuration: LanguageModelChatConfiguration): Promise<void> {
		await this.migrate(configuration);
	}
	protected override async getAllModels() { return []; }
	async provideLanguageModelChatResponse() { }
	async provideTokenCount() { return 0; }
}

const enumerate = (provider: TestMigrationProvider) => provider.provideLanguageModelChatInformation({ silent: true }, CancellationToken.None);

describe('BYOK credential migration', () => {
	it('retains the source during a shared pending migration and failure, then retries before deleting it', async () => {
		const storage = new TestCredentialStorage();
		await storage.storeAPIKey('Test', 'fake-migration-credential');
		const firstStarted = new DeferredPromise<void>();
		const firstTarget = new DeferredPromise<void>();
		const log = new TestLogService();
		const errors = vi.spyOn(log, 'error');
		let targetKey: string | undefined;
		const migrate = vi.fn(async (configuration: LanguageModelChatConfiguration) => {
			if (migrate.mock.calls.length === 1) {
				void firstStarted.complete();
				await firstTarget.p;
			}
			targetKey = configuration.apiKey;
		});
		const provider = new TestMigrationProvider(storage, log, migrate);
		const first = enumerate(provider);
		const second = enumerate(provider);
		const results = Promise.allSettled([first, second]);
		await firstStarted.p;
		expect(await storage.getAPIKey('Test')).toBe('fake-migration-credential');
		expect(targetKey).toBeUndefined();
		expect(migrate).toHaveBeenCalledTimes(1);
		void firstTarget.error(new Error('fake-migration-credential'));
		expect((await results).map(result => result.status)).toEqual(['rejected', 'rejected']);
		expect(await storage.getAPIKey('Test')).toBe('fake-migration-credential');
		expect(errors.mock.calls.flat().join(' ')).not.toContain('fake-migration-credential');
		expect(errors).toHaveBeenCalledWith('BYOK API key migration failed; the existing credential was retained.');
		await enumerate(provider);
		expect(targetKey).toBe('fake-migration-credential');
		expect(await storage.getAPIKey('Test')).toBeUndefined();
		expect(migrate).toHaveBeenCalledTimes(2);
		await enumerate(provider);
		expect(migrate).toHaveBeenCalledTimes(2);
	});

	it('does not migrate or delete when the source credential is absent', async () => {
		const storage = new TestCredentialStorage();
		const deleted = vi.spyOn(storage, 'deleteAPIKey');
		const migrate = vi.fn(async () => { });
		const provider = new TestMigrationProvider(storage, new TestLogService(), migrate);
		await enumerate(provider);
		expect(migrate).not.toHaveBeenCalled();
		expect(deleted).not.toHaveBeenCalled();
	});
});
