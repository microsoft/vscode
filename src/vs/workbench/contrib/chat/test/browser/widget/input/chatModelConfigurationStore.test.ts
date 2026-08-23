/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IStringDictionary } from '../../../../../../../base/common/collections.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../../platform/storage/common/storage.js';
import { ChatModelConfigurationStore } from '../../../../browser/widget/input/chatModelConfigurationStore.js';
import { resolveContextWindowInputTokens } from '../../../../browser/widgetHosts/viewPane/chatContextUsageWidget.js';
import { ILanguageModelChatMetadata, ILanguageModelConfigurationSchema, ILanguageModelsService } from '../../../../common/languageModels.js';

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

	function createStore(storage: InMemoryStorageService, service: ILanguageModelsService): ChatModelConfigurationStore {
		return store.add(new ChatModelConfigurationStore(() => KEY, service, storage));
	}

	interface IControllableService {
		readonly service: ILanguageModelsService;
		readonly setConfigCalls: Array<{ modelId: string; values: IStringDictionary<unknown> }>;
		fireModelsChanged(): void;
		setRegistered(registered: boolean): void;
		setGlobal(value: IStringDictionary<unknown> | undefined): void;
	}

	// A stub whose model registration and profile-global value can change over
	// time (mirroring the asynchronous provider registration) and which records
	// forwarded global writes so tests can assert no-ops are not propagated.
	function createControllableService(): IControllableService {
		const emitter = store.add(new Emitter<string>());
		let registered = true;
		let global: IStringDictionary<unknown> | undefined;
		const setConfigCalls: Array<{ modelId: string; values: IStringDictionary<unknown> }> = [];
		const service = {
			onDidChangeLanguageModels: emitter.event,
			lookupLanguageModel: (_id: string) => registered ? ({ configurationSchema: schema } as ILanguageModelChatMetadata) : undefined,
			getModelConfiguration: (_id: string) => global,
			setModelConfiguration: async (modelId: string, values: IStringDictionary<unknown>) => { setConfigCalls.push({ modelId, values }); },
		} as unknown as ILanguageModelsService;
		return {
			service,
			setConfigCalls,
			fireModelsChanged: () => emitter.fire('copilot'),
			setRegistered: (value: boolean) => { registered = value; },
			setGlobal: (value: IStringDictionary<unknown> | undefined) => { global = value; },
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

		const editorA = store.add(new ChatModelConfigurationStore(() => KEY, service, storage));
		const editorB = store.add(new ChatModelConfigurationStore(() => KEY, service, storage));

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

	test('onDidChange fires for the changed model', () => {
		const storage = store.add(new InMemoryStorageService());
		const editor = createStore(storage, createStubService());

		const fired: string[] = [];
		store.add(editor.onDidChange(id => fired.push(id)));

		editor.setModelConfiguration(MODEL, { thinkingEffort: 'high' });
		assert.deepStrictEqual(fired, [MODEL]);
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
		const editor = store.add(new ChatModelConfigurationStore(() => key, service, storage));

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
