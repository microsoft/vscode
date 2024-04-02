/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { timeout } from 'vs/base/common/async';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { URI } from 'vs/base/common/uri';
import { assertSnapshot } from 'vs/base/test/common/snapshot';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { Range } from 'vs/editor/common/core/range';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ChatAgentService, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ChatModel, Response } from 'vs/workbench/contrib/chat/common/chatModel';
import { ChatRequestTextPart } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { TestExtensionService, TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';

suite('ChatModel', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;

	setup(async () => {
		instantiationService = testDisposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IChatAgentService, instantiationService.createInstance(ChatAgentService));
	});

	test('Waits for initialization', async () => {
		const model = testDisposables.add(instantiationService.createInstance(ChatModel, 'provider', undefined));

		let hasInitialized = false;
		model.waitForInitialization().then(() => {
			hasInitialized = true;
		});

		await timeout(0);
		assert.strictEqual(hasInitialized, false);

		model.startInitialize();
		model.initialize({} as any, undefined);
		await timeout(0);
		assert.strictEqual(hasInitialized, true);
	});

	test('must call startInitialize before initialize', async () => {
		const model = testDisposables.add(instantiationService.createInstance(ChatModel, 'provider', undefined));

		let hasInitialized = false;
		model.waitForInitialization().then(() => {
			hasInitialized = true;
		});

		await timeout(0);
		assert.strictEqual(hasInitialized, false);

		assert.throws(() => model.initialize({} as any, undefined));
		assert.strictEqual(hasInitialized, false);
	});

	test('deinitialize/reinitialize', async () => {
		const model = testDisposables.add(instantiationService.createInstance(ChatModel, 'provider', undefined));

		let hasInitialized = false;
		model.waitForInitialization().then(() => {
			hasInitialized = true;
		});

		model.startInitialize();
		model.initialize({} as any, undefined);
		await timeout(0);
		assert.strictEqual(hasInitialized, true);

		model.deinitialize();
		let hasInitialized2 = false;
		model.waitForInitialization().then(() => {
			hasInitialized2 = true;
		});

		model.startInitialize();
		model.initialize({} as any, undefined);
		await timeout(0);
		assert.strictEqual(hasInitialized2, true);
	});

	test('cannot initialize twice', async () => {
		const model = testDisposables.add(instantiationService.createInstance(ChatModel, 'provider', undefined));

		model.startInitialize();
		model.initialize({} as any, undefined);
		assert.throws(() => model.initialize({} as any, undefined));
	});

	test('Initialization fails when model is disposed', async () => {
		const model = testDisposables.add(instantiationService.createInstance(ChatModel, 'provider', undefined));
		model.dispose();

		assert.throws(() => model.initialize({} as any, undefined));
	});

	test('removeRequest', async () => {
		const model = testDisposables.add(instantiationService.createInstance(ChatModel, 'provider', undefined));

		model.startInitialize();
		model.initialize({} as any, undefined);
		const text = 'hello';
		model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] });
		const requests = model.getRequests();
		assert.strictEqual(requests.length, 1);

		model.removeRequest(requests[0].id);
		assert.strictEqual(model.getRequests().length, 0);
	});
});

suite('Response', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('content, markdown', async () => {
		const response = new Response([]);
		response.updateContent({ content: 'text', kind: 'content' });
		response.updateContent({ content: new MarkdownString('markdown'), kind: 'markdownContent' });
		await assertSnapshot(response.value);

		assert.strictEqual(response.asString(), 'textmarkdown');
	});

	test('markdown, content', async () => {
		const response = new Response([]);
		response.updateContent({ content: new MarkdownString('markdown'), kind: 'markdownContent' });
		response.updateContent({ content: 'text', kind: 'content' });
		await assertSnapshot(response.value);
	});

	test('inline reference', async () => {
		const response = new Response([]);
		response.updateContent({ content: 'text before', kind: 'content' });
		response.updateContent({ inlineReference: URI.parse('https://microsoft.com'), kind: 'inlineReference' });
		response.updateContent({ content: 'text after', kind: 'content' });
		await assertSnapshot(response.value);
	});
});
