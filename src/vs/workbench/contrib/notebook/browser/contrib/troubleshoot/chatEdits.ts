/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../../nls.js';
import { Categories } from '../../../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { CellKind, NotebookData } from '../../../common/notebookCommon.js';
import { INotebookService } from '../../../common/notebookService.js';
import { ChatEditingNotebookFileSystemProvider } from '../chatEdit/chatEditingNotebookFileSystemProvider.js';
import { ChatEditingModifiedNotebookEntry, serializeSnapshot } from '../../../../chat/browser/chatEditing/chatEditingModifiedNotebookEntry.js';
import { IModifiedEntryTelemetryInfo } from '../../../../chat/browser/chatEditing/chatEditingModifiedFileEntry.js';
import { ChatEditKind, IChatEditingService } from '../../../../chat/common/chatEditingService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { IChatService } from '../../../../chat/common/chatService.js';
import { IChatModel, ISerializableChatData } from '../../../../chat/common/chatModel.js';
import { ChatAgentLocation } from '../../../../chat/common/chatAgents.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';

export class TroubleshootController extends DisposableStore {
	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService) {
		super();
	}

	async createServices() {
		const chatService = this.instantiationService.invokeFunction(accessor => accessor.get(IChatService));
		const model = chatService.startSession(ChatAgentLocation.Panel, CancellationToken.None);
		this.add(toDisposable(() => chatService.clearSession(model.sessionId)));
		const chatEditingSessionService = this.instantiationService.invokeFunction(accessor => accessor.get(IChatEditingService));
		const session = await chatEditingSessionService.createEditingSession(model.sessionId);
		session.startStreamingEdits(URI.parse('file:///some/path'), {});
		return model;

	}
	async createModifiedEntry() {
		const insta = this.instantiationService.createChild(new ServiceCollection([IInstantiationService, this.instantiationService]));
		const editorService = insta.invokeFunction(accessor => accessor.get(IEditorService));
		const { modifiedUri: uri, originalSnapshot: initialContent } = await this.createNotebook();
		const telemetryInfo: IModifiedEntryTelemetryInfo = {
			requestId: 'someRequestId',
			sessionId: '',
			agentId: undefined,
			command: undefined,
			result: undefined
		};
		const chatKind = ChatEditKind.Modified;
		const entry = await ChatEditingModifiedNotebookEntry.create(uri, { collapse: (_) => { } }, telemetryInfo, chatKind, initialContent, this.instantiationService);
		this.add(entry);
		const editor = await editorService.openEditor({ resource: uri, options: { pinned: true } });
		if (editor) {
			entry.getEditorIntegration(editor);
		}
		// const entry = this.instantiationService.invokeFunction(async accessor => {
		// 	const notebookService = accessor.get(INotebookService);
		// 	const resolver = accessor.get(INotebookEditorModelResolverService);
		// 	const configurationServie = accessor.get(IConfigurationService);
		// 	const textModelService = accessor.get(ITextModelService);
		// 	const resourceRef: IReference<IResolvedNotebookEditorModel> = await resolver.resolve(uri);
		// 	const notebook = resourceRef.object.notebook;
		// 	const originalUri = ChatEditingNotebookFileSystemProvider.getSnapshotFileURI(telemetryInfo.requestId, notebook.uri.path);
		// 	const [options, buffer] = await Promise.all([
		// 		notebookService.withNotebookDataProvider(resourceRef.object.notebook.notebookType),
		// 		notebookService.createNotebookTextDocumentSnapshot(notebook.uri, SnapshotContext.Backup, CancellationToken.None).then(s => streamToBuffer(s))
		// 	]);
		// 	const disposables = new DisposableStore();
		// 	disposables.add(ChatEditingNotebookFileSystemProvider.registerFile(originalUri, buffer));
		// 	const originalRef = await resolver.resolve(originalUri, notebook.viewType);
		// 	if (initialContent) {
		// 		restoreSnapshot(originalRef.object.notebook, initialContent);
		// 	}
		// 	const modifiedCells = new ResourceMap<ITextModel>();
		// 	const originalCells = new ResourceMap<ITextModel>();
		// 	await Promise.all(resourceRef.object.notebook.cells.map(async cell => {
		// 		modifiedCells.set(cell.uri, disposables.add(await textModelService.createModelReference(cell.uri)).object.textEditorModel);
		// 	}).concat(originalRef.object.notebook.cells.map(async cell => {
		// 		originalCells.set(cell.uri, disposables.add(await textModelService.createModelReference(cell.uri)).object.textEditorModel);
		// 	})));

		// 	const instance = this.instantiationService.createInstance(ChatEditingModifiedNotebookEntry, resourceRef, originalRef, modifiedCells, originalCells, _multiDiffEntryDelegate, options.serializer.options, telemetryInfo, chatKind, initialContent);
		// 	instance._register(disposables);
		// 	return instance;
		// });



	}
	async createNotebook() {
		const originalNotebook: NotebookData = {
			cells: [
				{
					cellKind: CellKind.Code,
					language: 'python',
					mime: undefined,
					outputs: [],
					source: ['import pandas as pd', 'import os', '', '', 'print("Hello World!")'].join('\n'),
				}
			],
			metadata: {}
		};
		const modifiedNotebook: NotebookData = {
			cells: [
				{
					cellKind: CellKind.Code,
					language: 'python',
					mime: undefined,
					outputs: [],
					source: ['import sys', '', '', 'print(sys.executable)'].join('\n'),
				}
			],
			metadata: {}
		};
		const modifiedUri = ChatEditingNotebookFileSystemProvider.getSnapshotFileURI('sample1', '/one/sample.ipynb');
		const notebookService = this.instantiationService.invokeFunction(accessor => accessor.get(INotebookService));
		const info = await notebookService.withNotebookDataProvider('jupyter-notebook');
		const buffer = await info.serializer.notebookToData(modifiedNotebook);
		const originalSnapshot = serializeSnapshot(originalNotebook, info.serializer.options);
		ChatEditingNotebookFileSystemProvider.registerFile(modifiedUri, buffer);
		return { modifiedUri, originalSnapshot };
	}
}

registerAction2(class extends Action2 {
	private controller?: TroubleshootController;
	constructor() {
		super({
			id: 'notebook.testChatEdits',
			title: localize2('workbench.notebook.testChatEdits', "Test Notebook Chat Edits"),
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		this.controller ??= new TroubleshootController(accessor.get(IInstantiationService));
		this.controller.createModifiedEntry();
	}
});
