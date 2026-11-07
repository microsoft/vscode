/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { LocalSelectionTransfer } from '../../../../../platform/dnd/browser/dnd.js';
import { MockContextKeyService, MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { DraggedEditorIdentifier, registerContentDropTarget } from '../../../../browser/dnd.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../browser/editor.js';
import { IEditorGroupView, IEditorPaneTitleMenu } from '../../../../browser/parts/editor/editor.js';
import { ViewEditorInput } from '../../../../browser/parts/editor/viewEditorInput.js';
import { ViewEditorPane } from '../../../../browser/parts/editor/viewEditorPane.js';
import { IViewEditorRegistry, IViewEditorView, ViewEditorExtensions } from '../../../../browser/parts/editor/viewEditorRegistry.js';
import { EditorExtensions, EditorInputCapabilities, EditorsOrder, IEditorFactoryRegistry } from '../../../../common/editor.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';
import { createEditorParts, registerTestEditor, TestEditorParts, TestFileEditorInput, TestMenuService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IAuxiliaryWindowService } from '../../../auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IStatusbarService } from '../../../statusbar/browser/statusbar.js';
import { EditorService } from '../../browser/editorService.js';
import { GroupDirection, GroupsOrder, IContentPart, IEditorGroup, IEditorGroupsService } from '../../common/editorGroupsService.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../common/editorService.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { IMenu, IMenuActionOptions, IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';

const TEST_VIEW_TITLE_MENU = MenuId.for('test.viewEditor.viewTitle');

class TestView implements IViewEditorView {

	readonly element = mainWindow.document.createElement('div');

	private readonly _onDidChange = new Emitter<{ width: number; height: number } | undefined>();
	readonly onDidChange = this._onDidChange.event;

	readonly minimumWidth = 100;
	readonly maximumWidth = Number.POSITIVE_INFINITY;
	readonly minimumHeight = 40;
	maximumHeight = 400;

	readonly dragHandle: HTMLElement | undefined;

	/** Whether it shows its own title, as its group last said; undefined until then. */
	providedTitleVisible: boolean | undefined;

	readonly titleMenu: IEditorPaneTitleMenu | undefined;

	constructor(readonly providesTitle: boolean, readonly instantiationService: IInstantiationService, private readonly log: string[], private readonly name: string) {
		log.push(`create ${name}`);
		if (providesTitle) {
			this.dragHandle = this.element.appendChild(mainWindow.document.createElement('div'));
			this.titleMenu = { menuId: TEST_VIEW_TITLE_MENU, contextKeyService: new MockContextKeyService(), options: { args: [name] } };
		}
	}

	setProvidedTitleVisible(visible: boolean): void {
		this.providedTitleVisible = visible;
	}

	saveViewState(): void {
		this.log.push(`save ${this.name}`);
	}

	setVisible(visible: boolean): void {
		this.log.push(`${visible ? 'show' : 'hide'} ${this.name}`);
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

	disposed = false;

	dispose(): void {
		this.disposed = true;
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
				providesTitle,
				createView: instantiationService => {
					const view = new TestView(providesTitle, instantiationService, log, `view${views.length + 1}`);
					views.push(view);
					return view;
				}
			}));
		}
	});

	teardown(() => {
		// What a test leaves open, such as after a failed assertion, closes before the logs reset, so that it does not log into the next test.
		disposables.clear();
		views.length = 0;
		log.length = 0;
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createViewInput(viewType: string, path?: string): ViewEditorInput {
		return disposables.add(new ViewEditorInput(viewType, path ? URI.file(path) : undefined));
	}

	async function createServices(menuService?: IMenuService) {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		if (menuService) {
			instantiationService.stub(IMenuService, menuService);
		}
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

	test('a view that provides its title shows it while alone in its group, and not while the group shows its title, also a view created or shown again then; a view without a title is not told', async () => {
		const { part } = await createServices();
		const titled = createViewInput('test.titled', '/chat/a');
		await part.activeGroup.openEditor(titled, { pinned: true });
		const alone = views[0].providedTitleVisible;

		const file = disposables.add(new TestFileEditorInput(URI.file('/beside.txt'), TEST_EDITOR_INPUT_ID));
		await part.activeGroup.openEditor(file, { pinned: true });
		await part.activeGroup.openEditor(titled);
		const besideAnotherEditor = views[0].providedTitleVisible;

		const second = createViewInput('test.titled', '/chat/b');
		await part.activeGroup.openEditor(second, { pinned: true });
		const createdBesideOthers = views[1].providedTitleVisible;

		await part.activeGroup.closeEditor(file);
		await part.activeGroup.closeEditor(second);
		await part.activeGroup.openEditor(titled);
		const aloneAgain = views[0].providedTitleVisible;

		await part.activeGroup.openEditor(createViewInput('test.untitled', '/chat/c'), { pinned: true });

		assert.deepStrictEqual({ alone, besideAnotherEditor, createdBesideOthers, aloneAgain, untitled: views[2].providedTitleVisible }, {
			alone: true,
			besideAnotherEditor: false,
			createdBesideOthers: false,
			aloneAgain: true,
			untitled: undefined,
		});
	});

	test('a view that stops rendering its title for now has its group show its title area, also alone, and is told not to show its title; rendering it again, it is as before; beside other editors nothing changes; editors opened from its group still go to the main part', async () => {
		const { parts, part } = await createServices();
		const group = groupViewOf(parts, part.activeGroup);
		const titleShown = () => group.element.querySelector<HTMLElement>(':scope > .title')!.style.display !== 'none' && !group.element.classList.contains('title-provided-by-editor');
		const read = () => ({ title: titleShown(), told: views[0].providedTitleVisible });
		const titled = createViewInput('test.titled', '/chat/a');
		titled.setRendersTitle(false);
		await part.activeGroup.openEditor(titled, { pinned: true });
		const aloneNotRendering = read();
		titled.setRendersTitle(true);
		const aloneRendering = read();
		titled.setRendersTitle(false);
		const aloneStopped = read();

		const file = disposables.add(new TestFileEditorInput(URI.file('/beside.txt'), TEST_EDITOR_INPUT_ID));
		await part.activeGroup.openEditor(file, { pinned: true });
		await part.activeGroup.openEditor(titled);
		const besideNotRendering = read();
		titled.setRendersTitle(true);
		const besideRendering = read();

		titled.setRendersTitle(false);
		const opened = disposables.add(new TestFileEditorInput(URI.file('/from-view.txt'), TEST_EDITOR_INPUT_ID));
		await views[0].instantiationService.invokeFunction(accessor => accessor.get(IEditorService)).openEditor(opened);

		assert.deepStrictEqual({ aloneNotRendering, aloneRendering, aloneStopped, besideNotRendering, besideRendering, capabilityKept: titled.hasCapability(EditorInputCapabilities.ProvidesTitle), openedInMainPart: parts.mainPart.groups.some(group => group.contains(opened)) }, {
			aloneNotRendering: { title: true, told: false },
			aloneRendering: { title: false, told: true },
			aloneStopped: { title: true, told: false },
			besideNotRendering: { title: true, told: false },
			besideRendering: { title: true, told: false },
			capabilityKept: true,
			openedInMainPart: true,
		});
	});

	test('the tab bar shows the actions of the active view\'s own title menu, in its context and with its arguments, and follows it as another view shows; other editors, and other menus of the group, keep the group\'s', async () => {
		const created: { readonly menu: string; readonly ownContext: boolean; options?: IMenuActionOptions }[] = [];
		const menuService = new class extends TestMenuService {
			override createMenu(id: MenuId, contextKeyService: IContextKeyService): IMenu {
				const entry: { readonly menu: string; readonly ownContext: boolean; options?: IMenuActionOptions } = { menu: id.id, ownContext: views.some(view => view.titleMenu?.contextKeyService === contextKeyService) };
				created.push(entry);
				return { onDidChange: Event.None, dispose: () => { }, getActions: options => { entry.options = options; return []; } };
			}
		}();
		const { parts, part } = await createServices(menuService);
		const group = groupViewOf(parts, part.activeGroup);
		const read = (menuId: MenuId, useEditorTitleMenu: boolean) => {
			const store = disposables.add(new DisposableStore());
			created.length = 0;
			let changes = 0;
			store.add(group.createEditorActions(store, menuId, { useEditorTitleMenu }).onDidChange(() => changes++));
			const [menu] = created;
			return { menu: menu.menu, ownContext: menu.ownContext, args: menu.options?.args, changes: () => changes };
		};

		await part.activeGroup.openEditor(createViewInput('test.titled', '/chat/a'), { pinned: true });
		const tabBar = read(MenuId.EditorTitle, true);
		await part.activeGroup.openEditor(createViewInput('test.titled', '/chat/b'), { pinned: true });
		const changedAsAnotherViewShows = tabBar.changes() > 0;
		const secondView = read(MenuId.EditorTitle, true);
		const otherMenu = read(MenuId.EditorTitleLayout, false);
		await part.activeGroup.openEditor(disposables.add(new TestFileEditorInput(URI.file('/beside.txt'), TEST_EDITOR_INPUT_ID)), { pinned: true });
		const fileEditor = read(MenuId.EditorTitle, true);

		const strip = (actions: ReturnType<typeof read>) => ({ menu: actions.menu, ownContext: actions.ownContext, args: actions.args });
		assert.deepStrictEqual({ tabBar: strip(tabBar), changedAsAnotherViewShows, secondView: strip(secondView), otherMenu: strip(otherMenu), fileEditor: strip(fileEditor) }, {
			tabBar: { menu: TEST_VIEW_TITLE_MENU.id, ownContext: true, args: ['view1'] },
			changedAsAnotherViewShows: true,
			secondView: { menu: TEST_VIEW_TITLE_MENU.id, ownContext: true, args: ['view2'] },
			otherMenu: { menu: MenuId.EditorTitleLayout.id, ownContext: false, args: undefined },
			fileEditor: { menu: MenuId.EditorTitle.id, ownContext: false, args: undefined },
		});
	});

	test('a group that shows a header with menus, as the groups of a chat window\'s parts do, still hides its whole title area, header too, while it holds only a view that provides its title', async () => {
		const { parts } = await createServices();
		const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		const part = parts.createEditorPart({ container, groupViewOptions: { showHeader: true, menuIds: { headerPrimary: MenuId.for('test.viewEditor.headerPrimary') } } });
		part.layout(800, 600, 0, 0);
		disposables.add({ dispose: () => { part.close(); container.remove(); } });
		const group = groupViewOf(parts, part.activeGroup);
		const titleShown = () => group.element.querySelector<HTMLElement>(':scope > .title')!.style.display !== 'none' && !group.element.classList.contains('title-provided-by-editor');

		await part.activeGroup.openEditor(createViewInput('test.titled', '/chat/a'), { pinned: true });
		const onlyTitledView = titleShown();
		await part.activeGroup.openEditor(disposables.add(new TestFileEditorInput(URI.file('/beside.txt'), TEST_EDITOR_INPUT_ID)), { pinned: true });

		assert.deepStrictEqual({ onlyTitledView, withSecondEditor: titleShown() }, { onlyTitledView: false, withSecondEditor: true });
	});

	test('a view lives on while another editor beside it, as a tab, shows, and shows again as it was; it goes as its editor closes or moves to another group', async () => {
		const { parts, part } = await createServices();
		const titled = createViewInput('test.titled', '/chat/a');
		const file = disposables.add(new TestFileEditorInput(URI.file('/tab.txt'), TEST_EDITOR_INPUT_ID));
		await part.activeGroup.openEditor(titled, { pinned: true });
		log.length = 0;
		await part.activeGroup.openEditor(file, { pinned: true });
		const whileTabShows = { views: views.length, disposed: views[0].disposed, inDom: views[0].element.isConnected };
		await part.activeGroup.openEditor(titled);
		const shownAgain = { views: views.length, disposed: views[0].disposed, inDom: views[0].element.isConnected, log: [...log] };

		await part.activeGroup.openEditor(file);
		await part.activeGroup.closeEditor(titled);
		const closedWhileHidden = views[0].disposed;

		const moved = createViewInput('test.titled', '/chat/b');
		await part.activeGroup.openEditor(moved, { pinned: true });
		await part.activeGroup.openEditor(file);
		part.activeGroup.moveEditor(moved, parts.mainPart.activeGroup);
		await timeout(0);

		assert.deepStrictEqual({ whileTabShows, shownAgain, closedWhileHidden, movedWhileHidden: views[1].disposed, createdForMove: views.length }, {
			whileTabShows: { views: 1, disposed: false, inDom: false },
			// It is told it hides and shows, so that it does not render or act as seen meanwhile
			shownAgain: { views: 1, disposed: false, inDom: true, log: ['save view1', 'hide view1', 'show view1'] },
			closedWhileHidden: true,
			movedWhileHidden: true,
			createdForMove: 3,
		});
	});

	test('a view opens other editors in the main part of its window, not beside itself', async () => {
		const { parts, part } = await createServices();
		await part.activeGroup.openEditor(createViewInput('test.titled', '/chat/a'));

		const file = disposables.add(new TestFileEditorInput(URI.file('/from-view.txt'), TEST_EDITOR_INPUT_ID));
		await views[0].instantiationService.invokeFunction(accessor => accessor.get(IEditorService)).openEditor(file);

		assert.deepStrictEqual({ main: parts.mainPart.groups.some(group => group.contains(file)), part: (part as IContentPart).groups.some(group => group.contains(file)) }, { main: true, part: false });
	});

	test('opens to the active group of a group that holds a view with its own title go to the main part of its window, also while another editor beside it, as a tab, is active', async () => {
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
			withSecondEditor: 'main',
			onlyUntitledView: 'part',
			mainWindow: 'main'
		});
	});

	test('opens to the active group while a locked group is active, such as of terminals, skip a group that shows only a view with its own title for the main part of its window', async () => {
		const { parts, editorService, part } = await createServices();
		const lockedContainer = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		const lockedPart = parts.createEditorPart({ container: lockedContainer });
		lockedPart.layout(800, 200, 0, 0);
		disposables.add({ dispose: () => { lockedPart.close(); lockedContainer.remove(); } });
		await lockedPart.activeGroup.openEditor(disposables.add(new TestFileEditorInput(URI.file('/terminal.txt'), TEST_EDITOR_INPUT_ID)), { pinned: true });
		lockedPart.activeGroup.lock(true);
		await part.activeGroup.openEditor(createViewInput('test.titled', '/chat/a'), { pinned: true });

		const where = (resource: URI) => parts.mainPart.groups.some(group => group.editors.some(editor => isEqual(editor.resource, resource))) ? 'main' : part.groups.some(group => group.editors.some(editor => isEqual(editor.resource, resource))) ? 'part' : lockedPart.groups.some(group => group.editors.some(editor => isEqual(editor.resource, resource))) ? 'locked' : 'none';
		const open = async (resource: URI, typed: boolean) => {
			// The view's group was focused before the locked one, such as of terminals, where focus was last: it moved on
			// to the quick input that opens the editor
			groupViewOf(parts, part.activeGroup).focus();
			groupViewOf(parts, lockedPart.activeGroup).focus();
			(mainWindow.document.activeElement as HTMLElement | null)?.blur();
			const lockedActive = parts.activeGroup.id === lockedPart.activeGroup.id;
			if (typed) {
				await editorService.openEditor(disposables.add(new TestFileEditorInput(resource, TEST_EDITOR_INPUT_ID)), { pinned: true }, ACTIVE_GROUP);
			} else {
				// As Quick Open opens a file
				await editorService.openEditor({ resource, options: { pinned: true } }, ACTIVE_GROUP);
			}
			return { lockedActive, openedIn: where(resource) };
		};

		assert.deepStrictEqual({ typed: await open(URI.file('/typed.txt'), true), resource: await open(URI.file('/resource.txt'), false) }, {
			typed: { lockedActive: true, openedIn: 'main' },
			resource: { lockedActive: true, openedIn: 'main' }
		});
		await parts.mainPart.activeGroup.closeAllEditors();
		await part.activeGroup.closeAllEditors();
	});

	test('opens to a group by its id, such as an extension\'s column, or to the side of the active group, do not put other editors into a group that holds a view with its own title: they go to the main part of its window; such a view, an explicit group and an editor already in the group still go there', async () => {
		const { parts, editorService, part } = await createServices();
		const where = (resource: URI) => parts.mainPart.groups.some(group => group.editors.some(editor => isEqual(editor.resource, resource))) ? 'main' : part.groups.some(group => group.editors.some(editor => isEqual(editor.resource, resource))) ? 'part' : 'none';
		const file = (path: string) => disposables.add(new TestFileEditorInput(URI.file(path), TEST_EDITOR_INPUT_ID));
		const viewGroup = part.activeGroup;
		const focusIn = (element: HTMLElement) => {
			const focusable = element.appendChild(mainWindow.document.createElement('div'));
			focusable.tabIndex = 0;
			focusable.focus();
		};
		const openAll = async (label: string) => {
			const byId = file(`/${label}-id.txt`);
			await editorService.openEditor(byId, { pinned: true }, viewGroup.id);
			// As an extension's column names a group: by its place among the groups of all parts
			const byColumn = file(`/${label}-column.txt`);
			const groupsByAppearance = parts.getGroups(GroupsOrder.GRID_APPEARANCE);
			await editorService.openEditor(byColumn, { pinned: true }, groupsByAppearance[groupsByAppearance.findIndex(group => group.id === viewGroup.id)].id);
			focusIn(part.element as HTMLElement);
			const viewGroupActive = parts.activeGroup.id === viewGroup.id;
			const toSide = file(`/${label}-side.txt`);
			await editorService.openEditor(toSide, { pinned: true }, SIDE_GROUP);
			return { byId: where(byId.resource), byColumn: where(byColumn.resource), viewGroupActive, toSide: where(toSide.resource), partGroups: part.groups.length };
		};

		await viewGroup.openEditor(createViewInput('test.titled', '/chat/a'), { pinned: true });
		const oneView = await openAll('one');
		await viewGroup.openEditor(createViewInput('test.titled', '/chat/b'), { pinned: true });
		const twoViews = await openAll('two');

		const view = createViewInput('test.titled', '/chat/c');
		await editorService.openEditor(view, { pinned: true }, viewGroup.id);
		const explicit = file('/explicit.txt');
		await editorService.openEditor(explicit, { pinned: true }, viewGroup);
		const reopened = await editorService.openEditor(explicit, { pinned: true }, viewGroup.id);

		const untitledGroup = part.addGroup(viewGroup, GroupDirection.DOWN);
		await untitledGroup.openEditor(createViewInput('test.untitled', '/chat/d'), { pinned: true });
		const besideUntitled = file('/beside-untitled.txt');
		await editorService.openEditor(besideUntitled, { pinned: true }, untitledGroup.id);

		assert.deepStrictEqual({
			oneView, twoViews,
			view: viewGroup.contains(view),
			explicit: where(explicit.resource),
			reopenedInItsGroup: reopened?.group.id === viewGroup.id,
			besideUntitled: where(besideUntitled.resource),
		}, {
			oneView: { byId: 'main', byColumn: 'main', viewGroupActive: true, toSide: 'main', partGroups: 1 },
			twoViews: { byId: 'main', byColumn: 'main', viewGroupActive: true, toSide: 'main', partGroups: 1 },
			view: true,
			explicit: 'part',
			reopenedInItsGroup: true,
			besideUntitled: 'part',
		});
		for (const group of [...parts.mainPart.groups, ...part.groups]) {
			await group.closeAllEditors();
		}
	});

	test('an editor opened by the id of a group that holds a view with its own title does not go into a locked group of the main part it is handed off to', async () => {
		const { parts, editorService, part } = await createServices();
		const viewGroup = part.activeGroup;
		await viewGroup.openEditor(createViewInput('test.titled', '/chat/a'), { pinned: true });
		const lockedGroup = parts.mainPart.activeGroup;
		lockedGroup.lock(true);

		const input = disposables.add(new TestFileEditorInput(URI.file('/locked.txt'), TEST_EDITOR_INPUT_ID));
		await editorService.openEditor(input, { pinned: true }, viewGroup.id);

		const target = parts.mainPart.groups.find(group => group.contains(input));
		assert.deepStrictEqual({ inLocked: lockedGroup.contains(input), inMainPart: !!target, targetLocked: target?.isLocked }, { inLocked: false, inMainPart: true, targetLocked: false });
		for (const group of [...parts.mainPart.groups, ...part.groups]) {
			await group.closeAllEditors();
		}
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
			onClear: ['save view2', 'hide view2']
		});
	});

	test('an editor of a view that moves around, between groups and parts, leaves one live view: the one that shows it', async () => {
		const { parts, part } = await createServices();
		const other = createPart(parts);
		const input = createViewInput('test.titled', '/chat/a');
		await part.activeGroup.openEditor(input, { pinned: true });
		await part.activeGroup.openEditor(disposables.add(new TestFileEditorInput(URI.file('/beside.txt'), TEST_EDITOR_INPUT_ID)), { pinned: true });

		const live = () => views.filter(view => !view.disposed).length;
		const afterEach: number[] = [];
		for (let i = 0; i < 5; i++) {
			// Into a group split off its own, then into another part, then back
			const source = part.groups.find(group => group.contains(input))!;
			const split = part.addGroup(source, GroupDirection.RIGHT);
			source.moveEditor(input, split);
			await timeout(0);
			afterEach.push(live());
			split.moveEditor(input, other.activeGroup);
			await timeout(0);
			afterEach.push(live());
			other.activeGroup.moveEditor(input, part.activeGroup);
			await timeout(0);
			afterEach.push(live());
		}

		assert.deepStrictEqual(afterEach, Array.from({ length: 15 }, () => 1));
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

	test('an editor dropped on the center of a view that handles drops, such as a chat, goes into its group as the active tab; on an edge, it splits the part into a new group', async () => {
		const { parts, part } = await createServices();
		await part.activeGroup.openEditor(createViewInput('test.titled', '/chat/a'));
		disposables.add(registerContentDropTarget(views[0].element));
		const group = groupViewOf(parts, part.activeGroup);
		// Where the view is in its group, which can be taller than the view, such as in a browser
		const bounds = views[0].element.getBoundingClientRect();

		const dragFile = async (path: string, clientX: number, clientY: number) => {
			const file = disposables.add(new TestFileEditorInput(URI.file(path), TEST_EDITOR_INPUT_ID));
			await parts.mainPart.activeGroup.openEditor(file, { pinned: true });
			editorTransfer.setData([new DraggedEditorIdentifier({ editor: file, groupId: parts.mainPart.activeGroup.id })], DraggedEditorIdentifier.prototype);
			await drop(group, clientX, clientY);
			editorTransfer.clearData(DraggedEditorIdentifier.prototype);
			return file;
		};

		const center = await dragFile('/center.txt', bounds.left + bounds.width / 2 + 10, bounds.top + bounds.height / 2);
		const afterCenter = { groups: part.groups.length, inViewGroup: group.contains(center), active: group.activeEditor === center };

		const edge = await dragFile('/edge.txt', bounds.left + 2, bounds.top + bounds.height / 2);
		const afterEdge = { groups: part.groups.length, inNewGroup: part.groups.some(other => other.id !== group.id && other.contains(edge)), inMain: parts.mainPart.groups.some(group => group.contains(edge)) };

		// The view's own editor dropped on its center stays where it is
		const view = group.getEditors(EditorsOrder.SEQUENTIAL).find(editor => editor !== center)!;
		const editorsBefore = group.getEditors(EditorsOrder.SEQUENTIAL);
		editorTransfer.setData([new DraggedEditorIdentifier({ editor: view, groupId: group.id })], DraggedEditorIdentifier.prototype);
		// Where the view is now, beside the group the edge drop split off
		const now = group.element.getBoundingClientRect();
		await drop(group, now.left + now.width / 2, now.top + now.height / 2);
		editorTransfer.clearData(DraggedEditorIdentifier.prototype);
		const ownEditor = { groups: part.groups.length, unchanged: JSON.stringify(group.getEditors(EditorsOrder.SEQUENTIAL).map(editor => editor.resource?.toString())) === JSON.stringify(editorsBefore.map(editor => editor.resource?.toString())) };

		assert.deepStrictEqual({ afterCenter, afterEdge, ownEditor }, {
			afterCenter: { groups: 1, inViewGroup: true, active: true },
			afterEdge: { groups: 2, inNewGroup: true, inMain: false },
			ownEditor: { groups: 2, unchanged: true }
		});
	});

	test('an editor dropped on an edge of a view that handles drops splits its group evenly, as the drop indicator shows, also beside a group at its minimum size', async () => {
		const { parts, part } = await createServices();
		await part.activeGroup.openEditor(createViewInput('test.titled', '/chat/a'));
		disposables.add(registerContentDropTarget(views[0].element));
		const viewGroup = groupViewOf(parts, part.activeGroup);
		const dragFile = async (path: string, edge: 'left' | 'bottom') => {
			const file = disposables.add(new TestFileEditorInput(URI.file(path), TEST_EDITOR_INPUT_ID));
			await parts.mainPart.activeGroup.openEditor(file, { pinned: true });
			editorTransfer.setData([new DraggedEditorIdentifier({ editor: file, groupId: parts.mainPart.activeGroup.id })], DraggedEditorIdentifier.prototype);
			// On the view, at an edge it shares with its group, which can be taller than the view, such as in a browser
			const bounds = views[0].element.getBoundingClientRect();
			await drop(viewGroup, edge === 'left' ? bounds.left + 2 : bounds.left + bounds.width / 2, edge === 'left' ? bounds.top + bounds.height / 2 : bounds.bottom - 2);
			editorTransfer.clearData(DraggedEditorIdentifier.prototype);
			return part.groups.find(group => group.contains(file))!;
		};

		// Beside the view, a group at its minimum width: the view's group counts as expanded
		const left = await dragFile('/left.txt', 'left');
		part.setSize(left, { width: 0, height: part.getSize(left).height });
		const viewHeight = part.getSize(viewGroup).height;
		const below = await dragFile('/below.txt', 'bottom');

		const heights = { below: part.getSize(below).height, view: part.getSize(viewGroup).height };
		assert.deepStrictEqual({ even: Math.abs(heights.below - heights.view) <= 1, total: heights.below + heights.view }, { even: true, total: viewHeight });
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
