/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { ChatModel } from '../../../common/model/chatModel.js';
import { ChatModelStore, IStartSessionProps } from '../../../common/model/chatModelStore.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { MockChatModel } from './mockChatModel.js';

suite('ChatModelStore', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let testObject: ChatModelStore;
	let createdModels: MockChatModel[];
	let willDisposePromises: DeferredPromise<void>[];

	setup(() => {
		createdModels = [];
		willDisposePromises = [];
		testObject = store.add(new ChatModelStore({
			createModel: (props: IStartSessionProps) => {
				const model = new MockChatModel(props.sessionResource);
				createdModels.push(model);
				return model as unknown as ChatModel;
			},
			willDisposeModel: async (model: ChatModel) => {
				const p = new DeferredPromise<void>();
				willDisposePromises.push(p);
				await p.p;
			}
		}, new NullLogService()));
	});

	test('create and dispose', async () => {
		const uri = URI.parse('test://session');
		const props: IStartSessionProps = {
			sessionResource: uri,
			location: ChatAgentLocation.Chat,
			canUseTools: true
		};

		const ref = testObject.acquireOrCreate(props);
		assert.strictEqual(createdModels.length, 1);
		assert.strictEqual(ref.object, createdModels[0]);

		ref.dispose();
		assert.strictEqual(willDisposePromises.length, 1);

		willDisposePromises[0].complete();
		await testObject.waitForModelDisposals();
		assert.strictEqual(testObject.get(uri), undefined);
	});

	test('resurrection', async () => {
		const uri = URI.parse('test://session');
		const props: IStartSessionProps = {
			sessionResource: uri,
			location: ChatAgentLocation.Chat,
			canUseTools: true
		};

		const ref1 = testObject.acquireOrCreate(props);
		const model1 = ref1.object;
		ref1.dispose();

		// Model is pending disposal
		assert.strictEqual(willDisposePromises.length, 1);
		assert.strictEqual(testObject.get(uri), model1);

		// Acquire again - should be resurrected
		const ref2 = testObject.acquireOrCreate(props);
		assert.strictEqual(ref2.object, model1);
		assert.strictEqual(createdModels.length, 1);

		// Finish disposal of the first ref
		willDisposePromises[0].complete();
		await testObject.waitForModelDisposals();

		// Model should still exist because ref2 holds it
		assert.strictEqual(testObject.get(uri), model1);

		ref2.dispose();
	});

	test('invalidation creates a new generation while old references remain valid', async () => {
		const uri = URI.parse('test://session');
		const props: IStartSessionProps = {
			sessionResource: uri,
			location: ChatAgentLocation.Chat,
			canUseTools: true
		};
		const disposedModels: ChatModel[] = [];
		store.add(testObject.onDidDisposeModel(model => disposedModels.push(model)));

		const oldRef = testObject.acquireOrCreate(props, 'old-holder');
		const oldModel = oldRef.object as unknown as MockChatModel;

		assert.strictEqual(testObject.invalidate(uri), true);
		assert.strictEqual(testObject.get(uri), undefined);
		assert.strictEqual(testObject.acquireExisting(uri), undefined);

		const newRef = testObject.acquireOrCreate(props, 'new-holder');
		const newModel = newRef.object;
		assert.notStrictEqual(newModel, oldModel);

		oldRef.dispose();
		await testObject.waitForModelDisposals();

		assert.deepStrictEqual({
			createdModels: createdModels.length,
			oldDisposed: oldModel.isDisposed,
			currentIsNew: testObject.get(uri) === newModel,
			willDisposeCalls: willDisposePromises.length,
			disposedModels,
			debugModels: testObject.getReferenceDebugSnapshot().models.map(model => ({
				createdBy: model.createdBy,
				referenceCount: model.referenceCount,
			})),
		}, {
			createdModels: 2,
			oldDisposed: true,
			currentIsNew: true,
			willDisposeCalls: 0,
			disposedModels: [],
			debugModels: [{
				createdBy: 'new-holder',
				referenceCount: 1,
			}],
		});

		newRef.dispose();
		willDisposePromises[0].complete();
		await testObject.waitForModelDisposals();
		assert.deepStrictEqual(disposedModels, [newModel]);
	});

	test('invalidated generation fires disposal when it has no replacement', async () => {
		const uri = URI.parse('test://session');
		const props: IStartSessionProps = {
			sessionResource: uri,
			location: ChatAgentLocation.Chat,
			canUseTools: true
		};
		const disposedModels: ChatModel[] = [];
		store.add(testObject.onDidDisposeModel(model => disposedModels.push(model)));
		const ref = testObject.acquireOrCreate(props);
		const model = ref.object;

		testObject.invalidate(uri);
		ref.dispose();
		await testObject.waitForModelDisposals();

		assert.deepStrictEqual({
			disposedModels,
			willDisposeCalls: willDisposePromises.length,
		}, {
			disposedModels: [model],
			willDisposeCalls: 0,
		});
	});

	test('resource cleanup waits for all invalidated generations', async () => {
		const uri = URI.parse('test://session');
		const props: IStartSessionProps = {
			sessionResource: uri,
			location: ChatAgentLocation.Chat,
			canUseTools: true
		};
		const disposedModels: ChatModel[] = [];
		store.add(testObject.onDidDisposeModel(model => disposedModels.push(model)));

		const firstRef = testObject.acquireOrCreate(props);
		const firstModel = firstRef.object;
		testObject.invalidate(uri);
		const secondRef = testObject.acquireOrCreate(props);
		const secondModel = secondRef.object;
		testObject.invalidate(uri);

		firstRef.dispose();
		await testObject.waitForModelDisposals();
		const disposedAfterFirstGeneration = [...disposedModels];

		secondRef.dispose();
		await testObject.waitForModelDisposals();
		assert.deepStrictEqual({
			generationsAreDistinct: firstModel !== secondModel,
			disposedAfterFirstGeneration,
			disposedAfterFinalGeneration: disposedModels,
		}, {
			generationsAreDistinct: true,
			disposedAfterFirstGeneration: [],
			disposedAfterFinalGeneration: [secondModel],
		});
	});

	test('get and has', async () => {
		const uri = URI.parse('test://session');
		const props: IStartSessionProps = {
			sessionResource: uri,
			location: ChatAgentLocation.Chat,
			canUseTools: true
		};

		const ref = testObject.acquireOrCreate(props);
		assert.strictEqual(testObject.get(uri), ref.object);
		assert.strictEqual(testObject.has(uri), true);

		ref.dispose();
		willDisposePromises[0].complete();
		await testObject.waitForModelDisposals();

		assert.strictEqual(testObject.get(uri), undefined);
		assert.strictEqual(testObject.has(uri), false);
	});

	test('acquireExisting', async () => {
		const uri = URI.parse('test://session');
		const props: IStartSessionProps = {
			sessionResource: uri,
			location: ChatAgentLocation.Chat,
			canUseTools: true
		};

		assert.strictEqual(testObject.acquireExisting(uri), undefined);

		const ref1 = testObject.acquireOrCreate(props);
		const ref2 = testObject.acquireExisting(uri);
		assert.ok(ref2);
		assert.strictEqual(ref2.object, ref1.object);

		ref1.dispose();
		ref2.dispose();
		willDisposePromises[0].complete();
		await testObject.waitForModelDisposals();
	});

	test('values', async () => {
		const uri1 = URI.parse('test://session1');
		const uri2 = URI.parse('test://session2');
		const props1: IStartSessionProps = {
			sessionResource: uri1,
			location: ChatAgentLocation.Chat,
			canUseTools: true
		};
		const props2: IStartSessionProps = {
			sessionResource: uri2,
			location: ChatAgentLocation.Chat,
			canUseTools: true
		};

		const ref1 = testObject.acquireOrCreate(props1);
		const ref2 = testObject.acquireOrCreate(props2);

		const values = Array.from(testObject.values());
		assert.strictEqual(values.length, 2);
		assert.ok(values.includes(ref1.object));
		assert.ok(values.includes(ref2.object));

		ref1.dispose();
		ref2.dispose();
		willDisposePromises[0].complete();
		willDisposePromises[1].complete();
		await testObject.waitForModelDisposals();
	});

	test('dispose store', async () => {
		const uri = URI.parse('test://session');
		const props: IStartSessionProps = {
			sessionResource: uri,
			location: ChatAgentLocation.Chat,
			canUseTools: true
		};

		const ref = testObject.acquireOrCreate(props);
		const model = ref.object as unknown as MockChatModel;
		testObject.dispose();

		assert.strictEqual(model.isDisposed, true);
	});

	test('tracks reference owners and creation owner', async () => {
		const uri = URI.parse('test://session');
		const props: IStartSessionProps = {
			sessionResource: uri,
			location: ChatAgentLocation.Chat,
			canUseTools: true
		};

		const ref1 = testObject.acquireOrCreate(props, 'ChatModelStoreTest#create');
		const ref2 = testObject.acquireExisting(uri, 'ChatModelStoreTest#existing');
		const ref3 = testObject.acquireExisting(uri, 'ChatModelStoreTest#existing');

		assert.deepStrictEqual(testObject.getReferenceDebugSnapshot(), {
			totalModels: 1,
			totalReferences: 3,
			models: [{
				sessionResource: uri,
				title: '',
				createdBy: 'ChatModelStoreTest#create',
				initialLocation: ChatAgentLocation.Chat,
				isImported: false,
				willKeepAlive: true,
				hasPendingEdits: false,
				pendingDisposal: false,
				referenceCount: 3,
				holders: [
					{ holder: 'ChatModelStoreTest#existing', count: 2 },
					{ holder: 'ChatModelStoreTest#create', count: 1 }
				]
			}]
		});

		ref1.dispose();
		ref2?.dispose();
		ref3?.dispose();
		willDisposePromises[0].complete();
		await testObject.waitForModelDisposals();
	});

	test('reports pending disposal models without holders', async () => {
		const uri = URI.parse('test://session');
		const props: IStartSessionProps = {
			sessionResource: uri,
			location: ChatAgentLocation.Chat,
			canUseTools: true
		};

		const ref = testObject.acquireOrCreate(props, 'ChatModelStoreTest#create');
		ref.dispose();

		assert.deepStrictEqual(testObject.getReferenceDebugSnapshot(), {
			totalModels: 1,
			totalReferences: 0,
			models: [{
				sessionResource: uri,
				title: '',
				createdBy: 'ChatModelStoreTest#create',
				initialLocation: ChatAgentLocation.Chat,
				isImported: false,
				willKeepAlive: true,
				hasPendingEdits: false,
				pendingDisposal: true,
				referenceCount: 0,
				holders: []
			}]
		});

		willDisposePromises[0].complete();
		await testObject.waitForModelDisposals();
	});

	test('resurrection preserves debug tracking', async () => {
		const uri = URI.parse('test://session');
		const props: IStartSessionProps = {
			sessionResource: uri,
			location: ChatAgentLocation.Chat,
			canUseTools: true
		};

		const ref1 = testObject.acquireOrCreate(props, 'OriginalCreator');
		ref1.dispose();

		// Model is pending disposal — re-acquire before disposal completes
		const ref2 = testObject.acquireOrCreate(props, 'Rescuer');

		// Complete the old disposal — should NOT wipe the model or tracking
		willDisposePromises[0].complete();
		await testObject.waitForModelDisposals();

		assert.deepStrictEqual(testObject.getReferenceDebugSnapshot(), {
			totalModels: 1,
			totalReferences: 1,
			models: [{
				sessionResource: uri,
				title: '',
				createdBy: 'OriginalCreator',
				initialLocation: ChatAgentLocation.Chat,
				isImported: false,
				willKeepAlive: true,
				hasPendingEdits: false,
				pendingDisposal: false,
				referenceCount: 1,
				holders: [{ holder: 'Rescuer', count: 1 }]
			}]
		});

		ref2.dispose();
		willDisposePromises[1].complete();
		await testObject.waitForModelDisposals();
	});
});
