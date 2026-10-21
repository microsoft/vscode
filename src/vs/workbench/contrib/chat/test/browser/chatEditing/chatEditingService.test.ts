/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { match, restore, stub } from 'sinon';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, dispose } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { autorun, IReader, observableValue, waitForState } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { assertType } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { assertThrowsAsync, ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { EditOperation } from '../../../../../../editor/common/core/editOperation.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { TextEdit } from '../../../../../../editor/common/languages.js';
import { IEditorWorkerService } from '../../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { computeStringDiff } from '../../../../../../editor/common/services/editorWebWorker.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { NullCommandService } from '../../../../../../platform/commands/test/common/nullCommandService.js';
import { SyncDescriptor } from '../../../../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { FileOperationError, FileOperationResult } from '../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IWorkbenchAssignmentService } from '../../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../../services/assignment/test/common/nullAssignmentService.js';
import { nullExtensionDescription } from '../../../../../services/extensions/common/extensions.js';
import { TestTextFileService, workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ITextFileService, TextFileEditorModelState } from '../../../../../services/textfile/common/textfiles.js';
import { TextFileEditorModelManager } from '../../../../../services/textfile/common/textFileEditorModelManager.js';
import { IWorkspaceEditingService } from '../../../../../services/workspaces/common/workspaceEditing.js';
import { TestWorkerService } from '../../../../inlineChat/test/browser/testWorkerService.js';
import { IAiEditTelemetryService } from '../../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { IMcpService } from '../../../../mcp/common/mcpTypes.js';
import { TestMcpService } from '../../../../mcp/test/common/testMcpService.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService } from '../../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { NotebookTextModel } from '../../../../notebook/common/model/notebookTextModel.js';
import { INotebookService } from '../../../../notebook/common/notebookService.js';
import { ChatEditingService } from '../../../browser/chatEditing/chatEditingServiceImpl.js';
import { ChatEditingSessionStorage } from '../../../browser/chatEditing/chatEditingSessionStorage.js';
import { ChatEditingSession } from '../../../browser/chatEditing/chatEditingSession.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { ChatSessionsService } from '../../../browser/chatSessions/chatSessions.contribution.js';
import { ChatAgentService, IChatAgentData, IChatAgentImplementation, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatEditingSessionState, IChatEditReviewSession, IChatEditingService, IChatEditingSession, IModifiedFileEntry, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';
import { ChatModel, IChatResponseModel } from '../../../common/model/chatModel.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { ChatService } from '../../../common/chatService/chatServiceImpl.js';
import { ChatOpenDiagnosticsService, IChatOpenDiagnosticsService } from '../../../common/chatOpenDiagnosticsService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { IChatSlashCommandService } from '../../../common/participants/chatSlashCommands.js';
import { ChatTransferService, IChatTransferService } from '../../../common/model/chatTransferService.js';
import { IChatVariablesService } from '../../../common/attachments/chatVariables.js';
import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { ICustomizationMigrationService } from '../../../common/promptSyntax/service/customizationMigrationService.js';
import { ICustomizationMigrationTelemetryService } from '../../../common/promptSyntax/service/customizationMigrationTelemetryService.js';
import { IPromptsService } from '../../../common/promptSyntax/service/promptsService.js';
import { NullLanguageModelsService } from '../../common/languageModels.js';
import { MockChatVariablesService } from '../../common/mockChatVariables.js';
import { MockPromptsService } from '../../common/promptSyntax/service/mockPromptsService.js';
import { IChatDebugService } from '../../../common/chatDebugService.js';
import { ChatDebugServiceImpl } from '../../../common/chatDebugServiceImpl.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';

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
	let instantiationService: IInstantiationService;
	let fileService: FileService;
	let fileProvider: InMemoryFileSystemProvider;
	let textFileService: TestTextFileService;

	setup(function () {
		fileService = store.add(new FileService(new NullLogService()));
		fileProvider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileProvider));
		store.add(fileService.registerProvider(Schemas.vscodeUserData, store.add(new InMemoryFileSystemProvider())));
		const collection = new ServiceCollection();
		collection.set(ICommandService, NullCommandService);
		collection.set(IAiEditTelemetryService, new class extends mock<IAiEditTelemetryService>() {
			override handleCodeAccepted() { }
			override handleCodeRejected() { }
		});
		collection.set(IWorkbenchAssignmentService, new NullWorkbenchAssignmentService());
		collection.set(IChatAgentService, new SyncDescriptor(ChatAgentService));
		collection.set(IChatVariablesService, new MockChatVariablesService());
		collection.set(IChatSlashCommandService, new class extends mock<IChatSlashCommandService>() { });
		collection.set(IChatTransferService, new SyncDescriptor(ChatTransferService));
		collection.set(IChatSessionsService, new SyncDescriptor(ChatSessionsService));
		collection.set(IChatEditingService, new SyncDescriptor(ChatEditingService));
		collection.set(IEditorWorkerService, new SyncDescriptor(class extends TestWorkerService {
			override computeStringEditFromDiff(...args: Parameters<IEditorWorkerService['computeStringEditFromDiff']>) {
				return computeStringDiff(...args);
			}
		}));
		collection.set(IChatService, new SyncDescriptor(ChatService));
		collection.set(IChatOpenDiagnosticsService, new SyncDescriptor(ChatOpenDiagnosticsService));
		collection.set(IMcpService, new TestMcpService());
		collection.set(IPromptsService, new MockPromptsService());
		collection.set(ICustomizationMigrationService, new class extends mock<ICustomizationMigrationService>() { });
		collection.set(ICustomizationMigrationTelemetryService, new class extends mock<ICustomizationMigrationTelemetryService>() { });
		collection.set(ILanguageModelsService, new SyncDescriptor(NullLanguageModelsService));
		const contextKeyService = store.add(new MockContextKeyService());
		collection.set(IChatDebugService, store.add(new ChatDebugServiceImpl(new TestConfigurationService(), contextKeyService)));
		collection.set(IMultiDiffSourceResolverService, new class extends mock<IMultiDiffSourceResolverService>() {
			override registerResolver(_resolver: IMultiDiffSourceResolver): IDisposable {
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
		const insta = store.add(store.add(workbenchInstantiationService({ fileService: () => fileService }, store)).createChild(collection));
		instantiationService = insta;
		textFileService = insta.get(ITextFileService) as TestTextFileService;
		store.add(textFileService.files as TextFileEditorModelManager);
		store.add(insta.get(IEditorWorkerService) as TestWorkerService);
		const value = insta.get(IChatEditingService);
		assert.ok(value instanceof ChatEditingService);
		editingService = value;

		chatService = insta.get(IChatService);

		store.add(insta.get(IChatSessionsService) as ChatSessionsService); // Needs to be disposed in between test runs to clear extensionPoint contribution
		store.add(chatService as ChatService);
		chatService.setSaveModelsEnabled(false);

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

	teardown(async () => {
		restore();
		dispose(textFileService.files.models);
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createReviewSession(entry: IModifiedFileEntry): IChatEditReviewSession {
		return store.add(new class extends Disposable implements IChatEditReviewSession {
			private readonly onDidDisposeEmitter = this._register(new Emitter<void>());

			readonly isGlobalEditingSession = false;
			readonly chatSessionResource = URI.parse('test://review-session');
			readonly onDidDispose = this.onDidDisposeEmitter.event;
			readonly entries = observableValue<readonly IModifiedFileEntry[]>('entries', [entry]);

			override dispose(): void {
				this.onDidDisposeEmitter.fire();
				super.dispose();
			}

			getEntry(uri: URI): IModifiedFileEntry | undefined {
				return isEqual(uri, entry.modifiedURI) ? entry : undefined;
			}

			readEntry(uri: URI, _reader: IReader): IModifiedFileEntry | undefined {
				return this.getEntry(uri);
			}

			async accept(..._uris: URI[]): Promise<void> { }

			async reject(..._uris: URI[]): Promise<void> { }
		});
	}

	function createReviewEntry(uri: URI): IModifiedFileEntry {
		return new class extends mock<IModifiedFileEntry>() {
			override readonly modifiedURI = uri;
			override readonly isCurrentlyBeingModifiedBy = observableValue<{ responseModel: IChatResponseModel; undoStopId: string | undefined } | undefined>('isCurrentlyBeingModifiedBy', undefined);
			override readonly state = observableValue('state', ModifiedFileEntryState.Modified);
		};
	}

	test('create session', async function () {
		assert.ok(editingService);

		const modelRef = chatService.startNewLocalSession(ChatAgentLocation.EditorInline);
		const model = modelRef.object as ChatModel;
		const session = editingService.createEditingSession(model, true);

		assert.strictEqual(session.chatSessionResource.toString(), model.sessionResource.toString());
		assert.strictEqual(session.isGlobalEditingSession, true);

		await assertThrowsAsync(async () => {
			// DUPE not allowed
			editingService.createEditingSession(model);
		});

		session.dispose();
		modelRef.dispose();
	});

	test('register edit review session', () => {
		const entry = createReviewEntry(URI.parse('test://review-entry'));
		const session = createReviewSession(entry);
		const registration = store.add(editingService.registerEditReviewSession(session));

		assert.deepStrictEqual(editingService.editingSessionsObs.get(), [session]);

		registration.dispose();

		assert.deepStrictEqual(editingService.editingSessionsObs.get(), []);
	});

	test('registered edit review session is not returned as an editing session', () => {
		const session = createReviewSession(createReviewEntry(URI.parse('test://review-entry')));
		store.add(editingService.registerEditReviewSession(session));

		assert.strictEqual(editingService.getEditingSession(session.chatSessionResource), undefined);
	});

	test('registered edit review entries are discoverable', () => {
		const entry = createReviewEntry(URI.parse('test://review-entry'));
		store.add(editingService.registerEditReviewSession(createReviewSession(entry)));

		let discoveredEntry: IModifiedFileEntry | undefined;
		store.add(autorun(reader => {
			discoveredEntry = editingService.editingSessionsObs.read(reader)
				.find(session => session.getEntry(entry.modifiedURI))
				?.readEntry(entry.modifiedURI, reader);
		}));

		assert.strictEqual(discoveredEntry, entry);
	});

	test('create session, file entry & isCurrentlyBeingModifiedBy', async function () {
		assert.ok(editingService);

		const uri = URI.from({ scheme: 'test', path: 'HelloWorld' });

		const modelRef = store.add(chatService.startNewLocalSession(ChatAgentLocation.Chat));
		const model = modelRef.object as ChatModel;
		const session = model.editingSession;
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
		assert.ok(entry.isCurrentlyBeingModifiedBy.get()?.responseModel === chatRequest.response);

		const unset = waitForState(entry.isCurrentlyBeingModifiedBy.map(res => res === undefined));

		chatRequest.response.complete();

		await unset;

		await entry.reject();
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

	async function restoreTextEntry(original: string, current: string, workspace: string) {
		const uri = URI.file('/restore.txt');
		await fileService.writeFile(uri, VSBuffer.fromString(workspace));
		const sessionResource = LocalChatSessionUri.forSession('restored-session');
		await instantiationService.createInstance(ChatEditingSessionStorage, sessionResource).storeState({
			initialFileContents: new ResourceMap([[uri, original]]),
			timeline: undefined,
			recentSnapshot: {
				stopId: undefined,
				entries: new ResourceMap([[uri, {
					resource: uri, snapshotUri: URI.parse('test://snapshot'), languageId: 'plaintext',
					original, current, state: ModifiedFileEntryState.Modified,
					telemetryInfo: {
						sessionResource, requestId: 'old-request', agentId: undefined,
						command: undefined, result: undefined, modelId: undefined, modeId: undefined,
						applyCodeBlockSuggestionId: undefined, feature: undefined,
					},
				}]]),
			},
		});
		const session = store.add(instantiationService.createInstance(ChatEditingSession, sessionResource, false, () => undefined, undefined));
		await waitForState(session.state, state => state === ChatEditingSessionState.Idle);
		const entry = session.getEntry(uri);
		assertType(entry);
		const modified = store.add(await textModelService.createModelReference(uri)).object.textEditorModel;
		return { sessionResource, session, entry, modified, uri };
	}

	test('restoring pending text edits preserves newer workspace contents', () => runWithFakedTimers({}, async () => {
		const { entry, modified, uri } = await restoreTextEntry('before\n', 'agent\n', 'newer workspace\n');

		assert.deepStrictEqual({
			model: modified.getValue(),
			disk: (await fileService.readFile(uri)).value.toString(),
			state: entry.state.get(),
		}, {
			model: 'newer workspace\n', disk: 'newer workspace\n', state: ModifiedFileEntryState.Modified,
		});
	}));

	test('rejecting restored text edits preserves nonconflicting outside edits', () => runWithFakedTimers({}, async () => {
		const { session, modified } = await restoreTextEntry('before\nmiddle\nend\n', 'agent\nmiddle\nend\n', 'agent\nmiddle\noutside\n');
		await session.reject();

		assert.strictEqual(modified.getValue(), 'before\nmiddle\noutside\n');
	}));

	test('rejecting restored text edits preserves overlapping outside edits', () => runWithFakedTimers({}, async () => {
		const { session, modified } = await restoreTextEntry('before\nmiddle\nend\n', 'agent\nmiddle\nend\n', 'newer\nmiddle\noutside\n');
		await session.reject();

		assert.strictEqual(modified.getValue(), 'newer\nmiddle\noutside\n');
	}));

	test('restoring pending text edits accounts for workspace changes during diff computation', () => runWithFakedTimers({}, async () => {
		const worker = instantiationService.invokeFunction(accessor => accessor.get(IEditorWorkerService));
		const modelService = instantiationService.invokeFunction(accessor => accessor.get(IModelService));
		let computations = 0;
		stub(worker, 'computeStringEditFromDiff').callsFake(async (...args) => {
			if (++computations === 2) {
				const modified = modelService.getModel(URI.file('/restore.txt'));
				assertType(modified);
				modified.setValue('newer\nmiddle\noutside\n');
			}
			return computeStringDiff(...args);
		});
		const { session, modified } = await restoreTextEntry('before\nmiddle\nend\n', 'agent\nmiddle\nend\n', 'agent\nmiddle\noutside\n');
		await session.reject();

		assert.strictEqual(modified.getValue(), 'newer\nmiddle\noutside\n');
	}));

	test('rejecting restored text edits preserves unsaved workspace changes without saving them', () => runWithFakedTimers({}, async () => {
		const uri = URI.file('/restore.txt');
		await fileService.writeFile(uri, VSBuffer.fromString('on disk\n'));
		const modified = store.add(await textModelService.createModelReference(uri)).object.textEditorModel;
		modified.setValue('newer unsaved workspace\n');
		const { session } = await restoreTextEntry('before\n', 'agent\n', 'on disk\n');
		await session.reject();

		assert.deepStrictEqual({
			model: modified.getValue(), disk: (await fileService.readFile(uri)).value.toString(), dirty: textFileService.isDirty(uri),
		}, {
			model: 'newer unsaved workspace\n', disk: 'on disk\n', dirty: true,
		});
	}));

	test('restored text review survives a persistence round trip without losing outside edits', () => runWithFakedTimers({}, async () => {
		const { sessionResource, session, modified } = await restoreTextEntry('before\nmiddle\nend\n', 'agent\nmiddle\nend\n', 'agent\nmiddle\noutside\n');
		await session.storeState();
		store.delete(session);
		const reopened = store.add(instantiationService.createInstance(ChatEditingSession, sessionResource, false, () => undefined, undefined));
		await waitForState(reopened.state, state => state === ChatEditingSessionState.Idle);
		await reopened.reject();

		assert.strictEqual(modified.getValue(), 'before\nmiddle\noutside\n');
	}));

	test('accepting restored text edits preserves newer workspace contents', () => runWithFakedTimers({}, async () => {
		const { session, entry, modified, uri } = await restoreTextEntry('before\n', 'agent\n', 'newer workspace\n');
		await session.accept();

		assert.deepStrictEqual({
			model: modified.getValue(), disk: (await fileService.readFile(uri)).value.toString(), state: entry.state.get(),
		}, {
			model: 'newer workspace\n', disk: 'newer workspace\n', state: ModifiedFileEntryState.Accepted,
		});
	}));

	test('rejecting unchanged restored text edits still undoes the agent edit', () => runWithFakedTimers({}, async () => {
		const { session, modified } = await restoreTextEntry('before\n', 'agent\n', 'agent\n');
		await session.reject();

		assert.strictEqual(modified.getValue(), 'before\n');
	}));

	test('accepting unchanged restored text edits still saves the agent edit', () => runWithFakedTimers({}, async () => {
		const { session, entry, uri } = await restoreTextEntry('before\n', 'agent\n', 'agent\n');
		await session.accept();

		assert.deepStrictEqual({
			disk: (await fileService.readFile(uri)).value.toString(), state: entry.state.get(),
		}, {
			disk: 'agent\n', state: ModifiedFileEntryState.Accepted,
		});
	}));

	test('accepting text edits surfaces an outside-write save conflict and keeps review pending', () => runWithFakedTimers({}, async () => {
		const { session, entry, modified, uri } = await restoreTextEntry('before\n', 'agent\n', 'agent\n');
		modified.pushEditOperations(null, [EditOperation.insert(new Position(2, 1), 'local\n')], () => null);
		await fileService.writeFile(uri, VSBuffer.fromString('newer outside workspace\n'));
		const outsideStat = await fileProvider.stat(uri);
		stub(fileProvider, 'stat').callThrough().withArgs(match((resource: URI) => isEqual(resource, uri))).resolves({ ...outsideStat, mtime: outsideStat.mtime + 1000 });
		const saveErrors: Error[] = [];
		textFileService.files.saveErrorHandler = { onSaveError: error => { saveErrors.push(error); } };
		await session.accept();

		assert.deepStrictEqual({
			model: modified.getValue(), disk: (await fileService.readFile(uri)).value.toString(),
			state: entry.state.get(), dirty: textFileService.isDirty(uri),
			conflict: textFileService.files.get(uri)?.hasState(TextFileEditorModelState.CONFLICT),
			errors: saveErrors.map(error => error instanceof FileOperationError ? error.fileOperationResult : error.message),
		}, {
			model: 'agent\nlocal\n', disk: 'newer outside workspace\n',
			state: ModifiedFileEntryState.Modified, dirty: true, conflict: true,
			errors: [FileOperationResult.FILE_MODIFIED_SINCE],
		});
	}));

	test('accepting clean text edits still surfaces an outside-write save conflict', () => runWithFakedTimers({}, async () => {
		const { session, entry, modified, uri } = await restoreTextEntry('before\n', 'agent\n', 'agent\n');
		await fileService.writeFile(uri, VSBuffer.fromString('newer outside workspace\n'));
		const outsideStat = await fileProvider.stat(uri);
		stub(fileProvider, 'stat').callThrough().withArgs(match((resource: URI) => isEqual(resource, uri))).resolves({ ...outsideStat, mtime: outsideStat.mtime + 1000 });
		const saveErrors: Error[] = [];
		textFileService.files.saveErrorHandler = { onSaveError: error => { saveErrors.push(error); } };
		await session.accept();

		assert.deepStrictEqual({
			model: modified.getValue(), disk: (await fileService.readFile(uri)).value.toString(),
			state: entry.state.get(), dirty: textFileService.isDirty(uri),
			conflict: textFileService.files.get(uri)?.hasState(TextFileEditorModelState.CONFLICT),
			errors: saveErrors.map(error => error instanceof FileOperationError ? error.fileOperationResult : error.message),
		}, {
			model: 'agent\n', disk: 'newer outside workspace\n',
			state: ModifiedFileEntryState.Modified, dirty: true, conflict: true,
			errors: [FileOperationResult.FILE_MODIFIED_SINCE],
		});
	}));

	test('accepting text edits keeps review pending after a handled save failure', () => runWithFakedTimers({}, async () => {
		const { session, entry, modified, uri } = await restoreTextEntry('before\n', 'agent\n', 'agent\n');
		modified.pushEditOperations(null, [EditOperation.insert(new Position(2, 1), 'local\n')], () => null);
		textFileService.setWriteErrorOnce(new FileOperationError('write denied', FileOperationResult.FILE_PERMISSION_DENIED));
		const saveErrors: Error[] = [];
		textFileService.files.saveErrorHandler = { onSaveError: error => { saveErrors.push(error); } };
		await session.accept();
		const original = store.add(await textModelService.createModelReference(entry.originalURI)).object.textEditorModel;

		assert.deepStrictEqual({
			model: modified.getValue(), original: original.getValue(), disk: (await fileService.readFile(uri)).value.toString(),
			state: entry.state.get(), dirty: textFileService.isDirty(uri), errors: saveErrors.map(error => error.message),
		}, {
			model: 'agent\nlocal\n', original: 'before\nlocal\n', disk: 'agent\n',
			state: ModifiedFileEntryState.Modified, dirty: true, errors: ['write denied'],
		});
	}));

	test('accepting text edits can be retried after a handled save failure', () => runWithFakedTimers({}, async () => {
		const { session, entry, modified, uri } = await restoreTextEntry('before\n', 'agent\n', 'agent\n');
		modified.pushEditOperations(null, [EditOperation.insert(new Position(2, 1), 'local\n')], () => null);
		textFileService.setWriteErrorOnce(new FileOperationError('write denied', FileOperationResult.FILE_PERMISSION_DENIED));
		textFileService.files.saveErrorHandler = { onSaveError: () => { } };
		await session.accept();
		await session.accept();
		const original = store.add(await textModelService.createModelReference(entry.originalURI)).object.textEditorModel;

		assert.deepStrictEqual({
			model: modified.getValue(), original: original.getValue(), disk: (await fileService.readFile(uri)).value.toString(),
			state: entry.state.get(), dirty: textFileService.isDirty(uri),
		}, {
			model: 'agent\nlocal\n', original: 'agent\nlocal\n', disk: 'agent\nlocal\n',
			state: ModifiedFileEntryState.Accepted, dirty: false,
		});
	}));

	test('queued edits retain their originating request and tier snapshots', async () => {
		await runWithFakedTimers({}, async () => {
			const uri = URI.from({ scheme: 'test', path: 'auto-tier' });
			const modelRef = store.add(chatService.startNewLocalSession(ChatAgentLocation.Chat));
			const model = modelRef.object as ChatModel;
			const session = model.editingSession;
			assertType(session);
			const textModel = store.add(await textModelService.createModelReference(uri)).object.textEditorModel;
			const sources: { source: string; modelId: string | undefined; requestId: string | undefined; autoTier: string | undefined }[] = [];
			store.add(textModel.onDidChangeContent(event => {
				for (const source of event.detailedReasons) {
					if (source.metadata.source === 'Chat.applyEdits') {
						sources.push({ source: source.metadata.source, modelId: source.props.$modelId, requestId: source.props.$$requestId, autoTier: source.props.$autoTier });
					}
				}
			}));
			const request = model.addRequest(
				{ text: 'edit', parts: [] }, { variables: [] }, 0, undefined, undefined, undefined, undefined,
				undefined, undefined, undefined, 'copilot/auto',
			);
			const streaming = waitForState(session.state.map(state => state === ChatEditingSessionState.StreamingEdits), Boolean);
			for (const autoTier of ['efficiency', 'fast', undefined, 'intelligence', undefined] as const) {
				model.acceptResponseProgress(request, { kind: 'textEdit', uri, edits: [{ range: new Range(1, 1, 1, 1), text: 'edit\n' }], done: false, autoTier });
			}
			request.response!.complete();
			const later = model.addRequest({ text: 'later', parts: [] }, { variables: [] }, 0, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'copilot/another-model');
			later.response!.complete();

			await streaming;
			await waitForState(session.state.map(state => state === ChatEditingSessionState.Idle), Boolean);

			assert.deepStrictEqual(sources, ['efficiency', 'fast', undefined, 'intelligence', undefined].map(autoTier => ({
				source: 'Chat.applyEdits',
				modelId: 'copilot|auto',
				requestId: request.id,
				autoTier,
			})));
		});
	});

	test('mirror typing outside -> accept', async function () {
		return runWithFakedTimers({}, async () => {
			assert.ok(editingService);

			const uri = URI.from({ scheme: 'test', path: 'abc\n' });

			const modelRef = store.add(chatService.startNewLocalSession(ChatAgentLocation.Chat));
			const model = modelRef.object as ChatModel;
			const session = model.editingSession;
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
	});

	test('mirror typing outside -> reject', async function () {
		return runWithFakedTimers({}, async () => {
			assert.ok(editingService);

			const uri = URI.from({ scheme: 'test', path: 'abc\n' });

			const modelRef = store.add(chatService.startNewLocalSession(ChatAgentLocation.Chat));
			const model = modelRef.object as ChatModel;
			const session = model.editingSession;
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
	});

	test('NO mirror typing inside -> accept', async function () {
		return runWithFakedTimers({}, async () => {
			assert.ok(editingService);

			const uri = URI.from({ scheme: 'test', path: 'abc\n' });

			const modelRef = store.add(chatService.startNewLocalSession(ChatAgentLocation.Chat));
			const model = modelRef.object as ChatModel;
			const session = model.editingSession;
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
	});

	test('ChatEditingService merges text edits it shouldn\'t merge, #272679', async function () {
		return runWithFakedTimers({}, async () => {
			assert.ok(editingService);

			const uri = URI.from({ scheme: 'test', path: 'abc' });

			const modified = store.add(await textModelService.createModelReference(uri)).object.textEditorModel;

			const modelRef = store.add(chatService.startNewLocalSession(ChatAgentLocation.Chat));
			const model = modelRef.object as ChatModel;
			const session = model.editingSession;
			assertType(session, 'session not created');

			modified.setValue('');
			await idleAfterEdit(session, model, uri, [{ range: new Range(1, 1, 1, 1), text: 'a' }, { range: new Range(1, 1, 1, 1), text: 'b' }]);
			assert.strictEqual(modified.getValue(), 'ab');

			modified.setValue('');
			await idleAfterEdit(session, model, uri, [{ range: new Range(1, 1, 1, 1), text: 'a' }]);
			await idleAfterEdit(session, model, uri, [{ range: new Range(1, 1, 1, 1), text: 'b' }]);
			assert.strictEqual(modified.getValue(), 'ba');
		});
	});

});
