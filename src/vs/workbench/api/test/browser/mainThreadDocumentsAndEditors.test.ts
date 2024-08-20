/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MainThreadDocumentsAndEditors } from 'vs/workbench/api/browser/mainThreadDocumentsAndEditors';
import { SingleProxyRPCProtocol } from 'vs/workbench/api/test/common/testRPCProtocol';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ModelService } from 'vs/editor/common/services/modelService';
import { TestCodeEditorService } from 'vs/editor/test/browser/editorTestServices';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ExtHostDocumentsAndEditorsShape, IDocumentsAndEditorsDelta } from 'vs/workbench/api/common/extHost.protocol';
import { createTestCodeEditor, ITestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { mock } from 'vs/base/test/common/mock';
import { TestEditorService, TestEditorGroupsService, TestEnvironmentService, TestPathService } from 'vs/workbench/test/browser/workbenchTestServices';
import { Event } from 'vs/base/common/event';
import { ITextModel } from 'vs/editor/common/model';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IFileService } from 'vs/platform/files/common/files';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { UndoRedoService } from 'vs/platform/undoRedo/common/undoRedoService';
import { TestDialogService } from 'vs/platform/dialogs/test/common/testDialogService';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { TestTextResourcePropertiesService, TestWorkingCopyFileService } from 'vs/workbench/test/common/workbenchTestServices';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { TextModel } from 'vs/editor/common/model/textModel';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { LanguageService } from 'vs/editor/common/services/languageService';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { TestLanguageConfigurationService } from 'vs/editor/test/common/modes/testLanguageConfigurationService';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';

suite('MainThreadDocumentsAndEditors', () => {

	let disposables: DisposableStore;

	let modelService: ModelService;
	let codeEditorService: TestCodeEditorService;
	let textFileService: ITextFileService;
	const deltas: IDocumentsAndEditorsDelta[] = [];

	function myCreateTestCodeEditor(model: ITextModel | undefined): ITestCodeEditor {
		return createTestCodeEditor(model, {
			hasTextFocus: false,
			serviceCollection: new ServiceCollection(
				[ICodeEditorService, codeEditorService]
			)
		});
	}

	setup(() => {
		disposables = new DisposableStore();

		deltas.length = 0;
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('editor', { 'detectIndentation': false });
		const dialogService = new TestDialogService();
		const notificationService = new TestNotificationService();
		const undoRedoService = new UndoRedoService(dialogService, notificationService);
		const themeService = new TestThemeService();
		const instantiationService = new TestInstantiationService();
		instantiationService.set(ILanguageService, disposables.add(new LanguageService()));
		instantiationService.set(ILanguageConfigurationService, new TestLanguageConfigurationService());
		instantiationService.set(IUndoRedoService, undoRedoService);
		modelService = new ModelService(
			configService,
			new TestTextResourcePropertiesService(configService),
			undoRedoService,
			instantiationService
		);
		codeEditorService = new TestCodeEditorService(themeService);
		textFileService = new class extends mock<ITextFileService>() {
			override isDirty() { return false; }
			override files = <any>{
				onDidSave: Event.None,
				onDidRevert: Event.None,
				onDidChangeDirty: Event.None
			};
		};
		const workbenchEditorService = disposables.add(new TestEditorService());
		const editorGroupService = new TestEditorGroupsService();

		const fileService = new class extends mock<IFileService>() {
			override onDidRunOperation = Event.None;
			override onDidChangeFileSystemProviderCapabilities = Event.None;
			override onDidChangeFileSystemProviderRegistrations = Event.None;
		};

		new MainThreadDocumentsAndEditors(
			SingleProxyRPCProtocol(new class extends mock<ExtHostDocumentsAndEditorsShape>() {
				override $acceptDocumentsAndEditorsDelta(delta: IDocumentsAndEditorsDelta) { deltas.push(delta); }
			}),
			modelService,
			textFileService,
			workbenchEditorService,
			codeEditorService,
			fileService,
			null!,
			editorGroupService,
			new class extends mock<IPaneCompositePartService>() implements IPaneCompositePartService {
				override onDidPaneCompositeOpen = Event.None;
				override onDidPaneCompositeClose = Event.None;
				override getActivePaneComposite() {
					return undefined;
				}
			},
			TestEnvironmentService,
			new TestWorkingCopyFileService(),
			new UriIdentityService(fileService),
			new class extends mock<IClipboardService>() {
				override readText() {
					return Promise.resolve('clipboard_contents');
				}
			},
			new TestPathService(),
			new TestConfigurationService(),
		);
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Model#add', () => {
		deltas.length = 0;

		disposables.add(modelService.createModel('farboo', null));

		assert.strictEqual(deltas.length, 1);
		const [delta] = deltas;

		assert.strictEqual(delta.addedDocuments!.length, 1);
		assert.strictEqual(delta.removedDocuments, undefined);
		assert.strictEqual(delta.addedEditors, undefined);
		assert.strictEqual(delta.removedEditors, undefined);
		assert.strictEqual(delta.newActiveEditor, undefined);
	});

	test('ignore huge model', function () {

		const oldLimit = TextModel._MODEL_SYNC_LIMIT;
		try {
			const largeModelString = 'abc'.repeat(1024);
			TextModel._MODEL_SYNC_LIMIT = largeModelString.length / 2;

			const model = modelService.createModel(largeModelString, null);
			disposables.add(model);
			assert.ok(model.isTooLargeForSyncing());

			assert.strictEqual(deltas.length, 1);
			const [delta] = deltas;
			assert.strictEqual(delta.newActiveEditor, null);
			assert.strictEqual(delta.addedDocuments, undefined);
			assert.strictEqual(delta.removedDocuments, undefined);
			assert.strictEqual(delta.addedEditors, undefined);
			assert.strictEqual(delta.removedEditors, undefined);

		} finally {
			TextModel._MODEL_SYNC_LIMIT = oldLimit;
		}
	});

	test('ignore huge model from editor', function () {

		const oldLimit = TextModel._MODEL_SYNC_LIMIT;
		try {
			const largeModelString = 'abc'.repeat(1024);
			TextModel._MODEL_SYNC_LIMIT = largeModelString.length / 2;

			const model = modelService.createModel(largeModelString, null);
			const editor = myCreateTestCodeEditor(model);

			assert.strictEqual(deltas.length, 1);
			deltas.length = 0;
			assert.strictEqual(deltas.length, 0);
			editor.dispose();
			model.dispose();

		} finally {
			TextModel._MODEL_SYNC_LIMIT = oldLimit;
		}
	});

	test('ignore simple widget model', function () {
		this.timeout(1000 * 60); // increase timeout for this one test

		const model = modelService.createModel('test', null, undefined, true);
		disposables.add(model);
		assert.ok(model.isForSimpleWidget);

		assert.strictEqual(deltas.length, 1);
		const [delta] = deltas;
		assert.strictEqual(delta.newActiveEditor, null);
		assert.strictEqual(delta.addedDocuments, undefined);
		assert.strictEqual(delta.removedDocuments, undefined);
		assert.strictEqual(delta.addedEditors, undefined);
		assert.strictEqual(delta.removedEditors, undefined);
	});

	test('ignore editor w/o model', () => {
		const editor = myCreateTestCodeEditor(undefined);
		assert.strictEqual(deltas.length, 1);
		const [delta] = deltas;
		assert.strictEqual(delta.newActiveEditor, null);
		assert.strictEqual(delta.addedDocuments, undefined);
		assert.strictEqual(delta.removedDocuments, undefined);
		assert.strictEqual(delta.addedEditors, undefined);
		assert.strictEqual(delta.removedEditors, undefined);

		editor.dispose();
	});

	test('editor with model', () => {
		deltas.length = 0;

		const model = modelService.createModel('farboo', null);
		const editor = myCreateTestCodeEditor(model);

		assert.strictEqual(deltas.length, 2);
		const [first, second] = deltas;
		assert.strictEqual(first.addedDocuments!.length, 1);
		assert.strictEqual(first.newActiveEditor, undefined);
		assert.strictEqual(first.removedDocuments, undefined);
		assert.strictEqual(first.addedEditors, undefined);
		assert.strictEqual(first.removedEditors, undefined);

		assert.strictEqual(second.addedEditors!.length, 1);
		assert.strictEqual(second.addedDocuments, undefined);
		assert.strictEqual(second.removedDocuments, undefined);
		assert.strictEqual(second.removedEditors, undefined);
		assert.strictEqual(second.newActiveEditor, undefined);

		editor.dispose();
		model.dispose();
	});

	test('editor with dispos-ed/-ing model', () => {
		const model = modelService.createModel('farboo', null);
		const editor = myCreateTestCodeEditor(model);

		// ignore things until now
		deltas.length = 0;

		modelService.destroyModel(model.uri);
		assert.strictEqual(deltas.length, 1);
		const [first] = deltas;

		assert.strictEqual(first.newActiveEditor, undefined);
		assert.strictEqual(first.removedEditors!.length, 1);
		assert.strictEqual(first.removedDocuments!.length, 1);
		assert.strictEqual(first.addedDocuments, undefined);
		assert.strictEqual(first.addedEditors, undefined);

		editor.dispose();
		model.dispose();
	});
});
