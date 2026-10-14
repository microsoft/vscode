/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { IReference, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { constObservable, observableValue, waitForState } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { CodeEditorWidget } from '../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { EditSources } from '../../../../../../editor/common/textModelEditSource.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileDeleteOptions, IFileService } from '../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IMenuService, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../../platform/actions/common/menuService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestCommandService } from '../../../../../../editor/test/browser/editorTestServices.js';
import { IEditorOptions } from '../../../../../../platform/editor/common/editor.js';
import { IUserInteractionService } from '../../../../../../platform/userInteraction/browser/userInteractionService.js';
import { UserInteractionService } from '../../../../../../platform/userInteraction/browser/userInteractionServiceImpl.js';
import { ITextFileContent, ITextFileService } from '../../../../../services/textfile/common/textfiles.js';
import { ACTIVE_GROUP, IEditorService, isPreferredGroup, PreferredGroup, SIDE_GROUP } from '../../../../../services/editor/common/editorService.js';
import { IUntypedEditorInput, IVisibleEditorPane } from '../../../../../common/editor.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { TestWorkerService } from '../../../../inlineChat/test/browser/testWorkerService.js';
import { INotebookService } from '../../../../notebook/common/notebookService.js';
import { AgentHostEditorReviewService, AgentHostEditorReviewSession } from '../../../browser/agentSessions/agentHost/agentHostEditorReview.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { AcceptHunkAction, RejectAction, RejectHunkAction } from '../../../browser/chatEditing/chatEditingEditorActions.js';
import { ctxHasEditorModification } from '../../../browser/chatEditing/chatEditingEditorContextKeys.js';
import { IChatEditingExplanationModelManager } from '../../../browser/chatEditing/chatEditingExplanationModelManager.js';
import { ChatEditingTextModelChangeService } from '../../../browser/chatEditing/chatEditingTextModelChangeService.js';
import { ChatEditingTextModelContentProvider } from '../../../browser/chatEditing/chatEditingTextModelContentProviders.js';
import { emptySessionEntryDiff, IChatEditReviewSession, IChatEditingService, IEditSessionEntryDiff, IModifiedFileEntry, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';
import { IChatModel } from '../../../common/model/chatModel.js';

suite('AgentHostEditorReview', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createReview(before: string, after: string, created = false) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const modelService = instantiationService.get(IModelService);
		instantiationService.stub(IEditorWorkerService, store.add(instantiationService.createInstance(TestWorkerService)));
		const resource = URI.file('/repo/review.ts');
		const original = URI.parse('test-snapshot:/before/review.ts');
		const snapshot = URI.parse('test-snapshot:/after/review.ts');
		const contents = new ResourceMap<string>([[resource, after], [original, before], [snapshot, after]]);
		const model = store.add(modelService.createModel(after, null, resource, false));
		const models = new ResourceMap<ITextModel>([[resource, model]]);
		const activeRequest = observableValue('activeRequest', false);
		let dirty = false;
		const saves: URI[] = [];
		const deletions: URI[] = [];
		const deleteOptions: (Partial<IFileDeleteOptions> | undefined)[] = [];
		const warnings: string[] = [];
		const sessions = observableValue<readonly IChatEditReviewSession[]>('reviewSessions', []);
		instantiationService.stub(IChatEditingService, {
			editingSessionsObs: sessions,
			registerEditReviewSession: session => {
				sessions.set([...sessions.get(), session], undefined);
				return { dispose: () => sessions.set(sessions.get().filter(value => value !== session), undefined) };
			},
		});
		instantiationService.stub(INotebookService, { hasSupportedNotebooks: () => false });
		instantiationService.stub(INotificationService, {
			warn: message => warnings.push(String(message)),
			error: error => { throw error; },
		});
		instantiationService.stub(ITextModelService, {
			createModelReference: async (uri: URI): Promise<IReference<IResolvedTextEditorModel>> => {
				const textModel = models.get(uri) ?? modelService.getModel(uri);
				assert.ok(textModel);
				return {
					object: upcastPartial<IResolvedTextEditorModel>({ textEditorModel: textModel, isReadonly: () => false }),
					dispose: () => { },
				};
			},
		});
		instantiationService.stub(ITextFileService, {
			read: async uri => {
				const value = contents.get(uri);
				assert.notStrictEqual(value, undefined, `Missing content for ${uri}`);
				return upcastPartial<ITextFileContent>({ value: value! });
			},
			isDirty: () => dirty,
			save: async uri => {
				saves.push(uri);
				contents.set(uri, model.getValue());
				dirty = false;
				return uri;
			},
		});
		instantiationService.stub(IFileService, {
			hasCapability: () => true,
			del: async (uri, options) => {
				deletions.push(uri);
				deleteOptions.push(options);
				contents.delete(uri);
			},
		});
		const chatModel = new class extends mock<IChatModel>() {
			override readonly sessionResource = URI.parse('vendor-session:/opaque/session');
			override readonly lastRequestObs = constObservable(undefined);
			override readonly hasActiveRequest = activeRequest;
			override readonly requestInProgress = activeRequest;
			override readonly onDidDispose = Event.None;
			override get lastRequest() { return undefined; }
		}();
		const session = store.add(instantiationService.createInstance(AgentHostEditorReviewSession, chatModel));
		const diff: IEditSessionEntryDiff = {
			...emptySessionEntryDiff(original, resource),
			modifiedSnapshotURI: snapshot,
			isCreated: created,
		};
		const settle = async () => {
			await session.whenReady();
			await session.getEntry(resource)?.getDiffInfo();
		};
		const load = async (changes = [diff]) => {
			session.setChanges(changes);
			await settle();
		};
		return {
			session, model, resource, original, snapshot, contents, saves, deletions, deleteOptions, warnings, activeRequest, sessions, diff, load, settle, instantiationService, chatModel,
			async reload(value: string, nextSnapshot = 'test-snapshot:/next/review.ts') {
				const uri = URI.parse(nextSnapshot);
				contents.set(resource, value);
				contents.set(uri, value);
				modelService.updateModel(model, value, EditSources.reloadFromDisk());
				dirty = false;
				await load([{ ...diff, modifiedSnapshotURI: uri }]);
			},
			async userEdit(range: Range, value: string) {
				model.pushEditOperations(null, [{ range, text: value }], () => null);
				dirty = true;
				await settle();
			},
		};
	}

	test('registers a real live model with review hunks without replaying the snapshot', async () => {
		const review = createReview('const value = 1;\n', 'const value = 2;\n');
		const version = review.model.getVersionId();
		await review.load();
		const entry = review.session.getEntry(review.resource)!;
		assert.deepStrictEqual({
			registered: review.sessions.get().includes(review.session),
			sameModel: entry.modifiedModel === review.model,
			original: entry.originalModel.getValue(),
			content: entry.modifiedModel.getValue(),
			hunks: entry.changesCount.get(),
			unchangedVersion: version === review.model.getVersionId(),
			saves: review.saves.length,
			warnings: review.warnings,
		}, {
			registered: true, sameModel: true, original: 'const value = 1;\n', content: 'const value = 2;\n',
			hunks: 1, unchangedVersion: true, saves: 0, warnings: [],
		});
	});

	test('keeps a file without writing it and reviews later live updates against the kept baseline', async () => {
		const review = createReview('const value = 1;\n', 'const value = 2;\n');
		await review.load();
		const entry = review.session.getEntry(review.resource)!;
		await entry.accept();
		const kept = { state: entry.state.get(), hunks: entry.changesCount.get(), saves: review.saves.length };
		await review.reload('const value = 3;\n');
		assert.deepStrictEqual({
			kept,
			sameEntry: review.session.getEntry(review.resource) === entry,
			baseline: entry.originalModel.getValue(),
			live: entry.modifiedModel.getValue(),
			state: entry.state.get(),
			hunks: entry.changesCount.get(),
		}, {
			kept: { state: ModifiedFileEntryState.Accepted, hunks: 0, saves: 0 },
			sameEntry: true, baseline: 'const value = 2;\n', live: 'const value = 3;\n',
			state: ModifiedFileEntryState.Modified, hunks: 1,
		});
	});

	test('undoes only one hunk in the live file and saves the result', async () => {
		const before = ['first', ...Array.from({ length: 10 }, (_, index) => `middle${index}`), 'last', ''].join('\n');
		const after = before.replace('first', 'FIRST').replace('last', 'LAST');
		const review = createReview(before, after);
		await review.load();
		const entry = review.session.getEntry(review.resource)!;
		const diff = entry.diffInfo.get();
		assert.strictEqual(diff.changes.length, 2);
		await diff.undo(diff.changes[0]);
		assert.deepStrictEqual({
			editor: review.model.getValue(),
			disk: review.contents.get(review.resource),
			hunks: entry.changesCount.get(),
			saves: review.saves.length,
		}, { editor: before.replace('last', 'LAST'), disk: before.replace('last', 'LAST'), hunks: 1, saves: 1 });
	});

	test('keeps a hunk and only undoes the remaining changes', async () => {
		const before = ['first', ...Array.from({ length: 10 }, (_, index) => `middle${index}`), 'last', ''].join('\n');
		const review = createReview(before, before.replace('first', 'FIRST').replace('last', 'LAST'));
		await review.load();
		const entry = review.session.getEntry(review.resource)!;
		const diff = entry.diffInfo.get();
		await diff.keep(diff.changes[0]);
		await entry.reject();
		assert.deepStrictEqual({ editor: review.model.getValue(), disk: review.contents.get(review.resource) }, {
			editor: before.replace('first', 'FIRST'), disk: before.replace('first', 'FIRST'),
		});
	});

	test('preserves nonoverlapping unsaved user edits when undoing an agent hunk', async () => {
		const before = ['user', ...Array.from({ length: 10 }, (_, index) => `middle${index}`), 'agent', ''].join('\n');
		const review = createReview(before, before.replace('agent', 'AGENT'));
		await review.load();
		await review.userEdit(new Range(1, 1, 1, 5), 'USER');
		const entry = review.session.getEntry(review.resource)!;
		const diff = entry.diffInfo.get();
		await diff.undo(diff.changes[0]);
		assert.deepStrictEqual({ editor: review.model.getValue(), saves: review.saves.length }, { editor: before.replace('user', 'USER'), saves: 0 });
	});

	test('refuses undo of overlapping user edits without changing either file version', async () => {
		const review = createReview('const value = 1;\n', 'const value = 2;\n');
		await review.load();
		await review.userEdit(new Range(1, 15, 1, 16), '3');
		const content = review.model.getValue();
		await assert.rejects(() => review.session.reject(), /overlap the agent changes/);
		assert.deepStrictEqual({ editor: review.model.getValue(), disk: review.contents.get(review.resource), saves: review.saves.length }, {
			editor: content, disk: 'const value = 2;\n', saves: 0,
		});
	});

	test('refuses stale hunk objects after live edits have changed the comparison', async () => {
		const review = createReview('const value = 1;\n', 'const value = 2;\n');
		await review.load();
		const diff = review.session.getEntry(review.resource)!.diffInfo.get();
		await review.reload('const value = 3;\n');
		await assert.rejects(() => diff.undo(diff.changes[0]), /has been updated/);
		assert.strictEqual(review.model.getValue(), 'const value = 3;\n');
	});

	test('blocks review actions while the agent is active', async () => {
		const review = createReview('before\n', 'after\n');
		await review.load();
		review.activeRequest.set(true, undefined);
		await assert.rejects(() => review.session.accept(), /Wait for the agent/);
		await assert.rejects(() => review.session.reject(), /Wait for the agent/);
		assert.strictEqual(review.model.getValue(), 'after\n');
	});

	test('refuses undo if disk changed before the live editor reloads', async () => {
		const review = createReview('before\n', 'after\n');
		await review.load();
		review.contents.set(review.resource, 'another writer\n');
		await assert.rejects(() => review.session.reject(), /file changed while preparing Undo/);
		assert.deepStrictEqual({ editor: review.model.getValue(), disk: review.contents.get(review.resource) }, { editor: 'after\n', disk: 'another writer\n' });
	});

	test('does not attach when the live file differs from the recorded snapshot', async () => {
		const review = createReview('before\n', 'after\n');
		review.model.setValue('my unsaved changes\n');
		await review.load();
		assert.deepStrictEqual({ entries: review.session.entries.get().length, warnings: review.warnings.length, editor: review.model.getValue() }, { entries: 0, warnings: 1, editor: 'my unsaved changes\n' });
	});

	test('keeps unsupported structural edits in the existing diff-only flow', async () => {
		const review = createReview('before\n', 'after\n');
		await review.load([{ ...review.diff, isDeleted: true }]);
		const deletedCount = review.session.entries.get().length;
		await review.load([{ ...review.diff, isRenamed: true }]);
		assert.deepStrictEqual({ deletedCount, renamedCount: review.session.entries.get().length, writes: review.saves.length, deletes: review.deletions.length }, { deletedCount: 0, renamedCount: 0, writes: 0, deletes: 0 });
	});

	test('keeps remote files in the diff-only flow until versioned remote writes are supported', async () => {
		const review = createReview('before\n', 'after\n');
		await review.load([{ ...review.diff, modifiedURI: URI.parse('vscode-agent-host://remote/review.ts') }]);
		assert.deepStrictEqual({ entries: review.session.entries.get().length, writes: review.saves.length, warnings: review.warnings }, { entries: 0, writes: 0, warnings: [] });
	});

	test('rejecting an untouched created file removes it instead of leaving an empty file', async () => {
		const review = createReview('', 'new file\n', true);
		await review.load();
		await review.session.reject();
		assert.deepStrictEqual({ deleted: review.deletions.map(uri => uri.path), options: review.deleteOptions, disk: review.contents.get(review.resource) }, { deleted: ['/repo/review.ts'], options: [{ useTrash: true }], disk: undefined });
	});

	test('does not delete a kept new file when later agent changes are undone', async () => {
		const review = createReview('', 'kept file\n', true);
		await review.load();
		await review.session.accept();
		await review.reload('later edits\n');
		await review.session.reject();
		assert.deepStrictEqual({ content: review.model.getValue(), disk: review.contents.get(review.resource), deleted: review.deletions.length }, {
			content: 'kept file\n', disk: 'kept file\n', deleted: 0,
		});
	});

	test('deduplicates unavailable-file warnings and retries on explicit activation', async () => {
		const review = createReview('before\n', 'after\n');
		review.model.setValue('user content\n');
		await review.load();
		await review.load();
		const warningCount = review.warnings.length;
		review.model.setValue('after\n');
		const entry = await review.session.prepareFile(review.resource);
		assert.deepStrictEqual({ warningCount, hasEntry: !!entry, content: review.model.getValue(), saves: review.saves.length }, {
			warningCount: 1, hasEntry: true, content: 'after\n', saves: 0,
		});
	});

	test('allows only one session to attach while snapshot reads resolve concurrently', async () => {
		const review = createReview('before\n', 'after\n');
		const otherModel = new class extends mock<IChatModel>() {
			override readonly sessionResource = URI.parse('vendor-session:/another');
			override readonly lastRequestObs = constObservable(undefined);
			override readonly hasActiveRequest = constObservable(false);
			override get lastRequest() { return undefined; }
		}();
		const other = store.add(review.instantiationService.createInstance(AgentHostEditorReviewSession, otherModel));
		review.session.setChanges([review.diff]);
		other.setChanges([review.diff]);
		await Promise.all([review.session.whenReady(), other.whenReady()]);
		assert.deepStrictEqual({ entries: review.session.entries.get().length + other.entries.get().length, warnings: review.warnings.length }, { entries: 1, warnings: 1 });
	});

	test('blocks mutation when another review later takes ownership of the file', async () => {
		const review = createReview('before\n', 'after\n');
		await review.load();
		review.sessions.set([...review.sessions.get(), upcastPartial<IChatEditReviewSession>({
			getEntry: () => upcastPartial<IModifiedFileEntry>({ modifiedURI: review.resource }),
		})], undefined);
		await assert.rejects(() => review.session.reject(), /Another chat session/);
		assert.strictEqual(review.model.getValue(), 'after\n');
	});

	test('preserves the Local harness hunk-undo user-edit bookkeeping', async () => {
		const review = createReview('before\n', 'after\n');
		const original = store.add(review.instantiationService.get(IModelService).createModel('before\n', null, URI.parse('local-before:/file'), false));
		const changes = store.add(review.instantiationService.createInstance(ChatEditingTextModelChangeService, original, review.model, constObservable(ModifiedFileEntryState.Modified), undefined));
		let userEdits = 0;
		store.add(changes.onDidUserEditModel(() => { userEdits++; }));
		await waitForState(changes.diffInfo, diff => diff.changes.length > 0);
		const diff = changes.diffInfo.get();
		await diff.undo(diff.changes[0]);
		assert.deepStrictEqual({ content: review.model.getValue(), allEditsAreFromUs: changes.allEditsAreFromUs, userEdits }, {
			content: 'before\n', allEditsAreFromUs: false, userEdits: 1,
		});
	});

	test('reuses entries across equal URI instances and releases review models on dispose', async () => {
		const review = createReview('before\n', 'after\n');
		await review.load();
		const entry = review.session.getEntry(review.resource)!;
		await review.load([{ ...review.diff, modifiedURI: URI.parse(review.resource.toString()) }]);
		const sameEntry = review.session.getEntry(review.resource) === entry;
		review.session.dispose();
		assert.deepStrictEqual({ sameEntry, released: entry.originalModel.isDisposed(), sessions: review.sessions.get().length, liveModelAlive: !review.model.isDisposed() }, {
			sameEntry: true, released: true, sessions: 0, liveModelAlive: true,
		});
	});

	test('routes working-set activation to the real editor and releases review when disabled', async () => {
		const review = createReview('before\n', 'after\n');
		review.session.dispose();
		const config = new TestConfigurationService({ [ChatConfiguration.EditorAgentHostReviewEnabled]: true });
		store.add(config.onDidChangeConfigurationEmitter);
		const disposed = store.add(new Emitter<{ sessionResources: URI[]; reason: 'disposed' }>());
		const opened: { input: EditorInput | IUntypedEditorInput; group?: PreferredGroup }[] = [];
		review.instantiationService.stub(IConfigurationService, config);
		review.instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow: false });
		review.instantiationService.stub(IChatService, { onDidDisposeSession: disposed.event });
		review.instantiationService.stub(IEditorService, {
			openEditor: async (input: EditorInput | IUntypedEditorInput, optionsOrGroup?: IEditorOptions | PreferredGroup) => {
				opened.push({ input, group: isPreferredGroup(optionsOrGroup) ? optionsOrGroup : undefined });
				return undefined;
			},
		});
		const service = store.add(review.instantiationService.createInstance(AgentHostEditorReviewService));
		service.trackSession(review.chatModel, [review.diff]);
		const handled = await service.openFile(review.chatModel.sessionResource, review.resource, { preserveFocus: true, pinned: true }, SIDE_GROUP);
		const registered = review.sessions.get().length;
		await config.setUserConfiguration(ChatConfiguration.EditorAgentHostReviewEnabled, false);
		config.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: () => true }));
		const afterDisable = await service.openFile(review.chatModel.sessionResource, review.resource, {}, ACTIVE_GROUP);
		assert.deepStrictEqual({ handled, opened, registered, afterDisable, remaining: review.sessions.get().length }, {
			handled: true,
			opened: [{ input: { resource: review.resource, options: { preserveFocus: true, pinned: true } }, group: SIDE_GROUP }],
			registered: 1, afterDisable: false, remaining: 0,
		});
	});

	test('does not create editor review state in the Agents window', () => {
		const review = createReview('before\n', 'after\n');
		review.session.dispose();
		const config = new TestConfigurationService({ [ChatConfiguration.EditorAgentHostReviewEnabled]: true });
		store.add(config.onDidChangeConfigurationEmitter);
		review.instantiationService.stub(IConfigurationService, config);
		review.instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow: true });
		review.instantiationService.stub(IChatService, { onDidDisposeSession: Event.None });
		const service = store.add(review.instantiationService.createInstance(AgentHostEditorReviewService));
		service.trackSession(review.chatModel, [review.diff]);
		assert.strictEqual(review.sessions.get().length, 0);
	});

	test('receives real file-service reloads in the open model and persists granular Undo', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		const provider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, provider));
		const instantiationService = workbenchInstantiationService({ fileService: () => fileService }, store);
		instantiationService.stub(IEditorWorkerService, store.add(instantiationService.createInstance(TestWorkerService)));
		const sessions = observableValue<readonly IChatEditReviewSession[]>('sessions', []);
		instantiationService.stub(IChatEditingService, {
			editingSessionsObs: sessions,
			registerEditReviewSession: session => {
				sessions.set([...sessions.get(), session], undefined);
				return toDisposable(() => sessions.set(sessions.get().filter(value => value !== session), undefined));
			},
		});
		instantiationService.stub(INotebookService, { hasSupportedNotebooks: () => false });
		const warnings: string[] = [];
		instantiationService.stub(INotificationService, { warn: message => warnings.push(String(message)), error: error => { throw error; } });
		const modelService = instantiationService.get(IModelService);
		store.add(instantiationService.get(ITextModelService).registerTextModelContentProvider(ChatEditingTextModelContentProvider.scheme, {
			provideTextContent: async uri => modelService.getModel(uri),
		}));
		const resource = URI.file('/review.txt');
		const original = URI.file('/before.txt');
		const snapshot = URI.file('/after.txt');
		const nextSnapshot = URI.file('/after-next.txt');
		await fileService.writeFile(resource, VSBuffer.fromString('value = 20;\n'));
		await fileService.writeFile(original, VSBuffer.fromString('value = 1;\n'));
		await fileService.writeFile(snapshot, VSBuffer.fromString('value = 20;\n'));
		const chatModel = new class extends mock<IChatModel>() {
			override readonly sessionResource = URI.parse('vendor-session:/live-file');
			override readonly lastRequestObs = constObservable(undefined);
			override readonly hasActiveRequest = constObservable(false);
			override get lastRequest() { return undefined; }
		}();
		const session = store.add(instantiationService.createInstance(AgentHostEditorReviewSession, chatModel));
		session.setChanges([{ ...emptySessionEntryDiff(original, resource), modifiedSnapshotURI: snapshot }]);
		await session.whenReady();
		const entry = session.getEntry(resource);
		assert.ok(entry, warnings.join('\n'));
		const fileModel = instantiationService.get(ITextFileService).files.get(resource);
		assert.ok(fileModel);
		store.add(fileModel);
		await entry.accept();
		const reloaded = new DeferredPromise<void>();
		store.add(entry.modifiedModel.onDidChangeContent(() => {
			if (entry.modifiedModel.getValue() === 'value = 300;\n') {
				reloaded.complete();
			}
		}));
		await fileService.writeFile(resource, VSBuffer.fromString('value = 300;\n'));
		await reloaded.p;
		await fileService.writeFile(nextSnapshot, VSBuffer.fromString('value = 300;\n'));
		session.setChanges([{ ...emptySessionEntryDiff(original, resource), modifiedSnapshotURI: nextSnapshot }]);
		await session.whenReady();
		await entry.getDiffInfo();
		const sameModel = instantiationService.get(ITextFileService).files.get(resource)?.textEditorModel === entry.modifiedModel;
		const diff = entry.diffInfo.get();
		await diff.undo(diff.changes[0]);
		assert.deepStrictEqual({
			sameModel, editor: entry.modifiedModel.getValue(), disk: (await fileService.readFile(resource)).value.toString(),
			dirty: instantiationService.get(ITextFileService).isDirty(resource), warnings,
		}, { sameModel: true, editor: 'value = 20;\n', disk: 'value = 20;\n', dirty: false, warnings: [] });
	});

	test('renders the existing hunk widgets in a normal editor and executes its Keep and Undo commands', async () => {
		const before = ['first', ...Array.from({ length: 10 }, (_, index) => `middle${index}`), 'last', ''].join('\n');
		const review = createReview(before, before.replace('first', 'FIRST').replace('last', 'LAST'));
		await review.load();
		const instantiationService = review.instantiationService;
		instantiationService.stub(IUserInteractionService, new UserInteractionService());
		instantiationService.stub(IContextKeyService, store.add(instantiationService.createInstance(ContextKeyService)));
		instantiationService.stub(ICommandService, new TestCommandService(instantiationService));
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		instantiationService.stub(IChatEditingExplanationModelManager, { state: constObservable(new ResourceMap()) });
		instantiationService.stub(IViewsService, {});
		store.add(registerAction2(AcceptHunkAction));
		store.add(registerAction2(RejectHunkAction));
		store.add(registerAction2(RejectAction));
		ctxHasEditorModification.bindTo(instantiationService.get(IContextKeyService)).set(true);
		const container = dom.$('div', { style: 'width: 800px; height: 500px;' });
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const editor = store.add(instantiationService.createInstance(CodeEditorWidget, container, {
			dimension: { width: 800, height: 500 },
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
		}, { contributions: [] }));
		editor.setModel(review.model);
		const pane = upcastPartial<IVisibleEditorPane>({ input: upcastPartial<EditorInput>({ resource: review.resource }), getControl: () => editor });
		instantiationService.stub(IEditorService, { activeEditorPane: pane });
		const entry = review.session.getEntry(review.resource)!;
		entry.getEditorIntegration(pane);
		const initialWidgetCount = container.querySelectorAll('.chat-diff-change-content-widget').length;
		review.activeRequest.set(true, undefined);
		await assert.rejects(() => instantiationService.get(ICommandService).executeCommand(RejectAction.ID), /Wait for the agent/);
		review.activeRequest.set(false, undefined);
		editor.setPosition({ lineNumber: 1, column: 1 });
		await instantiationService.get(ICommandService).executeCommand(AcceptHunkAction.ID);
		editor.setPosition({ lineNumber: 12, column: 1 });
		await instantiationService.get(ICommandService).executeCommand(RejectHunkAction.ID);
		assert.deepStrictEqual({ initialWidgetCount, content: review.model.getValue(), remaining: entry.changesCount.get(), saved: review.contents.get(review.resource) }, {
			initialWidgetCount: 2, content: before.replace('first', 'FIRST'), remaining: 0, saved: before.replace('first', 'FIRST'),
		});
	});
});
