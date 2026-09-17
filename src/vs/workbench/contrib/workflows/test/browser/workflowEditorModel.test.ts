/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IContextMenuMenuDelegate, IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { WorkflowCheckpointType } from '../../../../../platform/workflow/common/workflow.js';
import { TextFileEditorModelManager } from '../../../../services/textfile/common/textFileEditorModelManager.js';
import { TestBrowserTextFileServiceWithEncodingOverrides, TestServiceAccessor, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { WorkflowEditorModel } from '../../browser/workflowEditorModel.js';
import { IWorkflowAccessibilityService, WorkflowAccessibilityService } from '../../browser/workflowAccessibility.js';
import { WorkflowEditorWidget } from '../../browser/workflowEditorWidget.js';
import { IWorkflowUIService } from '../../browser/workflowUIService.js';
import { IWorkflowCatalogService, WorkflowCatalog } from '../../common/workflowCatalog.js';
import { createWorkflowCatalog, workflowSchemaId } from '../../common/workflowCatalogModel.js';
import { testCheckpointType, testWorkflowDefinition } from '../common/workflowTestData.js';

suite('Workflow document editor model', () => {
	const models: WorkflowEditorModel[] = [];
	teardown(async () => {
		for (const model of models.splice(0)) {
			await model.revert();
			model.dispose();
		}
		await timeout(0);
	});
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function createModel() {
		const files = store.add(new FileService(new NullLogService()));
		store.add(files.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
		const root = URI.from({ scheme: Schemas.file, path: '/workflow-tests' });
		const resource = joinPath(root, 'feature.workflow.jsonc');
		await files.createFolder(root);
		const original = `// Keep this comment\n${JSON.stringify({ $schema: workflowSchemaId, ...testWorkflowDefinition() }, null, '\t')}\n`;
		await files.writeFile(resource, VSBuffer.fromString(original));
		const catalog = createWorkflowCatalog([
			{ kind: 'checkpoint', content: JSON.stringify(testCheckpointType()), source: { kind: 'user', id: 'profile' } },
			{ kind: 'workflow', content: original, resource, source: { kind: 'workspace', id: 'project' } },
		]);
		const instantiationService = workbenchInstantiationService({
			fileService: () => files,
			textFileService: instantiationService => store.add(instantiationService.createInstance(TestBrowserTextFileServiceWithEncodingOverrides)),
		}, store);
		instantiationService.stub(IWorkflowCatalogService, new class extends mock<IWorkflowCatalogService>() {
			override readonly onDidChange = Event.None;
			override async getCatalog(): Promise<WorkflowCatalog> { return catalog; }
			override watch() { return { dispose: () => { } }; }
		});
		const accessor = instantiationService.createInstance(TestServiceAccessor);
		store.add(accessor.textFileService.files as TextFileEditorModelManager);
		const model = store.add(instantiationService.createInstance(WorkflowEditorModel, catalog.workflows[0], root));
		models.push(model);
		await model.load();
		return { model, files, resource, original, accessor, instantiationService };
	}

	test('form edits share dirty state, undo, save, and revert with the real text file', async () => {
		const { model, files, resource, original, accessor } = await createModel();
		model.update(['label'], 'Changed title');
		const dirty = [model.isDirty, accessor.textFileService.isDirty(resource), model.definition?.label];
		await model.textModel!.undo();
		const undone = model.definition?.label;
		model.update(['label'], 'Saved title');
		await model.save();
		const saved = (await files.readFile(resource)).value.toString();
		model.update(['label'], 'Discarded title');
		await model.revert();
		assert.deepStrictEqual({
			dirty, undone, savedComment: saved.startsWith('// Keep this comment'),
			reverted: model.definition?.label, finalDirty: model.isDirty,
			originalUnchangedUntilSave: original.includes('Feature delivery'),
		}, {
			dirty: [true, true, 'Changed title'], undone: 'Feature delivery', savedComment: true,
			reverted: 'Saved title', finalDirty: false, originalUnchangedUntilSave: true,
		});
	});

	test('a running snapshot is isolated from later local contract edits', async () => {
		const { model } = await createModel();
		const snapshot = model.resolveSnapshot();
		model.makeLocalContract('plan');
		model.update(['checkpoints', 0, 'localType', 'instructions'], 'New local instructions.');
		assert.deepStrictEqual({
			run: snapshot.checkpoints[0].instructions,
			updated: model.resolveSnapshot().checkpoints[0].instructions,
			shared: model.checkpointTypes[0].instructions,
		}, {
			run: testCheckpointType().instructions,
			updated: 'New local instructions.',
			shared: testCheckpointType().instructions,
		});
		await model.revert();
	});

	test('invalid source edits block structured use without losing the text document', async () => {
		const { model, files, resource } = await createModel();
		model.textModel!.setValue('{ invalid');
		assert.throws(() => model.resolveSnapshot(), /JSON/);
		assert.deepStrictEqual({ dirty: model.isDirty, text: model.textModel?.getValue(), definition: model.definition }, { dirty: true, text: '{ invalid', definition: undefined });
		await model.save();
		assert.deepStrictEqual({ saved: (await files.readFile(resource)).value.toString(), dirty: model.isDirty }, { saved: '{ invalid', dirty: false });
	});

	test('a semantically invalid form value can be corrected without discarding its document', async () => {
		const { model } = await createModel();
		model.update(['version'], 0);
		const invalid = model.structuredDefinition;
		model.update(['version'], 2);
		assert.deepStrictEqual({ invalid, version: model.structuredDefinition?.version, dirty: model.isDirty }, { invalid: undefined, version: 2, dirty: true });
		await model.revert();
	});

	test('unresolved contracts leave structurally valid form fields editable', async () => {
		const { model } = await createModel();
		model.updateCheckpoint('plan', 'type', 'test/missing@1');
		const invalid = { editable: !!model.structuredDefinition, diagnostics: model.diagnostics.length > 0 };
		model.updateCheckpoint('plan', 'type', 'test/summary@1');
		assert.deepStrictEqual({ invalid, restored: model.structuredDefinition?.checkpoints[0].type, diagnostics: model.diagnostics }, { invalid: { editable: true, diagnostics: true }, restored: 'test/summary@1', diagnostics: [] });
		await model.revert();
	});

	test('committing a field on blur does not replace the button receiving the click', async () => {
		const { model, instantiationService } = await createModel();
		instantiationService.stub(IWorkflowAccessibilityService, instantiationService.createInstance(WorkflowAccessibilityService));
		instantiationService.stub(IWorkflowUIService, new class extends mock<IWorkflowUIService>() {
			override getGroups() { return []; }
		});
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const widget = store.add(instantiationService.createInstance(WorkflowEditorWidget, container, model));
		widget.layout(new dom.Dimension(900, 600));
		const input = [...container.getElementsByTagName('textarea')].find(input => input.getAttribute('aria-label') === 'Description') ?? [...container.getElementsByTagName('input')].find(input => input.getAttribute('aria-label') === 'Description');
		assert.ok(input);
		const button = [...container.getElementsByTagName('a')].find(button => button.textContent === 'Edit Workflow Input Schema');
		assert.ok(button);
		input.value = 'Updated description';
		input.dispatchEvent(new FocusEvent('blur', { relatedTarget: button }));
		assert.deepStrictEqual({ description: model.definition?.description, buttonPreserved: button.isConnected, inputPreserved: input.isConnected }, { description: 'Updated description', buttonPreserved: true, inputPreserved: true });
		await model.revert();
	});

	test('narrow fields are measured and saved without leaving the focused input', async () => {
		const { model, instantiationService, files, resource } = await createModel();
		instantiationService.stub(IWorkflowAccessibilityService, instantiationService.createInstance(WorkflowAccessibilityService));
		instantiationService.stub(IWorkflowUIService, new class extends mock<IWorkflowUIService>() {
			override getGroups() { return []; }
		});
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		container.style.width = '460px';
		store.add(toDisposable(() => container.remove()));
		const widget = store.add(instantiationService.createInstance(WorkflowEditorWidget, container, model));
		widget.layout(new dom.Dimension(460, 640));
		widget.revealCheckpoint('plan');
		const textarea = container.querySelector('textarea');
		assert.ok(textarea);
		const layout = { visible: textarea.clientHeight > 0, contentFits: textarea.clientHeight === textarea.scrollHeight };
		textarea.focus();
		textarea.value = 'Updated instructions without leaving the field';
		textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
		const beforeSave = { dirty: model.isDirty, focused: mainWindow.document.activeElement === textarea };
		await model.save();
		const instructionsSaved = (await files.readFile(resource)).value.toString().includes('Updated instructions without leaving the field');
		container.querySelector<HTMLElement>('[data-workflow-editor-focus="toolbar-rename-workflow-title"]')!.click();
		const title = container.querySelector<HTMLInputElement>('input[aria-label="Workflow title"]');
		assert.ok(title);
		title.focus();
		title.value = 'Title saved while focused';
		title.dispatchEvent(new InputEvent('input', { bubbles: true }));
		const staged = { dirty: model.isDirty, focused: mainWindow.document.activeElement === title };
		title.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		await model.save();
		assert.deepStrictEqual({
			layout,
			instructions: { ...beforeSave, saved: instructionsSaved },
			title: { ...staged, inputClosed: !title.isConnected, saved: (await files.readFile(resource)).value.toString().includes('Title saved while focused') },
		}, {
			layout: { visible: true, contentFits: true },
			instructions: { dirty: true, focused: true, saved: true },
			title: { dirty: false, focused: true, inputClosed: true, saved: true },
		});
	});

	test('checkpoint titles rename in place and Escape preserves the saved document', async () => {
		const { model, instantiationService } = await createModel();
		instantiationService.stub(IWorkflowAccessibilityService, instantiationService.createInstance(WorkflowAccessibilityService));
		instantiationService.stub(IWorkflowUIService, new class extends mock<IWorkflowUIService>() { override getGroups() { return []; } });
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const widget = store.add(instantiationService.createInstance(WorkflowEditorWidget, container, model));
		widget.layout(new dom.Dimension(900, 600));
		widget.revealCheckpoint('plan');
		const rename = () => container.querySelector<HTMLElement>('[data-workflow-editor-focus="detail-rename-checkpoint-title"]')!;
		const initiallyInput = container.querySelector('input[aria-label="Checkpoint title"]');
		const titleRect = rename().getBoundingClientRect();
		rename().click();
		const cancelled = container.querySelector<HTMLInputElement>('input[aria-label="Checkpoint title"]')!;
		const inputRect = container.querySelector('.workflow-title-input')!.getBoundingClientRect();
		const renameState = {
			selectedText: cancelled.value.substring(cancelled.selectionStart!, cancelled.selectionEnd!),
			stationary: (['x', 'y', 'width', 'height'] as const).every(key => Math.abs(inputRect[key] - titleRect[key]) < 0.1),
			editIcons: container.querySelectorAll('.workflow-title-button .codicon-edit').length,
		};
		cancelled.value = 'Discarded name';
		cancelled.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		const afterCancel = { name: model.definition?.checkpoints[0].label, dirty: model.isDirty };
		rename().click();
		const accepted = container.querySelector<HTMLInputElement>('input[aria-label="Checkpoint title"]')!;
		accepted.value = 'Prepare design';
		accepted.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		assert.deepStrictEqual({
			initiallyInput, renameState, afterCancel, name: model.definition?.checkpoints[0].label,
			title: rename().textContent, inputClosed: !accepted.isConnected,
		}, { initiallyInput: null, renameState: { selectedText: 'Plan', stationary: true, editIcons: 0 }, afterCancel: { name: 'Plan', dirty: false }, name: 'Prepare design', title: 'Prepare design', inputClosed: true });
	});

	test('outline rows have markers and expose reorder actions without duplicate numbered titles', async () => {
		const { model, instantiationService } = await createModel();
		instantiationService.stub(IWorkflowAccessibilityService, instantiationService.createInstance(WorkflowAccessibilityService));
		instantiationService.stub(IWorkflowUIService, new class extends mock<IWorkflowUIService>() { override getGroups() { return []; } });
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const widget = store.add(instantiationService.createInstance(WorkflowEditorWidget, container, model));
		widget.layout(new dom.Dimension(900, 600));
		const before = [...container.querySelectorAll('.workflow-outline-row:not(.root)')].map(row => ({
			marker: row.querySelector('.workflow-outline-marker')?.textContent, label: row.querySelector('.workflow-outline-label')?.textContent,
			toolbarBeforeHandle: row.querySelector('.workflow-outline-actions')?.lastElementChild?.classList.contains('workflow-outline-gripper'),
		}));
		const down = container.querySelector<HTMLElement>('[aria-label="Move Plan Down"]')!;
		down.click();
		assert.deepStrictEqual({ before, order: model.definition?.checkpoints.map(checkpoint => checkpoint.id) }, {
			before: [{ marker: '1', label: 'Plan', toolbarBeforeHandle: true }, { marker: '2', label: 'Implementation', toolbarBeforeHandle: true }], order: ['implement', 'plan'],
		});
	});

	test('the checkpoint context menu removes its target rather than the selected checkpoint', async () => {
		const { model, instantiationService, files, resource, original } = await createModel();
		instantiationService.stub(IWorkflowAccessibilityService, instantiationService.createInstance(WorkflowAccessibilityService));
		instantiationService.stub(IWorkflowUIService, new class extends mock<IWorkflowUIService>() { override getGroups() { return []; } });
		let menu: IContextMenuDelegate | IContextMenuMenuDelegate | undefined;
		instantiationService.stub(IContextMenuService, new class extends mock<IContextMenuService>() {
			override showContextMenu(delegate: IContextMenuDelegate | IContextMenuMenuDelegate): void { menu = delegate; }
		});
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const widget = store.add(instantiationService.createInstance(WorkflowEditorWidget, container, model));
		widget.layout(new dom.Dimension(900, 600));
		widget.revealCheckpoint('plan');
		container.querySelector('.workflow-outline-row[data-checkpoint-id="implement"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));
		const actions = menu?.getActions?.();
		assert.ok(actions?.length);
		await actions[0].run();
		menu?.onHide?.(false);
		assert.deepStrictEqual({
			action: actions[0].label,
			remaining: model.definition?.checkpoints.map(checkpoint => checkpoint.id),
			selected: container.querySelector('.workflow-editor-detail .workflow-title-text')?.textContent,
			dirty: model.isDirty,
			savedDocument: (await files.readFile(resource)).value.toString(),
		}, { action: 'Remove', remaining: ['plan'], selected: 'Plan', dirty: true, savedDocument: original });
	});

	test('editor chrome omits help, accessible view, outline and version controls', async () => {
		const { model, instantiationService } = await createModel();
		instantiationService.stub(IWorkflowAccessibilityService, instantiationService.createInstance(WorkflowAccessibilityService));
		instantiationService.stub(IWorkflowUIService, new class extends mock<IWorkflowUIService>() { override getGroups() { return []; } });
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		container.style.width = '460px';
		store.add(toDisposable(() => container.remove()));
		const widget = store.add(instantiationService.createInstance(WorkflowEditorWidget, container, model));
		widget.layout(new dom.Dimension(460, 640));
		const settings = { version: container.querySelector('input[aria-label="Version"]') };
		widget.revealCheckpoint('plan');
		const detailVisible = container.querySelector('.workflow-editor-detail')!.getBoundingClientRect().height > 0;
		container.querySelector<HTMLElement>('[aria-label="Back to Checkpoints"]')!.click();
		const backInList = !widget.domNode.classList.contains('show-detail');
		widget.revealCheckpoint('plan');
		const title = container.querySelector<HTMLElement>('.workflow-editor-detail .workflow-title-button')!;
		title.focus();
		title.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		assert.deepStrictEqual({
			settings,
			extraButtons: [...container.querySelectorAll('.monaco-button')].map(button => button.textContent).filter(label => ['Help', 'Accessible View', 'Outline', 'Remove'].includes(label ?? '')),
			detailVisible,
			backInList,
			escapeInList: !widget.domNode.classList.contains('show-detail') && !!dom.getActiveElement()?.classList.contains('monaco-list'),
			listVisible: container.querySelector('.workflow-outline-list')!.getBoundingClientRect().height > 0,
		}, { settings: { version: null }, extraButtons: [], detailVisible: true, backInList: true, escapeInList: true, listVisible: true });
	});

	test('the checkpoint library appends a selectable checkpoint without saving or starting work', async () => {
		const { model, instantiationService, files, resource, original } = await createModel();
		instantiationService.stub(IWorkflowAccessibilityService, instantiationService.createInstance(WorkflowAccessibilityService));
		instantiationService.stub(IWorkflowUIService, new class extends mock<IWorkflowUIService>() { override getGroups() { return []; } });
		let descriptions: (string | undefined)[] = [];
		instantiationService.stub(IQuickInputService, 'pick', async (items: (IQuickPickItem & { checkpointType: WorkflowCheckpointType })[]) => {
			descriptions = items.map(item => item.description);
			return items[0];
		});
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const widget = store.add(instantiationService.createInstance(WorkflowEditorWidget, container, model));
		widget.layout(new dom.Dimension(900, 600));
		container.querySelector<HTMLElement>('.workflow-outline-add')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			order: model.definition?.checkpoints.map(checkpoint => checkpoint.id),
			title: container.querySelector('.workflow-editor-detail .workflow-title-text')?.textContent,
			dirty: model.isDirty,
			savedDocument: (await files.readFile(resource)).value.toString(),
			descriptions,
		}, { order: ['plan', 'implement', 'summary'], title: 'Summary', dirty: true, savedDocument: original, descriptions: ['profile'] });
	});

	test('Alt+Arrow reorders the focused outline checkpoint without changing its identity', async () => {
		const { model, instantiationService } = await createModel();
		instantiationService.stub(IWorkflowAccessibilityService, instantiationService.createInstance(WorkflowAccessibilityService));
		instantiationService.stub(IWorkflowUIService, new class extends mock<IWorkflowUIService>() { override getGroups() { return []; } });
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const widget = store.add(instantiationService.createInstance(WorkflowEditorWidget, container, model));
		widget.layout(new dom.Dimension(900, 600));
		widget.revealCheckpoint('plan');
		widget.focus();
		dom.getActiveElement()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
		assert.deepStrictEqual({
			order: model.definition?.checkpoints.map(checkpoint => checkpoint.id),
			focused: container.querySelector('.monaco-list-row.focused .workflow-outline-row')?.getAttribute('data-checkpoint-id'),
		}, { order: ['implement', 'plan'], focused: 'plan' });
	});
});
