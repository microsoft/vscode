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
import { ChatAIDisabledSettingId } from '../../common/constants.js';
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
			readonly aiDisabled?: boolean;
		};
		readonly storage?: {
			readonly lastKnown?: boolean;
		};
		readonly deferConfigReady?: boolean;
	}

	class FakeLanguageModelsConfigurationService {
		_serviceBrand: undefined;
		configurationFile = undefined as unknown as never;
		private readonly _onDidChangeLanguageModelGroups = new Emitter<readonly ILanguageModelsProviderGroup[]>();
		readonly onDidChangeLanguageModelGroups = this._onDidChangeLanguageModelGroups.event;
		private _groups: readonly FakeProviderGroup[] = [];
		private _resolveReady!: () => void;
		private readonly _whenReady: Promise<void>;
		readyRequests = 0;
		groupReads = 0;

		get whenReady(): Promise<void> {
			this.readyRequests++;
			return this._whenReady;
		}

		constructor(defer: boolean) {
			this._whenReady = new Promise<void>(resolve => { this._resolveReady = resolve; });
			if (!defer) {
				this._resolveReady();
			}
		}

		resolveReady(): void {
			this._resolveReady();
		}

		setGroups(groups: readonly FakeProviderGroup[]): void {
			this._groups = groups;
			this._onDidChangeLanguageModelGroups.fire(this._groups as readonly ILanguageModelsProviderGroup[]);
		}

		getLanguageModelsProviderGroups(): readonly ILanguageModelsProviderGroup[] {
			this.groupReads++;
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
		configurationService.setUserConfiguration(ChatAIDisabledSettingId, options.configuration?.aiDisabled ?? false);

		const contextKeyService = store.add(new ContextKeyService(configurationService));

		const clientByokEnabled = ChatEntitlementContextKeys.clientByokEnabled.bindTo(contextKeyService);
		clientByokEnabled.set(options.contextKeys?.clientByokEnabled ?? true);
		const nonCopilotUserSelectable = ChatContextKeys.nonCopilotLanguageModelsAreUserSelectable.bindTo(contextKeyService);
		nonCopilotUserSelectable.set(options.contextKeys?.nonCopilotUserSelectable ?? false);

		const storage = store.add(new InMemoryStorageService());
		if (options.storage?.lastKnown !== undefined) {
			storage.store('chat.hasByokModels.lastKnown', options.storage.lastKnown, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}

		const configService = new FakeLanguageModelsConfigurationService(options.deferConfigReady ?? false);
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

	test('does not force configuration loading while the feature is disabled', async () => {
		const scenarios = [
			createScenario(disposables.add(new DisposableStore()), { contextKeys: { clientByokEnabled: false } }),
			createScenario(disposables.add(new DisposableStore()), { configuration: { aiDisabled: true } }),
		];
		await flush();

		assert.deepStrictEqual(scenarios.map(scenario => ({
			...snapshot(scenario),
			readyRequests: scenario.configService.readyRequests,
			groupReads: scenario.configService.groupReads,
		})), [
			{ hasByokModels: false, persistedLastKnown: false, readyRequests: 0, groupReads: 0 },
			{ hasByokModels: false, persistedLastKnown: false, readyRequests: 0, groupReads: 0 },
		]);
	});

	test('starts configuration readiness once when the feature becomes enabled', async () => {
		const scenario = createScenario(disposables.add(new DisposableStore()), {
			contextKeys: { clientByokEnabled: false },
			deferConfigReady: true,
		});
		await flush();
		const beforeEnablement = scenario.configService.readyRequests;
		scenario.clientByokEnabled.set(true);
		const afterEnablement = scenario.configService.readyRequests;
		scenario.clientByokEnabled.set(false);
		scenario.clientByokEnabled.set(true);
		scenario.configService.setGroups([{ vendor: 'ollama', name: 'Ollama' }]);
		scenario.configService.resolveReady();
		await flush();

		assert.deepStrictEqual({
			beforeEnablement,
			afterEnablement,
			afterRepeatedEnablement: scenario.configService.readyRequests,
			...snapshot(scenario),
		}, {
			beforeEnablement: 0,
			afterEnablement: 1,
			afterRepeatedEnablement: 1,
			hasByokModels: true,
			persistedLastKnown: true,
		});
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

	test('configured BYOK group is sufficient — extensions registered, no signal → result true', async () => {
		const store = disposables.add(new DisposableStore());
		const scenario = createScenario(store, {
			groups: [{ vendor: 'ollama', name: 'Ollama' }],
		});
		await flush();

		assert.deepStrictEqual(snapshot(scenario), { hasByokModels: true, persistedLastKnown: true });
	});

	test('pre-registration: signal flipping on optimistically updates the persisted value', () => {
		const store = disposables.add(new DisposableStore());
		const scenario = createScenario(store, {});
		// No flush — extensions are not yet registered.
		assert.deepStrictEqual(snapshot(scenario), { hasByokModels: false, persistedLastKnown: false });

		scenario.nonCopilotUserSelectable.set(true);

		assert.deepStrictEqual(snapshot(scenario), { hasByokModels: true, persistedLastKnown: true });
	});

	test('stale signal is ignored once extensions register and no BYOK groups remain', async () => {
		const store = disposables.add(new DisposableStore());
		const scenario = createScenario(store, {
			// The signal is on (e.g. the language-model cache still has a model whose underlying
			// BYOK group was just removed) but no non-Copilot vendor group is configured anymore.
			contextKeys: { nonCopilotUserSelectable: true },
			storage: { lastKnown: true },
		});
		await flush();

		assert.deepStrictEqual(snapshot(scenario, true), { hasByokModels: false, persistedLastKnown: false });
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

	// Regression for #319121: during cold start, the language-models configuration file load is
	// async. A previously-persisted `true` must survive until that load completes; otherwise
	// BYOK-gated UI (e.g. the Copilot signed-out placeholder) flickers on every restart.
	test('persisted true survives while config load is pending (#319121)', async () => {
		const store = disposables.add(new DisposableStore());
		const scenario = createScenario(store, {
			storage: { lastKnown: true },
			deferConfigReady: true,
		});
		await flush();

		// Extensions have registered but configuration has not loaded yet — keep restored value.
		assert.deepStrictEqual(snapshot(scenario, true), { hasByokModels: true, persistedLastKnown: true });

		// Once the config loads and reports a BYOK group, the value stays true.
		(scenario.configService as unknown as { _groups: readonly FakeProviderGroup[] })._groups = [{ vendor: 'ollama', name: 'Ollama' }];
		scenario.configService.resolveReady();
		await flush();

		assert.deepStrictEqual(snapshot(scenario), { hasByokModels: true, persistedLastKnown: true });
	});

	test('persisted true cleared once config load completes with no BYOK groups', async () => {
		const store = disposables.add(new DisposableStore());
		const scenario = createScenario(store, {
			storage: { lastKnown: true },
			deferConfigReady: true,
		});
		await flush();
		assert.strictEqual(scenario.hasByokModels.get(), true);

		scenario.configService.resolveReady();
		await flush();

		assert.deepStrictEqual(snapshot(scenario, true), { hasByokModels: false, persistedLastKnown: false });
	});
});
