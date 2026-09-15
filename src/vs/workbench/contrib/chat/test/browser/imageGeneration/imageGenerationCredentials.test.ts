/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Barrier } from '../../../../../../base/common/async.js';
import { Event } from '../../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationOverrides, IConfigurationUpdateOptions, IConfigurationUpdateOverrides, IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { TestSecretStorageService } from '../../../../../../platform/secrets/test/common/testSecretStorageService.js';
import { ImageGenerationCredentialsService } from '../../../browser/imageGeneration/imageGenerationCredentials.js';
import { IImageGenerationConfiguration, ImageGenerationConnectionSetting, ImageGenerationCredentialsSecret } from '../../../common/imageGeneration.js';

class TestLogService extends NullLogService {
	readonly warnings: string[] = [];

	override warn(message: string, ...args: unknown[]): void {
		this.warnings.push([message, ...args].join(' '));
	}
}

class CapturingConfigurationService extends TestConfigurationService {
	readonly updates: { key: string; value: unknown; target: ConfigurationTarget | undefined }[] = [];
	readonly updateOptions: Array<IConfigurationUpdateOptions | undefined> = [];
	applicationValue: unknown;
	userLocalValue: unknown;
	updateError: Error | undefined;

	constructor(values?: { applicationValue?: unknown; userLocalValue?: unknown }) {
		super();
		this.applicationValue = values?.applicationValue;
		this.userLocalValue = values?.userLocalValue;
	}

	override inspect<T>(_key: string): IConfigurationValue<T> {
		const value = (this.applicationValue ?? this.userLocalValue) as T | undefined;
		return {
			value,
			applicationValue: this.applicationValue as T | undefined,
			userValue: this.userLocalValue as T | undefined,
			userLocalValue: this.userLocalValue as T | undefined,
		};
	}

	override updateValue(key: string, value: unknown): Promise<void>;
	override updateValue(key: string, value: unknown, target: ConfigurationTarget): Promise<void>;
	override updateValue(key: string, value: unknown, overrides: IConfigurationOverrides | IConfigurationUpdateOverrides): Promise<void>;
	override updateValue(key: string, value: unknown, overrides: IConfigurationOverrides | IConfigurationUpdateOverrides, target: ConfigurationTarget, options?: IConfigurationUpdateOptions): Promise<void>;
	override updateValue(key: string, value: unknown, arg3?: ConfigurationTarget | IConfigurationOverrides | IConfigurationUpdateOverrides, target?: ConfigurationTarget, options?: IConfigurationUpdateOptions): Promise<void> {
		const actualTarget = typeof arg3 === 'number' ? arg3 : target;
		this.updates.push({ key, value, target: actualTarget });
		this.updateOptions.push(options);
		if (this.updateError) {
			return options?.donotNotifyError ? Promise.reject(this.updateError) : Promise.resolve();
		}
		switch (actualTarget) {
			case ConfigurationTarget.USER_LOCAL:
				this.userLocalValue = value;
				break;
			case ConfigurationTarget.APPLICATION:
			default:
				this.applicationValue = value;
				break;
		}
		return Promise.resolve();
	}

	fireChange(setting = ImageGenerationConnectionSetting): void {
		this.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
			affectsConfiguration: key => key === setting,
		}));
	}
}

class CapturingSecretStorageService extends TestSecretStorageService {
	readonly writes: { key: string; value: string }[] = [];
	readonly deletions: string[] = [];
	getError: Error | undefined;
	setError: Error | undefined;
	deleteError: Error | undefined;
	getBarrier: Barrier | undefined;

	override async get(key: string): Promise<string | undefined> {
		await this.getBarrier?.wait();
		if (this.getError) {
			throw this.getError;
		}
		return super.get(key);
	}

	override async set(key: string, value: string): Promise<void> {
		this.writes.push({ key, value });
		if (this.setError) {
			throw this.setError;
		}
		return super.set(key, value);
	}

	override async delete(key: string): Promise<void> {
		this.deletions.push(key);
		if (this.deleteError) {
			throw this.deleteError;
		}
		return super.delete(key);
	}
}

function snapshotConfiguration(configuration: IImageGenerationConfiguration | undefined): IImageGenerationConfiguration | undefined {
	return configuration ? { ...configuration } : undefined;
}

suite('ImageGenerationCredentialsService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const configuration: IImageGenerationConfiguration = { endpoint: 'https://images.example.test', deployment: 'image-deployment' };
	const replacementConfiguration: IImageGenerationConfiguration = { endpoint: 'https://images-2.example.test', deployment: 'image-deployment-2' };

	test('configures trimmed credentials in application scope', async () => {
		const configurationService = new CapturingConfigurationService();
		const secretStorageService = new CapturingSecretStorageService();
		const logService = new TestLogService();
		const service = store.add(new ImageGenerationCredentialsService(configurationService, secretStorageService, logService));

		await service.whenReady;
		const initiallyStored = service.hasStoredData;
		await service.configure({ endpoint: ' https://images.example.test/ ', deployment: ' image-deployment ' }, ' test-key ');

		assert.deepStrictEqual({
			stored: [initiallyStored, service.hasStoredData],
			configuration: service.configuration,
			connection: await service.resolve(configuration),
			storedSecret: secretStorageService.writes[0],
			updates: configurationService.updates,
			warnings: logService.warnings,
		}, {
			stored: [false, true],
			configuration,
			connection: { ...configuration, headers: { 'api-key': 'test-key' } },
			storedSecret: {
				key: ImageGenerationCredentialsSecret,
				value: JSON.stringify({ ...configuration, key: 'test-key' }),
			},
			updates: [
				{ key: ImageGenerationConnectionSetting, value: configuration, target: ConfigurationTarget.APPLICATION },
			],
			warnings: [],
		});
	});

	test('restores and clears persisted credentials', async () => {
		const configurationService = new CapturingConfigurationService({ applicationValue: configuration });
		const secretStorageService = new CapturingSecretStorageService();
		const logService = new TestLogService();
		await secretStorageService.set(ImageGenerationCredentialsSecret, JSON.stringify({ ...configuration, key: 'restored-key' }));
		const restored = store.add(new ImageGenerationCredentialsService(configurationService, secretStorageService, logService));

		await restored.whenReady;
		const restoredConfiguration = snapshotConfiguration(restored.configuration);
		const connection = await restored.resolve(configuration);
		await restored.clear();

		assert.deepStrictEqual({
			restored: restoredConfiguration,
			connection,
			cleared: {
				hasStoredData: restored.hasStoredData,
				configuration: restored.configuration,
				secret: await secretStorageService.get(ImageGenerationCredentialsSecret),
				deletions: secretStorageService.deletions,
			},
			updates: configurationService.updates,
			warnings: logService.warnings,
		}, {
			restored: configuration,
			connection: { ...configuration, headers: { 'api-key': 'restored-key' } },
			cleared: {
				hasStoredData: false,
				configuration: undefined,
				secret: undefined,
				deletions: [ImageGenerationCredentialsSecret],
			},
			updates: [
				{ key: ImageGenerationConnectionSetting, value: undefined, target: ConfigurationTarget.APPLICATION },
			],
			warnings: [],
		});
	});

	test('tracks orphaned credentials and permits cleanup of an invalid connection', async () => {
		const configurationService = new CapturingConfigurationService();
		const secrets = store.add(new CapturingSecretStorageService());
		const service = store.add(new ImageGenerationCredentialsService(configurationService, secrets, new TestLogService()));
		await service.whenReady;

		const states: Array<{ stored: boolean; configured: boolean }> = [];
		const record = () => states.push({ stored: service.hasStoredData, configured: !!service.configuration });
		store.add(service.onDidChangeConfiguration(record));
		record();
		const changed = Event.toPromise(Event.once(service.onDidChangeConfiguration));
		await secrets.set(ImageGenerationCredentialsSecret, JSON.stringify({ ...configuration, key: 'orphaned-key' }));
		await changed;

		configurationService.applicationValue = { endpoint: configuration.endpoint };
		configurationService.fireChange();
		await service.clear();

		assert.deepStrictEqual({ states, setting: configurationService.applicationValue, secret: await secrets.get(ImageGenerationCredentialsSecret) }, {
			states: [{ stored: false, configured: false }, { stored: true, configured: false }, { stored: false, configured: false }],
			setting: undefined, secret: undefined,
		});
	});

	test('restores a user-local configuration without writing workspace state', async () => {
		const configurationService = new CapturingConfigurationService({ userLocalValue: configuration });
		const secretStorageService = new CapturingSecretStorageService();
		await secretStorageService.set(ImageGenerationCredentialsSecret, JSON.stringify({ ...configuration, key: 'restored-key' }));
		const service = store.add(new ImageGenerationCredentialsService(configurationService, secretStorageService, new TestLogService()));

		await service.whenReady;

		assert.deepStrictEqual({
			configuration: service.configuration,
			connection: await service.resolve(configuration),
			updates: configurationService.updates,
		}, {
			configuration,
			connection: { ...configuration, headers: { 'api-key': 'restored-key' } },
			updates: [],
		});
	});

	test('replaces the stored key and endpoint while rejecting stale configurations', async () => {
		const configurationService = new CapturingConfigurationService();
		const secretStorageService = new CapturingSecretStorageService();
		const service = store.add(new ImageGenerationCredentialsService(configurationService, secretStorageService, new TestLogService()));

		await service.whenReady;
		await service.configure(configuration, 'old-key');
		await service.configure(replacementConfiguration, 'new-key');

		await assert.rejects(() => service.resolve(configuration), /connection changed/i);

		assert.deepStrictEqual({
			configuration: service.configuration,
			connection: await service.resolve(replacementConfiguration),
			stored: await secretStorageService.get(ImageGenerationCredentialsSecret),
			updateValues: configurationService.updates.map(update => update.value),
		}, {
			configuration: replacementConfiguration,
			connection: { ...replacementConfiguration, headers: { 'api-key': 'new-key' } },
			stored: JSON.stringify({ ...replacementConfiguration, key: 'new-key' }),
			updateValues: [configuration, replacementConfiguration],
		});
	});

	test('rejects credentials when the configured connection changes during resolution', async () => {
		const configurationService = new CapturingConfigurationService({ applicationValue: configuration });
		const secretStorageService = new CapturingSecretStorageService();
		await secretStorageService.set(ImageGenerationCredentialsSecret, JSON.stringify({ ...configuration, key: 'test-key' }));
		const service = store.add(new ImageGenerationCredentialsService(configurationService, secretStorageService, new TestLogService()));
		await service.whenReady;

		const barrier = new Barrier();
		secretStorageService.getBarrier = barrier;
		const pending = service.resolve(configuration);
		configurationService.applicationValue = replacementConfiguration;
		barrier.open();

		await assert.rejects(() => pending, /connection changed/i);
	});

	test('treats malformed stored credentials as unavailable and surfaces the repair error', async () => {
		const configurationService = new CapturingConfigurationService({ applicationValue: configuration });
		const secretStorageService = new CapturingSecretStorageService();
		const logService = new TestLogService();
		await secretStorageService.set(ImageGenerationCredentialsSecret, '{');
		const service = store.add(new ImageGenerationCredentialsService(configurationService, secretStorageService, logService));

		await service.whenReady;
		await assert.rejects(() => service.resolve(configuration), /stored image generation credentials are invalid/i);

		assert.deepStrictEqual({
			configuration: service.configuration,
			warnings: logService.warnings.length,
		}, {
			configuration: undefined,
			warnings: 1,
		});
	});

	test('keeps credentials unavailable when secret storage cannot be read', async () => {
		const configurationService = new CapturingConfigurationService({ applicationValue: configuration });
		const secretStorageService = new CapturingSecretStorageService();
		const logService = new TestLogService();
		secretStorageService.getError = new Error('storage unavailable');
		const service = store.add(new ImageGenerationCredentialsService(configurationService, secretStorageService, logService));

		await service.whenReady;
		await assert.rejects(() => service.resolve(configuration), /storage unavailable/);

		assert.deepStrictEqual({
			configuration: service.configuration,
			warnings: logService.warnings.length,
		}, {
			configuration: undefined,
			warnings: 1,
		});
	});

	test('refreshes back to the persisted state when setup fails', async () => {
		const configurationService = new CapturingConfigurationService();
		const secretStorageService = new CapturingSecretStorageService();
		const service = store.add(new ImageGenerationCredentialsService(configurationService, secretStorageService, new TestLogService()));
		configurationService.updateError = new Error('cannot persist configuration');

		await service.whenReady;
		await assert.rejects(() => service.configure(configuration, 'test-key'), /cannot persist configuration/);

		assert.deepStrictEqual({
			configuration: service.configuration,
			storedSecret: await secretStorageService.get(ImageGenerationCredentialsSecret),
			updates: configurationService.updates,
			updateOptions: configurationService.updateOptions,
		}, {
			configuration: undefined,
			storedSecret: undefined,
			updates: [{ key: ImageGenerationConnectionSetting, value: configuration, target: ConfigurationTarget.APPLICATION }],
			updateOptions: [{ donotNotifyError: true }],
		});
	});

	test('does not report successful configuration when the saved credentials cannot be read', async () => {
		const configurationService = new CapturingConfigurationService();
		const secretStorageService = store.add(new CapturingSecretStorageService());
		const service = store.add(new ImageGenerationCredentialsService(configurationService, secretStorageService, new TestLogService()));
		await service.whenReady;
		secretStorageService.getError = new Error('secret storage unavailable');

		await assert.rejects(service.configure(configuration, 'test-key'), /secret storage unavailable/);
		assert.strictEqual(service.configuration, undefined);
	});

	for (const operation of ['replace', 'remove', 'key-write-failure']) {
		test(`preserves the previous connection after ${operation} fails`, async () => {
			const configurationService = new CapturingConfigurationService();
			const secrets = store.add(new CapturingSecretStorageService());
			const service = store.add(new ImageGenerationCredentialsService(configurationService, secrets, new TestLogService()));
			await service.configure(configuration, 'original-key');
			if (operation === 'key-write-failure') {
				secrets.setError = new Error('key storage failure');
			} else {
				configurationService.updateError = new Error('settings failure');
			}
			await assert.rejects(operation === 'remove' ? service.clear() : service.configure(replacementConfiguration, 'replacement-key'), /failure/);
			assert.deepStrictEqual({ configuration: service.configuration, resolved: await service.resolve(configuration) }, {
				configuration, resolved: { ...configuration, headers: { 'api-key': 'original-key' } },
			});
		});
	}

	test('propagates settings removal failures', async () => {
		const configurationService = new CapturingConfigurationService();
		const secretStorageService = store.add(new CapturingSecretStorageService());
		const service = store.add(new ImageGenerationCredentialsService(configurationService, secretStorageService, new TestLogService()));
		await service.whenReady;
		configurationService.updateError = new Error('cannot update user settings');

		await assert.rejects(service.clear(), /cannot update user settings/);
		assert.deepStrictEqual(configurationService.updateOptions, [{ donotNotifyError: true }]);
	});

	test('emits live availability changes and stops reacting after disposal', async () => {
		const configurationService = new CapturingConfigurationService({ applicationValue: configuration });
		const secretStorageService = new CapturingSecretStorageService();
		const service = store.add(new ImageGenerationCredentialsService(configurationService, secretStorageService, new TestLogService()));
		await service.whenReady;

		const states: Array<IImageGenerationConfiguration | undefined> = [];
		store.add(service.onDidChangeConfiguration(() => states.push(snapshotConfiguration(service.configuration))));

		const becameAvailable = Event.toPromise(Event.once(service.onDidChangeConfiguration));
		await secretStorageService.set(ImageGenerationCredentialsSecret, JSON.stringify({ ...configuration, key: 'live-key' }));
		await becameAvailable;

		const becameUnavailable = Event.toPromise(Event.once(service.onDidChangeConfiguration));
		await secretStorageService.delete(ImageGenerationCredentialsSecret);
		await becameUnavailable;

		service.dispose();
		configurationService.applicationValue = replacementConfiguration;
		configurationService.fireChange();
		await secretStorageService.set(ImageGenerationCredentialsSecret, JSON.stringify({ ...replacementConfiguration, key: 'ignored-key' }));
		await Promise.resolve();
		await Promise.resolve();

		assert.deepStrictEqual({
			states,
			configuration: service.configuration,
		}, {
			states: [configuration, undefined],
			configuration: undefined,
		});
	});
});
