/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../../../base/browser/dom.js';
import { IStringDictionary } from '../../../../../../../base/common/collections.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { DisposableStore, MutableDisposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { IActionWidgetService } from '../../../../../../../platform/actionWidget/browser/actionWidget.js';
import { NullTelemetryService } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IManagedSettingsService, NullManagedSettingsService } from '../../../../../../../platform/policy/common/copilotManagedSettings.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../../platform/storage/common/storage.js';
import { ChatInputPart } from '../../../../browser/widget/input/chatInputPart.js';
import { extractSchemaDefaults } from '../../../../browser/widget/input/chatModelConfigurationLogic.js';
import { ChatModelConfigurationStore } from '../../../../browser/widget/input/chatModelConfigurationStore.js';
import { ModelPickerConfiguration } from '../../../../browser/widget/input/modelPicker/modelPickerConfiguration.js';
import { resolveContextWindowInputTokens } from '../../../../browser/widgetHosts/viewPane/chatContextUsageWidget.js';
import { ILanguageModelChatMetadata, ILanguageModelConfigurationSchema, ILanguageModelsService } from '../../../../common/languageModels.js';
import { IChatModelInputState, IInputModel } from '../../../../common/model/chatModel.js';
import { ChatModeKind } from '../../../../common/constants.js';

const schema: ILanguageModelConfigurationSchema = {
	properties: {
		thinkingEffort: { enum: ['low', 'medium', 'high'], default: 'medium' },
	}
};

const schemaWithContextSize: ILanguageModelConfigurationSchema = {
	properties: {
		thinkingEffort: { enum: ['low', 'medium', 'high'], default: 'medium' },
		contextSize: { type: 'number', default: 200_000 },
	}
};

const MODEL = 'copilot/gpt';
const KEY = 'chat.modelConfiguration.panel';

function createStubService(global?: IStringDictionary<unknown>): ILanguageModelsService {
	return {
		onDidChangeLanguageModels: Event.None,
		lookupLanguageModel: (_id: string) => ({ configurationSchema: schema } as ILanguageModelChatMetadata),
		getModelConfiguration: (_id: string) => global,
		setModelConfiguration: async (_id: string, _values: IStringDictionary<unknown>) => { },
	} as unknown as ILanguageModelsService;
}

suite('ChatModelConfigurationStore', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createStore(storage: InMemoryStorageService, service: ILanguageModelsService, isEmpty = () => true, managedSettings: IManagedSettingsService = new NullManagedSettingsService(), useAgentHostManagedDefault = false): ChatModelConfigurationStore {
		return store.add(new ChatModelConfigurationStore(() => KEY, isEmpty, constObservable(useAgentHostManagedDefault), service, storage, managedSettings, new NullLogService()));
	}

	interface IControllableService {
		readonly service: ILanguageModelsService;
		readonly setConfigCalls: Array<{ modelId: string; values: IStringDictionary<unknown> }>;
		fireModelsChanged(): void;
		setRegistered(registered: boolean): void;
		setGlobal(value: IStringDictionary<unknown> | undefined): void;
		setSchema(value: ILanguageModelConfigurationSchema): void;
		setAutoModel(vendor?: string): void;
	}

	// A stub whose model registration and profile-global value can change over
	// time (mirroring the asynchronous provider registration) and which records
	// forwarded global writes so tests can assert no-ops are not propagated.
	function createControllableService(): IControllableService {
		const emitter = store.add(new Emitter<string>());
		let registered = true;
		let global: IStringDictionary<unknown> | undefined;
		let configurationSchema = schema;
		let autoVendor: string | undefined;
		const setConfigCalls: Array<{ modelId: string; values: IStringDictionary<unknown> }> = [];
		const service = {
			onDidChangeLanguageModels: emitter.event,
			lookupLanguageModel: (_id: string) => registered ? ({ configurationSchema, ...(autoVendor ? { id: 'auto', vendor: autoVendor } : {}) } as ILanguageModelChatMetadata) : undefined,
			getModelConfiguration: (_id: string, includeDefaults = true) => includeDefaults && registered
				? { ...extractSchemaDefaults(configurationSchema), ...global }
				: global,
			setModelConfiguration: async (modelId: string, values: IStringDictionary<unknown>) => { setConfigCalls.push({ modelId, values }); },
		} as unknown as ILanguageModelsService;
		return {
			service,
			setConfigCalls,
			fireModelsChanged: () => emitter.fire('copilot'),
			setRegistered: (value: boolean) => { registered = value; },
			setGlobal: (value: IStringDictionary<unknown> | undefined) => { global = value; },
			setSchema: value => { configurationSchema = value; },
			setAutoModel: (vendor = 'copilot') => {
				autoVendor = vendor;
				configurationSchema = {
					properties: {
						tier: {
							type: 'string', title: 'Optimize for', group: 'navigation',
							enum: ['efficiency', 'balance', 'intelligence'],
							enumItemLabels: ['Efficiency', 'Balance', 'Intelligence'], default: 'balance',
						}
					}
				};
			},
		};
	}

	test('non-default value round-trips through storage to a newly opened editor', () => {
		const storage = store.add(new InMemoryStorageService());

		const editorA = createStore(storage, createStubService());
		editorA.setModelConfiguration(MODEL, { thinkingEffort: 'high' });
		assert.deepStrictEqual(editorA.getModelConfiguration(MODEL), { thinkingEffort: 'high' });

		// A newly opened editor sharing the same storage inherits the value.
		const editorB = createStore(storage, createStubService());
		assert.deepStrictEqual(editorB.getModelConfiguration(MODEL), { thinkingEffort: 'high' });
	});

	test('already-open editor keeps its own snapshot when another editor writes', () => {
		const storage = store.add(new InMemoryStorageService());

		const editorA = createStore(storage, createStubService());
		const editorB = createStore(storage, createStubService());

		// Both read 'high' first so each has an in-memory snapshot.
		editorA.setModelConfiguration(MODEL, { thinkingEffort: 'high' });
		assert.deepStrictEqual(editorB.getModelConfiguration(MODEL), { thinkingEffort: 'high' });

		// Editor B changes it; editor A's live snapshot is unaffected.
		editorB.setModelConfiguration(MODEL, { thinkingEffort: 'low' });
		assert.deepStrictEqual(editorA.getModelConfiguration(MODEL), { thinkingEffort: 'high' });
		assert.deepStrictEqual(editorB.getModelConfiguration(MODEL), { thinkingEffort: 'low' });
	});

	test('a config write from another editor does not clobber an open editor via the model-change event', () => {
		// `setModelConfiguration` mirrors to the global service, which re-emits
		// `onDidChangeLanguageModels` to EVERY store sharing the service. An
		// already-open editor must keep its own in-memory snapshot rather than
		// adopt the writer's bucket value when that event fires.
		const storage = store.add(new InMemoryStorageService());
		const emitter = store.add(new Emitter<string>());
		const service = {
			onDidChangeLanguageModels: emitter.event,
			lookupLanguageModel: (_id: string) => ({ configurationSchema: schema } as ILanguageModelChatMetadata),
			getModelConfiguration: (_id: string) => undefined,
			setModelConfiguration: async (_id: string, _values: IStringDictionary<unknown>) => { },
		} as unknown as ILanguageModelsService;

		const editorA = createStore(storage, service);
		const editorB = createStore(storage, service);

		// Editor A captures 'high'; editor B reads it then picks 'low'.
		editorA.setModelConfiguration(MODEL, { thinkingEffort: 'high' });
		assert.deepStrictEqual(editorB.getModelConfiguration(MODEL), { thinkingEffort: 'high' });
		editorB.setModelConfiguration(MODEL, { thinkingEffort: 'low' });

		// The mirrored global write re-emits the model-change event to all stores.
		emitter.fire('copilot');

		// Each editor keeps its own snapshot; neither adopts the other's value.
		assert.deepStrictEqual(
			{ a: editorA.getModelConfiguration(MODEL), b: editorB.getModelConfiguration(MODEL) },
			{ a: { thinkingEffort: 'high' }, b: { thinkingEffort: 'low' } },
		);
	});

	test('explicit reset-to-default does not revert to a stale global value (issue #320393)', () => {
		const storage = store.add(new InMemoryStorageService());
		// Profile-global is a non-default 'high'.
		const editorA = createStore(storage, createStubService({ thinkingEffort: 'high' }));

		// With no scoped entry yet, the editor seeds from the global value.
		assert.deepStrictEqual(editorA.getModelConfiguration(MODEL), { thinkingEffort: 'high' });

		// The user explicitly picks the schema default 'medium'.
		editorA.setModelConfiguration(MODEL, { thinkingEffort: 'medium' });

		// A newly opened editor — with the same non-default global — must resolve
		// to 'medium' (the persisted reset), NOT the stale global 'high'.
		const editorB = createStore(storage, createStubService({ thinkingEffort: 'high' }));
		assert.deepStrictEqual(editorB.getModelConfiguration(MODEL), { thinkingEffort: 'medium' });
	});

	test('draft Auto defaults follow the schema without replacing explicit or restored tiers', async () => {
		const storage = store.add(new InMemoryStorageService());
		storage.store(KEY, JSON.stringify({ [MODEL]: {} }), StorageScope.APPLICATION, StorageTarget.USER);
		const control = createControllableService();
		const tierSchema = (defaultTier: string): ILanguageModelConfigurationSchema => ({
			properties: { tier: { type: 'string', enum: ['efficiency', 'balance', 'intelligence'], default: defaultTier } },
		});
		control.setSchema(tierSchema('balance'));
		const untouched = createStore(storage, control.service);
		const selectedDefault = createStore(storage, control.service);
		const selectedTier = createStore(storage, control.service);
		const restored = createStore(storage, control.service);
		const editors = [untouched, selectedDefault, selectedTier, restored];
		for (const editor of editors) {
			editor.getModelConfiguration(MODEL);
		}
		await selectedDefault.setModelConfiguration(MODEL, { tier: 'balance' });
		await selectedTier.setModelConfiguration(MODEL, { tier: 'efficiency' });
		restored.restoreModelConfiguration(MODEL, { tier: 'balance' });

		const changes: (IStringDictionary<unknown> | undefined)[] = [];
		store.add(untouched.onDidChange(() => changes.push(untouched.getModelConfiguration(MODEL))));
		const storedBefore = storage.get(KEY, StorageScope.APPLICATION);
		const writesBefore = [...control.setConfigCalls];
		control.setSchema(tierSchema('intelligence'));
		control.fireModelsChanged();
		const changed = editors.map(editor => editor.getModelConfiguration(MODEL));
		control.setSchema(tierSchema('balance'));
		control.fireModelsChanged();

		assert.deepStrictEqual({
			changed,
			restoredDefault: editors.map(editor => editor.getModelConfiguration(MODEL)),
			changes,
			storageUnchanged: storage.get(KEY, StorageScope.APPLICATION) === storedBefore,
			globalWrites: control.setConfigCalls.slice(writesBefore.length),
		}, {
			changed: [{ tier: 'intelligence' }, { tier: 'balance' }, { tier: 'efficiency' }, { tier: 'balance' }],
			restoredDefault: [{ tier: 'balance' }, { tier: 'balance' }, { tier: 'efficiency' }, { tier: 'balance' }],
			changes: [{ tier: 'intelligence' }, { tier: 'balance' }],
			storageUnchanged: true,
			globalWrites: [],
		});
	});

	test('schema updates preserve started conversations and legacy saved values equal to the old default', () => {
		const storage = store.add(new InMemoryStorageService());
		const control = createControllableService();
		let empty = true;
		const started = createStore(storage, control.service, () => empty);
		started.getModelConfiguration(MODEL);
		empty = false;

		storage.store(KEY, JSON.stringify({ [MODEL]: { thinkingEffort: 'medium' } }), StorageScope.APPLICATION, StorageTarget.USER);
		const legacy = createStore(storage, control.service);
		legacy.getModelConfiguration(MODEL);
		control.setSchema({ properties: { thinkingEffort: { enum: ['low', 'medium', 'high'], default: 'low' } } });
		control.fireModelsChanged();

		assert.deepStrictEqual({
			started: started.getModelConfiguration(MODEL),
			legacy: legacy.getModelConfiguration(MODEL),
		}, {
			started: { thinkingEffort: 'medium' },
			legacy: { thinkingEffort: 'medium' },
		});
	});

	test('a global override equal to the old default is not mistaken for a derived default', () => {
		const storage = store.add(new InMemoryStorageService());
		const control = createControllableService();
		control.setGlobal({ thinkingEffort: 'medium' });
		const editor = createStore(storage, control.service);
		editor.getModelConfiguration(MODEL);
		control.setSchema({ properties: { thinkingEffort: { enum: ['low', 'medium', 'high'], default: 'low' } } });
		control.fireModelsChanged();
		assert.deepStrictEqual(editor.getModelConfiguration(MODEL), { thinkingEffort: 'medium' });
	});

	test('profile schema defaults remain derived when no scoped preference exists', () => {
		const storage = store.add(new InMemoryStorageService());
		const control = createControllableService();
		const editor = createStore(storage, control.service);
		editor.getModelConfiguration(MODEL);
		control.setSchema({ properties: { thinkingEffort: { enum: ['low', 'medium', 'high'], default: 'low' } } });
		control.fireModelsChanged();
		assert.deepStrictEqual({
			configuration: editor.getModelConfiguration(MODEL),
			stored: storage.get(KEY, StorageScope.APPLICATION),
			globalWrites: control.setConfigCalls,
		}, {
			configuration: { thinkingEffort: 'low' },
			stored: undefined,
			globalWrites: [],
		});
	});

	for (const vendor of ['copilot', 'agent-host-copilotcli']) {
		test(`${vendor} scalar default reaches request configuration and updates only untouched drafts`, async () => {
			const storage = store.add(new InMemoryStorageService());
			const control = createControllableService();
			control.setAutoModel(vendor);
			const changed = store.add(new Emitter<void>());
			let value: string | undefined;
			const managed: IManagedSettingsService = {
				_serviceBrand: undefined, onDidChangeManagedSettings: changed.event, getManagedSettingValue: () => value,
			};
			const untouched = createStore(storage, control.service, () => true, managed, true);
			const selected = createStore(storage, control.service, () => true, managed, true);
			const restored = createStore(storage, control.service, () => true, managed, true);
			const started = createStore(storage, control.service, () => false, managed, true);
			const before = untouched.getModelConfiguration(MODEL);
			await selected.setModelConfiguration(MODEL, { tier: 'balance' });
			restored.restoreModelConfiguration(MODEL, { tier: 'balance' }, false);
			value = 'intelligence';
			changed.fire();
			const configured = [untouched, selected, restored, started].map(editor => JSON.parse(JSON.stringify(editor.getModelConfiguration(MODEL))));
			value = undefined;
			changed.fire();
			const removed = untouched.getModelConfiguration(MODEL);
			value = 'efficiency';
			changed.fire();
			assert.deepStrictEqual({
				before, configured, removed, nextAccount: untouched.getModelConfiguration(MODEL),
				selected: selected.getModelConfiguration(MODEL), restored: restored.getModelConfiguration(MODEL),
			}, {
				before: { tier: 'balance', tierSource: 'default' },
				configured: [
					{ tier: 'intelligence', tierSource: 'managed' },
					{ tier: 'balance', tierSource: 'explicit' },
					{ tier: 'balance', tierSource: 'explicit' },
					{ tier: 'balance', tierSource: 'default' },
				],
				removed: { tier: 'balance', tierSource: 'default' },
				nextAccount: { tier: 'efficiency', tierSource: 'managed' },
				selected: { tier: 'balance', tierSource: 'explicit' },
				restored: { tier: 'balance', tierSource: 'explicit' },
			});
		});
	}

	for (const [vendor, sameMachine, expected] of [
		['agent-host-copilotcli', true, 'intelligence'],
		['agent-host-copilotcli', false, 'balance'],
		['remote-server-copilotcli', true, 'balance'],
		['agent-host-claude', true, 'balance'],
		['other-provider', true, 'balance'],
	] as const) {
		test(`client default scope: ${vendor}, same-machine ${sameMachine}`, () => {
			const storage = store.add(new InMemoryStorageService());
			const control = createControllableService();
			control.setAutoModel(vendor);
			const managed: IManagedSettingsService = {
				_serviceBrand: undefined, onDidChangeManagedSettings: Event.None, getManagedSettingValue: () => 'intelligence',
			};
			const editor = createStore(storage, control.service, () => true, managed, sameMachine);
			assert.deepStrictEqual({
				selection: JSON.parse(JSON.stringify(editor.getModelConfiguration(MODEL))),
				pickerDefault: editor.getModelConfigurationSchema(MODEL)?.properties?.tier.default,
				providerDefault: control.service.lookupLanguageModel(MODEL)?.configurationSchema?.properties?.tier.default,
			}, {
				selection: { tier: expected, tierSource: expected === 'intelligence' ? 'managed' : 'default' },
				pickerDefault: expected, providerDefault: 'balance',
			});
		});
	}

	test('invalid and unsupported managed values clear the old default and log without persisting it', () => {
		const storage = store.add(new InMemoryStorageService());
		const control = createControllableService();
		control.setAutoModel('agent-host-copilotcli');
		const changed = store.add(new Emitter<void>());
		let value: string | boolean | undefined = '"intelligence"';
		const managed: IManagedSettingsService = {
			_serviceBrand: undefined, onDidChangeManagedSettings: changed.event, getManagedSettingValue: () => value,
		};
		const errors: string[] = [];
		const log = new class extends NullLogService {
			override error(message: string): void { errors.push(message); }
		}();
		const editor = store.add(new ChatModelConfigurationStore(() => KEY, () => true, constObservable(true), control.service, storage, managed, log));
		const initial = editor.getModelConfiguration(MODEL);
		const configurations = [];
		for (value of ['fast', '{"overridable":"intelligence"}', 'unknown', '"bad-json', true, undefined]) {
			changed.fire();
			configurations.push(editor.getModelConfiguration(MODEL));
		}
		assert.deepStrictEqual({
			initial, configurations, errors, stored: storage.get(KEY, StorageScope.APPLICATION), globalWrites: control.setConfigCalls,
		}, {
			initial: { tier: 'intelligence', tierSource: 'managed' },
			configurations: Array.from({ length: 6 }, () => ({ tier: 'balance', tierSource: 'default' })),
			errors: Array.from({ length: 5 }, () => '[Chat] Invalid managed Auto startup default'),
			stored: undefined, globalWrites: [],
		});
	});

	test('late account verification and scope withdrawal only update inherited new chats', async () => {
		const storage = store.add(new InMemoryStorageService());
		const control = createControllableService();
		control.setAutoModel('agent-host-copilotcli');
		const scope = observableValue('test.managedScope', false);
		const changed = store.add(new Emitter<void>());
		let value: string | undefined = 'intelligence';
		const managed: IManagedSettingsService = {
			_serviceBrand: undefined, onDidChangeManagedSettings: changed.event, getManagedSettingValue: () => value,
		};
		const makeEditor = () => store.add(new ChatModelConfigurationStore(() => KEY, () => true, scope, control.service, storage, managed, new NullLogService()));
		const inherited = makeEditor();
		const explicit = makeEditor();
		const before = inherited.getModelConfiguration(MODEL);
		await explicit.setModelConfiguration(MODEL, { tier: 'balance' });
		scope.set(true, undefined);
		const verified = [inherited, explicit].map(editor => editor.getModelConfiguration(MODEL));
		scope.set(false, undefined);
		const withdrawn = inherited.getModelConfiguration(MODEL);
		value = undefined;
		changed.fire();
		scope.set(true, undefined);
		assert.deepStrictEqual({
			before, verified, withdrawn, cleared: inherited.getModelConfiguration(MODEL),
			explicit: explicit.getModelConfiguration(MODEL),
			defaultMarker: inherited.getModelConfigurationSchema(MODEL)?.properties?.tier.default,
		}, {
			before: { tier: 'balance', tierSource: 'default' },
			verified: [{ tier: 'intelligence', tierSource: 'managed' }, { tier: 'balance', tierSource: 'explicit' }],
			withdrawn: { tier: 'balance', tierSource: 'default' },
			cleared: { tier: 'balance', tierSource: 'default' },
			explicit: { tier: 'balance', tierSource: 'explicit' },
			defaultMarker: 'balance',
		});
	});

	test('committed runtime defaults remain session state and never become saved user preferences', () => {
		const storage = store.add(new InMemoryStorageService());
		const control = createControllableService();
		control.setAutoModel('agent-host-copilotcli');
		const editor = createStore(storage, control.service, () => false);
		editor.restoreModelConfiguration(MODEL, { tier: 'intelligence', tierSource: 'session' });
		control.fireModelsChanged();
		assert.deepStrictEqual({
			configuration: editor.getModelConfiguration(MODEL),
			stored: storage.get(KEY, StorageScope.APPLICATION),
			globalWrites: control.setConfigCalls,
		}, {
			configuration: { tier: 'intelligence', tierSource: 'session' },
			stored: undefined,
			globalWrites: [],
		});
	});

	test('an inherited managed draft survives serialization without pinning a withdrawn policy', () => {
		const storage = store.add(new InMemoryStorageService());
		const control = createControllableService();
		control.setAutoModel();
		const editor = createStore(storage, control.service);
		editor.restoreModelConfiguration(MODEL, { tier: 'intelligence', tierSource: 'managed' });
		assert.deepStrictEqual({
			configuration: editor.getModelConfiguration(MODEL),
			stored: storage.get(KEY, StorageScope.APPLICATION),
		}, { configuration: { tier: 'balance', tierSource: 'default' }, stored: undefined });
	});

	for (const tierSource of ['explicit', 'session', undefined]) {
		test(`invalid restored ${tierSource ?? 'legacy'} tier does not suppress the managed default`, () => {
			const storage = store.add(new InMemoryStorageService());
			const control = createControllableService();
			control.setAutoModel();
			const managed: IManagedSettingsService = {
				_serviceBrand: undefined, onDidChangeManagedSettings: Event.None, getManagedSettingValue: () => 'intelligence',
			};
			const editor = createStore(storage, control.service, () => true, managed);
			editor.restoreModelConfiguration(MODEL, { tier: 'unsupported', ...(tierSource ? { tierSource } : {}) }, false);
			assert.deepStrictEqual(editor.getModelConfiguration(MODEL), { tier: 'intelligence', tierSource: 'managed' });
		});
	}

	for (const registered of [true, false]) {
		test(`restoring a managed draft retains the real user preference when registered=${registered}`, () => {
			const storage = store.add(new InMemoryStorageService());
			const control = createControllableService();
			control.setAutoModel();
			control.setGlobal({ tier: 'efficiency' });
			control.setRegistered(registered);
			const changed = store.add(new Emitter<void>());
			let value: string | undefined = 'intelligence';
			const managed: IManagedSettingsService = {
				_serviceBrand: undefined, onDidChangeManagedSettings: changed.event, getManagedSettingValue: () => value,
			};
			const editor = createStore(storage, control.service, () => true, managed);
			editor.getModelConfiguration(MODEL);
			editor.restoreModelConfiguration(MODEL, { tier: 'intelligence', tierSource: 'managed' });
			control.setRegistered(true);
			control.fireModelsChanged();
			const active = editor.getModelConfiguration(MODEL);
			value = undefined;
			changed.fire();
			assert.deepStrictEqual({ active, removed: editor.getModelConfiguration(MODEL), globalWrites: control.setConfigCalls }, {
				active: { tier: 'intelligence', tierSource: 'managed' },
				removed: { tier: 'efficiency', tierSource: 'preference' },
				globalWrites: [],
			});
		});
	}

	for (const tierSource of ['managed', 'managedFallback', 'default']) {
		test(`restored ${tierSource} tier before model registration never becomes a saved preference`, () => {
			const storage = store.add(new InMemoryStorageService());
			const control = createControllableService();
			control.setAutoModel();
			control.setRegistered(false);
			const changed = store.add(new Emitter<void>());
			let value: string | undefined = 'intelligence';
			const managed: IManagedSettingsService = {
				_serviceBrand: undefined, onDidChangeManagedSettings: changed.event, getManagedSettingValue: () => value,
			};
			const editor = createStore(storage, control.service, () => true, managed);
			editor.restoreModelConfiguration(MODEL, { tier: 'intelligence', tierSource });
			control.setRegistered(true);
			control.fireModelsChanged();
			const registered = editor.getModelConfiguration(MODEL);
			value = undefined;
			changed.fire();
			assert.deepStrictEqual({
				registered, removed: editor.getModelConfiguration(MODEL), stored: storage.get(KEY, StorageScope.APPLICATION),
			}, {
				registered: { tier: 'intelligence', tierSource: 'managed' },
				removed: { tier: 'balance', tierSource: 'default' }, stored: undefined,
			});
		});
	}

	for (const [name, policy, expected, vendor] of ['copilot', 'agent-host-copilotcli'].flatMap(vendor => [
		['scalar', 'intelligence', 'intelligence', vendor],
		['unsupported runtime wrapper', '{"overridable":"intelligence"}', 'balance', vendor],
		['unmanaged', undefined, 'balance', vendor],
	] as const)) {
		test(`ChatInputPart New Chat treats the previous explicit tier as inherited under ${vendor} ${name} policy`, async () => {
			const storage = store.add(new InMemoryStorageService());
			const control = createControllableService();
			control.setAutoModel(vendor);
			const managed: IManagedSettingsService = {
				_serviceBrand: undefined, onDidChangeManagedSettings: Event.None, getManagedSettingValue: () => policy,
			};
			const configuration = createStore(storage, control.service, () => true, managed, true);
			const selectedModel = { identifier: MODEL, metadata: control.service.lookupLanguageModel(MODEL)! };
			const button = $('a');
			const picker = new ModelPickerConfiguration({
				getSelectedModel: () => selectedModel,
				getConfigurationAccess: () => configuration,
				isDisabled: () => false,
				shouldShowCacheBreakHint: () => false,
				getCacheBreakLearnMoreLink: () => undefined,
				dismissCacheBreakHint() { },
			}, upcastPartial<IActionWidgetService>({}), NullTelemetryService);
			store.add(configuration.onDidChange(() => picker.renderButton(button, false, false)));
			const initial: IChatModelInputState = {
				selectedModel, attachments: [], mode: { id: 'agent', kind: ChatModeKind.Agent },
				inputText: '', selections: [], contrib: {},
			};
			const createModel = (value?: IChatModelInputState): IInputModel => {
				const state = observableValue<IChatModelInputState | undefined>('test.input', value);
				return upcastPartial<IInputModel>({
					state,
					setState: update => state.set({ ...initial, ...state.get(), ...update }, undefined),
				});
			};
			let activeModel: IInputModel | undefined;
			let carriedState: IChatModelInputState | undefined;
			const modes = { onDidChange: Event.None, dispose() { } };
			const input: ChatInputPart = Object.assign(Object.create(ChatInputPart.prototype), {
				logService: new NullLogService(),
				_modelConfigStore: configuration,
				_modelSyncDisposables: store.add(new DisposableStore()),
				_currentChatModes: store.add(new MutableDisposable()),
				_currentChatModesObservable: observableValue('test.modes', modes),
				_currentSessionModelObservable: observableValue('test.model', undefined),
				_currentSessionTypeObservable: observableValue<string | undefined>('test.sessionType', undefined),
				_currentLanguageModel: observableValue('test.selectedModel', selectedModel),
				chatModeService: { createModes: () => modes },
				selectedToolsModel: { resetSessionEnablementState() { } },
				sessionTypeHasOwnModelPool: () => false,
				_modelSelectionController: { beginConversationSwitch() { } },
				_emptyInputState: { read: () => carriedState },
				_emptyInputAttachments: { read: () => [] },
				configurationService: { onDidChangeConfiguration: Event.None },
				resolveDraftModel: () => ({ model: selectedModel, changed: false }),
				_setEmptyModelState() { },
				_syncInputStateToModel: () => {
					activeModel?.setState({ modelConfiguration: configuration.getModelConfiguration(MODEL) });
					carriedState = activeModel?.state.get();
				},
				_syncFromModel: (state: IChatModelInputState | undefined) => {
					if (state?.modelConfiguration) {
						configuration.restoreModelConfiguration(MODEL, state.modelConfiguration);
					}
				},
			});
			const first = createModel(initial);
			const second = createModel();
			const bind = (model: IInputModel, id: string) => {
				input.setInputModel(model, true, URI.parse(`vscode-chat-session:/${id}`));
				activeModel = model;
			};
			bind(first, 'first');
			await configuration.setModelConfiguration(MODEL, { tier: 'balance' });
			bind(second, 'second');
			const newChatTier = configuration.getModelConfiguration(MODEL)?.tier;
			const newChatLabel = button.textContent;
			const defaultTier = configuration.getModelConfigurationSchema(MODEL)?.properties?.tier.default;
			await configuration.setModelConfiguration(MODEL, { tier: 'efficiency' });
			bind(first, 'first');
			const firstRestored = configuration.getModelConfiguration(MODEL);
			bind(second, 'second');
			assert.deepStrictEqual({
				newChatTier, newChatLabel, defaultTier, firstRestored, secondRestored: configuration.getModelConfiguration(MODEL),
			}, {
				newChatTier: expected,
				newChatLabel: expected === 'intelligence' ? 'Intelligence' : 'Balance',
				defaultTier: policy === 'intelligence' ? 'intelligence' : 'balance',
				firstRestored: { tier: 'balance', tierSource: 'explicit' },
				secondRestored: { tier: 'efficiency', tierSource: 'explicit' },
			});
		});
	}

	test('onDidChange fires for the changed model', () => {
		const storage = store.add(new InMemoryStorageService());
		const editor = createStore(storage, createStubService());

		const fired: string[] = [];
		store.add(editor.onDidChange(id => fired.push(id)));

		editor.setModelConfiguration(MODEL, { thinkingEffort: 'high' });
		assert.deepStrictEqual(fired, [MODEL]);
	});

	test('reports explicit configuration selections separately from restores and schema updates', async () => {
		const storage = store.add(new InMemoryStorageService());
		const control = createControllableService();
		control.setRegistered(false);
		const editor = createStore(storage, control.service);
		editor.getModelConfiguration(MODEL);

		const changes: (IStringDictionary<unknown> | undefined)[] = [];
		const selections: { modelId: string; configuration: IStringDictionary<unknown> | undefined }[] = [];
		store.add(editor.onDidChange(modelId => changes.push(editor.getModelConfiguration(modelId))));
		store.add(editor.onDidSelectConfiguration(modelId => selections.push({ modelId, configuration: editor.getModelConfiguration(modelId) })));

		control.setRegistered(true);
		control.fireModelsChanged();
		editor.restoreModelConfiguration(MODEL, { thinkingEffort: 'high' });
		await editor.setModelConfiguration(MODEL, { thinkingEffort: 'low' });
		await editor.setModelConfiguration(MODEL, { thinkingEffort: 'low' });
		await editor.setModelConfiguration(MODEL, { thinkingEffort: 'medium' });
		editor.restoreModelConfiguration(MODEL, { thinkingEffort: 'high' }, false);

		assert.deepStrictEqual({ changes, selections, globalWrites: control.setConfigCalls }, {
			changes: [
				{ thinkingEffort: 'medium' },
				{ thinkingEffort: 'high' },
				{ thinkingEffort: 'low' },
				{ thinkingEffort: 'medium' },
				{ thinkingEffort: 'high' },
			],
			selections: [
				{ modelId: MODEL, configuration: { thinkingEffort: 'low' } },
				{ modelId: MODEL, configuration: { thinkingEffort: 'low' } },
				{ modelId: MODEL, configuration: { thinkingEffort: 'medium' } },
			],
			globalWrites: [
				{ modelId: MODEL, values: { thinkingEffort: 'low' } },
				{ modelId: MODEL, values: { thinkingEffort: 'medium' } },
			],
		});
	});

	test('setting an unchanged value does not fire onDidChange or rewrite storage', () => {
		const storage = store.add(new InMemoryStorageService());
		const editor = createStore(storage, createStubService());
		editor.setModelConfiguration(MODEL, { thinkingEffort: 'high' });

		const fired: string[] = [];
		store.add(editor.onDidChange(id => fired.push(id)));
		let writes = 0;
		const ds = store.add(new DisposableStore());
		store.add(storage.onDidChangeValue(StorageScope.APPLICATION, KEY, ds)(() => writes++));

		// Re-applying the same value (e.g. restoring on every input-state sync
		// while a session stays selected) must be a no-op.
		editor.setModelConfiguration(MODEL, { thinkingEffort: 'high' });
		editor.restoreModelConfiguration(MODEL, { thinkingEffort: 'high' });

		assert.deepStrictEqual(fired, []);
		assert.strictEqual(writes, 0);
	});

	test('restoreModelConfiguration seeds the snapshot and persists to the scoped bucket', () => {
		const storage = store.add(new InMemoryStorageService());
		const editor = createStore(storage, createStubService());

		// Restoring a captured non-default value (e.g. from a reopened session)
		// applies it to this editor and persists it for newly opened editors.
		editor.restoreModelConfiguration(MODEL, { thinkingEffort: 'high' });
		assert.deepStrictEqual(editor.getModelConfiguration(MODEL), { thinkingEffort: 'high' });

		const editorB = createStore(storage, createStubService());
		assert.deepStrictEqual(editorB.getModelConfiguration(MODEL), { thinkingEffort: 'high' });
	});

	test('request restoration stays local until the configuration is explicitly selected', async () => {
		const storage = store.add(new InMemoryStorageService());
		const control = createControllableService();
		const editor = createStore(storage, control.service);
		await editor.setModelConfiguration(MODEL, { thinkingEffort: 'high' });
		control.setConfigCalls.length = 0;
		const changes: string[] = [];
		store.add(editor.onDidChange(modelId => changes.push(modelId)));
		const input: ChatInputPart = Object.assign(Object.create(ChatInputPart.prototype), {
			_modelConfigStore: editor,
			_requestProgrammaticLanguageModel: async () => true,
		});

		await input.requestModelByIdentifier(MODEL, { thinkingEffort: 'low' });
		await input.requestModelByIdentifier(MODEL, { thinkingEffort: 'low' });
		control.fireModelsChanged();

		assert.deepStrictEqual({
			restored: editor.getModelConfiguration(MODEL),
			inherited: createStore(storage, control.service).getModelConfiguration(MODEL),
			globalWrites: control.setConfigCalls,
			changes,
		}, {
			restored: { thinkingEffort: 'low' },
			inherited: { thinkingEffort: 'high' },
			globalWrites: [],
			changes: [MODEL],
		});

		await editor.setModelConfiguration(MODEL, { thinkingEffort: 'low' });
		assert.deepStrictEqual({
			inherited: createStore(storage, control.service).getModelConfiguration(MODEL),
			globalWrites: control.setConfigCalls,
		}, {
			inherited: { thinkingEffort: 'low' },
			globalWrites: [{ modelId: MODEL, values: { thinkingEffort: 'low' } }],
		});
	});

	test('restoreModelConfiguration ignores values that the current schema rejects', () => {
		const storage = store.add(new InMemoryStorageService());
		const editor = createStore(storage, createStubService());

		// A config captured against an older schema: an unknown key plus a
		// now-invalid enum value. Both are dropped so the model falls back to its
		// live default ('medium'), leaving no stale override behind.
		editor.restoreModelConfiguration(MODEL, { thinkingEffort: 'extreme', removedProp: 42 });
		assert.deepStrictEqual(editor.getModelConfiguration(MODEL), { thinkingEffort: 'medium' });

		// The persisted bucket holds no stale entry, so a newly opened editor also
		// resolves to the live default.
		const editorB = createStore(storage, createStubService());
		assert.deepStrictEqual(editorB.getModelConfiguration(MODEL), { thinkingEffort: 'medium' });
	});

	test('clear() drops in-memory snapshots so the next read re-seeds from storage', () => {
		const storage = store.add(new InMemoryStorageService());
		const editor = createStore(storage, createStubService());

		editor.setModelConfiguration(MODEL, { thinkingEffort: 'high' });
		assert.deepStrictEqual(editor.getModelConfiguration(MODEL), { thinkingEffort: 'high' });

		// Simulate the persisted bucket changing out from under the editor (as a
		// different scope would), then clear and confirm the re-read picks it up.
		storage.store(KEY, JSON.stringify({ [MODEL]: { thinkingEffort: 'low' } }), StorageScope.APPLICATION, StorageTarget.USER);
		editor.clear();
		assert.deepStrictEqual(editor.getModelConfiguration(MODEL), { thinkingEffort: 'low' });
	});

	test('hostile model identifiers do not pollute the bucket prototype', () => {
		const storage = store.add(new InMemoryStorageService());
		// Seed a stored bucket that contains a __proto__ entry.
		storage.store(KEY, '{"__proto__":{"polluted":true},"copilot/gpt":{"thinkingEffort":"high"}}', StorageScope.APPLICATION, StorageTarget.USER);

		const editor = createStore(storage, createStubService());
		// The legitimate entry still resolves.
		assert.deepStrictEqual(editor.getModelConfiguration(MODEL), { thinkingEffort: 'high' });
		// Object.prototype is untouched.
		assert.strictEqual(({} as IStringDictionary<unknown>)['polluted'], undefined);
	});

	test('re-selecting the current value does not rewrite the profile-global configuration', () => {
		const storage = store.add(new InMemoryStorageService());
		const controls = createControllableService();
		const editor = createStore(storage, controls.service);

		// The first selection is a real change and is mirrored to the global.
		editor.setModelConfiguration(MODEL, { thinkingEffort: 'high' });
		assert.strictEqual(controls.setConfigCalls.length, 1);

		// Re-applying the same value is a local no-op and must not touch the global.
		editor.setModelConfiguration(MODEL, { thinkingEffort: 'high' });
		assert.strictEqual(controls.setConfigCalls.length, 1);
	});

	test('model change refreshes only pre-config-load snapshots, not bucket-backed ones', () => {
		const storage = store.add(new InMemoryStorageService());
		// A stable, bucket-backed entry for MODEL.
		storage.store(KEY, JSON.stringify({ [MODEL]: { thinkingEffort: 'high' } }), StorageScope.APPLICATION, StorageTarget.USER);

		const controls = createControllableService();
		// Nothing is registered yet, so schema defaults / global config are absent.
		controls.setRegistered(false);
		const editor = createStore(storage, controls.service);

		// MODEL resolves from its bucket entry even before registration (stable).
		assert.deepStrictEqual(editor.getModelConfiguration(MODEL), { thinkingEffort: 'high' });
		// OTHER has no bucket entry and nothing is registered, so it caches an empty
		// (poisoned) snapshot that must refresh once configuration becomes available.
		const OTHER = 'copilot/other';
		assert.strictEqual(editor.getModelConfiguration(OTHER), undefined);

		const fired: string[] = [];
		store.add(editor.onDidChange(id => fired.push(id)));

		// Providers register; the schema and a non-default global become available.
		controls.setRegistered(true);
		controls.setGlobal({ thinkingEffort: 'low' });
		controls.fireModelsChanged();

		// Only the poisoned OTHER snapshot is dropped + refreshed; MODEL's stable
		// bucket-backed snapshot survives without a duplicate refresh.
		assert.deepStrictEqual(fired, [OTHER]);
		assert.deepStrictEqual(editor.getModelConfiguration(OTHER), { thinkingEffort: 'low' });
		assert.deepStrictEqual(editor.getModelConfiguration(MODEL), { thinkingEffort: 'high' });
	});

	test('model change merges newly available schema defaults into non-empty pre-config-load snapshots', () => {
		const storage = store.add(new InMemoryStorageService());
		const emitter = store.add(new Emitter<string>());
		let registered = false;
		const service = {
			onDidChangeLanguageModels: emitter.event,
			lookupLanguageModel: (_id: string) => registered ? ({ configurationSchema: schemaWithContextSize } as ILanguageModelChatMetadata) : undefined,
			getModelConfiguration: (_id: string) => ({ thinkingEffort: 'high' }),
			setModelConfiguration: async (_modelId: string, _values: IStringDictionary<unknown>) => { },
		} as unknown as ILanguageModelsService;
		const editor = createStore(storage, service);

		assert.deepStrictEqual(editor.getModelConfiguration(MODEL), { thinkingEffort: 'high' });

		const fired: string[] = [];
		store.add(editor.onDidChange(id => fired.push(id)));

		registered = true;
		emitter.fire('copilot');

		assert.deepStrictEqual(
			{ fired, configuration: editor.getModelConfiguration(MODEL) },
			{ fired: [MODEL], configuration: { thinkingEffort: 'high', contextSize: 200_000 } }
		);
	});

	test('reload: a bucket-backed snapshot missing contextSize heals once the schema loads (regression for #320393)', () => {
		// Reproduces the subtle reload bug: a previously persisted scoped entry was
		// captured before `contextSize` existed in the schema (or only held a
		// thinking-effort override). On reload the editor reads that bucket entry
		// before providers finish registering, so the snapshot lacks `contextSize`.
		// Once the schema (with the default contextSize tier) becomes available the
		// snapshot MUST heal to include it — otherwise the request and gauge fall
		// back to the model's full native window (1M) instead of the default (200K).
		const storage = store.add(new InMemoryStorageService());
		storage.store(KEY, JSON.stringify({ [MODEL]: { thinkingEffort: 'high' } }), StorageScope.APPLICATION, StorageTarget.USER);

		const emitter = store.add(new Emitter<string>());
		let registered = false;
		const service = {
			onDidChangeLanguageModels: emitter.event,
			lookupLanguageModel: (_id: string) => registered ? ({ configurationSchema: schemaWithContextSize } as ILanguageModelChatMetadata) : undefined,
			getModelConfiguration: (_id: string) => undefined,
			setModelConfiguration: async (_modelId: string, _values: IStringDictionary<unknown>) => { },
		} as unknown as ILanguageModelsService;
		const editor = createStore(storage, service);

		// Before registration the snapshot resolves from the bucket entry only.
		assert.deepStrictEqual(editor.getModelConfiguration(MODEL), { thinkingEffort: 'high' });

		const fired: string[] = [];
		store.add(editor.onDidChange(id => fired.push(id)));

		registered = true;
		emitter.fire('copilot');

		assert.deepStrictEqual(
			{ fired, configuration: editor.getModelConfiguration(MODEL) },
			{ fired: [MODEL], configuration: { thinkingEffort: 'high', contextSize: 200_000 } }
		);
	});

	// A stub service registering a multi-property schema (thinkingEffort +
	// contextSize), so tests can exercise interactions between several config
	// keys that the single-key stubs miss.
	function createMultiKeyService(): ILanguageModelsService {
		return {
			onDidChangeLanguageModels: Event.None,
			lookupLanguageModel: (_id: string) => ({ configurationSchema: schemaWithContextSize } as ILanguageModelChatMetadata),
			getModelConfiguration: (_id: string) => undefined,
			setModelConfiguration: async (_id: string, _values: IStringDictionary<unknown>) => { },
		} as unknown as ILanguageModelsService;
	}

	test('changing one config key preserves the other key and its default (multi-key independence)', () => {
		const storage = store.add(new InMemoryStorageService());
		const editor = createStore(storage, createMultiKeyService());

		// Choosing a non-default contextSize must not drop the thinkingEffort default.
		editor.setModelConfiguration(MODEL, { contextSize: 1_000_000 });
		assert.deepStrictEqual(editor.getModelConfiguration(MODEL), { thinkingEffort: 'medium', contextSize: 1_000_000 });

		// Choosing a non-default thinkingEffort must not drop the chosen contextSize.
		editor.setModelConfiguration(MODEL, { thinkingEffort: 'high' });
		assert.deepStrictEqual(editor.getModelConfiguration(MODEL), { thinkingEffort: 'high', contextSize: 1_000_000 });
	});

	test('a non-default contextSize round-trips to a new editor and reselecting the default clears it', () => {
		const storage = store.add(new InMemoryStorageService());

		const editorA = createStore(storage, createMultiKeyService());
		editorA.setModelConfiguration(MODEL, { contextSize: 1_000_000 });

		// A newly opened editor inherits the persisted full-window choice, with the
		// thinkingEffort default filled in.
		const editorB = createStore(storage, createMultiKeyService());
		assert.deepStrictEqual(editorB.getModelConfiguration(MODEL), { thinkingEffort: 'medium', contextSize: 1_000_000 });

		// Reselecting the default 200K clears the override (empty marker persisted),
		// so a later editor resolves cleanly to the default tier rather than getting
		// "stuck" on the previously chosen full window.
		editorB.setModelConfiguration(MODEL, { contextSize: 200_000 });
		const editorC = createStore(storage, createMultiKeyService());
		assert.deepStrictEqual(editorC.getModelConfiguration(MODEL), { thinkingEffort: 'medium', contextSize: 200_000 });
	});

	test('healing does not reset a user-chosen full-window contextSize back to the default', () => {
		// The mirror image of the 200K regression: a user who explicitly picked the
		// full 1M window must NOT have it silently reset to the default tier when the
		// schema finishes loading and defaults are merged in.
		const storage = store.add(new InMemoryStorageService());
		storage.store(KEY, JSON.stringify({ [MODEL]: { contextSize: 1_000_000 } }), StorageScope.APPLICATION, StorageTarget.USER);

		const emitter = store.add(new Emitter<string>());
		let registered = false;
		const service = {
			onDidChangeLanguageModels: emitter.event,
			lookupLanguageModel: (_id: string) => registered ? ({ configurationSchema: schemaWithContextSize } as ILanguageModelChatMetadata) : undefined,
			getModelConfiguration: (_id: string) => undefined,
			setModelConfiguration: async (_modelId: string, _values: IStringDictionary<unknown>) => { },
		} as unknown as ILanguageModelsService;
		const editor = createStore(storage, service);

		assert.deepStrictEqual(editor.getModelConfiguration(MODEL), { contextSize: 1_000_000 });

		registered = true;
		emitter.fire('copilot');

		// The explicit full-window choice survives; only the absent thinkingEffort
		// default is filled in.
		assert.deepStrictEqual(editor.getModelConfiguration(MODEL), { thinkingEffort: 'medium', contextSize: 1_000_000 });
	});

	test('restoreModelConfiguration does not write the profile-global value', () => {
		// Restoring a reopened session is not an intentional reconfiguration and
		// runs on every input-state sync, so it must seed only the editor-scoped
		// snapshot and never mirror to the profile-global value.
		const storage = store.add(new InMemoryStorageService());
		const controls = createControllableService();
		const editor = createStore(storage, controls.service);

		editor.restoreModelConfiguration(MODEL, { thinkingEffort: 'high' });

		assert.deepStrictEqual(editor.getModelConfiguration(MODEL), { thinkingEffort: 'high' });
		assert.strictEqual(controls.setConfigCalls.length, 0);
	});

	test('a per-scope storage key change segregates buckets (issue #320393)', () => {
		// The owner can swap the storage key when the editor's scope (e.g. session
		// type) changes. After `clear()` the next read must resolve from the new
		// key's bucket, not leak the previous scope's value.
		const storage = store.add(new InMemoryStorageService());
		let key = 'chat.modelConfiguration.scopeA';
		const service = createStubService();
		const editor = store.add(new ChatModelConfigurationStore(() => key, () => true, constObservable(false), service, storage, new NullManagedSettingsService(), new NullLogService()));

		editor.setModelConfiguration(MODEL, { thinkingEffort: 'high' });
		assert.deepStrictEqual(editor.getModelConfiguration(MODEL), { thinkingEffort: 'high' });

		// Switch scope: a different key with no entry must resolve to the default,
		// and switching back must restore scope A's value.
		key = 'chat.modelConfiguration.scopeB';
		editor.clear();
		assert.deepStrictEqual(editor.getModelConfiguration(MODEL), { thinkingEffort: 'medium' });

		key = 'chat.modelConfiguration.scopeA';
		editor.clear();
		assert.deepStrictEqual(editor.getModelConfiguration(MODEL), { thinkingEffort: 'high' });
	});

	test('reload: an empty pre-config-load snapshot resolves to the default contextSize once the schema loads', () => {
		// A model with no stored entry and no global value caches an empty snapshot
		// before registration. Once the schema loads it must resolve to the default
		// contextSize tier (not be left without a contextSize, which would leak the
		// full window to the request/gauge).
		const storage = store.add(new InMemoryStorageService());

		const emitter = store.add(new Emitter<string>());
		let registered = false;
		const service = {
			onDidChangeLanguageModels: emitter.event,
			lookupLanguageModel: (_id: string) => registered ? ({ configurationSchema: schemaWithContextSize } as ILanguageModelChatMetadata) : undefined,
			getModelConfiguration: (_id: string) => undefined,
			setModelConfiguration: async (_modelId: string, _values: IStringDictionary<unknown>) => { },
		} as unknown as ILanguageModelsService;
		const editor = createStore(storage, service);

		// Nothing registered yet: empty (poisoned) snapshot.
		assert.strictEqual(editor.getModelConfiguration(MODEL), undefined);

		const fired: string[] = [];
		store.add(editor.onDidChange(id => fired.push(id)));

		registered = true;
		emitter.fire('copilot');

		assert.deepStrictEqual(
			{ fired, configuration: editor.getModelConfiguration(MODEL) },
			{ fired: [MODEL], configuration: { thinkingEffort: 'medium', contextSize: 200_000 } }
		);
	});

	test('integration: store heals + notifies so the widget denominator drops from the full window to the default tier', () => {
		// Covers the store -> widget seam the original regression slipped through.
		// A non-empty snapshot (a global thinkingEffort) is cached before the model
		// registers, so it lacks contextSize. Once the schema loads the store must
		// both merge the default contextSize AND fire onDidChange, or the widget —
		// whose only config-refresh trigger is this event — keeps showing the
		// model's full native window instead of the cheaper default tier.
		const FULL_WINDOW = 1_000_000;
		const DEFAULT_TIER = 200_000;
		const storage = store.add(new InMemoryStorageService());
		const emitter = store.add(new Emitter<string>());
		let registered = false;
		const metadata = () => registered
			? ({ configurationSchema: schemaWithContextSize, maxInputTokens: FULL_WINDOW } as ILanguageModelChatMetadata)
			: undefined;
		const service = {
			onDidChangeLanguageModels: emitter.event,
			lookupLanguageModel: (_id: string) => metadata(),
			getModelConfiguration: (_id: string) => ({ thinkingEffort: 'high' }),
			setModelConfiguration: async (_modelId: string, _values: IStringDictionary<unknown>) => { },
		} as unknown as ILanguageModelsService;
		const editor = createStore(storage, service);

		// The widget's denominator, fed by the store resolver, recomputed on change.
		const computeDenominator = () => resolveContextWindowInputTokens(
			editor.getModelConfiguration(MODEL),
			metadata()?.configurationSchema,
			metadata()?.maxInputTokens,
		);
		const denominators: (number | undefined)[] = [computeDenominator()];
		store.add(editor.onDidChange(id => { if (id === MODEL) { denominators.push(computeDenominator()); } }));

		// Schema loads: the store heals the snapshot and notifies the widget.
		registered = true;
		emitter.fire('copilot');

		assert.deepStrictEqual(denominators, [undefined, DEFAULT_TIER]);
	});

	test('restore preserves a reopened conversation\'s config for an unregistered model instead of re-pinning a shared stale value', () => {
		// Repro of the per-conversation restore bug: two conversations share the
		// (location, sessionType)-scoped store. Conversation B picked a large
		// context window, leaving the shared bucket + in-memory snapshot at 936k.
		// Reopening conversation A must restore ITS captured 200k even though the
		// model is not registered (schema unavailable) — filtering must not discard
		// the captured config and let the stale 936k survive, which would also get
		// re-captured into A's persisted state.
		const storage = store.add(new InMemoryStorageService());
		// Conversation B's value persisted in the shared scoped bucket.
		storage.store(KEY, JSON.stringify({ [MODEL]: { contextSize: 936_000 } }), StorageScope.APPLICATION, StorageTarget.USER);
		// The model is NOT registered, so its configuration schema is unavailable.
		const service = {
			onDidChangeLanguageModels: Event.None,
			lookupLanguageModel: (_id: string) => undefined,
			getModelConfiguration: (_id: string) => undefined,
			setModelConfiguration: async (_id: string, _values: IStringDictionary<unknown>) => { },
		} as unknown as ILanguageModelsService;
		const editor = createStore(storage, service);

		// Seed the in-memory snapshot from the stale shared bucket (as if B was active).
		assert.deepStrictEqual(editor.getModelConfiguration(MODEL), { contextSize: 936_000 });

		// Reopen conversation A: restore its captured 200k config.
		editor.restoreModelConfiguration(MODEL, { contextSize: 200_000 });

		// A's value wins; the stale 936k is gone.
		assert.deepStrictEqual(editor.getModelConfiguration(MODEL), { contextSize: 200_000 });
	});
});
