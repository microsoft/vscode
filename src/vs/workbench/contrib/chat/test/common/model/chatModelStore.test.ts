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
});
