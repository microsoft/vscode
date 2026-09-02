/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { observableValue, waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActiveCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelContentProvider, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IFilesConfigurationService } from '../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../services/assignment/test/common/nullAssignmentService.js';
import { IWorkspaceEditingService } from '../../../../services/workspaces/common/workspaceEditing.js';
import { nullExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ChatEditingService } from '../../../chat/browser/chatEditing/chatEditingServiceImpl.js';
import { ChatEditingSession } from '../../../chat/browser/chatEditing/chatEditingSession.js';
import { ChatSessionsService } from '../../../chat/browser/chatSessions/chatSessions.contribution.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { ChatService } from '../../../chat/common/chatService/chatServiceImpl.js';
import { ChatAgentLocation, ChatModeKind } from '../../../chat/common/constants.js';
import { IChatEditingService } from '../../../chat/common/editing/chatEditingService.js';
import { ChatModel } from '../../../chat/common/model/chatModel.js';
import { IChatAgentData, IChatAgentImplementation, IChatAgentService, ChatAgentService } from '../../../chat/common/participants/chatAgents.js';
import { IChatSessionsService, ResolvedChatSessionsExtensionPoint, SessionType } from '../../../chat/common/chatSessionsService.js';
import { IChatDebugService } from '../../../chat/common/chatDebugService.js';
import { ChatDebugServiceImpl } from '../../../chat/common/chatDebugServiceImpl.js';
import { IChatSlashCommandService } from '../../../chat/common/participants/chatSlashCommands.js';
import { ChatTransferService, IChatTransferService } from '../../../chat/common/model/chatTransferService.js';
import { IChatVariablesService } from '../../../chat/common/attachments/chatVariables.js';
import { ILanguageModelsService } from '../../../chat/common/languageModels.js';
import { ICustomizationMigrationService } from '../../../chat/common/promptSyntax/service/customizationMigrationService.js';
import { IPromptsService } from '../../../chat/common/promptSyntax/service/promptsService.js';
import { MockChatVariablesService } from '../../../chat/test/common/mockChatVariables.js';
import { NullLanguageModelsService } from '../../../chat/test/common/languageModels.js';
import { MockPromptsService } from '../../../chat/test/common/promptSyntax/service/mockPromptsService.js';
import { IMcpService } from '../../../mcp/common/mcpTypes.js';
import { TestMcpService } from '../../../mcp/test/common/testMcpService.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService } from '../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { NotebookTextModel } from '../../../notebook/common/model/notebookTextModel.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { InlineChatEditReviewSession } from '../../browser/inlineChatEditReviewSession.js';
import { IInlineChatSession } from '../../browser/inlineChatSessionService.js';
import { InlineChatSessionServiceImpl } from '../../browser/inlineChatSessionServiceImpl.js';
import { IInlineChatSessionResolver, IInlineChatSessionResolution } from '../../browser/inlineChatSessionResolver.js';
import { TestWorkerService } from './testWorkerService.js';

const agentHostContribution: ResolvedChatSessionsExtensionPoint = {
	type: SessionType.AgentHostCopilot,
	name: 'Agent Host Copilot',
	displayName: 'Agent Host Copilot',
	description: 'Test contribution',
	icon: undefined,
	locations: [ChatAgentLocation.EditorInline],
};

class TestInlineChatSessionResolver extends mock<IInlineChatSessionResolver>() {
	chatService!: IChatService;
	lockToAgent: ResolvedChatSessionsExtensionPoint | undefined;
	resolveCalls = 0;

	override async resolve(_token: CancellationToken, _languageId: string | undefined, _targetUri: URI): Promise<IInlineChatSessionResolution> {
		this.resolveCalls++;
		return {
			modelRef: this.chatService.startNewLocalSession(ChatAgentLocation.EditorInline, { canUseTools: false }),
			lockToAgent: this.lockToAgent,
		};
	}
}

interface ReadonlyUpdate {
	readonly resource: URI;
	readonly value: true | IMarkdownString | false | 'toggle' | 'reset';
}

class TestFilesConfigurationService extends mock<IFilesConfigurationService>() {
	private readonly _updates = observableValue<readonly ReadonlyUpdate[]>(this, []);
	readonly updates = this._updates;

	override async updateReadonly(resource: URI | URI[], value: true | IMarkdownString | false | 'toggle' | 'reset'): Promise<void> {
		for (const item of Array.isArray(resource) ? resource : [resource]) {
			this._updates.set([...this._updates.get(), { resource: item, value }], undefined);
		}
	}

	async waitForUpdates(count: number): Promise<readonly ReadonlyUpdate[]> {
		return waitForState(this.updates.map(updates => updates.length >= count ? updates : undefined));
	}
}

class TestTextModelService extends mock<ITextModelService>() {
	private readonly _models = new Map<string, ITextModel>();
	private readonly _providers = new Map<string, ITextModelContentProvider>();

	override registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider) {
		this._providers.set(scheme, provider);
		return toDisposable(() => this._providers.delete(scheme));
	}

	add(model: ITextModel): void {
		this._models.set(model.uri.toString(), model);
	}

	override async createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
		let model = this._models.get(resource.toString());
		if (!model) {
			model = await this._providers.get(resource.scheme)?.provideTextContent(resource) ?? undefined;
			if (model) {
				this.add(model);
			}
		}
		assert.ok(model, `Expected a text model for ${resource}`);
		return {
			object: { textEditorModel: model } as IResolvedTextEditorModel,
			dispose: () => { },
		};
	}
}

function getAgentData(): IChatAgentData {
	return {
		name: 'inlineChatTestAgent',
		id: 'inlineChatTestAgent',
		extensionId: nullExtensionDescription.identifier,
		extensionVersion: undefined,
		extensionPublisherId: '',
		publisherDisplayName: '',
		extensionDisplayName: '',
		locations: [ChatAgentLocation.EditorInline],
		modes: [ChatModeKind.Ask],
		metadata: {},
		slashCommands: [],
		disambiguation: [],
	};
}

suite('InlineChatSessionService', () => {
	const store = new DisposableStore();
	let service: InlineChatSessionServiceImpl;
	let chatService: IChatService;
	let modelService: IModelService;
	let resolver: TestInlineChatSessionResolver;
	let filesConfigurationService: TestFilesConfigurationService;
	let textModelService: TestTextModelService;

	setup(() => {
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
		collection.set(ICustomizationMigrationService, new class extends mock<ICustomizationMigrationService>() { });
		collection.set(IPromptsService, new MockPromptsService());
		collection.set(ILanguageModelsService, new SyncDescriptor(NullLanguageModelsService));
		collection.set(IChatDebugService, store.add(new ChatDebugServiceImpl(new TestConfigurationService(), store.add(new MockContextKeyService()))));
		collection.set(IMultiDiffSourceResolverService, new class extends mock<IMultiDiffSourceResolverService>() {
			override registerResolver(_resolver: IMultiDiffSourceResolver) {
				return Disposable.None;
			}
		});
		collection.set(IWorkspaceEditingService, new class extends mock<IWorkspaceEditingService>() {
			override readonly onDidEnterWorkspace = Event.None;
		});
		collection.set(INotebookService, new class extends mock<INotebookService>() {
			override getNotebookTextModel(_uri: URI): NotebookTextModel | undefined {
				return undefined;
			}

			override hasSupportedNotebooks(_resource: URI): boolean {
				return false;
			}
		});

		resolver = new TestInlineChatSessionResolver();
		filesConfigurationService = new TestFilesConfigurationService();
		textModelService = new TestTextModelService();
		collection.set(IInlineChatSessionResolver, resolver);
		collection.set(IFilesConfigurationService, filesConfigurationService);
		collection.set(ITextModelService, textModelService);

		const instantiationService = store.add(store.add(workbenchInstantiationService(undefined, store)).createChild(collection));
		store.add(instantiationService.get(IEditorWorkerService) as TestWorkerService);
		store.add(instantiationService.get(IChatSessionsService) as ChatSessionsService);
		chatService = instantiationService.get(IChatService);
		store.add(chatService as ChatService);
		chatService.setSaveModelsEnabled(false);
		modelService = instantiationService.get(IModelService);
		resolver.chatService = chatService;

		const chatAgentService = instantiationService.get(IChatAgentService);
		const agent: IChatAgentImplementation = {
			async invoke() {
				return {};
			},
		};
		store.add(chatAgentService.registerAgent('inlineChatTestAgent', { ...getAgentData(), isDefault: true }));
		store.add(chatAgentService.registerAgentImplementation('inlineChatTestAgent', agent));

		service = store.add(instantiationService.createInstance(InlineChatSessionServiceImpl));
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses an edit review session and locks to the Agent Host contribution', async () => {
		resolver.lockToAgent = agentHostContribution;

		const session = await service.createSession(createEditor(createModel(URI.from({ scheme: Schemas.file, path: '/test/agent-host.ts' }))), false, CancellationToken.None);

		assert.deepStrictEqual({
			usesEditReviewSession: session.editingSession instanceof InlineChatEditReviewSession,
			usesChatModelEditingSession: session.editingSession === session.chatModel.editingSession,
			locksToContribution: session.lockToAgent === agentHostContribution,
			chatModelEditingSession: session.chatModel.editingSession,
		}, {
			usesEditReviewSession: true,
			usesChatModelEditingSession: false,
			locksToContribution: true,
			chatModelEditingSession: undefined,
		});

		await disposeSession(session);
	});

	test('uses the legacy editing session without Agent Host locking', async () => {
		const session = await service.createSession(createEditor(createModel(URI.from({ scheme: Schemas.file, path: '/test/legacy.ts' }))), false, CancellationToken.None);

		assert.deepStrictEqual({
			usesChatModelEditingSession: session.editingSession === session.chatModel.editingSession,
			lockToAgent: session.lockToAgent,
			readonlyUpdates: filesConfigurationService.updates.get(),
		}, {
			usesChatModelEditingSession: true,
			lockToAgent: undefined,
			readonlyUpdates: [],
		});

		await disposeSession(session);
	});

	test('brackets a completed Agent Host turn with a read-only lock', async () => {
		resolver.lockToAgent = agentHostContribution;
		const uri = URI.from({ scheme: Schemas.file, path: '/test/complete.ts' });
		const session = await service.createSession(createEditor(createModel(uri)), false, CancellationToken.None);
		const request = (session.chatModel as ChatModel).addRequest({ text: '', parts: [] }, { variables: [] }, 0);
		assert.ok(request.response);

		await filesConfigurationService.waitForUpdates(1);
		request.response.complete();
		const updates = await filesConfigurationService.waitForUpdates(2);

		assert.deepStrictEqual(updates.map(update => ({
			resource: update.resource.toString(),
			value: update.value === 'reset' ? 'reset' : typeof update.value === 'object' ? 'markdown' : update.value,
		})), [
			{ resource: uri.toString(), value: 'markdown' },
			{ resource: uri.toString(), value: 'reset' },
		]);

		session.dispose();
	});

	test('releases the read-only lock when an Agent Host turn is cancelled', async () => {
		resolver.lockToAgent = agentHostContribution;
		const session = await service.createSession(createEditor(createModel(URI.from({ scheme: Schemas.file, path: '/test/cancelled.ts' }))), false, CancellationToken.None);
		const request = (session.chatModel as ChatModel).addRequest({ text: '', parts: [] }, { variables: [] }, 0);
		assert.ok(request.response);

		await filesConfigurationService.waitForUpdates(1);
		request.response.cancel();
		const updates = await filesConfigurationService.waitForUpdates(2);

		assert.deepStrictEqual(updates.map(update => update.value === 'reset' ? 'reset' : typeof update.value === 'object' ? 'markdown' : update.value), ['markdown', 'reset']);

		await waitForState(session.editingSession.entries.map(entries => entries.length > 0 ? entries : undefined));
		await disposeSession(session);
	});

	test('releases the read-only lock when the inline chat session is disposed mid-turn', async () => {
		resolver.lockToAgent = agentHostContribution;
		const session = await service.createSession(createEditor(createModel(URI.from({ scheme: Schemas.file, path: '/test/disposed.ts' }))), false, CancellationToken.None);
		const request = (session.chatModel as ChatModel).addRequest({ text: '', parts: [] }, { variables: [] }, 0);
		assert.ok(request.response);

		await filesConfigurationService.waitForUpdates(1);
		session.dispose();
		const updates = await filesConfigurationService.waitForUpdates(2);

		assert.deepStrictEqual(updates.map(update => update.value === 'reset' ? 'reset' : typeof update.value === 'object' ? 'markdown' : update.value), ['markdown', 'reset']);
	});

	test('uses the legacy path without resolving Agent Host for untitled documents', async () => {
		resolver.lockToAgent = agentHostContribution;

		const session = await service.createSession(createEditor(createModel(URI.from({ scheme: Schemas.untitled, path: '/test/untitled.ts' }))), false, CancellationToken.None);

		assert.deepStrictEqual({
			resolveCalls: resolver.resolveCalls,
			usesChatModelEditingSession: session.editingSession === session.chatModel.editingSession,
			readonlyUpdates: filesConfigurationService.updates.get(),
		}, {
			resolveCalls: 0,
			usesChatModelEditingSession: true,
			readonlyUpdates: [],
		});

		await disposeSession(session);
	});

	test('uses the legacy path without resolving Agent Host for notebooks', async () => {
		resolver.lockToAgent = agentHostContribution;

		const session = await service.createSession(createEditor(createModel(URI.from({ scheme: Schemas.file, path: '/test/notebook.ts' }))), true, CancellationToken.None);

		assert.deepStrictEqual({
			resolveCalls: resolver.resolveCalls,
			usesChatModelEditingSession: session.editingSession === session.chatModel.editingSession,
			readonlyUpdates: filesConfigurationService.updates.get(),
		}, {
			resolveCalls: 0,
			usesChatModelEditingSession: true,
			readonlyUpdates: [],
		});

		await disposeSession(session);
	});

	function createModel(uri: URI): ITextModel {
		const model = store.add(modelService.createModel('const value = 1;', null, uri, false));
		textModelService.add(model);
		return model;
	}

	function createEditor(model: ITextModel): IActiveCodeEditor {
		return new class extends mock<IActiveCodeEditor>() {
			override getModel(): ITextModel {
				return model;
			}

			override getSelection(): Selection {
				return new Selection(1, 1, 1, 1);
			}
		}();
	}

	async function disposeSession(session: IInlineChatSession): Promise<void> {
		await session.editingSession.reject();
		if (session.editingSession instanceof ChatEditingSession) {
			await session.editingSession.stop();
		}
		session.dispose();
	}
});
