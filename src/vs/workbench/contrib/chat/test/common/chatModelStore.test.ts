/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ChatModel } from '../../common/chatModel.js';
import { ChatModelStore, IStartSessionProps } from '../../common/chatModelStore.js';
import { ChatAgentLocation } from '../../common/constants.js';
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
			token: CancellationToken.None,
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
			token: CancellationToken.None,
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
});
