/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { ITestCodeEditor, instantiateTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { InlineChatConfigKeys } from '../../common/inlineChat.js';
import { IChatSendRequestOptions, IChatService } from '../../../chat/common/chatService/chatService.js';
import { IInlineChatSession2, IInlineChatSessionService } from '../../browser/inlineChatSessionService.js';
import { InlineChatController } from '../../browser/inlineChatController.js';
import { ChatAgentLocation, ChatModeKind } from '../../../chat/common/constants.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../chat/common/languageModels.js';
import { IChatAgentData } from '../../../chat/common/participants/chatAgents.js';
import { IChatModel, IChatResponseModel } from '../../../chat/common/model/chatModel.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IChatEditingService, IChatEditingSession, IModifiedFileEntry } from '../../../chat/common/editing/chatEditingService.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { CursorChangeReason } from '../../../../../editor/common/cursorEvents.js';
import { CursorState } from '../../../../../editor/common/cursorCommon.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../../platform/userInteraction/browser/userInteractionService.js';
import { INotebookEditorService } from '../../../notebook/browser/services/notebookEditorService.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';

suite('InlineChatController - Request Parity', () => {

	const store = new DisposableStore();
	let editor: ITestCodeEditor;
	let model: ITextModel;
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;

	/** Captured sendRequest calls: [sessionResource, message, options] */
	let sendRequestCalls: { sessionResource: URI; message: string; options?: IChatSendRequestOptions }[];
	/** Emitter to signal session dispose */
	let sessionDisposedEmitter: Emitter<void>;

	const testModelId = 'test-model-id';
	const testModelQualifiedName = 'Test Model (TestVendor)';
	const testSessionResource = URI.parse('chat-session:test-session');

	setup(() => {
		sendRequestCalls = [];
		sessionDisposedEmitter = store.add(new Emitter<void>());

		instantiationService = workbenchInstantiationService({
			configurationService: () => new TestConfigurationService({
				[InlineChatConfigKeys.RenderMode]: 'hover',
			}),
		}, store);

		configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;

		// Mock IUserInteractionService — needed for InlineChatInputWidget's internal code editor
		instantiationService.stub(IUserInteractionService, new MockUserInteractionService());

		// Mock INotebookEditorService
		instantiationService.stub(INotebookEditorService, new class extends mock<INotebookEditorService>() {
			override getNotebookForPossibleCell() { return undefined; }
		});

		// Mock IChatService — capture sendRequest calls
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override async sendRequest(sessionResource: URI, message: string, options?: IChatSendRequestOptions) {
				sendRequestCalls.push({ sessionResource, message, options });
				return { kind: 'sent' as const, data: { agent: {} as Partial<IChatAgentData> as IChatAgentData, responseCreatedPromise: Promise.resolve({} as Partial<IChatResponseModel> as IChatResponseModel), responseCompletePromise: Promise.resolve() } };
			}
			override async cancelCurrentRequestForSession() { }
		});

		// Mock ILanguageModelsService
		const testMetadata: ILanguageModelChatMetadata = {
			vendor: 'TestVendor',
			name: 'Test Model',
			family: 'test',
			version: '1',
			id: testModelId,
			maxInputTokens: 1000,
			maxOutputTokens: 1000,
			auth: undefined,
			capabilities: {},
			isDefaultForLocation: { [ChatAgentLocation.EditorInline]: true },
			targetEntitlements: [],
		} as Partial<ILanguageModelChatMetadata> as ILanguageModelChatMetadata;

		instantiationService.stub(ILanguageModelsService, new class extends mock<ILanguageModelsService>() {
			override getLanguageModelIds() { return [testModelId]; }
			override lookupLanguageModel(id: string) { return id === testModelId ? testMetadata : undefined; }
			override lookupLanguageModelByQualifiedName(name: string) {
				if (name === testModelQualifiedName) {
					return { metadata: testMetadata, identifier: testModelId };
				}
				return undefined;
			}
			override async selectLanguageModels() { return [testModelId]; }
		});

		// Mock IChatEditingService
		instantiationService.stub(IChatEditingService, new class extends mock<IChatEditingService>() {
			override readonly editingSessionsObs = observableValue('sessions', []);
		});

		// Mock IInlineChatSessionService
		const onDidChangeSessionsEmitter = store.add(new Emitter<any>());
		const sessionStateObs = observableValue<undefined>('terminationState', undefined);
		const entriesObs = observableValue<readonly IModifiedFileEntry[]>('entries', []);

		instantiationService.stub(IInlineChatSessionService, new class extends mock<IInlineChatSessionService>() {
			override readonly onWillStartSession = Event.None;
			override readonly onDidChangeSessions = onDidChangeSessionsEmitter.event;
			override getSessionByTextModel() { return undefined; }
			override getSessionBySessionUri() { return undefined; }
			override createSession(_editor: any): IInlineChatSession2 {
				const session: IInlineChatSession2 = {
					initialPosition: new Position(1, 1),
					initialSelection: _editor.getSelection() ?? new Selection(1, 1, 1, 6),
					uri: _editor.getModel()!.uri,
					chatModel: {
						sessionResource: testSessionResource,
						initialLocation: ChatAgentLocation.EditorInline,
						hasRequests: false,
						inputModel: { state: observableValue('state', undefined), setState: () => { }, clearState: () => { }, toJSON: () => ({}) },
						getRequests: () => [],
						lastRequestObs: observableValue('lastReq', undefined),
						onDidChange: Event.None,
					} as unknown as IChatModel,
					editingSession: {
						onDidDispose: sessionDisposedEmitter.event,
						entries: entriesObs,
						readEntry: () => undefined,
						getEntry: () => undefined,
						accept: async () => { },
						reject: async () => { },
						dispose: () => { },
					} as Partial<IChatEditingSession> as IChatEditingSession,
					terminationState: sessionStateObs,
					setTerminationState: () => { },
					dispose: () => {
						onDidChangeSessionsEmitter.fire(undefined);
					},
				};
				onDidChangeSessionsEmitter.fire(undefined);
				return session;
			}
		});

		model = store.add(createTextModel('hello world\nfoo bar\nbaz qux'));
		editor = store.add(instantiateTestCodeEditor(instantiationService, model));
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function setExplicitSelection(sel: Selection): void {
		editor.getViewModel()!.setCursorStates(
			'test',
			CursorChangeReason.Explicit,
			[CursorState.fromModelSelection(sel)]
		);
	}

	test('hover mode sendRequest has correct location and locationData', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		setExplicitSelection(new Selection(1, 1, 1, 6));

		const controller = store.add(instantiationService.createInstance(InlineChatController, editor));

		const runPromise = controller.run({ message: 'test message', autoSend: true });
		await timeout(0);

		// Settle the session so run() can return
		sessionDisposedEmitter.fire();
		await runPromise;

		assert.strictEqual(sendRequestCalls.length, 1, 'should have exactly one sendRequest call');
		const call = sendRequestCalls[0];

		// Verify session resource
		assert.ok(call.sessionResource.toString() === testSessionResource.toString());

		// Verify message
		assert.strictEqual(call.message, 'test message');

		// Verify location
		assert.strictEqual(call.options?.location, ChatAgentLocation.EditorInline);

		// Verify locationData
		const locData = call.options?.locationData;
		assert.ok(locData);
		assert.strictEqual(locData.type, ChatAgentLocation.EditorInline);
		if (locData.type === ChatAgentLocation.EditorInline) {
			assert.ok(locData.document.toString() === model.uri.toString());
			assert.deepStrictEqual(Selection.liftSelection(locData.selection), new Selection(1, 1, 1, 6));
		}

		// Verify model selection
		assert.strictEqual(call.options?.userSelectedModelId, testModelId);

		// Verify modeInfo
		assert.strictEqual(call.options?.modeInfo?.kind, ChatModeKind.Ask);
		assert.strictEqual(call.options?.modeInfo?.modeId, 'ask');
		assert.strictEqual(call.options?.modeInfo?.isBuiltin, true);
	}));

	test('hover mode sendRequest locationData matches what zone widget resolveData would produce', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		setExplicitSelection(new Selection(2, 1, 2, 4));

		const controller = store.add(instantiationService.createInstance(InlineChatController, editor));

		const runPromise = controller.run({ message: 'edit code', autoSend: true });
		await timeout(0);
		sessionDisposedEmitter.fire();
		await runPromise;

		assert.strictEqual(sendRequestCalls.length, 1);
		const locData = sendRequestCalls[0].options?.locationData;
		assert.ok(locData);

		// The zone widget's resolveData builds the same shape:
		// { type: ChatAgentLocation.EditorInline, id: getEditorId(editor, model), selection, document, wholeRange }
		if (locData.type === ChatAgentLocation.EditorInline) {
			// id should be `${editorId},${modelId}`
			assert.ok(typeof locData.id === 'string');
			assert.ok(locData.id.length > 0);
			// document should match the editor's model URI
			assert.ok(locData.document.toString() === model.uri.toString());
			// selection should match what we set
			assert.deepStrictEqual(Selection.liftSelection(locData.selection), new Selection(2, 1, 2, 4));
			// wholeRange should equal the selection (same as zone widget behavior)
			assert.deepStrictEqual(Range.lift(locData.wholeRange), new Range(2, 1, 2, 4));
		} else {
			assert.fail('Expected EditorInline location data');
		}
	}));

	test('hover mode resolves model via defaultModel setting', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		// Reset _userSelectedModel static
		// @ts-ignore accessing private static for test reset
		InlineChatController._userSelectedModel = undefined;

		// Set a default model config
		configurationService.setUserConfiguration(InlineChatConfigKeys.DefaultModel, testModelQualifiedName);
		configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration() { return true; }
		});

		setExplicitSelection(new Selection(1, 1, 1, 6));
		const controller = store.add(instantiationService.createInstance(InlineChatController, editor));

		const runPromise = controller.run({ message: 'hello', autoSend: true });
		await timeout(0);
		sessionDisposedEmitter.fire();
		await runPromise;

		assert.strictEqual(sendRequestCalls.length, 1);
		assert.strictEqual(sendRequestCalls[0].options?.userSelectedModelId, testModelId);
	}));

	test('hover mode does not send request when autoSend is false', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		setExplicitSelection(new Selection(1, 1, 1, 6));
		const controller = store.add(instantiationService.createInstance(InlineChatController, editor));

		const runPromise = controller.run({ message: 'hello', autoSend: false });
		await timeout(0);
		sessionDisposedEmitter.fire();
		await runPromise;

		assert.strictEqual(sendRequestCalls.length, 0, 'should not call sendRequest when autoSend is false');
	}));

	test('hover mode does not send request when message is missing', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		setExplicitSelection(new Selection(1, 1, 1, 6));
		const controller = store.add(instantiationService.createInstance(InlineChatController, editor));

		const runPromise = controller.run({ autoSend: true });
		await timeout(0);
		sessionDisposedEmitter.fire();
		await runPromise;

		assert.strictEqual(sendRequestCalls.length, 0, 'should not call sendRequest when message is missing');
	}));
});
