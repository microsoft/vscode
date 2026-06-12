/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IStringDictionary } from '../../../../../../../base/common/collections.js';
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
		lookupLanguageModel: (_id: string) => ({ configurationSchema: schema } as ILanguageModelChatMetadata),
		getModelConfiguration: (_id: string) => global,
	} as unknown as ILanguageModelsService;
}

suite('ChatModelConfigurationStore', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createStore(storage: InMemoryStorageService, service: ILanguageModelsService): ChatModelConfigurationStore {
		return store.add(new ChatModelConfigurationStore(() => KEY, service, storage));
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
});
