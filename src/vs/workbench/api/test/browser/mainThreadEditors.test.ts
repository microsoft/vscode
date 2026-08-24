/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, IReference, ImmortalReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IBulkEditService } from '../../../../editor/browser/services/bulkEditService.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { EditOperation, ISingleEditOperation } from '../../../../editor/common/core/editOperation.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ILanguageConfigurationService } from '../../../../editor/common/languages/languageConfigurationRegistry.js';
import { EndOfLineSequence, ITextSnapshot } from '../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { LanguageService } from '../../../../editor/common/services/languageService.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ModelService } from '../../../../editor/common/services/modelService.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ITreeSitterLibraryService } from '../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { TestCodeEditorService } from '../../../../editor/test/browser/editorTestServices.js';
import { TestLanguageConfigurationService } from '../../../../editor/test/common/modes/testLanguageConfigurationService.js';
import { TestTreeSitterLibraryService } from '../../../../editor/test/common/services/testTreeSitterLibraryService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../platform/dialogs/test/common/testDialogService.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationService } from '../../../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../platform/notification/test/common/testNotificationService.js';
import { TestThemeService } from '../../../../platform/theme/test/common/testThemeService.js';
import { IUndoRedoService } from '../../../../platform/undoRedo/common/undoRedo.js';
import { UndoRedoService } from '../../../../platform/undoRedo/common/undoRedoService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { BulkEditService } from '../../../contrib/bulkEdit/browser/bulkEditService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { SerializableObjectWithBuffers } from '../../../services/extensions/common/proxyIdentifier.js';
import { LabelService } from '../../../services/label/common/labelService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { ICopyOperation, ICreateFileOperation, ICreateOperation, IDeleteOperation, IMoveOperation, IWorkingCopyFileService } from '../../../services/workingCopy/common/workingCopyFileService.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';
import { TestEditorGroupsService, TestEditorService, TestEnvironmentService, TestLifecycleService, TestWorkingCopyService } from '../../../test/browser/workbenchTestServices.js';
import { TestContextService, TestFileService, TestTextResourcePropertiesService } from '../../../test/common/workbenchTestServices.js';
import { MainThreadBulkEdits } from '../../browser/mainThreadBulkEdits.js';
import { MainThreadTextEditors, IMainThreadEditorLocator } from '../../browser/mainThreadEditors.js';
import { MainThreadTextEditor } from '../../browser/mainThreadEditor.js';
import { MainThreadDocuments } from '../../browser/mainThreadDocuments.js';
import { IWorkspaceTextEditDto } from '../../common/extHost.protocol.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { ITextResourcePropertiesService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { TestClipboardService } from '../../../../platform/clipboard/test/common/testClipboardService.js';
import { createTestCodeEditor } from '../../../../editor/test/browser/testCodeEditor.js';

suite('MainThreadEditors', () => {

	let disposables: DisposableStore;
	const existingResource = URI.parse('foo:existing');
	const resource = URI.parse('foo:bar');

	let modelService: IModelService;

	let bulkEdits: MainThreadBulkEdits;
	let editors: MainThreadTextEditors;
	let editorLocator: IMainThreadEditorLocator;
	let testEditor: MainThreadTextEditor;

	const movedResources = new Map<URI, URI>();
	const copiedResources = new Map<URI, URI>();
	const createdResources = new Set<URI>();
	const deletedResources = new Set<URI>();

	const editorId = 'testEditorId';

	setup(() => {
		disposables = new DisposableStore();

		movedResources.clear();
		copiedResources.clear();
		createdResources.clear();
		deletedResources.clear();

		const configService = new TestConfigurationService();
		const dialogService = new TestDialogService();
		const notificationService = new TestNotificationService();
		const undoRedoService = new UndoRedoService(dialogService, notificationService);
		const themeService = new TestThemeService();

		const services = new ServiceCollection();
		services.set(IBulkEditService, new SyncDescriptor(BulkEditService));
		services.set(ILabelService, new SyncDescriptor(LabelService));
		services.set(ILogService, new NullLogService());
		services.set(IWorkspaceContextService, new TestContextService());
		services.set(IEnvironmentService, TestEnvironmentService);
		services.set(IWorkbenchEnvironmentService, TestEnvironmentService);
		services.set(IConfigurationService, configService);
		services.set(IDialogService, dialogService);
		services.set(INotificationService, notificationService);
		services.set(IUndoRedoService, undoRedoService);
		services.set(ITextResourcePropertiesService, new SyncDescriptor(TestTextResourcePropertiesService));
		services.set(IModelService, new SyncDescriptor(ModelService));
		services.set(ICodeEditorService, new TestCodeEditorService(themeService));
		services.set(IFileService, new TestFileService());
		services.set(IUriIdentityService, new SyncDescriptor(UriIdentityService));
		services.set(ITreeSitterLibraryService, new TestTreeSitterLibraryService());
		services.set(IEditorService, disposables.add(new TestEditorService()));
		services.set(ILifecycleService, new TestLifecycleService());
		services.set(IWorkingCopyService, new TestWorkingCopyService());
		services.set(IEditorGroupsService, new TestEditorGroupsService());
		services.set(IClipboardService, new TestClipboardService());
		services.set(ITextFileService, new class extends mock<ITextFileService>() {
			override isDirty() { return false; }
			// eslint-disable-next-line local/code-no-any-casts
			override files = <any>{
				onDidSave: Event.None,
				onDidRevert: Event.None,
				onDidChangeDirty: Event.None,
				onDidChangeEncoding: Event.None
			};
			// eslint-disable-next-line local/code-no-any-casts
			override untitled = <any>{
				onDidChangeEncoding: Event.None
			};
			override create(operations: { resource: URI }[]) {
				for (const o of operations) {
					createdResources.add(o.resource);
				}
				return Promise.resolve(Object.create(null));
			}
			override async getEncodedReadable(resource: URI, value?: string | ITextSnapshot): Promise<any> {
				return undefined;
			}
		});
		services.set(IWorkingCopyFileService, new class extends mock<IWorkingCopyFileService>() {
			override onDidRunWorkingCopyFileOperation = Event.None;
			override createFolder(operations: ICreateOperation[]): any {
				this.create(operations);
			}
			override create(operations: ICreateFileOperation[]) {
				for (const operation of operations) {
					createdResources.add(operation.resource);
				}
				return Promise.resolve(Object.create(null));
			}
			override move(operations: IMoveOperation[]) {
				const { source, target } = operations[0].file;
				movedResources.set(source, target);
				return Promise.resolve(Object.create(null));
			}
			override copy(operations: ICopyOperation[]) {
				const { source, target } = operations[0].file;
				copiedResources.set(source, target);
				return Promise.resolve(Object.create(null));
			}
			override delete(operations: IDeleteOperation[]) {
				for (const operation of operations) {
					deletedResources.add(operation.resource);
				}
				return Promise.resolve(undefined);
			}
		});
		services.set(ITextModelService, new class extends mock<ITextModelService>() {
			override createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
				const textEditorModel = new class extends mock<IResolvedTextEditorModel>() {
					override textEditorModel = modelService.getModel(resource)!;
				};
				textEditorModel.isReadonly = () => false;
				return Promise.resolve(new ImmortalReference(textEditorModel));
			}
		});
		services.set(IEditorWorkerService, new class extends mock<IEditorWorkerService>() {

		});
		services.set(IPaneCompositePartService, new class extends mock<IPaneCompositePartService>() implements IPaneCompositePartService {
			override onDidPaneCompositeOpen = Event.None;
			override onDidPaneCompositeClose = Event.None;
			override getActivePaneComposite() {
				return undefined;
			}
		});

		services.set(ILanguageService, disposables.add(new LanguageService()));
		services.set(ILanguageConfigurationService, new TestLanguageConfigurationService());

		const instaService = new InstantiationService(services);

		bulkEdits = instaService.createInstance(MainThreadBulkEdits, SingleProxyRPCProtocol(null));
		const documents = instaService.createInstance(MainThreadDocuments, SingleProxyRPCProtocol(null));

		// Create editor locator
		editorLocator = {
			getEditor(id: string): MainThreadTextEditor | undefined {
				return id === editorId ? testEditor : undefined;
			},
			findTextEditorIdFor() { return undefined; },
			getIdOfCodeEditor() { return undefined; }
		};

		editors = instaService.createInstance(MainThreadTextEditors, editorLocator, SingleProxyRPCProtocol(null));
		modelService = instaService.invokeFunction(accessor => accessor.get(IModelService));

		// Create a test code editor using the helper
		const model = modelService.createModel('Hello world!', null, existingResource);
		const testCodeEditor = disposables.add(createTestCodeEditor(model));

		testEditor = disposables.add(instaService.createInstance(
			MainThreadTextEditor,
			editorId,
			model,
			testCodeEditor,
			{ onGainedFocus() { }, onLostFocus() { } },
			documents
		));
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test(`applyWorkspaceEdit returns false if model is changed by user`, () => {

		const model = disposables.add(modelService.createModel('something', null, resource));

		const workspaceResourceEdit: IWorkspaceTextEditDto = {
			resource: resource,
			versionId: model.getVersionId(),
			textEdit: {
				text: 'asdfg',
				range: new Range(1, 1, 1, 1)
			}
		};

		// Act as if the user edited the model
		model.applyEdits([EditOperation.insert(new Position(0, 0), 'something')]);

		return bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({ edits: [workspaceResourceEdit] })).then((result) => {
			assert.strictEqual(result, false);
		});
	});

	test(`issue #54773: applyWorkspaceEdit checks model version in race situation`, () => {

		const model = disposables.add(modelService.createModel('something', null, resource));

		const workspaceResourceEdit1: IWorkspaceTextEditDto = {
			resource: resource,
			versionId: model.getVersionId(),
			textEdit: {
				text: 'asdfg',
				range: new Range(1, 1, 1, 1)
			}
		};
		const workspaceResourceEdit2: IWorkspaceTextEditDto = {
			resource: resource,
			versionId: model.getVersionId(),
			textEdit: {
				text: 'asdfg',
				range: new Range(1, 1, 1, 1)
			}
		};

		const p1 = bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({ edits: [workspaceResourceEdit1] })).then((result) => {
			// first edit request succeeds
			assert.strictEqual(result, true);
		});
		const p2 = bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({ edits: [workspaceResourceEdit2] })).then((result) => {
			// second edit request fails
			assert.strictEqual(result, false);
		});
		return Promise.all([p1, p2]);
	});

	test('applyWorkspaceEdit: noop eol edit keeps undo stack clean', async () => {

		const initialText = 'hello\nworld';
		const model = disposables.add(modelService.createModel(initialText, null, resource));
		const initialAlternativeVersionId = model.getAlternativeVersionId();

		const insertEdit: IWorkspaceTextEditDto = {
			resource: resource,
			versionId: model.getVersionId(),
			textEdit: {
				range: new Range(1, 6, 1, 6),
				text: '2'
			}
		};

		const insertResult = await bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({ edits: [insertEdit] }));
		assert.strictEqual(insertResult, true);
		assert.strictEqual(model.getValue(), 'hello2\nworld');
		assert.notStrictEqual(model.getAlternativeVersionId(), initialAlternativeVersionId);

		const eolEdit: IWorkspaceTextEditDto = {
			resource: resource,
			versionId: model.getVersionId(),
			textEdit: {
				range: new Range(1, 1, 1, 1),
				text: '',
				eol: EndOfLineSequence.LF
			}
		};

		const eolResult = await bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({ edits: [eolEdit] }));
		assert.strictEqual(eolResult, true);
		assert.strictEqual(model.getValue(), 'hello2\nworld');

		const undoResult = model.undo();
		if (undoResult) {
			await undoResult;
		}
		assert.strictEqual(model.getValue(), initialText);
		assert.strictEqual(model.getAlternativeVersionId(), initialAlternativeVersionId);
	});

	test(`applyWorkspaceEdit with only resource edit`, () => {
		return bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({
			edits: [
				{ oldResource: resource, newResource: resource, options: undefined },
				{ oldResource: undefined, newResource: resource, options: undefined },
				{ oldResource: resource, newResource: undefined, options: undefined }
			]
		})).then((result) => {
			assert.strictEqual(result, true);
			assert.strictEqual(movedResources.get(resource), resource);
			assert.strictEqual(createdResources.has(resource), true);
			assert.strictEqual(deletedResources.has(resource), true);
		});
	});

	test('applyWorkspaceEdit can control undo/redo stack 1', async () => {
		const model = modelService.getModel(existingResource)!;

		const edit1: ISingleEditOperation = {
			range: new Range(1, 1, 1, 2),
			text: 'h',
			forceMoveMarkers: false
		};

		const applied1 = await editors.$tryApplyEdits(editorId, model.getVersionId(), [edit1], { undoStopBefore: false, undoStopAfter: false });
		assert.strictEqual(applied1, true);
		assert.strictEqual(model.getValue(), 'hello world!');

		const edit2: ISingleEditOperation = {
			range: new Range(1, 2, 1, 6),
			text: 'ELLO',
			forceMoveMarkers: false
		};

		const applied2 = await editors.$tryApplyEdits(editorId, model.getVersionId(), [edit2], { undoStopBefore: false, undoStopAfter: false });
		assert.strictEqual(applied2, true);
		assert.strictEqual(model.getValue(), 'hELLO world!');

		await model.undo();
		assert.strictEqual(model.getValue(), 'Hello world!');
	});

	test('applyWorkspaceEdit can control undo/redo stack 2', async () => {
		const model = modelService.getModel(existingResource)!;

		const edit1: ISingleEditOperation = {
			range: new Range(1, 1, 1, 2),
			text: 'h',
			forceMoveMarkers: false
		};

		const applied1 = await editors.$tryApplyEdits(editorId, model.getVersionId(), [edit1], { undoStopBefore: false, undoStopAfter: false });
		assert.strictEqual(applied1, true);
		assert.strictEqual(model.getValue(), 'hello world!');

		const edit2: ISingleEditOperation = {
			range: new Range(1, 2, 1, 6),
			text: 'ELLO',
			forceMoveMarkers: false
		};

		const applied2 = await editors.$tryApplyEdits(editorId, model.getVersionId(), [edit2], { undoStopBefore: true, undoStopAfter: false });
		assert.strictEqual(applied2, true);
		assert.strictEqual(model.getValue(), 'hELLO world!');

		await model.undo();
		assert.strictEqual(model.getValue(), 'hello world!');
	});
});
