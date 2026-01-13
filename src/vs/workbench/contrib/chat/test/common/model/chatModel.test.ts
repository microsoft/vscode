/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { assertSnapshot } from '../../../../../../base/test/common/snapshot.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../../../editor/common/core/ranges/offsetRange.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { TestExtensionService, TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { CellUri } from '../../../../notebook/common/notebookCommon.js';
import { ChatAgentService, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatModel, IExportableChatData, ISerializableChatData1, ISerializableChatData2, ISerializableChatData3, isExportableSessionData, isSerializableSessionData, normalizeSerializableChatData, Response } from '../../../common/model/chatModel.js';
import { ChatRequestTextPart } from '../../../common/requestParser/chatParserTypes.js';
import { IChatService, IChatToolInvocation } from '../../../common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { MockChatService } from '../chatService/mockChatService.js';

suite('ChatModel', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;

	setup(async () => {
		instantiationService = testDisposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IChatAgentService, testDisposables.add(instantiationService.createInstance(ChatAgentService)));
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IChatService, new MockChatService());
	});

	test('initialization with exported data only (imported)', async () => {
		const exportedData: IExportableChatData = {
			initialLocation: ChatAgentLocation.Chat,
			requests: [],
			responderUsername: 'bot',
			responderAvatarIconUri: undefined
		};

		const model = testDisposables.add(instantiationService.createInstance(
			ChatModel,
			exportedData,
			{ initialLocation: ChatAgentLocation.Chat, canUseTools: true }
		));

		assert.strictEqual(model.isImported, true);
		assert.ok(model.sessionId); // Should have generated ID
		assert.ok(model.timestamp > 0); // Should have generated timestamp
	});

	test('initialization with full serializable data (not imported)', async () => {
		const now = Date.now();
		const serializableData: ISerializableChatData3 = {
			version: 3,
			sessionId: 'existing-session',
			creationDate: now - 1000,
			lastMessageDate: now,
			customTitle: 'My Chat',
			initialLocation: ChatAgentLocation.Chat,
			requests: [],
			responderUsername: 'bot',
			responderAvatarIconUri: undefined
		};

		const model = testDisposables.add(instantiationService.createInstance(
			ChatModel,
			serializableData,
			{ initialLocation: ChatAgentLocation.Chat, canUseTools: true }
		));

		assert.strictEqual(model.isImported, false);
		assert.strictEqual(model.sessionId, 'existing-session');
		assert.strictEqual(model.timestamp, now - 1000);
		assert.strictEqual(model.lastMessageDate, now);
		assert.strictEqual(model.customTitle, 'My Chat');
	});

	test('initialization with invalid data', async () => {
		const invalidData = {
			// Missing required fields
			requests: 'not-an-array'
		} as unknown as IExportableChatData;

		const model = testDisposables.add(instantiationService.createInstance(
			ChatModel,
			invalidData,
			{ initialLocation: ChatAgentLocation.Chat, canUseTools: true }
		));

		// Should handle gracefully with empty state
		assert.strictEqual(model.getRequests().length, 0);
		assert.ok(model.sessionId); // Should have generated ID
	});

	test('initialization without data', async () => {
		const model = testDisposables.add(instantiationService.createInstance(
			ChatModel,
			undefined,
			{ initialLocation: ChatAgentLocation.Chat, canUseTools: true }
		));

		assert.strictEqual(model.isImported, false);
		assert.strictEqual(model.getRequests().length, 0);
		assert.ok(model.sessionId);
		assert.ok(model.timestamp > 0);
	});

	test('removeRequest', async () => {
		const model = testDisposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));

		const text = 'hello';
		model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
		const requests = model.getRequests();
		assert.strictEqual(requests.length, 1);

		model.removeRequest(requests[0].id);
		assert.strictEqual(model.getRequests().length, 0);
	});

	test('adoptRequest', async function () {
		const model1 = testDisposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.EditorInline, canUseTools: true }));
		const model2 = testDisposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));

		const text = 'hello';
		const request1 = model1.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);

		assert.strictEqual(model1.getRequests().length, 1);
		assert.strictEqual(model2.getRequests().length, 0);
		assert.ok(request1.session === model1);
		assert.ok(request1.response?.session === model1);

		model2.adoptRequest(request1);

		assert.strictEqual(model1.getRequests().length, 0);
		assert.strictEqual(model2.getRequests().length, 1);
		assert.ok(request1.session === model2);
		assert.ok(request1.response?.session === model2);

		model2.acceptResponseProgress(request1, { content: new MarkdownString('Hello'), kind: 'markdownContent' });

		assert.strictEqual(request1.response.response.toString(), 'Hello');
	});

	test('addCompleteRequest', async function () {
		const model1 = testDisposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));

		const text = 'hello';
		const request1 = model1.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0, undefined, undefined, undefined, undefined, undefined, undefined, true);

		assert.strictEqual(request1.isCompleteAddedRequest, true);
		assert.strictEqual(request1.response!.isCompleteAddedRequest, true);
		assert.strictEqual(request1.shouldBeRemovedOnSend, undefined);
		assert.strictEqual(request1.response!.shouldBeRemovedOnSend, undefined);
	});
});

suite('Response', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('mergeable markdown', async () => {
		const response = store.add(new Response([]));
		response.updateContent({ content: new MarkdownString('markdown1'), kind: 'markdownContent' });
		response.updateContent({ content: new MarkdownString('markdown2'), kind: 'markdownContent' });
		await assertSnapshot(response.value);

		assert.strictEqual(response.toString(), 'markdown1markdown2');
	});

	test('not mergeable markdown', async () => {
		const response = store.add(new Response([]));
		const md1 = new MarkdownString('markdown1');
		md1.supportHtml = true;
		response.updateContent({ content: md1, kind: 'markdownContent' });
		response.updateContent({ content: new MarkdownString('markdown2'), kind: 'markdownContent' });
		await assertSnapshot(response.value);
	});

	test('inline reference', async () => {
		const response = store.add(new Response([]));
		response.updateContent({ content: new MarkdownString('text before '), kind: 'markdownContent' });
		response.updateContent({ inlineReference: URI.parse('https://microsoft.com/'), kind: 'inlineReference' });
		response.updateContent({ content: new MarkdownString(' text after'), kind: 'markdownContent' });
		await assertSnapshot(response.value);

		assert.strictEqual(response.toString(), 'text before https://microsoft.com/ text after');

	});

	test('consolidated edit summary', () => {
		const response = store.add(new Response([]));
		response.updateContent({ content: new MarkdownString('Some content before edits'), kind: 'markdownContent' });
		response.updateContent({ kind: 'textEditGroup', uri: URI.parse('file:///file1.ts'), edits: [], state: undefined, done: true });
		response.updateContent({ kind: 'textEditGroup', uri: URI.parse('file:///file2.ts'), edits: [], state: undefined, done: true });
		response.updateContent({ content: new MarkdownString('Some content after edits'), kind: 'markdownContent' });

		// Should have single "Made changes." at the end instead of multiple entries
		const responseString = response.toString();
		const madeChangesCount = (responseString.match(/Made changes\./g) || []).length;
		assert.strictEqual(madeChangesCount, 1, 'Should have exactly one "Made changes." message');
		assert.ok(responseString.includes('Some content before edits'), 'Should include content before edits');
		assert.ok(responseString.includes('Some content after edits'), 'Should include content after edits');
		assert.ok(responseString.endsWith('Made changes.'), 'Should end with "Made changes."');
	});

	test('no edit summary when no edits', () => {
		const response = store.add(new Response([]));
		response.updateContent({ content: new MarkdownString('Some content'), kind: 'markdownContent' });
		response.updateContent({ content: new MarkdownString('More content'), kind: 'markdownContent' });

		// Should not have "Made changes." when there are no edit groups
		const responseString = response.toString();
		assert.ok(!responseString.includes('Made changes.'), 'Should not include "Made changes." when no edits present');
		assert.strictEqual(responseString, 'Some contentMore content');
	});

	test('consolidated edit summary with clear operation', () => {
		const response = store.add(new Response([]));
		response.updateContent({ content: new MarkdownString('Initial content'), kind: 'markdownContent' });
		response.updateContent({ kind: 'textEditGroup', uri: URI.parse('file:///file1.ts'), edits: [], state: undefined, done: true });
		response.updateContent({ kind: 'clearToPreviousToolInvocation', reason: 1 });
		response.updateContent({ content: new MarkdownString('Content after clear'), kind: 'markdownContent' });
		response.updateContent({ kind: 'textEditGroup', uri: URI.parse('file:///file2.ts'), edits: [], state: undefined, done: true });

		// Should only show "Made changes." for edits after the clear operation
		const responseString = response.toString();
		const madeChangesCount = (responseString.match(/Made changes\./g) || []).length;
		assert.strictEqual(madeChangesCount, 1, 'Should have exactly one "Made changes." message after clear');
		assert.ok(responseString.includes('Content after clear'), 'Should include content after clear');
		assert.ok(!responseString.includes('Initial content'), 'Should not include content before clear');
		assert.ok(responseString.endsWith('Made changes.'), 'Should end with "Made changes."');
	});

	test('textEdit merges edits for same URI when not done', () => {
		const response = store.add(new Response([]));
		const uri = URI.parse('file:///file1.ts');

		response.updateContent({
			kind: 'textEdit',
			uri,
			edits: [{ range: new Range(1, 1, 1, 1), text: 'edit1' }],
			done: false,
			isExternalEdit: true
		});

		response.updateContent({
			kind: 'textEdit',
			uri,
			edits: [{ range: new Range(2, 1, 2, 1), text: 'edit2' }],
			done: true
		});

		const textEditGroups = response.value.filter(p => p.kind === 'textEditGroup');
		assert.strictEqual(textEditGroups.length, 1, 'Should have exactly one textEditGroup');
		assert.strictEqual(textEditGroups[0].edits.length, 2, 'Should have two edit batches merged');
		assert.strictEqual(textEditGroups[0].done, true, 'Should be marked as done after final edit');
		assert.strictEqual(textEditGroups[0].isExternalEdit, true, 'Should preserve isExternalEdit flag from first edit');
	});

	test('textEdit does not merge edits when previous is done', () => {
		const response = store.add(new Response([]));
		const uri = URI.parse('file:///file1.ts');

		response.updateContent({
			kind: 'textEdit',
			uri,
			edits: [{ range: new Range(1, 1, 1, 1), text: 'edit1' }],
			done: true
		});

		response.updateContent({
			kind: 'textEdit',
			uri,
			edits: [{ range: new Range(2, 1, 2, 1), text: 'edit2' }],
			done: true
		});

		const textEditGroups = response.value.filter(p => p.kind === 'textEditGroup');
		assert.strictEqual(textEditGroups.length, 2, 'Should have two separate textEditGroups');
	});

	test('textEdit does not merge edits for different URIs', () => {
		const response = store.add(new Response([]));

		response.updateContent({
			kind: 'textEdit',
			uri: URI.parse('file:///file1.ts'),
			edits: [{ range: new Range(1, 1, 1, 1), text: 'edit1' }],
			done: false
		});

		response.updateContent({
			kind: 'textEdit',
			uri: URI.parse('file:///file2.ts'),
			edits: [{ range: new Range(1, 1, 1, 1), text: 'edit2' }],
			done: true
		});

		const textEditGroups = response.value.filter(p => p.kind === 'textEditGroup');
		assert.strictEqual(textEditGroups.length, 2, 'Should have two separate textEditGroups for different URIs');
	});

	test('notebookEdit merges edits for same notebook URI when not done', () => {
		const response = store.add(new Response([]));
		const notebookUri = URI.parse('file:///notebook.ipynb');

		response.updateContent({
			kind: 'notebookEdit',
			uri: notebookUri,
			edits: [{ editType: 1 /* CellEditType.Replace */, index: 0, count: 0, cells: [] }],
			done: false,
			isExternalEdit: true
		});

		response.updateContent({
			kind: 'notebookEdit',
			uri: notebookUri,
			edits: [{ editType: 1 /* CellEditType.Replace */, index: 1, count: 0, cells: [] }],
			done: true
		});

		const notebookEditGroups = response.value.filter(p => p.kind === 'notebookEditGroup');
		assert.strictEqual(notebookEditGroups.length, 1, 'Should have exactly one notebookEditGroup');
		assert.strictEqual(notebookEditGroups[0].edits.length, 2, 'Should have two edit batches merged');
		assert.strictEqual(notebookEditGroups[0].done, true, 'Should be marked as done after final edit');
		assert.strictEqual(notebookEditGroups[0].isExternalEdit, true, 'Should preserve isExternalEdit flag from first edit');
	});

	test('notebookEdit does not merge edits when previous is done', () => {
		const response = store.add(new Response([]));
		const notebookUri = URI.parse('file:///notebook.ipynb');

		response.updateContent({
			kind: 'notebookEdit',
			uri: notebookUri,
			edits: [{ editType: 1 /* CellEditType.Replace */, index: 0, count: 0, cells: [] }],
			done: true
		});

		response.updateContent({
			kind: 'notebookEdit',
			uri: notebookUri,
			edits: [{ editType: 1 /* CellEditType.Replace */, index: 1, count: 0, cells: [] }],
			done: true
		});

		const notebookEditGroups = response.value.filter(p => p.kind === 'notebookEditGroup');
		assert.strictEqual(notebookEditGroups.length, 2, 'Should have two separate notebookEditGroups');
	});

	test('notebookEdit does not merge edits for different notebook URIs', () => {
		const response = store.add(new Response([]));

		response.updateContent({
			kind: 'notebookEdit',
			uri: URI.parse('file:///notebook1.ipynb'),
			edits: [{ editType: 1 /* CellEditType.Replace */, index: 0, count: 0, cells: [] }],
			done: false
		});

		response.updateContent({
			kind: 'notebookEdit',
			uri: URI.parse('file:///notebook2.ipynb'),
			edits: [{ editType: 1 /* CellEditType.Replace */, index: 0, count: 0, cells: [] }],
			done: true
		});

		const notebookEditGroups = response.value.filter(p => p.kind === 'notebookEditGroup');
		assert.strictEqual(notebookEditGroups.length, 2, 'Should have two separate notebookEditGroups for different URIs');
	});

	test('textEdit to notebook cell creates notebookEditGroup', () => {
		const response = store.add(new Response([]));
		const notebookUri = URI.parse('file:///notebook.ipynb');
		const cellUri = CellUri.generate(notebookUri, 1);

		response.updateContent({
			kind: 'textEdit',
			uri: cellUri,
			edits: [{ range: new Range(1, 1, 1, 1), text: 'edit1' }],
			done: true
		});

		const textEditGroups = response.value.filter(p => p.kind === 'textEditGroup');
		const notebookEditGroups = response.value.filter(p => p.kind === 'notebookEditGroup');
		assert.strictEqual(textEditGroups.length, 0, 'Should not have textEditGroup for cell edits');
		assert.strictEqual(notebookEditGroups.length, 1, 'Should have notebookEditGroup for cell edits');
	});
});

suite('normalizeSerializableChatData', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('v1', () => {
		const v1Data: ISerializableChatData1 = {
			creationDate: Date.now(),
			initialLocation: undefined,
			requests: [],
			responderAvatarIconUri: undefined,
			responderUsername: 'bot',
			sessionId: 'session1',
		};

		const newData = normalizeSerializableChatData(v1Data);
		assert.strictEqual(newData.creationDate, v1Data.creationDate);
		assert.strictEqual(newData.lastMessageDate, v1Data.creationDate);
		assert.strictEqual(newData.version, 3);
	});

	test('v2', () => {
		const v2Data: ISerializableChatData2 = {
			version: 2,
			creationDate: 100,
			lastMessageDate: Date.now(),
			initialLocation: undefined,
			requests: [],
			responderAvatarIconUri: undefined,
			responderUsername: 'bot',
			sessionId: 'session1',
			computedTitle: 'computed title'
		};

		const newData = normalizeSerializableChatData(v2Data);
		assert.strictEqual(newData.version, 3);
		assert.strictEqual(newData.creationDate, v2Data.creationDate);
		assert.strictEqual(newData.lastMessageDate, v2Data.lastMessageDate);
		assert.strictEqual(newData.customTitle, v2Data.computedTitle);
	});

	test('old bad data', () => {
		const v1Data: ISerializableChatData1 = {
			// Testing the scenario where these are missing
			sessionId: undefined!,
			creationDate: undefined!,

			initialLocation: undefined,
			requests: [],
			responderAvatarIconUri: undefined,
			responderUsername: 'bot',
		};

		const newData = normalizeSerializableChatData(v1Data);
		assert.strictEqual(newData.version, 3);
		assert.ok(newData.creationDate > 0);
		assert.ok(newData.lastMessageDate > 0);
		assert.ok(newData.sessionId);
	});

	test('v3 with bug', () => {
		const v3Data: ISerializableChatData3 = {
			// Test case where old data was wrongly normalized and these fields were missing
			creationDate: undefined!,
			lastMessageDate: undefined!,

			version: 3,
			initialLocation: undefined,
			requests: [],
			responderAvatarIconUri: undefined,
			responderUsername: 'bot',
			sessionId: 'session1',
			customTitle: 'computed title'
		};

		const newData = normalizeSerializableChatData(v3Data);
		assert.strictEqual(newData.version, 3);
		assert.ok(newData.creationDate > 0);
		assert.ok(newData.lastMessageDate > 0);
		assert.ok(newData.sessionId);
	});
});

suite('isExportableSessionData', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('valid exportable data', () => {
		const validData: IExportableChatData = {
			initialLocation: ChatAgentLocation.Chat,
			requests: [],
			responderUsername: 'bot',
			responderAvatarIconUri: undefined
		};

		assert.strictEqual(isExportableSessionData(validData), true);
	});

	test('invalid - missing requests', () => {
		const invalidData = {
			initialLocation: ChatAgentLocation.Chat,
			responderUsername: 'bot',
			responderAvatarIconUri: undefined
		};

		assert.strictEqual(isExportableSessionData(invalidData), false);
	});

	test('invalid - requests not array', () => {
		const invalidData = {
			initialLocation: ChatAgentLocation.Chat,
			requests: 'not-an-array',
			responderUsername: 'bot',
			responderAvatarIconUri: undefined
		};

		assert.strictEqual(isExportableSessionData(invalidData), false);
	});

	test('invalid - missing responderUsername', () => {
		const invalidData = {
			initialLocation: ChatAgentLocation.Chat,
			requests: [],
			responderAvatarIconUri: undefined
		};

		assert.strictEqual(isExportableSessionData(invalidData), false);
	});

	test('invalid - responderUsername not string', () => {
		const invalidData = {
			initialLocation: ChatAgentLocation.Chat,
			requests: [],
			responderUsername: 123,
			responderAvatarIconUri: undefined
		};

		assert.strictEqual(isExportableSessionData(invalidData), false);
	});

	test('invalid - null', () => {
		assert.strictEqual(isExportableSessionData(null), false);
	});

	test('invalid - undefined', () => {
		assert.strictEqual(isExportableSessionData(undefined), false);
	});
});

suite('isSerializableSessionData', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('valid serializable data', () => {
		const validData: ISerializableChatData3 = {
			version: 3,
			sessionId: 'session1',
			creationDate: Date.now(),
			lastMessageDate: Date.now(),
			customTitle: undefined,
			initialLocation: ChatAgentLocation.Chat,
			requests: [],
			responderUsername: 'bot',
			responderAvatarIconUri: undefined
		};

		assert.strictEqual(isSerializableSessionData(validData), true);
	});

	test('valid - with usedContext', () => {
		const validData: ISerializableChatData3 = {
			version: 3,
			sessionId: 'session1',
			creationDate: Date.now(),
			lastMessageDate: Date.now(),
			customTitle: undefined,
			initialLocation: ChatAgentLocation.Chat,
			requests: [{
				requestId: 'req1',
				message: 'test',
				variableData: { variables: [] },
				response: undefined,
				usedContext: { documents: [], kind: 'usedContext' }
			}],
			responderUsername: 'bot',
			responderAvatarIconUri: undefined
		};

		assert.strictEqual(isSerializableSessionData(validData), true);
	});

	test('invalid - missing sessionId', () => {
		const invalidData = {
			version: 3,
			creationDate: Date.now(),
			lastMessageDate: Date.now(),
			customTitle: undefined,
			initialLocation: ChatAgentLocation.Chat,
			requests: [],
			responderUsername: 'bot',
			responderAvatarIconUri: undefined
		};

		assert.strictEqual(isSerializableSessionData(invalidData), false);
	});

	test('invalid - missing creationDate', () => {
		const invalidData = {
			version: 3,
			sessionId: 'session1',
			lastMessageDate: Date.now(),
			customTitle: undefined,
			initialLocation: ChatAgentLocation.Chat,
			requests: [],
			responderUsername: 'bot',
			responderAvatarIconUri: undefined
		};

		assert.strictEqual(isSerializableSessionData(invalidData), false);
	});

	test('invalid - not exportable', () => {
		const invalidData = {
			version: 3,
			sessionId: 'session1',
			creationDate: Date.now(),
			lastMessageDate: Date.now(),
			customTitle: undefined,
			initialLocation: ChatAgentLocation.Chat,
			requests: 'not-an-array',
			responderUsername: 'bot',
			responderAvatarIconUri: undefined
		};

		assert.strictEqual(isSerializableSessionData(invalidData), false);
	});
});

suite('ChatResponseModel', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;

	setup(async () => {
		instantiationService = testDisposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IChatAgentService, testDisposables.add(instantiationService.createInstance(ChatAgentService)));
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IChatService, new MockChatService());
	});

	test('timestamp and confirmationAdjustedTimestamp', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const model = testDisposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
			const start = Date.now();

			const text = 'hello';
			const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
			const response = request.response!;

			assert.strictEqual(response.timestamp, start);
			assert.strictEqual(response.confirmationAdjustedTimestamp.get(), start);

			// Advance time, no pending confirmation
			clock.tick(1000);
			assert.strictEqual(response.confirmationAdjustedTimestamp.get(), start);

			// Add pending confirmation via tool invocation
			const toolState = observableValue<any>('state', { type: 0 /* IChatToolInvocation.StateKind.WaitingForConfirmation */ });
			const toolInvocation = {
				kind: 'toolInvocation',
				invocationMessage: 'calling tool',
				confirmationMessages: { title: 'Please confirm' },
				state: toolState
			} as Partial<IChatToolInvocation> as IChatToolInvocation;

			model.acceptResponseProgress(request, toolInvocation);

			// Advance time while pending
			clock.tick(2000);
			// Timestamp should still be start (it includes the wait time while waiting)
			assert.strictEqual(response.confirmationAdjustedTimestamp.get(), start);

			// Resolve confirmation
			toolState.set({ type: 3 /* IChatToolInvocation.StateKind.Completed */ }, undefined);

			// Now adjusted timestamp should reflect the wait time
			// The wait time was 2000ms.
			// confirmationAdjustedTimestamp = start + waitTime = start + 2000
			assert.strictEqual(response.confirmationAdjustedTimestamp.get(), start + 2000);

			// Advance time again
			clock.tick(1000);
			assert.strictEqual(response.confirmationAdjustedTimestamp.get(), start + 2000);

		} finally {
			clock.restore();
		}
	});
});
