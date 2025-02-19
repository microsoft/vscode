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
import { ChatAgentLocation, ChatAgentService, IChatAgentImplementation, IChatAgentService } from '../../common/chatAgents.js';
import { IChatSlashCommandService } from '../../common/chatSlashCommands.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../services/assignment/test/common/nullAssignmentService.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { nullExtensionDescription } from '../../../../services/extensions/common/extensions.js';

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
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('create session', async function () {
		assert.ok(editingService);

		const model = chatService.startSession(ChatAgentLocation.EditingSession, CancellationToken.None);
		const session = await editingService.createEditingSession(model.sessionId, true);

		assert.strictEqual(session.chatSessionId, model.sessionId);
		assert.strictEqual(session.isGlobalEditingSession, true);

		await assertThrowsAsync(async () => {
			// DUPE not allowed
			await editingService.createEditingSession(model.sessionId);
		});

		session.dispose();
		model.dispose();
	});

});
