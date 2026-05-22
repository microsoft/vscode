/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ChatEntitlementContextKeys } from '../../../../services/chat/common/chatEntitlementService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { TestExtensionService } from '../../../../test/common/workbenchTestServices.js';
import { HasByokModelsContribution } from '../../browser/hasByokModelsContribution.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../common/constants.js';
import { COPILOT_VENDOR_ID } from '../../common/languageModels.js';
import { ILanguageModelsConfigurationService, ILanguageModelsProviderGroup } from '../../common/languageModelsConfiguration.js';

suite('HasByokModelsContribution', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	type FakeProviderGroup = Pick<ILanguageModelsProviderGroup, 'vendor' | 'name'>;

	interface IScenarioOptions {
		readonly groups?: readonly FakeProviderGroup[];
		readonly contextKeys?: {
			readonly clientByokEnabled?: boolean;
			readonly nonCopilotUserSelectable?: boolean;
		};
		readonly configuration?: {
			readonly offlineByok?: boolean;
			readonly aiDisabled?: boolean;
		};
		readonly storage?: {
			readonly lastKnown?: boolean;
		};
	}

	class FakeLanguageModelsConfigurationService {
		_serviceBrand: undefined;
		configurationFile = undefined as unknown as never;
		private readonly _onDidChangeLanguageModelGroups = new Emitter<readonly ILanguageModelsProviderGroup[]>();
		readonly onDidChangeLanguageModelGroups = this._onDidChangeLanguageModelGroups.event;
		private _groups: readonly FakeProviderGroup[] = [];

		setGroups(groups: readonly FakeProviderGroup[]): void {
			this._groups = groups;
			this._onDidChangeLanguageModelGroups.fire(this._groups as readonly ILanguageModelsProviderGroup[]);
		}

		getLanguageModelsProviderGroups(): readonly ILanguageModelsProviderGroup[] {
			return this._groups as readonly ILanguageModelsProviderGroup[];
		}

		addLanguageModelsProviderGroup(): never { throw new Error('not implemented'); }
		updateLanguageModelsProviderGroup(): never { throw new Error('not implemented'); }
		removeLanguageModelsProviderGroup(): never { throw new Error('not implemented'); }
		configureLanguageModels(): never { throw new Error('not implemented'); }

		dispose(): void {
			this._onDidChangeLanguageModelGroups.dispose();
		}
	}

	interface IScenario {
		readonly storage: InMemoryStorageService;
		readonly configService: FakeLanguageModelsConfigurationService;
		readonly hasByokModels: IContextKey<boolean>;
		readonly nonCopilotUserSelectable: IContextKey<boolean>;
		readonly clientByokEnabled: IContextKey<boolean>;
	}

	function createScenario(store: DisposableStore, options: IScenarioOptions = {}): IScenario {
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(ChatConfiguration.OfflineByok, options.configuration?.offlineByok ?? true);
		configurationService.setUserConfiguration(ChatConfiguration.AIDisabled, options.configuration?.aiDisabled ?? false);

		const contextKeyService = store.add(new ContextKeyService(configurationService));

		const clientByokEnabled = ChatEntitlementContextKeys.clientByokEnabled.bindTo(contextKeyService);
		clientByokEnabled.set(options.contextKeys?.clientByokEnabled ?? true);
		const nonCopilotUserSelectable = ChatContextKeys.nonCopilotLanguageModelsAreUserSelectable.bindTo(contextKeyService);
		nonCopilotUserSelectable.set(options.contextKeys?.nonCopilotUserSelectable ?? false);

		const storage = store.add(new InMemoryStorageService());
		if (options.storage?.lastKnown !== undefined) {
			storage.store('chat.hasByokModels.lastKnown', options.storage.lastKnown, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}

		const configService = new FakeLanguageModelsConfigurationService();
		store.add({ dispose: () => configService.dispose() });
		if (options.groups) {
			(configService as unknown as { _groups: readonly FakeProviderGroup[] })._groups = options.groups;
		}

		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IStorageService, storage);
		instantiation.stub(IExtensionService, new TestExtensionService());
		instantiation.stub(IContextKeyService, contextKeyService);
		instantiation.stub(IConfigurationService, configurationService);
		instantiation.stub(ILanguageModelsConfigurationService, configService as unknown as ILanguageModelsConfigurationService);

		const hasByokModels = ChatEntitlementContextKeys.hasByokModels.bindTo(contextKeyService);
		store.add(instantiation.createInstance(HasByokModelsContribution));

		return { storage, configService, hasByokModels, nonCopilotUserSelectable, clientByokEnabled };
	}

	/** Allow the `whenInstalledExtensionsRegistered()` continuation to run. */
	async function flush(): Promise<void> {
		for (let i = 0; i < 5; i++) {
			await Promise.resolve();
		}
	}

	function snapshot(scenario: IScenario, persistedDefault = false) {
		return {
			hasByokModels: scenario.hasByokModels.get(),
			persistedLastKnown: scenario.storage.getBoolean('chat.hasByokModels.lastKnown', StorageScope.APPLICATION, persistedDefault),
		};
	}

	test('feature disabled (clientByokEnabled=false) → result is false', async () => {
		const store = disposables.add(new DisposableStore());
		const scenario = createScenario(store, {
			groups: [{ vendor: 'ollama', name: 'Ollama' }],
			contextKeys: { clientByokEnabled: false },
			storage: { lastKnown: true },
		});
		await flush();

		assert.deepStrictEqual(snapshot(scenario, true), { hasByokModels: false, persistedLastKnown: false });
	});

	test('feature disabled (aiDisabled=true) → result is false', async () => {
		const store = disposables.add(new DisposableStore());
		const scenario = createScenario(store, {
			groups: [{ vendor: 'ollama', name: 'Ollama' }],
			configuration: { aiDisabled: true },
			storage: { lastKnown: true },
		});
		await flush();

		assert.deepStrictEqual(snapshot(scenario, true), { hasByokModels: false, persistedLastKnown: false });
	});

	test('feature disabled (offlineByok=false) → result is false', async () => {
		const store = disposables.add(new DisposableStore());
		const scenario = createScenario(store, {
			groups: [{ vendor: 'ollama', name: 'Ollama' }],
			configuration: { offlineByok: false },
			storage: { lastKnown: true },
		});
		await flush();

		assert.deepStrictEqual(snapshot(scenario, true), { hasByokModels: false, persistedLastKnown: false });
	});

	test('signal already on → result true and persisted', async () => {
		const store = disposables.add(new DisposableStore());
		const scenario = createScenario(store, {
			groups: [{ vendor: 'ollama', name: 'Ollama' }],
			contextKeys: { nonCopilotUserSelectable: true },
		});
		await flush();

		assert.deepStrictEqual(snapshot(scenario), { hasByokModels: true, persistedLastKnown: true });
	});

	test('optimistic restore: persisted true is preserved before signal flips', () => {
		const store = disposables.add(new DisposableStore());
		const scenario = createScenario(store, {
			groups: [{ vendor: 'ollama', name: 'Ollama' }],
			storage: { lastKnown: true },
		});

		// Synchronously after construction, no signal has flipped yet but the optimistic value
		// must already be visible to consumers of the context key.
		assert.strictEqual(scenario.hasByokModels.get(), true);
	});

	test('optimistic true preserved when extensions register and BYOK groups exist', async () => {
		const store = disposables.add(new DisposableStore());
		const scenario = createScenario(store, {
			groups: [{ vendor: 'ollama', name: 'Ollama' }],
			storage: { lastKnown: true },
		});
		await flush();

		assert.deepStrictEqual(snapshot(scenario, true), { hasByokModels: true, persistedLastKnown: true });
	});

	test('optimistic true cleared when extensions register and there are no BYOK groups', async () => {
		const store = disposables.add(new DisposableStore());
		const scenario = createScenario(store, {
			groups: [{ vendor: COPILOT_VENDOR_ID, name: 'Copilot' }],
			storage: { lastKnown: true },
		});
		await flush();

		assert.deepStrictEqual(snapshot(scenario, true), { hasByokModels: false, persistedLastKnown: false });
	});

	test('signal flipping on later updates the persisted value', async () => {
		const store = disposables.add(new DisposableStore());
		const scenario = createScenario(store, {
			groups: [{ vendor: 'ollama', name: 'Ollama' }],
		});
		await flush();
		assert.deepStrictEqual(snapshot(scenario), { hasByokModels: false, persistedLastKnown: false });

		scenario.nonCopilotUserSelectable.set(true);
		await flush();

		assert.deepStrictEqual(snapshot(scenario), { hasByokModels: true, persistedLastKnown: true });
	});

	test('removing all BYOK groups at runtime → result false', async () => {
		const store = disposables.add(new DisposableStore());
		const scenario = createScenario(store, {
			groups: [{ vendor: 'ollama', name: 'Ollama' }],
			storage: { lastKnown: true },
		});
		await flush();
		assert.strictEqual(scenario.hasByokModels.get(), true);

		scenario.configService.setGroups([]);
		await flush();

		assert.deepStrictEqual(snapshot(scenario, true), { hasByokModels: false, persistedLastKnown: false });
	});

	test('toggling feature off then on respects current signal', async () => {
		const store = disposables.add(new DisposableStore());
		const scenario = createScenario(store, {
			groups: [{ vendor: 'ollama', name: 'Ollama' }],
			contextKeys: { nonCopilotUserSelectable: true },
		});
		await flush();
		assert.strictEqual(scenario.hasByokModels.get(), true);

		scenario.clientByokEnabled.set(false);
		await flush();
		assert.deepStrictEqual(snapshot(scenario, true), { hasByokModels: false, persistedLastKnown: false });

		scenario.clientByokEnabled.set(true);
		await flush();
		assert.deepStrictEqual(snapshot(scenario), { hasByokModels: true, persistedLastKnown: true });
	});
});
