/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { waitForState } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { assertType } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { assertThrowsAsync, ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditOperation } from '../../../../../editor/common/core/editOperation.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../services/assignment/test/common/nullAssignmentService.js';
import { nullExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestWorkerService } from '../../../inlineChat/test/browser/testWorkerService.js';
import { IMcpService } from '../../../mcp/common/mcpTypes.js';
import { TestMcpService } from '../../../mcp/test/common/testMcpService.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService } from '../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { NotebookTextModel } from '../../../notebook/common/model/notebookTextModel.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { ChatEditingService } from '../../browser/chatEditing/chatEditingServiceImpl.js';
import { ChatSessionsService } from '../../browser/chatSessions.contribution.js';
import { ChatAgentService, IChatAgentData, IChatAgentImplementation, IChatAgentService } from '../../common/chatAgents.js';
import { ChatEditingSessionState, IChatEditingService, IChatEditingSession, ModifiedFileEntryState } from '../../common/chatEditingService.js';
import { ChatModel } from '../../common/chatModel.js';
import { IChatService } from '../../common/chatService.js';
import { ChatService } from '../../common/chatServiceImpl.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { IChatSlashCommandService } from '../../common/chatSlashCommands.js';
import { ChatTransferService, IChatTransferService } from '../../common/chatTransferService.js';
import { IChatVariablesService } from '../../common/chatVariables.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { ILanguageModelsService } from '../../common/languageModels.js';
import { NullLanguageModelsService } from '../common/languageModels.js';
import { MockChatVariablesService } from '../common/mockChatVariables.js';

function getAgentData(id: string): IChatAgentData {
	return {
		name: id,
		id: id,
		extensionId: nullExtensionDescription.identifier,
		extensionVersion: undefined,
		extensionPublisherId: '',
		publisherDisplayName: '',
		extensionDisplayName: '',
		locations: [ChatAgentLocation.Chat],
		modes: [ChatModeKind.Ask],
		metadata: {},
		slashCommands: [],
		disambiguation: [],
	};
}

suite('ChatEditingService', function () {

	const store = new DisposableStore();
	let editingService: ChatEditingService;
	let chatService: IChatService;
	let textModelService: ITextModelService;

	setup(function () {
		const collection = new ServiceCollection();
		collection.set(IWorkbenchAssignmentService, new NullWorkbenchAssignmentService());
		collection.set(IChatAgentService, new SyncDescriptor(ChatAgentService));
		collection.set(IChatVariablesService, new MockChatVariablesService());
		collection.set(IChatSlashCommandService, new class extends mock<IChatSlashCommandService>() { });
		collection.set(IChatTransferService, new SyncDescriptor(ChatTransferService));
		collection.set(IChatSessionsService, new SyncDescriptor(ChatSessionsService));
		collection.set(IChatEditingService, new SyncDescriptor(ChatEditingService));
		collection.set(IEditorWorkerService, new SyncDescriptor(TestWorkerService));
		collection.set(IChatService, new SyncDescriptor(ChatService));
		collection.set(IMcpService, new TestMcpService());
		collection.set(ILanguageModelsService, new SyncDescriptor(NullLanguageModelsService));
		collection.set(IMultiDiffSourceResolverService, new class extends mock<IMultiDiffSourceResolverService>() {
			override registerResolver(_resolver: IMultiDiffSourceResolver): IDisposable {
				return Disposable.None;
			}
		});
		collection.set(INotebookService, new class extends mock<INotebookService>() {
			override getNotebookTextModel(_uri: URI): NotebookTextModel | undefined {
				return undefined;
			}
			override hasSupportedNotebooks(_resource: URI): boolean {
				return false;
			}
		});
		const insta = store.add(store.add(workbenchInstantiationService(undefined, store)).createChild(collection));
		store.add(insta.get(IEditorWorkerService) as TestWorkerService);
		const value = insta.get(IChatEditingService);
		assert.ok(value instanceof ChatEditingService);
		editingService = value;

		chatService = insta.get(IChatService);

		store.add(insta.get(IChatSessionsService) as ChatSessionsService); // Needs to be disposed in between test runs to clear extensionPoint contribution

		const chatAgentService = insta.get(IChatAgentService);

		const agent: IChatAgentImplementation = {
			async invoke(request, progress, history, token) {
				return {};
			},
		};
		store.add(chatAgentService.registerAgent('testAgent', { ...getAgentData('testAgent'), isDefault: true }));
		store.add(chatAgentService.registerAgentImplementation('testAgent', agent));

		textModelService = insta.get(ITextModelService);

		const modelService = insta.get(IModelService);

		store.add(textModelService.registerTextModelContentProvider('test', {
			async provideTextContent(resource) {
				return store.add(modelService.createModel(resource.path.repeat(10), null, resource, false));
			},
		}));
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('create session', async function () {
		assert.ok(editingService);

		const model = chatService.startSession(ChatAgentLocation.Chat, CancellationToken.None);
		const session = await editingService.createEditingSession(model, true);

		assert.strictEqual(session.chatSessionId, model.sessionId);
		assert.strictEqual(session.isGlobalEditingSession, true);

		await assertThrowsAsync(async () => {
			// DUPE not allowed
			await editingService.createEditingSession(model);
		});

		session.dispose();
		model.dispose();
	});

	test('create session, file entry & isCurrentlyBeingModifiedBy', async function () {
		assert.ok(editingService);

		const uri = URI.from({ scheme: 'test', path: 'HelloWorld' });

		const model = chatService.startSession(ChatAgentLocation.Chat, CancellationToken.None);
		const session = await model.editingSessionObs?.promise;
		if (!session) {
			assert.fail('session not created');
		}

		const chatRequest = model?.addRequest({ text: '', parts: [] }, { variables: [] }, 0);
		assertType(chatRequest.response);
		chatRequest.response.updateContent({ kind: 'textEdit', uri, edits: [], done: false });
		chatRequest.response.updateContent({ kind: 'textEdit', uri, edits: [{ range: new Range(1, 1, 1, 1), text: 'FarBoo\n' }], done: false });
		chatRequest.response.updateContent({ kind: 'textEdit', uri, edits: [], done: true });

		const entry = await waitForState(session.entries.map(value => value.find(a => isEqual(a.modifiedURI, uri))));

		assert.ok(isEqual(entry.modifiedURI, uri));

		await waitForState(entry.isCurrentlyBeingModifiedBy.map(value => value === chatRequest.response));
		assert.ok(entry.isCurrentlyBeingModifiedBy.get() === chatRequest.response);

		const unset = waitForState(entry.isCurrentlyBeingModifiedBy.map(res => res === undefined));

		chatRequest.response.complete();

		await unset;

		await entry.reject();

		model.dispose();
	});

	async function idleAfterEdit(session: IChatEditingSession, model: ChatModel, uri: URI, edits: TextEdit[]) {
		const isStreaming = waitForState(session.state.map(s => s === ChatEditingSessionState.StreamingEdits), Boolean);

		const chatRequest = model.addRequest({ text: '', parts: [] }, { variables: [] }, 0);
		assertType(chatRequest.response);

		chatRequest.response.updateContent({ kind: 'textEdit', uri, edits, done: true });

		const entry = await waitForState(session.entries.map(value => value.find(a => isEqual(a.modifiedURI, uri))));

		assert.ok(isEqual(entry.modifiedURI, uri));

		chatRequest.response.complete();

		await isStreaming;

		const isIdle = waitForState(session.state.map(s => s === ChatEditingSessionState.Idle), Boolean);
		await isIdle;

		return entry;
	}

	test('mirror typing outside -> accept', async function () {
		assert.ok(editingService);

		const uri = URI.from({ scheme: 'test', path: 'abc\n' });

		const model = store.add(chatService.startSession(ChatAgentLocation.Chat, CancellationToken.None));
		const session = await model.editingSessionObs?.promise;
		assertType(session, 'session not created');

		const entry = await idleAfterEdit(session, model, uri, [{ range: new Range(1, 1, 1, 1), text: 'FarBoo\n' }]);
		const original = store.add(await textModelService.createModelReference(entry.originalURI)).object.textEditorModel;
		const modified = store.add(await textModelService.createModelReference(entry.modifiedURI)).object.textEditorModel;

		assert.strictEqual(entry.state.get(), ModifiedFileEntryState.Modified);

		assert.strictEqual(original.getValue(), 'abc\n'.repeat(10));
		assert.strictEqual(modified.getValue(), 'FarBoo\n' + 'abc\n'.repeat(10));

		modified.pushEditOperations(null, [EditOperation.insert(new Position(3, 1), 'USER_TYPE\n')], () => null);

		assert.ok(modified.getValue().includes('USER_TYPE'));
		assert.ok(original.getValue().includes('USER_TYPE'));

		await entry.accept();
		assert.strictEqual(modified.getValue(), original.getValue());
		assert.strictEqual(entry.state.get(), ModifiedFileEntryState.Accepted);

		assert.ok(modified.getValue().includes('FarBoo'));
		assert.ok(original.getValue().includes('FarBoo'));
	});

	test('mirror typing outside -> reject', async function () {
		assert.ok(editingService);

		const uri = URI.from({ scheme: 'test', path: 'abc\n' });

		const model = store.add(chatService.startSession(ChatAgentLocation.Chat, CancellationToken.None));
		const session = await model.editingSessionObs?.promise;
		assertType(session, 'session not created');

		const entry = await idleAfterEdit(session, model, uri, [{ range: new Range(1, 1, 1, 1), text: 'FarBoo\n' }]);
		const original = store.add(await textModelService.createModelReference(entry.originalURI)).object.textEditorModel;
		const modified = store.add(await textModelService.createModelReference(entry.modifiedURI)).object.textEditorModel;

		assert.strictEqual(entry.state.get(), ModifiedFileEntryState.Modified);

		assert.strictEqual(original.getValue(), 'abc\n'.repeat(10));
		assert.strictEqual(modified.getValue(), 'FarBoo\n' + 'abc\n'.repeat(10));

		modified.pushEditOperations(null, [EditOperation.insert(new Position(3, 1), 'USER_TYPE\n')], () => null);

		assert.ok(modified.getValue().includes('USER_TYPE'));
		assert.ok(original.getValue().includes('USER_TYPE'));

		await entry.reject();
		assert.strictEqual(modified.getValue(), original.getValue());
		assert.strictEqual(entry.state.get(), ModifiedFileEntryState.Rejected);

		assert.ok(!modified.getValue().includes('FarBoo'));
		assert.ok(!original.getValue().includes('FarBoo'));
	});

	test('NO mirror typing inside -> accept', async function () {
		assert.ok(editingService);

		const uri = URI.from({ scheme: 'test', path: 'abc\n' });

		const model = store.add(chatService.startSession(ChatAgentLocation.Chat, CancellationToken.None));
		const session = await model.editingSessionObs?.promise;
		assertType(session, 'session not created');

		const entry = await idleAfterEdit(session, model, uri, [{ range: new Range(1, 1, 1, 1), text: 'FarBoo\n' }]);
		const original = store.add(await textModelService.createModelReference(entry.originalURI)).object.textEditorModel;
		const modified = store.add(await textModelService.createModelReference(entry.modifiedURI)).object.textEditorModel;

		assert.strictEqual(entry.state.get(), ModifiedFileEntryState.Modified);

		assert.strictEqual(original.getValue(), 'abc\n'.repeat(10));
		assert.strictEqual(modified.getValue(), 'FarBoo\n' + 'abc\n'.repeat(10));

		modified.pushEditOperations(null, [EditOperation.replace(new Range(1, 2, 1, 7), 'ooBar')], () => null);

		assert.ok(modified.getValue().includes('FooBar'));
		assert.ok(!original.getValue().includes('FooBar')); // typed in the AI edits, DO NOT transpose

		await entry.accept();
		assert.strictEqual(modified.getValue(), original.getValue());
		assert.strictEqual(entry.state.get(), ModifiedFileEntryState.Accepted);

		assert.ok(modified.getValue().includes('FooBar'));
		assert.ok(original.getValue().includes('FooBar'));
	});

	test('sequential edits - second edit should be based on first edit result', async function () {
		assert.ok(editingService);

		// Create initial file with 3 distinct lines, repeated 10 times
		// Initial content will be: "line1\nline2\nline3\n" repeated 10 times
		const uri = URI.from({ scheme: 'test', path: 'line1\nline2\nline3\n' });

		const model = store.add(chatService.startSession(ChatAgentLocation.Chat, CancellationToken.None));
		const session = await model.editingSessionObs?.promise;
		assertType(session, 'session not created');

		// First edit: Replace the first occurrence of "line2" with "EDITED_LINE2"
		// This is at line 2 in the original file
		const firstEdit = [{ range: new Range(2, 1, 2, 6), text: 'EDITED_LINE2' }];
		const entry1 = await idleAfterEdit(session, model, uri, firstEdit);
		const modified1 = store.add(await textModelService.createModelReference(entry1.modifiedURI)).object.textEditorModel;

		// Verify first edit was applied correctly
		const valueAfterFirst = modified1.getValue();
		assert.ok(valueAfterFirst.includes('EDITED_LINE2'), 'First edit should be applied');
		assert.ok(valueAfterFirst.includes('line1'), 'Original content should still exist');

		// Second edit: Replace the first occurrence of "line3" with "EDITED_LINE3"
		// In the original file this is at line 3, but we need to make sure it's
		// applied correctly even though the file has been modified
		const secondEdit = [{ range: new Range(3, 1, 3, 6), text: 'EDITED_LINE3' }];
		
		// Simulate a second edit operation in the same session
		const chatRequest2 = model.addRequest({ text: '', parts: [] }, { variables: [] }, 0);
		assertType(chatRequest2.response);
		chatRequest2.response.updateContent({ kind: 'textEdit', uri, edits: secondEdit, done: true });
		chatRequest2.response.complete();

		// Wait for the edit to complete
		const isIdle = waitForState(session.state.map(s => s === ChatEditingSessionState.Idle), Boolean);
		await isIdle;

		// After second edit, both edits should be present
		const modified2 = store.add(await textModelService.createModelReference(entry1.modifiedURI)).object.textEditorModel;
		const finalValue = modified2.getValue();

		// Verify both edits are present in the final content
		assert.ok(finalValue.includes('EDITED_LINE2'), 'First edit should still be present after second edit');
		assert.ok(finalValue.includes('EDITED_LINE3'), 'Second edit should be applied correctly');
		
		// Verify the structure is correct: both edits should be applied to adjacent lines
		const lines = finalValue.split('\n');
		assert.strictEqual(lines[1], 'EDITED_LINE2', 'Line 2 should contain first edit');
		assert.strictEqual(lines[2], 'EDITED_LINE3', 'Line 3 should contain second edit');
		assert.strictEqual(lines[0], 'line1', 'Line 1 should remain unchanged');
	});

});
