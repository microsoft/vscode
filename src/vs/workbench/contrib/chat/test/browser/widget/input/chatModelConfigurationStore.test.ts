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
import { ILanguageModelChatMetadata, ILanguageModelConfigurationSchema, ILanguageModelsService } from '../../../../common/languageModels.js';

const schema: ILanguageModelConfigurationSchema = {
	properties: {
		thinkingEffort: { enum: ['low', 'medium', 'high'], default: 'medium' },
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
});
