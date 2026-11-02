/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { LocalSelectionTransfer } from '../../../../../platform/dnd/browser/dnd.js';
import { MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { DraggedEditorIdentifier, registerContentDropTarget } from '../../../../browser/dnd.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../browser/editor.js';
import { IEditorGroupView } from '../../../../browser/parts/editor/editor.js';
import { ViewEditorInput } from '../../../../browser/parts/editor/viewEditorInput.js';
import { ViewEditorPane } from '../../../../browser/parts/editor/viewEditorPane.js';
import { IViewEditorRegistry, IViewEditorView, ViewEditorExtensions } from '../../../../browser/parts/editor/viewEditorRegistry.js';
import { EditorExtensions, EditorInputCapabilities, IEditorFactoryRegistry } from '../../../../common/editor.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';
import { createEditorParts, registerTestEditor, TestEditorParts, TestFileEditorInput, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IAuxiliaryWindowService } from '../../../auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IStatusbarService } from '../../../statusbar/browser/statusbar.js';
import { EditorService } from '../../browser/editorService.js';
import { IContentPart, IEditorGroup, IEditorGroupsService } from '../../common/editorGroupsService.js';
import { ACTIVE_GROUP, IEditorService } from '../../common/editorService.js';

class TestView implements IViewEditorView {

	readonly element = mainWindow.document.createElement('div');

	private readonly _onDidChange = new Emitter<{ width: number; height: number } | undefined>();
	readonly onDidChange = this._onDidChange.event;

	readonly minimumWidth = 100;
	readonly maximumWidth = Number.POSITIVE_INFINITY;
	readonly minimumHeight = 40;
	maximumHeight = 400;

	readonly dragHandle: HTMLElement | undefined;

	constructor(readonly providesTitle: boolean, readonly instantiationService: IInstantiationService, private readonly log: string[], private readonly name: string) {
		log.push(`create ${name}`);
		if (providesTitle) {
			this.dragHandle = this.element.appendChild(mainWindow.document.createElement('div'));
		}
	}

	saveViewState(): void {
		this.log.push(`save ${this.name}`);
	}

	setMaximumHeight(height: number): void {
		this.maximumHeight = height;
		this._onDidChange.fire(undefined);
	}

	layout(width: number, height: number): void {
		this.element.style.width = `${width}px`;
		this.element.style.height = `${height}px`;
	}

	focus(): void { }

	dispose(): void {
		this._onDidChange.dispose();
	}
}

suite('View Editors', () => {

	const TEST_EDITOR_ID = 'MyFileEditorForViewEditors';
	const TEST_EDITOR_INPUT_ID = 'testEditorInputForViewEditors';

	const disposables = new DisposableStore();
	const views: TestView[] = [];
	const log: string[] = [];
	const editorTransfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();

	setup(() => {
		disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput), new SyncDescriptor(SideBySideEditorInput)], TEST_EDITOR_INPUT_ID));
		disposables.add(Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(ViewEditorPane, ViewEditorPane.ID, 'View Editor'), [new SyncDescriptor(ViewEditorInput)]));
		for (const providesTitle of [true, false]) {
			disposables.add(Registry.as<IViewEditorRegistry>(ViewEditorExtensions.ViewEditors).register({
				viewType: providesTitle ? 'test.titled' : 'test.untitled',
				name: providesTitle ? 'Titled View' : 'Untitled View',
				createView: instantiationService => {
					const view = new TestView(providesTitle, instantiationService, log, `view${views.length + 1}`);
					views.push(view);
					return view;
				}
			}));
		}
	});

	teardown(() => {
		views.length = 0;
		log.length = 0;
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createViewInput(viewType: string, path?: string): ViewEditorInput {
		return disposables.add(new ViewEditorInput(viewType, path ? URI.file(path) : undefined));
	}

	async function createServices() {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		instantiationService.stub(IAuxiliaryWindowService, new class extends mock<IAuxiliaryWindowService>() { override getWindow() { return undefined; } }());
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);
		instantiationService.stub(IStatusbarService, new class extends mock<IStatusbarService>() { override createScoped() { return this; } }());
		const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
		instantiationService.stub(IEditorService, editorService);

		const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		const part = parts.createEditorPart({ container });
		part.layout(800, 600, 0, 0);
		disposables.add({ dispose: () => { part.close(); container.remove(); } });

		return { parts, editorService, part };
	}

	function groupViewOf(parts: TestEditorParts, group: IEditorGroup): IEditorGroupView {
		return parts.getGroup(group.id)!;
	}

	test('the registry hands out registered views; a view type registers once', () => {
		const registry = Registry.as<IViewEditorRegistry>(ViewEditorExtensions.ViewEditors);

		let duplicate = false;
		try {
			registry.register({ viewType: 'test.titled', name: 'Again', createView: () => { throw new Error('unused'); } });
		} catch {
			duplicate = true;
		}

		const registration = registry.register({ viewType: 'test.other', name: 'Other', createView: () => { throw new Error('unused'); } });
		const registered = !!registry.get('test.other');
		registration.dispose();

		assert.deepStrictEqual({ duplicate, registered, unregistered: !registry.get('test.other'), name: createViewInput('test.titled').getName() }, { duplicate: true, registered: true, unregistered: true, name: 'Titled View' });
	});

	test('an input matches the same view type and resource, and shows in one group only', () => {
		const input = createViewInput('test.titled', '/chat/a');

		assert.deepStrictEqual({
			sameTypeAndResource: input.matches(createViewInput('test.titled', '/chat/a')),
			otherResource: input.matches(createViewInput('test.titled', '/chat/b')),
			otherType: input.matches(createViewInput('test.untitled', '/chat/a')),
			singleton: input.hasCapability(EditorInputCapabilities.Singleton)
		}, { sameTypeAndResource: true, otherResource: false, otherType: false, singleton: true });
	});

	test('opening the same view again reveals it instead of showing it twice', async () => {
		const { parts, editorService, part } = await createServices();
		await part.activeGroup.openEditor(createViewInput('test.titled', '/chat/a'));
		await parts.mainPart.activeGroup.openEditor(disposables.add(new TestFileEditorInput(URI.file('/main.txt'), TEST_EDITOR_INPUT_ID)));

		const pane = await editorService.openEditor(createViewInput('test.titled', '/chat/a'));

		assert.deepStrictEqual({ revealedInPart: pane?.group.id === part.activeGroup.id, views: views.length, inMain: parts.mainPart.activeGroup.editors.some(editor => editor instanceof ViewEditorInput) }, { revealedInPart: true, views: 1, inMain: false });
	});

	test('the view\'s size constraints are the group\'s, and changes reach it', async () => {
		const { parts, part } = await createServices();
		const group = groupViewOf(parts, part.activeGroup);
		await part.activeGroup.openEditor(createViewInput('test.titled', '/chat/a'));

		const initial = group.maximumHeight;
		let changes = 0;
		disposables.add(group.onDidChange(() => changes++));
		views[0].setMaximumHeight(120);

		assert.deepStrictEqual({ initial, minimum: group.minimumHeight, updated: group.maximumHeight, changed: changes > 0 }, { initial: 400, minimum: 40, updated: 120, changed: true });
	});

	test('a group hides its title area only while it holds one editor whose pane provides its title', async () => {
		const { parts, part } = await createServices();
		const group = groupViewOf(parts, part.activeGroup);
		const titleShownIn = (group: IEditorGroupView) => group.element.querySelector<HTMLElement>(':scope > .title')!.style.display !== 'none' && !group.element.classList.contains('title-provided-by-editor');
		const titleShown = () => titleShownIn(group);

		const titled = createViewInput('test.titled', '/chat/a');
		await part.activeGroup.openEditor(titled, { pinned: true });
		const onlyTitledView = titleShown();

		const file = disposables.add(new TestFileEditorInput(URI.file('/second.txt'), TEST_EDITOR_INPUT_ID));
		await part.activeGroup.openEditor(file, { pinned: true });
		const withSecondEditor = titleShown();

		await part.activeGroup.closeEditor(file);
		await part.activeGroup.openEditor(titled); // the remaining editor shows
		const afterClosingSecond = titleShown();

		const untitled = createViewInput('test.untitled', '/chat/b');
		await part.activeGroup.openEditor(untitled, { pinned: true });
		await part.activeGroup.closeEditor(titled);
		await part.activeGroup.openEditor(untitled); // the remaining editor shows
		const onlyUntitledView = titleShown();

		assert.deepStrictEqual({ onlyTitledView, withSecondEditor, afterClosingSecond, onlyUntitledView, mainPart: titleShownIn(groupViewOf(parts, parts.mainPart.activeGroup)) }, {
			onlyTitledView: false,
			withSecondEditor: true,
			afterClosingSecond: false,
			onlyUntitledView: true,
			mainPart: true
		});
	});

	test('a view opens other editors in the main part of its window, not beside itself', async () => {
		const { parts, part } = await createServices();
		await part.activeGroup.openEditor(createViewInput('test.titled', '/chat/a'));

		const file = disposables.add(new TestFileEditorInput(URI.file('/from-view.txt'), TEST_EDITOR_INPUT_ID));
		await views[0].instantiationService.invokeFunction(accessor => accessor.get(IEditorService)).openEditor(file);

		assert.deepStrictEqual({ main: parts.mainPart.groups.some(group => group.contains(file)), part: (part as IContentPart).groups.some(group => group.contains(file)) }, { main: true, part: false });
	});

	test('opens to the active group of a group that shows only a view with its own title go to the main part of its window', async () => {
		const { parts, editorService, part } = await createServices();
		const focusIn = (element: HTMLElement) => {
			const focusable = element.appendChild(mainWindow.document.createElement('div'));
			focusable.tabIndex = 0;
			focusable.focus();
		};
		const where = (input: TestFileEditorInput) => parts.mainPart.groups.some(group => group.contains(input)) ? 'main' : (part as IContentPart).groups.some(group => group.contains(input)) ? 'part' : 'none';
		const open = async (path: string, group?: typeof ACTIVE_GROUP) => {
			const input = disposables.add(new TestFileEditorInput(URI.file(path), TEST_EDITOR_INPUT_ID));
			focusIn(part.element as HTMLElement);
			await editorService.openEditor(input, { pinned: true }, group);
			return where(input);
		};

		const titled = createViewInput('test.titled', '/chat/a');
		await part.activeGroup.openEditor(titled, { pinned: true });
		const onlyTitledView = await open('/only-titled.txt');
		const onlyTitledViewActiveGroup = await open('/only-titled-active.txt', ACTIVE_GROUP);

		await part.activeGroup.openEditor(disposables.add(new TestFileEditorInput(URI.file('/second.txt'), TEST_EDITOR_INPUT_ID)), { pinned: true });
		const withSecondEditor = await open('/with-second.txt');

		await part.activeGroup.closeAllEditors();
		await part.activeGroup.openEditor(createViewInput('test.untitled', '/chat/b'), { pinned: true });
		const onlyUntitledView = await open('/only-untitled.txt');

		const mainContainer = mainWindow.document.body.appendChild(parts.testMainPart.getContainer()!);
		disposables.add({ dispose: () => mainContainer.remove() });
		focusIn(mainContainer);
		const fromMain = disposables.add(new TestFileEditorInput(URI.file('/from-main.txt'), TEST_EDITOR_INPUT_ID));
		await editorService.openEditor(fromMain, { pinned: true });

		assert.deepStrictEqual({ onlyTitledView, onlyTitledViewActiveGroup, withSecondEditor, onlyUntitledView, mainWindow: where(fromMain) }, {
			onlyTitledView: 'main',
			onlyTitledViewActiveGroup: 'main',
			withSecondEditor: 'part',
			onlyUntitledView: 'part',
			mainWindow: 'main'
		});
	});

	test('a view saves its state before its editor moves to another group, where it is created again, and before its pane clears its input', async () => {
		const { parts, part } = await createServices();
		const view = createViewInput('test.titled', '/chat/a');
		await part.activeGroup.openEditor(view, { pinned: true });

		await parts.mainPart.activeGroup.openEditor(disposables.add(new TestFileEditorInput(URI.file('/main.txt'), TEST_EDITOR_INPUT_ID)), { pinned: true });
		part.activeGroup.moveEditor(view, parts.mainPart.activeGroup);
		await parts.mainPart.activeGroup.openEditor(view);
		const onMove = [...log];

		log.length = 0;
		await parts.mainPart.activeGroup.openEditor(disposables.add(new TestFileEditorInput(URI.file('/other.txt'), TEST_EDITOR_INPUT_ID)), { pinned: true });
		await parts.mainPart.activeGroup.closeEditor(view);
		const onClear = [...log];

		assert.deepStrictEqual({ onMove, onClear }, {
			onMove: ['create view1', 'save view1', 'create view2'],
			onClear: ['save view2']
		});
	});

	function createPart(parts: TestEditorParts): IContentPart {
		const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		const part = parts.createEditorPart({ container });
		part.layout(800, 600, 0, 0);
		disposables.add({ dispose: () => { part.close(); container.remove(); } });

		return part;
	}

	function dispatch(target: Element, type: string, clientX = 0, clientY = 0): void {
		target.dispatchEvent(new DragEvent(type, { dataTransfer: new DataTransfer(), clientX, clientY, bubbles: true, cancelable: true }));
	}

	function getOverlay(group: IEditorGroupView): HTMLElement | null {
		return group.element.querySelector<HTMLElement>('#monaco-workbench-editor-drop-overlay');
	}

	async function drop(group: IEditorGroupView, clientX: number, clientY: number): Promise<void> {
		dispatch(group.element, 'dragenter', clientX, clientY);
		const overlay = getOverlay(group);
		if (overlay) {
			dispatch(overlay, 'dragover', clientX, clientY);
		}
		dispatch(getOverlay(group) ?? group.element, 'drop', clientX, clientY);
		await timeout(0);
	}

	test('the view\'s drag handle drags its editor like a tab, and it moves into another part', async () => {
		const { parts, part } = await createServices();
		const other = createPart(parts);
		const input = createViewInput('test.titled', '/chat/a');
		await part.activeGroup.openEditor(input);

		const handle = views[0].dragHandle!;
		const draggable = handle.draggable;
		dispatch(handle, 'dragstart');
		const transfer = editorTransfer.getData(DraggedEditorIdentifier.prototype)?.map(({ identifier }) => ({ editor: identifier.editor === input, groupId: identifier.groupId === part.activeGroup.id }));

		const target = groupViewOf(parts, other.activeGroup);
		const bounds = target.element.getBoundingClientRect();
		await drop(target, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);

		assert.deepStrictEqual({ draggable, transfer, inSource: part.groups.some(group => group.contains(input)), inTarget: other.activeGroup.contains(input), transferAfterDrop: editorTransfer.hasData(DraggedEditorIdentifier.prototype) }, {
			draggable: true,
			transfer: [{ editor: true, groupId: true }],
			inSource: false,
			inTarget: true,
			transferAfterDrop: false
		});
	});

	test('an editor dropped on the edge of a part holding a view that handles drops splits the part; its center stays the view\'s', async () => {
		const { parts, part } = await createServices();
		await part.activeGroup.openEditor(createViewInput('test.titled', '/chat/a'));
		disposables.add(registerContentDropTarget(views[0].element));
		const group = groupViewOf(parts, part.activeGroup);
		const bounds = group.element.getBoundingClientRect();

		const dragFile = async (path: string, clientX: number, clientY: number) => {
			const file = disposables.add(new TestFileEditorInput(URI.file(path), TEST_EDITOR_INPUT_ID));
			await parts.mainPart.activeGroup.openEditor(file, { pinned: true });
			editorTransfer.setData([new DraggedEditorIdentifier({ editor: file, groupId: parts.mainPart.activeGroup.id })], DraggedEditorIdentifier.prototype);
			await drop(group, clientX, clientY);
			editorTransfer.clearData(DraggedEditorIdentifier.prototype);
			return file;
		};

		const center = await dragFile('/center.txt', bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
		const afterCenter = { groups: part.groups.length, inPart: part.groups.some(group => group.contains(center)) };

		const edge = await dragFile('/edge.txt', bounds.left + bounds.width - 2, bounds.top + bounds.height / 2);
		const afterEdge = { groups: part.groups.length, inNewGroup: part.groups.some(other => other.id !== group.id && other.contains(edge)), inMain: parts.mainPart.groups.some(group => group.contains(edge)) };

		assert.deepStrictEqual({ afterCenter, afterEdge }, {
			afterCenter: { groups: 1, inPart: false },
			afterEdge: { groups: 2, inNewGroup: true, inMain: false }
		});
	});

	test('the view\'s drag handle lets what contains it add to its drag, and does not start one from a text field in it', async () => {
		const { part } = await createServices();
		await part.activeGroup.openEditor(createViewInput('test.titled', '/chat/a'));
		const handle = views[0].dragHandle!;
		const field = handle.appendChild(mainWindow.document.createElement('input'));

		let reachedContainer = 0;
		const listener = () => reachedContainer++;
		views[0].element.addEventListener('dragstart', listener);

		const fromField = new DragEvent('dragstart', { dataTransfer: new DataTransfer(), bubbles: true, cancelable: true });
		field.dispatchEvent(fromField);
		const transferFromField = editorTransfer.hasData(DraggedEditorIdentifier.prototype);

		dispatch(handle, 'dragstart');
		const transferFromHandle = editorTransfer.hasData(DraggedEditorIdentifier.prototype);
		dispatch(handle, 'dragend');
		views[0].element.removeEventListener('dragstart', listener);

		assert.deepStrictEqual({ fromFieldCancelled: fromField.defaultPrevented, transferFromField, transferFromHandle, reachedContainer, transferAfterEnd: editorTransfer.hasData(DraggedEditorIdentifier.prototype) }, {
			fromFieldCancelled: true,
			transferFromField: false,
			transferFromHandle: true,
			reachedContainer: 2, // the cancelled drag from the text field, and the handle's drag
			transferAfterEnd: false
		});
	});
});
