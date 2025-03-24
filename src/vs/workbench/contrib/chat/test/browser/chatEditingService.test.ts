/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ChatEditingService } from '../../browser/chatEditing/chatEditingServiceImpl.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService } from '../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IChatService } from '../../common/chatService.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ChatService } from '../../common/chatServiceImpl.js';
import { IChatEditingService } from '../../common/chatEditingService.js';
import { assertThrowsAsync, ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatVariablesService } from '../../common/chatVariables.js';
import { MockChatVariablesService } from '../common/mockChatVariables.js';
import { ChatAgentService, IChatAgentImplementation, IChatAgentService } from '../../common/chatAgents.js';
import { IChatSlashCommandService } from '../../common/chatSlashCommands.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../services/assignment/test/common/nullAssignmentService.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { nullExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { URI } from '../../../../../base/common/uri.js';
import { assertType } from '../../../../../base/common/types.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { waitForState } from '../../../../../base/common/observable.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { NotebookTextModel } from '../../../notebook/common/model/notebookTextModel.js';

function getAgentData(id: string) {
	return {
		name: id,
		id: id,
		extensionId: nullExtensionDescription.identifier,
		extensionPublisherId: '',
		publisherDisplayName: '',
		extensionDisplayName: '',
		locations: [ChatAgentLocation.Panel],
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
		collection.set(IChatEditingService, new SyncDescriptor(ChatEditingService));
		collection.set(IChatService, new SyncDescriptor(ChatService));
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
		const value = insta.get(IChatEditingService);
		assert.ok(value instanceof ChatEditingService);
		editingService = value;

		chatService = insta.get(IChatService);

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
				return modelService.createModel(resource.path.repeat(10), null, resource, false);
			},
		}));
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('create session', async function () {
		assert.ok(editingService);

		const model = chatService.startSession(ChatAgentLocation.EditingSession, CancellationToken.None);
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

		const model = chatService.startSession(ChatAgentLocation.EditingSession, CancellationToken.None);
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

		await entry.reject(undefined);

		model.dispose();
	});

});
