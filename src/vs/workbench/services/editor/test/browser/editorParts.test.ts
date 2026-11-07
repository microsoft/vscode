/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { URI } from '../../../../../base/common/uri.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationService } from '../../../../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ConfirmResult, IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IEditorGroupView, IEditorGroupViewOptions, IEditorPartsView } from '../../../../browser/parts/editor/editor.js';
import { EditorPart } from '../../../../browser/parts/editor/editorPart.js';
import { PART_GRID_CLASS } from '../../../../browser/parts/editor/partGridClass.js';
import { EditorGroupLockActionsHiddenContext } from '../../../../common/contextkeys.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../common/editor.js';
import { createEditorParts, TestEditorParts, TestFileEditorInput, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { UntitledTextEditorInput } from '../../../untitled/common/untitledTextEditorInput.js';
import { IUntitledTextEditorService } from '../../../untitled/common/untitledTextEditorService.js';
import { IAuxiliaryWindowService } from '../../../auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IHostService } from '../../../host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../layout/browser/layoutService.js';
import { GroupDirection, GroupsOrder, IEditorGroup, IEditorGroupsService, IEditorPart } from '../../common/editorGroupsService.js';

/**
 * An editor part that is created by someone else than the editor parts
 * service and rendered into a container of its owner.
 */
class TestOwnedEditorPart extends EditorPart {

	private static COUNTER = 1;

	constructor(
		editorPartsView: IEditorPartsView,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IHostService hostService: IHostService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(editorPartsView, `workbench.parts.testOwnedEditor.${TestOwnedEditorPart.COUNTER++}`, 'Owned', mainWindow.vscodeWindowId, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService);
	}

	override get isTransient(): boolean {
		return true;
	}

	protected override saveState(): void {
		// owned by the test
	}
}

suite('Editor Parts', () => {

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	async function createServices() {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		instantiationService.stub(IAuxiliaryWindowService, new class extends mock<IAuxiliaryWindowService>() { override getWindow() { return undefined; } }());
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		// The main part renders into the main window, like the other parts of the test
		const mainContainer = parts.testMainPart.getContainer()!;
		mainWindow.document.body.appendChild(mainContainer);
		disposables.add({ dispose: () => mainContainer.remove() });

		return { instantiationService, parts };
	}

	function createOwnedPart(instantiationService: IInstantiationService, parts: TestEditorParts): TestOwnedEditorPart {
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add({ dispose: () => container.remove() });

		const part = disposables.add(instantiationService.createInstance(TestOwnedEditorPart, parts));
		disposables.add(parts.registerPart(part));
		part.create(container);
		part.layout(400, 300, 0, 0);

		return part;
	}

	function groupElementOf(part: EditorPart): HTMLElement {
		return part.getGroups(GroupsOrder.CREATION_TIME)[0].element;
	}

	function createPartGridArea(): HTMLElement {
		const grid = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		grid.classList.add(PART_GRID_CLASS);
		disposables.add({ dispose: () => grid.remove() });

		return grid.appendChild(mainWindow.document.createElement('div'));
	}

	function focusIn(element: HTMLElement): HTMLElement {
		const focusable = element.appendChild(mainWindow.document.createElement('div'));
		focusable.tabIndex = 0;
		focusable.focus();
		// the test window may not have focus, which leaves out focus events
		focusable.dispatchEvent(new FocusEvent('focus'));
		focusable.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

		return focusable;
	}

	test('a part created with services and what it shows can still use their instantiation services while they dispose, as the part closes', async () => {
		const { instantiationService } = await createServices();
		// A real instantiation service, whose children are disposed with it, unlike those of the test one.
		const workbenchInstantiationService = disposables.add(new InstantiationService(new ServiceCollection(), false, instantiationService));
		const parts = await createEditorParts(workbenchInstantiationService, disposables);
		const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		disposables.add({ dispose: () => container.remove() });
		const part = parts.createEditorPart({ container, services: new ServiceCollection() });
		const used: string[] = [];
		const listener = part.onWillDispose(() => {
			try {
				parts.getScopedInstantiationService(part).invokeFunction(() => used.push('part'));
				workbenchInstantiationService.invokeFunction(() => used.push('workbench'));
			} catch (error) {
				used.push(String(error));
			}
		});

		part.close();
		listener.dispose();

		assert.deepStrictEqual(used, ['part', 'workbench']);
	});

	test('a part whose groups hide their lock actions binds that in the context of each of its groups, also of groups added later', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: () => disposables.add(new ContextKeyService(new TestConfigurationService())) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		instantiationService.stub(IAuxiliaryWindowService, new class extends mock<IAuxiliaryWindowService>() { override getWindow() { return undefined; } }());
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);
		const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		disposables.add({ dispose: () => container.remove() });
		const part = parts.createEditorPart({ container, groupViewOptions: { hideLockActions: true } satisfies IEditorGroupViewOptions });
		disposables.add({ dispose: () => part.close() });
		part.addGroup(part.activeGroup, GroupDirection.RIGHT);

		const hidden = (group: IEditorGroup) => (group as IEditorGroupView).scopedContextKeyService.getContextKeyValue(EditorGroupLockActionsHiddenContext.key) ?? false;
		assert.deepStrictEqual({ part: part.groups.map(hidden), mainPart: parts.mainPart.groups.map(hidden) }, { part: [true, true], mainPart: [false] });
	});

	test('several parts in one window: an element resolves to the closest part containing it', async () => {
		const { instantiationService, parts } = await createServices();
		const partA = createOwnedPart(instantiationService, parts);
		const partB = createOwnedPart(instantiationService, parts);

		const inMain = parts.testMainPart.getContainer()!.appendChild(mainWindow.document.createElement('div'));
		const inA = partA.getContainer()!.appendChild(mainWindow.document.createElement('div'));
		const inB = partB.getContainer()!.appendChild(mainWindow.document.createElement('div'));

		assert.deepStrictEqual({
			main: parts.getPart(inMain) === parts.mainPart,
			a: parts.getPart(inA) === partA,
			b: parts.getPart(inB) === partB,
			rootOfA: parts.getPart(partA.getContainer()!) === partA,
			groupOfB: parts.getPart(partB.activeGroup.id) === partB
		}, { main: true, a: true, b: true, rootOfA: true, groupOfB: true });
	});

	test('the active part of a window is the part with focus; with focus in the grid of its parts but in no part, its main part; elsewhere, the part active last', async () => {
		const { instantiationService, parts } = await createServices();
		const partA = createOwnedPart(instantiationService, parts);
		const partB = createOwnedPart(instantiationService, parts);
		const titleRow = createPartGridArea();
		const quickInput = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		disposables.add({ dispose: () => quickInput.remove() });

		const nameOf = (part: EditorPart) => part === parts.mainPart ? 'main' : part === partA ? 'a' : part === partB ? 'b' : 'other';
		const activePartWithFocusIn = (element: HTMLElement) => {
			focusIn(element);
			return nameOf(parts.activePart);
		};

		const focusInA = activePartWithFocusIn(groupElementOf(partA));
		const focusInB = activePartWithFocusIn(groupElementOf(partB));
		const focusInQuickInput = activePartWithFocusIn(quickInput); // B stays active, as it was active last
		const focusInTitleRow = activePartWithFocusIn(titleRow);
		const focusInMain = activePartWithFocusIn(parts.testMainPart.getContainer()!);

		assert.deepStrictEqual({ focusInA, focusInB, focusInQuickInput, focusInTitleRow, focusInMain }, { focusInA: 'a', focusInB: 'b', focusInQuickInput: 'b', focusInTitleRow: 'main', focusInMain: 'main' });
	});

	test('a part inside another part is the active part with focus in it', async () => {
		const { instantiationService, parts } = await createServices();
		const outer = createOwnedPart(instantiationService, parts);
		const inner = disposables.add(instantiationService.createInstance(TestOwnedEditorPart, parts));
		disposables.add(parts.registerPart(inner));
		inner.create(outer.getContainer()!.appendChild(mainWindow.document.createElement('div')));
		inner.layout(200, 100, 0, 0);

		focusIn(inner.getContainer()!);

		assert.deepStrictEqual({ inner: parts.activePart === inner, element: parts.getPart(mainWindow.document.activeElement as HTMLElement) === inner }, { inner: true, element: true });
	});

	test('focus leaving a part for elsewhere in the grid of the parts of a window announces the active group of the window; an overlay keeps the active group', async () => {
		const { instantiationService, parts } = await createServices();
		const partA = createOwnedPart(instantiationService, parts);
		const titleRow = createPartGridArea();
		const quickInput = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		disposables.add({ dispose: () => quickInput.remove() });

		focusIn(groupElementOf(partA));
		const announced: string[] = [];
		disposables.add(parts.onDidChangeActiveGroup(group => announced.push(group === parts.mainPart.activeGroup ? 'main' : group === partA.activeGroup ? 'a' : 'other')));

		focusIn(quickInput);
		const activeWithQuickInput = parts.activeGroup === partA.activeGroup;
		focusIn(titleRow);
		focusIn(titleRow); // no change, no event

		assert.deepStrictEqual({ activeWithQuickInput, announced, active: parts.activeGroup === parts.mainPart.activeGroup }, { activeWithQuickInput: true, announced: ['main'], active: true });
	});

	test('a window with a single part gets no extra active group events from focus leaving it', async () => {
		const { parts } = await createServices();
		const outside = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		disposables.add({ dispose: () => outside.remove() });

		let events = 0;
		disposables.add(parts.onDidChangeActiveGroup(() => events++));
		const eventsOf = (fn: () => void) => { const before = events; fn(); return events - before; };

		focusIn(parts.testMainPart.getContainer()!);
		const leavingMain = eventsOf(() => focusIn(outside));

		const modalPart = await parts.createModalEditorPart();
		modalPart.activeGroup.focus();
		const leavingModal = eventsOf(() => focusIn(outside));
		await modalPart.close();

		assert.deepStrictEqual({ leavingMain, leavingModal }, { leavingMain: 0, leavingModal: 0 });
	});

	test('a modal part stays the active part while it was the last active part, also with focus in no part', async () => {
		const { instantiationService, parts } = await createServices();
		createOwnedPart(instantiationService, parts);

		const outside = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		disposables.add({ dispose: () => outside.remove() });

		const modalPart = await parts.createModalEditorPart();
		modalPart.activeGroup.focus();
		focusIn(outside);

		const modalIsActive = (parts.activePart as IEditorPart) === modalPart;

		await modalPart.close();

		assert.deepStrictEqual({ modalIsActive, mainIsActiveAfterClose: parts.activePart === parts.mainPart }, { modalIsActive: true, mainIsActiveAfterClose: true });
	});

	test('applying a working set focuses the part active last among those of working sets, not a part owned by someone else', async () => {
		const { instantiationService, parts } = await createServices();
		const owned = createOwnedPart(instantiationService, parts);
		parts.testMainPart.activeGroup.focus();
		focusIn(groupElementOf(owned)); // the owned part is the most recently active one

		const workingSet = parts.saveWorkingSet('test');
		await parts.applyWorkingSet(workingSet);
		parts.deleteWorkingSet(workingSet);

		assert.strictEqual(parts.getPart(mainWindow.document.activeElement as HTMLElement), parts.mainPart);
	});

	test('restoring state keeps parts owned by someone else in their place among the most recently active parts', async () => {
		const { instantiationService, parts } = await createServices();
		const owned = createOwnedPart(instantiationService, parts);
		focusIn(groupElementOf(owned));
		focusIn(groupElementOf(parts.testMainPart)); // main is the most recent, then the owned part

		// Only a state with auxiliary parts rebuilds the list of the most recently active parts
		parts.createAuxiliaryEditorPart = () => Promise.reject(new Error('not created'));
		await (parts as unknown as { restoreState(state: { auxiliary: unknown[]; mru: number[] }): Promise<void> }).restoreState({ auxiliary: [{}], mru: [0] });

		const order = parts.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE).map(group => group === parts.mainPart.activeGroup ? 'main' : group === owned.activeGroup ? 'owned' : 'other');
		assert.deepStrictEqual(order, ['main', 'owned']);
	});

	test('owned parts are not part of the persisted state, labels or working sets', async () => {
		const { instantiationService, parts } = await createServices();
		const owned = createOwnedPart(instantiationService, parts);
		owned.activeGroup.focus();

		const workingSet = parts.saveWorkingSet('test');
		const applied = await parts.applyWorkingSet(workingSet);

		assert.deepStrictEqual({
			applied,
			ownedStaysRegistered: parts.parts.includes(owned),
			ownedGroupStays: owned.groups.length === 1,
			hasRestorableState: parts.hasRestorableState === parts.testMainPart.hasRestorableState
		}, { applied: true, ownedStaysRegistered: true, ownedGroupStays: true, hasRestorableState: true });

		parts.deleteWorkingSet(workingSet);
	});

	async function moveGroupAcrossParts(inputs: (instantiationService: IInstantiationService) => EditorInput[]) {
		const { instantiationService, parts } = await createServices();
		const partA = createOwnedPart(instantiationService, parts);
		const partB = createOwnedPart(instantiationService, parts);

		let confirmations = 0;
		const fileDialogService = instantiationService.invokeFunction(accessor => accessor.get(IFileDialogService));
		const showSaveConfirm = fileDialogService.showSaveConfirm.bind(fileDialogService);
		fileDialogService.showSaveConfirm = async (...args: Parameters<IFileDialogService['showSaveConfirm']>) => { confirmations++; return showSaveConfirm(...args); };

		const editors = inputs(instantiationService);
		const sourceGroup = partA.activeGroup;
		for (const editor of editors) {
			await sourceGroup.openEditor(editor, { pinned: true });
		}
		partA.addGroup(sourceGroup, GroupDirection.RIGHT);

		const movedGroup = partA.moveGroup(sourceGroup, partB.activeGroup, GroupDirection.RIGHT);

		return {
			editors,
			confirmations,
			sourceRemoved: !partA.groups.includes(sourceGroup),
			partACount: partA.count,
			partAEditors: partA.groups.flatMap(group => group.editors),
			partBCount: partB.count,
			targetEditors: movedGroup.editors
		};
	}

	test('moving a group into a group of another part leaves its editors only in the target', async () => {
		const first = disposables.add(new TestFileEditorInput(URI.file('/first.txt'), 'testTypeId'));
		const second = disposables.add(new TestFileEditorInput(URI.file('/second.txt'), 'testTypeId'));
		const result = await moveGroupAcrossParts(() => [first, second]);

		assert.deepStrictEqual({
			sourceRemoved: result.sourceRemoved,
			partACount: result.partACount,
			partAEditors: result.partAEditors.length,
			partBCount: result.partBCount,
			targetEditors: result.targetEditors.map(editor => editor.resource?.path),
			disposed: [first.gotDisposed, second.gotDisposed]
		}, { sourceRemoved: true, partACount: 1, partAEditors: 0, partBCount: 2, targetEditors: ['/first.txt', '/second.txt'], disposed: [false, false] });
	});

	test('moving a group with a dirty editor into another part moves it without confirmation and keeps it dirty and alive', async () => {
		const clean = disposables.add(new TestFileEditorInput(URI.file('/clean.txt'), 'testTypeId'));
		const dirty = disposables.add(new TestFileEditorInput(URI.file('/dirty.txt'), 'testTypeId'));
		dirty.setDirty();
		const result = await moveGroupAcrossParts(() => [clean, dirty]);

		assert.deepStrictEqual({
			sourceRemoved: result.sourceRemoved,
			partAEditors: result.partAEditors.length,
			targetEditors: result.targetEditors.map(editor => editor.resource?.path),
			confirmations: result.confirmations,
			dirty: dirty.isDirty(),
			disposed: [clean.gotDisposed, dirty.gotDisposed]
		}, { sourceRemoved: true, partAEditors: 0, targetEditors: ['/clean.txt', '/dirty.txt'], confirmations: 0, dirty: true, disposed: [false, false] });
	});

	test('moving a group with a dirty untitled editor into another part keeps its content and working copy', async () => {
		let untitled!: UntitledTextEditorInput;
		const result = await moveGroupAcrossParts(instantiationService => {
			const model = disposables.add(instantiationService.invokeFunction(accessor => accessor.get(IUntitledTextEditorService)).create({ initialValue: 'content' }));
			untitled = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, model));
			return [untitled];
		});
		const resolvedModel = await untitled.resolve();
		resolvedModel.textEditorModel?.setValue('changed');

		assert.deepStrictEqual({
			sourceRemoved: result.sourceRemoved,
			partAEditors: result.partAEditors.length,
			targetIsSameInput: result.targetEditors.length === 1 && result.targetEditors[0] === untitled,
			confirmations: result.confirmations,
			dirty: untitled.isDirty(),
			disposed: untitled.isDisposed(),
			content: resolvedModel.textEditorModel?.getValue()
		}, { sourceRemoved: true, partAEditors: 0, targetIsSameInput: true, confirmations: 0, dirty: true, disposed: false, content: 'changed' });
	});

	test('closing all editors without confirming closes a dirty editor that is open in a group of another part, but keeps one that is open only here', async () => {
		const { instantiationService, parts } = await createServices();
		const partA = createOwnedPart(instantiationService, parts);
		const partB = createOwnedPart(instantiationService, parts);

		const shared = disposables.add(new TestFileEditorInput(URI.file('/shared.txt'), 'testTypeId'));
		const only = disposables.add(new TestFileEditorInput(URI.file('/only.txt'), 'testTypeId'));
		shared.setDirty();
		only.setDirty();

		await partA.activeGroup.openEditor(shared, { pinned: true });
		await partA.activeGroup.openEditor(only, { pinned: true });
		await partB.activeGroup.openEditor(shared, { pinned: true });

		const closed = partA.activeGroup.closeAllEditors({ excludeConfirming: true, force: true });

		assert.deepStrictEqual({
			closed,
			partA: partA.activeGroup.editors.map(editor => editor.resource?.path),
			partB: partB.activeGroup.editors.map(editor => editor.resource?.path),
			sharedDirtyAndAlive: shared.isDirty() && !shared.gotDisposed,
			onlyDirtyAndAlive: only.isDirty() && !only.gotDisposed
		}, { closed: true, partA: ['/only.txt'], partB: ['/shared.txt'], sharedDirtyAndAlive: true, onlyDirtyAndAlive: true });
	});

	test('closing a dirty editor that is open only in its group asks for confirmation (the spy counts it)', async () => {
		const { instantiationService, parts } = await createServices();
		const part = createOwnedPart(instantiationService, parts);

		let confirmations = 0;
		const fileDialogService = instantiationService.invokeFunction(accessor => accessor.get(IFileDialogService));
		fileDialogService.showSaveConfirm = async () => { confirmations++; return ConfirmResult.CANCEL; };

		const only = disposables.add(new TestFileEditorInput(URI.file('/only.txt'), 'testTypeId'));
		only.setDirty();
		await part.activeGroup.openEditor(only, { pinned: true });

		await part.activeGroup.closeAllEditors({ force: true });

		assert.deepStrictEqual({ confirmations, editors: part.activeGroup.editors.length }, { confirmations: 1, editors: 1 });
	});
});
