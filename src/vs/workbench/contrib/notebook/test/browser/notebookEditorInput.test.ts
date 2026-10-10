/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { EditorService } from '../../../../services/editor/browser/editorService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { FileWorkingCopyManager } from '../../../../services/workingCopy/common/fileWorkingCopyManager.js';
import { GroupDirection, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { createEditorPart, registerTestEditor, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { InteractiveDocumentService, IInteractiveDocumentService } from '../../../interactive/browser/interactiveDocumentService.js';
import { InteractiveEditorInput } from '../../../interactive/browser/interactiveEditorInput.js';
import { InteractiveHistoryService, IInteractiveHistoryService } from '../../../interactive/browser/interactiveHistoryService.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../../services/editor/common/editorResolverService.js';
import { NotebookFileWorkingCopyModel, SimpleNotebookEditorModel } from '../../common/notebookEditorModel.js';
import { INotebookLoggingService } from '../../common/notebookLoggingService.js';
import { setupInstantiationService } from './testNotebookEditor.js';
import { NotebookMultiDiffEditorInput } from '../../browser/diff/notebookMultiDiffEditorInput.js';
import { IResolvedNotebookEditorModel } from '../../common/notebookCommon.js';
import { NotebookDiffEditorInput } from '../../common/notebookDiffEditorInput.js';
import { NotebookEditorInput, NotebookEditorInputOptions } from '../../common/notebookEditorInput.js';
import { INotebookEditorModelResolverService } from '../../common/notebookEditorModelResolverService.js';
import { INotebookService } from '../../common/notebookService.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';

suite('NotebookEditorInput reuse', () => {
	const disposables = new DisposableStore();
	let instantiationService: TestInstantiationService;
	let notebookAdded: Emitter<NotebookTextModel>;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		notebookAdded = disposables.add(new Emitter<NotebookTextModel>());
		instantiationService.stub(INotebookService, { onDidAddNotebookDocument: notebookAdded.event, canResolve: async () => false });
		instantiationService.stub(INotebookEditorModelResolverService, {});
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function getInput(resource = URI.file('/test.ipynb'), viewType = 'test-notebook', preferredResource?: URI, options?: NotebookEditorInputOptions) {
		return disposables.add(NotebookEditorInput.getOrCreate(instantiationService, resource, preferredResource, viewType, options));
	}

	test('reuses a live input for the same resource and notebook type', () => {
		const input = getInput();
		assert.strictEqual(getInput(URI.file('/test.ipynb')), input);
		assert.notStrictEqual(getInput(URI.file('/other.ipynb')), input);
		assert.notStrictEqual(getInput(input.resource, 'other-notebook'), input);
	});

	test('preserves initialization options and updates the preferred resource when reused', () => {
		const options = { startDirty: true, _backupId: 'backup' };
		const input = getInput(undefined, undefined, undefined, options);
		const preferredResource = URI.parse('vscode-notebook-cell:/test.ipynb#cell');
		const reused = getInput(input.resource, input.viewType, preferredResource);
		assert.strictEqual(reused, input);
		assert.strictEqual(reused.options, options);
		assert.strictEqual(reused.preferredResource, preferredResource);
		assert.strictEqual(reused.isDirty(), true);
	});

	test('accepts restoration options supplied after an unresolved input was cached', () => {
		const input = getInput();
		const options = { startDirty: true, _backupId: 'backup', _workingCopy: { resource: input.resource, typeId: 'backup' } };
		assert.strictEqual(getInput(input.resource, input.viewType, undefined, options), input);
		assert.deepStrictEqual(input.options, options);
		assert.strictEqual(input.isDirty(), true);
		assert.strictEqual(getInput().isDirty(), true);
	});

	test('evicts disposed inputs and unregisters their notebook listeners', () => {
		const input = getInput();
		input.dispose();
		assert.strictEqual(notebookAdded.hasListeners(), false);
		const replacement = getInput();
		assert.notStrictEqual(replacement, input);
		assert.strictEqual(replacement.isDisposed(), false);
	});

	test('evicts before model teardown can request a replacement', async () => {
		let replacement: NotebookEditorInput | undefined;
		const model = new class extends mock<IResolvedNotebookEditorModel>() {
			override onDidChangeDirty = Event.None;
			override onDidChangeReadonly = Event.None;
			override onDidRevertUntitled = Event.None;
			override isDirty() { return false; }
			override isReadonly() { return false; }
		};
		instantiationService.stub(INotebookService, 'canResolve', async () => true);
		instantiationService.stub(INotebookEditorModelResolverService, {
			resolve: async () => ({ object: model, dispose: () => { replacement = getInput(); } })
		});
		const input = getInput();
		await input.resolve();
		input.dispose();
		assert.ok(replacement);
		assert.notStrictEqual(replacement, input);
		assert.strictEqual(getInput(), replacement);
	});

	test('repeated disposal does not evict a replacement', () => {
		const input = getInput();
		input.dispose();
		const replacement = getInput();
		input.dispose();
		assert.strictEqual(getInput(), replacement);
	});

	test('restored inputs remain reusable after restoration options are cleared', () => {
		const resource = URI.file('/test.ipynb');
		const options: NotebookEditorInputOptions = { _workingCopy: { resource, typeId: 'backup' } };
		const input = getInput(resource, undefined, undefined, options);
		options._workingCopy = undefined;
		assert.strictEqual(getInput(resource), input);
		input.dispose();
		assert.notStrictEqual(getInput(resource, undefined, undefined, { _workingCopy: { resource, typeId: 'backup' } }), input);
	});

	for (const createDiff of [NotebookDiffEditorInput.create, NotebookMultiDiffEditorInput.create]) {
		test(`${createDiff === NotebookDiffEditorInput.create ? 'notebook diff' : 'notebook multi diff'} owns separate notebook children`, () => {
			const original = getInput(URI.file('/original.ipynb'));
			const modified = getInput();
			const diff = disposables.add(createDiff(instantiationService, modified.resource, undefined, undefined, original.resource, modified.viewType));
			assert.notStrictEqual(diff.original, original);
			assert.notStrictEqual(diff.modified, modified);
			diff.dispose();
			assert.strictEqual(original.isDisposed(), false);
			assert.strictEqual(modified.isDisposed(), false);
			assert.strictEqual(getInput(), modified);
		});
	}

	test('interactive editors own separate notebook children', () => {
		instantiationService.stub(IInteractiveDocumentService, disposables.add(new InteractiveDocumentService()));
		instantiationService.stub(IInteractiveHistoryService, disposables.add(new InteractiveHistoryService()));
		const resource = URI.parse('untitled:/test.interactive');
		const input = getInput(resource, 'interactive');
		const interactive = disposables.add(instantiationService.createInstance(InteractiveEditorInput, resource, URI.parse('vscode-interactive-input:/test'), undefined, undefined));
		assert.notStrictEqual(interactive.notebookEditorInput, input);
		interactive.dispose();
		assert.strictEqual(input.isDisposed(), false);
		assert.strictEqual(getInput(resource, 'interactive'), input);
	});

	test('shared group inputs survive closing one group and expire after the last group closes', async () => {
		disposables.add(registerTestEditor('TestNotebookEditor', [new SyncDescriptor(NotebookEditorInput)]));
		const part = await createEditorPart(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, part);
		const service = disposables.add(instantiationService.createInstance(EditorService, undefined));
		instantiationService.stub(IEditorService, service);
		const first = part.activeGroup;
		const second = part.addGroup(first, GroupDirection.RIGHT);
		const input = getInput();
		await service.openEditor(input, { pinned: true }, first);
		await service.openEditor(getInput(), { pinned: true }, second);
		await first.closeEditor(input);
		assert.strictEqual(input.isDisposed(), false);
		assert.strictEqual(getInput(), input);
		await second.closeEditor(input);
		assert.strictEqual(input.isDisposed(), true);
		assert.notStrictEqual(getInput(), input);
	});

	test('37 overlapping open/close iterations leave no notebook input listeners', async () => {
		disposables.add(registerTestEditor('TestNotebookEditor', [new SyncDescriptor(NotebookEditorInput)]));
		const part = await createEditorPart(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, part);
		const service = disposables.add(instantiationService.createInstance(EditorService, undefined));
		instantiationService.stub(IEditorService, service);
		disposables.add(instantiationService.get(IEditorResolverService).registerEditor('*.ipynb',
			{ id: 'test-notebook', label: 'Test Notebook', priority: RegisteredEditorPriority.default }, {},
			{ createEditorInput: ({ resource }) => ({ editor: getInput(resource) }) }));
		for (let iteration = 0; iteration < 37; iteration++) {
			const first = getInput();
			const second = getInput();
			assert.strictEqual(first, second);
			await Promise.all([
				service.openEditor({ resource: first.resource, options: { override: first.viewType, pinned: true } }),
				service.openEditor({ resource: second.resource, options: { override: second.viewType, pinned: true } })
			]);
			assert.strictEqual(part.activeGroup.activeEditor, first);
			await part.activeGroup.closeAllEditors();
			assert.strictEqual(notebookAdded.hasListeners(), false);
		}
	});

	test('37 untitled model revert/recreate iterations return fresh live inputs', async () => {
		const resource = URI.parse('untitled:/Untitled-1.ipynb');
		const modelInstantiationService = setupInstantiationService(disposables);
		instantiationService.stub(INotebookService, 'canResolve', async () => true);
		const factory = {
			createModel: async (resource: URI) => {
				const notebook = disposables.add(modelInstantiationService.createInstance(NotebookTextModel,
					'test-notebook', resource, [], {},
					{ transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {}, transientOutputs: false }));
				return new NotebookFileWorkingCopyModel(notebook,
					new class extends mock<INotebookService>() { }, new TestConfigurationService(), NullTelemetryService,
					new class extends mock<INotebookLoggingService>() { });
			}
		};
		const manager = disposables.add(instantiationService.createInstance(FileWorkingCopyManager<NotebookFileWorkingCopyModel, NotebookFileWorkingCopyModel>, 'test-notebook', factory, factory));
		let previous: NotebookEditorInput | undefined;
		for (let iteration = 0; iteration < 37; iteration++) {
			const model = disposables.add(instantiationService.createInstance(SimpleNotebookEditorModel, resource, false, 'test-notebook', manager, false));
			const resolved = await model.load();
			let releases = 0;
			instantiationService.stub(INotebookEditorModelResolverService, {
				resolve: async () => ({ object: resolved, dispose: () => { releases++; model.dispose(); } })
			});
			const input = getInput(resource);
			assert.notStrictEqual(input, previous);
			assert.strictEqual(input.isDisposed(), false);
			assert.strictEqual(await input.resolve(), model);
			await model.revert();
			assert.strictEqual(input.isDisposed(), true);
			assert.strictEqual(releases, 1);
			assert.strictEqual(notebookAdded.hasListeners(), false);
			previous = input;
		}
	});
});
