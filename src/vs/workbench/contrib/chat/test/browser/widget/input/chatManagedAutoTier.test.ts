/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event, Emitter } from '../../../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationValue } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { COPILOT_AUTO_TIER_CONFIG, COPILOT_AUTO_TIER_KEY, managedSettingValue, normalizeManagedSettings, projectManagedSettings } from '../../../../../../../platform/policy/common/copilotManagedSettings.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../../platform/storage/common/storage.js';
import { ChatModelConfigurationStore } from '../../../../browser/widget/input/chatModelConfigurationStore.js';
import { ModelPickerAutoRow } from '../../../../browser/widget/input/modelPicker/modelPickerAutoRow.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../../common/languageModels.js';

const modelId = 'agent-host-copilot:auto';
const storageKey = 'chat.modelConfiguration.panel.agent-host-copilot';

class PolicyConfiguration extends TestConfigurationService {
	override inspect<T>(key: string): IConfigurationValue<T> {
		return { ...super.inspect<T>(key), policyValue: this.getValue<T>(key) };
	}
}

suite('Managed Auto tier prototype', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function fixture(value?: string, stored?: Record<string, string>, globalTier = 'balance') {
		const configuration = new PolicyConfiguration({ [COPILOT_AUTO_TIER_CONFIG]: value });
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		const storage = disposables.add(new InMemoryStorageService());
		if (stored) {
			storage.store(storageKey, JSON.stringify({ [modelId]: stored }), StorageScope.APPLICATION, StorageTarget.USER);
		}
		const modelsChanged = disposables.add(new Emitter<string>());
		const metadata = upcastPartial<ILanguageModelChatMetadata>({
			id: 'auto', name: 'Auto', vendor: 'agent-host-copilot',
			configurationSchema: { properties: {
				tier: { type: 'string', enum: ['efficiency', 'balance', 'intelligence'], default: 'balance', group: 'navigation' },
				contextSize: { type: 'number', default: 200_000 },
			} },
		});
		let registered = true;
		const writes: Record<string, unknown>[] = [];
		const service = upcastPartial<ILanguageModelsService>({
			onDidChangeLanguageModels: modelsChanged.event,
			lookupLanguageModel: id => registered && id === modelId ? metadata : undefined,
			getModelConfiguration: () => ({ tier: globalTier, contextSize: 200_000 }),
			setModelConfiguration: async (_id, values) => { writes.push(values); },
		});
		const warnings: string[] = [];
		const log = disposables.add(new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}());
		const createStore = () => disposables.add(new ChatModelConfigurationStore(() => storageKey, service, storage, configuration, log));
		const store = createStore();
		return {
			store, storage, configuration, metadata, writes, warnings, createStore,
			setRegistered: (value: boolean) => { registered = value; modelsChanged.fire(modelId); },
			async policy(value: string | undefined) {
				await configuration.setUserConfiguration(COPILOT_AUTO_TIER_CONFIG, value);
				configuration.onDidChangeConfigurationEmitter.fire({
					source: ConfigurationTarget.DEFAULT,
					affectedKeys: new Set([COPILOT_AUTO_TIER_CONFIG]),
					change: { keys: [COPILOT_AUTO_TIER_CONFIG], overrides: [] },
					affectsConfiguration: key => key === COPILOT_AUTO_TIER_CONFIG,
				});
			},
		};
	}

	test('projects the provisional managed key and uses it for the picker and request without persisting it', () => {
		const managedSettings = projectManagedSettings(normalizeManagedSettings({ autoTier: 'intelligence' }), { [COPILOT_AUTO_TIER_KEY]: { type: 'string' } });
		const value = managedSettingValue(COPILOT_AUTO_TIER_KEY)({ managedSettings });
		assert.strictEqual(value, 'intelligence');
		const f = fixture(typeof value === 'string' ? value : undefined);
		const row = disposables.add(new ModelPickerAutoRow({
			autoModel: { identifier: modelId, metadata: f.metadata },
			configurationAccess: f.store,
			isEnabled: () => true,
			onToggle: () => { },
		}));
		const draft = f.store.getModelConfigurationForPersistence(modelId)!;
		f.store.restoreModelConfiguration(modelId, draft);
		assert.deepStrictEqual({
			request: f.store.getModelConfiguration(modelId),
			draft,
			provenance: row.element.textContent?.includes('Organization default. You can choose another preference.'),
			storage: f.storage.get(storageKey, StorageScope.APPLICATION),
			writes: f.writes,
		}, {
			request: { tier: 'intelligence', contextSize: 200_000 },
			draft: { contextSize: 200_000 }, provenance: true, storage: undefined, writes: [],
		});
	});

	test('explicit schema-default selection wins, persists, and removes default provenance', async () => {
		const f = fixture('intelligence');
		assert.strictEqual(f.store.getModelConfiguration(modelId)?.tier, 'intelligence');
		await f.store.setModelConfiguration(modelId, { tier: 'balance' });
		await f.policy('efficiency');
		assert.deepStrictEqual({
			tier: f.store.getModelConfiguration(modelId)?.tier,
			managed: f.store.isModelConfigurationDefaultManaged(modelId, 'tier'),
			reopened: f.createStore().getModelConfiguration(modelId)?.tier,
			writes: f.writes,
		}, { tier: 'balance', managed: false, reopened: 'balance', writes: [{ tier: 'balance' }] });
	});

	test('picker radio activation overrides the default without locking Auto', async () => {
		const f = fixture('intelligence');
		const row = disposables.add(new ModelPickerAutoRow({
			autoModel: { identifier: modelId, metadata: f.metadata },
			configurationAccess: f.store,
			isEnabled: () => true,
			onToggle: () => { },
		}));
		const selected = Event.toPromise(f.store.onDidSelectConfiguration);
		row.element.querySelector<HTMLElement>('[role="radio"]')!.click();
		await selected;
		row.render();
		assert.deepStrictEqual({
			tier: f.store.getModelConfiguration(modelId)?.tier,
			provenance: row.element.textContent?.includes('Organization default'),
		}, { tier: 'efficiency', provenance: false });
	});

	test('reselecting the managed value makes it an explicit preference', async () => {
		const f = fixture('intelligence');
		await f.store.setModelConfiguration(modelId, { tier: 'intelligence' });
		await f.policy(undefined);
		assert.deepStrictEqual({
			tier: f.store.getModelConfiguration(modelId)?.tier,
			reopened: f.createStore().getModelConfiguration(modelId)?.tier,
			managed: f.store.isModelConfigurationDefaultManaged(modelId, 'tier'),
		}, { tier: 'intelligence', reopened: 'intelligence', managed: false });
	});

	test('existing scoped preferences, explicit reset and non-default global preferences win', () => {
		assert.deepStrictEqual([
			fixture('intelligence', { tier: 'efficiency' }).store.getModelConfiguration(modelId)?.tier,
			fixture('intelligence', {}).store.getModelConfiguration(modelId)?.tier,
			fixture('intelligence', undefined, 'efficiency').store.getModelConfiguration(modelId)?.tier,
			fixture().store.getModelConfiguration(modelId)?.tier,
		], ['efficiency', 'balance', 'efficiency', 'balance']);
	});

	test('late policy, updates and removal affect only unchosen tiers without preference writes', async () => {
		const f = fixture();
		f.store.getModelConfiguration(modelId);
		const changes: unknown[] = [];
		disposables.add(f.store.onDidChange(id => changes.push(f.store.getModelConfiguration(id)?.tier)));
		await f.policy('intelligence');
		await f.policy('efficiency');
		await f.policy(undefined);
		assert.deepStrictEqual({ changes, writes: f.writes, saved: f.storage.get(storageKey, StorageScope.APPLICATION) },
			{ changes: ['intelligence', 'efficiency', 'balance'], writes: [], saved: undefined });
	});

	test('restored tier wins but cannot seed other conversations while governed', () => {
		const f = fixture('intelligence');
		f.store.restoreModelConfiguration(modelId, { tier: 'efficiency' });
		assert.deepStrictEqual({
			restored: f.store.getModelConfiguration(modelId)?.tier,
			fresh: f.createStore().getModelConfiguration(modelId)?.tier,
			storage: f.storage.get(storageKey, StorageScope.APPLICATION),
		}, { restored: 'efficiency', fresh: 'intelligence', storage: undefined });
	});

	test('a pre-policy captured default remains a restored choice, not a late-policy reset', async () => {
		const f = fixture();
		f.store.restoreModelConfiguration(modelId, f.store.getModelConfigurationForPersistence(modelId)!);
		await f.policy('intelligence');
		assert.strictEqual(f.store.getModelConfiguration(modelId)?.tier, 'balance');
	});

	test('unrelated context choices never copy the managed tier into preferences', async () => {
		const f = fixture('intelligence');
		await f.store.setModelConfiguration(modelId, { contextSize: 1_000_000 });
		assert.deepStrictEqual({
			request: f.store.getModelConfiguration(modelId),
			saved: JSON.parse(f.storage.get(storageKey, StorageScope.APPLICATION)!),
			global: f.writes,
		}, {
			request: { tier: 'intelligence', contextSize: 1_000_000 },
			saved: { [modelId]: { contextSize: 1_000_000 } },
			global: [{ contextSize: 1_000_000 }],
		});
	});

	test('invalid and unsupported values warn, do not claim provenance, and never expand capabilities', () => {
		const invalid = fixture('fast');
		const unsupported = fixture('intelligence');
		unsupported.metadata.configurationSchema!.properties!.tier.enum = ['balance'];
		for (const f of [invalid, unsupported]) {
			assert.deepStrictEqual({
				tier: f.store.getModelConfiguration(modelId)?.tier,
				managed: f.store.isModelConfigurationDefaultManaged(modelId, 'tier'),
				warnings: f.warnings.length,
			}, { tier: 'balance', managed: false, warnings: 1 });
		}
	});

	test('asynchronous catalog registration and removal recheck capability without changing preferences', () => {
		const f = fixture('intelligence');
		f.setRegistered(false);
		assert.strictEqual(f.store.isModelConfigurationDefaultManaged(modelId, 'tier'), false);
		f.setRegistered(true);
		assert.strictEqual(f.store.getModelConfiguration(modelId)?.tier, 'intelligence');
		f.setRegistered(false);
		assert.strictEqual(f.store.isModelConfigurationDefaultManaged(modelId, 'tier'), false);
	});

	test('non-Auto selection and user settings do not acquire a managed tier', () => {
		const f = fixture('intelligence');
		const userConfiguration = new TestConfigurationService({ [COPILOT_AUTO_TIER_CONFIG]: 'intelligence' });
		disposables.add(userConfiguration.onDidChangeConfigurationEmitter);
		const service = upcastPartial<ILanguageModelsService>({
			onDidChangeLanguageModels: Event.None,
			lookupLanguageModel: () => f.metadata,
			getModelConfiguration: () => ({ tier: 'balance' }),
		});
		const userStore = disposables.add(new ChatModelConfigurationStore(() => storageKey, service, f.storage, userConfiguration));
		assert.deepStrictEqual({
			nonAuto: f.store.isModelConfigurationDefaultManaged('agent-host-copilot:gpt-5', 'tier'),
			userOnly: userStore.getModelConfiguration(modelId)?.tier,
		}, { nonAuto: false, userOnly: 'balance' });
	});
});
