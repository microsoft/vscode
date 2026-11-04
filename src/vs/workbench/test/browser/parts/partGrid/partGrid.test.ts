/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { setARIAContainer } from '../../../../../base/browser/ui/aria/aria.js';
import { $, append, registerWindow } from '../../../../../base/browser/dom.js';
import { ensureCodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { errorHandler } from '../../../../../base/common/errors.js';
import { Direction } from '../../../../../base/browser/ui/grid/grid.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { LocalSelectionTransfer } from '../../../../../platform/dnd/browser/dnd.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IPartGridRect, IPartGridView, PART_GRID_TOP_EDGE_CLASS, PART_GRID_TOP_EDGE_GROUP_CLASS, PART_GRID_TOP_RIGHT_GROUP_CLASS, PartGrid } from '../../../../browser/parts/partGrid/partGrid.js';
import { IEditorGroupView } from '../../../../browser/parts/editor/editor.js';
import { DraggedEditorGroupIdentifier, DraggedEditorIdentifier } from '../../../../browser/dnd.js';
import { ContentPart } from '../../../../browser/parts/editor/contentPart.js';
import { MoveEditorIntoNewPartBelowAction, MovePartRightAction } from '../../../../browser/parts/partGrid/partGridActions.js';
import { getPartGridDrop, getPartGridNewPartZone, IPartGridDrop } from '../../../../browser/parts/partGrid/partGridDnd.js';
import { PART_GRID_PLACEHOLDER_CLASS, PART_GRID_REFLOW_DURATION } from '../../../../browser/parts/partGrid/partGridReflow.js';
import { registerOverlayAnchor } from '../../../../../base/browser/overlayLayoutElement.js';
import { GRID_GAP_SASH_CLASS } from '../../../../browser/parts/partGrid/partGridGap.js';
import { EditorPartInPartGridContext } from '../../../../common/contextkeys.js';
import { EditorExtensions, EditorsOrder, IEditorFactoryRegistry } from '../../../../common/editor.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';
import { IAuxiliaryWindowService } from '../../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { GroupDirection, IContentPart, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { createEditorParts, registerTestEditor, TestEditorParts, TestFileEditorInput, workbenchInstantiationService } from '../../workbenchTestServices.js';

suite('Part Grid', () => {

	const TEST_EDITOR_ID = 'MyFileEditorForPartGrid';
	const TEST_EDITOR_INPUT_ID = 'testEditorInputForPartGrid';

	const disposables = new DisposableStore();

	setup(() => {
		disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput), new SyncDescriptor(SideBySideEditorInput)], TEST_EDITOR_INPUT_ID));
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;

	async function createParts(): Promise<TestEditorParts> {
		instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		instantiationService.stub(IWorkbenchLayoutService, 'getMaximumEditorDimensions', () => ({ width: Number.POSITIVE_INFINITY, height: Number.POSITIVE_INFINITY }));
		instantiationService.stub(IAuxiliaryWindowService, new class extends mock<IAuxiliaryWindowService>() { override getWindow() { return undefined; } }());
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		return parts;
	}

	function createContainer(): HTMLElement {
		const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		disposables.add({ dispose: () => container.remove() });

		return container;
	}

	function createPart(parts: TestEditorParts, state?: unknown): IContentPart {
		const part = parts.createEditorPart({ container: mainWindow.document.createElement('div'), state });
		disposables.add({ dispose: () => part.close() });

		return part;
	}

	function createGrid(): PartGrid {
		const grid = disposables.add(new PartGrid(createContainer(), instantiationService.get(IEditorGroupsService)));
		grid.layout(1000, 800);

		return grid;
	}

	function createView(): IPartGridView {
		return { element: mainWindow.document.createElement('div'), minimumWidth: 0, maximumWidth: Number.POSITIVE_INFINITY, minimumHeight: 30, maximumHeight: 30, onDidChange: Event.None, layout: () => { } };
	}

	async function openEditor(part: IContentPart, path: string): Promise<TestFileEditorInput> {
		const input = disposables.add(new TestFileEditorInput(URI.file(path), TEST_EDITOR_INPUT_ID));
		await part.activeGroup.openEditor(input, { pinned: true });

		return input;
	}

	test('the parts of the grid say so in their context, for what acts on them, such as Move Part, until they leave it', async () => {
		const parts = await createParts();
		const grid = createGrid();
		const [main, other] = [createPart(parts), createPart(parts)];
		await Promise.all([openEditor(main, '/main.txt'), openEditor(other, '/other.txt')]);
		grid.addPart('main', main);
		grid.addPart('other', other, { edge: Direction.Right });
		const [mainContext, otherContext] = [main, other].map(part => parts.getScopedInstantiationService(part).invokeFunction(accessor => accessor.get(IContextKeyService)));
		const inPartGrid = () => ({ main: mainContext.getContextKeyValue(EditorPartInPartGridContext.key), other: otherContext.getContextKeyValue(EditorPartInPartGridContext.key) });

		const before = inPartGrid();
		grid.removeCell('other');

		assert.deepStrictEqual({ before, after: inPartGrid() }, { before: { main: true, other: true }, after: { main: true, other: false } });
	});

	test('parts go beside other parts or at an edge of the window, and move there', async () => {
		const parts = await createParts();
		const grid = createGrid();
		const side = createPart(parts);
		const chat = createPart(parts);
		const bottom = createPart(parts);
		await Promise.all([openEditor(side, '/side.txt'), openEditor(chat, '/chat.txt'), openEditor(bottom, '/bottom.txt')]);

		const shapes: string[] = [];
		grid.addPart('side', side);
		grid.addPart('chat', chat, { reference: 'side', direction: Direction.Down });
		shapes.push(grid.describe());
		grid.addPart('bottom', bottom, { edge: Direction.Right });
		shapes.push(grid.describe());
		grid.moveCell('bottom', { edge: Direction.Down });
		shapes.push(grid.describe());
		grid.moveCell('bottom', { reference: 'chat', direction: Direction.Right });
		shapes.push(grid.describe());
		grid.addView('title', createView(), { edge: Direction.Up });
		shapes.push(grid.describe());
		grid.swapCells('side', 'chat');
		shapes.push(grid.describe());

		assert.deepStrictEqual(shapes, [
			'column(side, chat)',
			'row(column(side, chat), bottom)',
			'column(side, chat, bottom)',
			'column(side, row(chat, bottom))',
			'column(title, side, row(chat, bottom))',
			'column(title, chat, row(side, bottom))'
		]);
	});

	test('the groups whose title is at the top edge of the grid are marked, as parts move, split, show and hide, below a row of chrome or not', async () => {
		const parts = await createParts();
		const grid = createGrid();
		const main = createPart(parts);
		const chat = createPart(parts);
		const terminals = createPart(parts);
		await Promise.all([openEditor(main, '/main.txt'), openEditor(chat, '/chat.txt'), openEditor(terminals, '/terminals.txt')]);
		grid.addPart('chat', chat);
		grid.addPart('main', main, { reference: 'chat', direction: Direction.Right });
		grid.addPart('terminals', terminals, { edge: Direction.Down });
		const lowerMainGroup = main.addGroup(main.activeGroup, GroupDirection.DOWN);
		const topEdge = () => ({
			cells: ['chat', 'main', 'terminals'].filter(id => mainWindow.document.querySelector(`[data-part-grid-cell="${id}"]`)?.classList.contains(PART_GRID_TOP_EDGE_CLASS)),
			groups: [['chat', chat], ['main', main], ['terminals', terminals]].flatMap(([name, part]) => (part as IContentPart).groups
				.filter(group => (group as IEditorGroupView).element.classList.contains(PART_GRID_TOP_EDGE_GROUP_CLASS))
				.map(group => `${name}${group === lowerMainGroup ? ' (lower)' : ''}`)),
		});

		const sideBySide = topEdge();
		// Move Part Up: the terminals across the top.
		grid.moveCell('terminals', { edge: Direction.Up });
		const terminalsMovedUp = topEdge();
		grid.setCellVisible('terminals', false);
		const terminalsHidden = topEdge();
		// A row of chrome across the top, such as the title row of the window.
		grid.addView('title', createView(), { edge: Direction.Up });
		const belowTitleRow = topEdge();

		assert.deepStrictEqual({ sideBySide, terminalsMovedUp, terminalsHidden, belowTitleRow }, {
			sideBySide: { cells: ['chat', 'main'], groups: ['chat', 'main'] },
			terminalsMovedUp: { cells: ['terminals'], groups: ['terminals'] },
			terminalsHidden: { cells: ['chat', 'main'], groups: ['chat', 'main'] },
			belowTitleRow: { cells: [], groups: [] },
		});
	});

	test('the group whose title is at the top right corner of the grid is marked, as parts move, split, show and hide, below a row of chrome or not', async () => {
		const parts = await createParts();
		const grid = createGrid();
		const main = createPart(parts);
		const chat = createPart(parts);
		const terminals = createPart(parts);
		await Promise.all([openEditor(main, '/main.txt'), openEditor(chat, '/chat.txt'), openEditor(terminals, '/terminals.txt')]);
		grid.addPart('chat', chat);
		grid.addPart('main', main, { reference: 'chat', direction: Direction.Right });
		grid.addPart('terminals', terminals, { edge: Direction.Down });
		const topRight = () => [['chat', chat], ['main', main], ['terminals', terminals]].flatMap(([name, part]) => (part as IContentPart).groups
			.filter(group => (group as IEditorGroupView).element.classList.contains(PART_GRID_TOP_RIGHT_GROUP_CLASS))
			.map(group => `${name}${group === (part as IContentPart).groups[0] ? '' : ' (split)'}`));

		const sideBySide = topRight();
		// The main part split to the right: its right group is at the corner, and a group below it is not.
		const split = main.addGroup(main.activeGroup, GroupDirection.RIGHT);
		main.addGroup(split, GroupDirection.DOWN);
		const mainSplit = topRight();
		grid.moveCell('terminals', { edge: Direction.Up });
		const terminalsMovedUp = topRight();
		grid.setCellVisible('terminals', false);
		const terminalsHidden = topRight();
		grid.addView('title', createView(), { edge: Direction.Up });
		const belowTitleRow = topRight();

		assert.deepStrictEqual({ sideBySide, mainSplit, terminalsMovedUp, terminalsHidden, belowTitleRow }, {
			sideBySide: ['main'],
			mainSplit: ['main (split)'],
			terminalsMovedUp: ['terminals'],
			terminalsHidden: ['main (split)'],
			belowTitleRow: [],
		});
	});

	test('a part shows while it has editors; once no part has editors, the grid says so', async () => {
		const parts = await createParts();
		const grid = createGrid();
		const side = createPart(parts);
		const chat = createPart(parts);
		grid.addView('title', createView(), { edge: Direction.Up });
		grid.addPart('side', side, { edge: Direction.Down });
		grid.addPart('chat', chat, { edge: Direction.Right });

		let empties = 0;
		disposables.add(grid.onDidBecomeEmpty(() => empties++));
		const visible = () => ({ title: grid.isCellVisible('title'), side: grid.isCellVisible('side'), chat: grid.isCellVisible('chat'), empty: grid.isEmpty, empties });

		const initially = visible();
		const sideFile = await openEditor(side, '/side.txt');
		const chatFile = await openEditor(chat, '/chat.txt');
		const withEditors = visible();
		await side.activeGroup.closeEditor(sideFile);
		const sideClosed = visible();
		await chat.activeGroup.closeEditor(chatFile);
		const allClosed = visible();

		assert.deepStrictEqual({ initially, withEditors, sideClosed, allClosed }, {
			initially: { title: true, side: false, chat: false, empty: true, empties: 0 },
			withEditors: { title: true, side: true, chat: true, empty: false, empties: 0 },
			sideClosed: { title: true, side: false, chat: true, empty: false, empties: 0 },
			allClosed: { title: true, side: false, chat: false, empty: true, empties: 1 }
		});
	});

	test('a cell hidden on purpose stays hidden with editors; a closed part leaves the grid', async () => {
		const parts = await createParts();
		const grid = createGrid();
		const side = createPart(parts);
		const chat = createPart(parts);
		await openEditor(side, '/side.txt');
		await openEditor(chat, '/chat.txt');
		grid.addPart('side', side);
		grid.addPart('chat', chat, { reference: 'side', direction: Direction.Right });

		grid.setCellVisible('side', false);
		const hidden = { side: grid.isCellVisible('side'), size: grid.getCellSize('chat').width };
		grid.setCellVisible('side', true);
		const shown = grid.isCellVisible('side');
		chat.close();

		assert.deepStrictEqual({ hidden, shown, shape: grid.describe() }, { hidden: { side: false, size: 1000 }, shown: true, shape: 'side' });
	});

	test('the grid restores its topology, sizes, hidden cells and the editors of its parts', async () => {
		const parts = await createParts();
		const grid = createGrid();
		const side = createPart(parts);
		const chat = createPart(parts);
		const bottom = createPart(parts);
		await openEditor(side, '/side.txt');
		await openEditor(chat, '/chat.txt');
		await openEditor(bottom, '/bottom.txt');
		grid.addPart('side', side);
		grid.addPart('chat', chat, { reference: 'side', direction: Direction.Right });
		grid.addPart('bottom', bottom, { edge: Direction.Down });
		grid.resizeCell('side', { width: 300, height: grid.getCellSize('side').height });
		grid.setCellVisible('bottom', false);

		const state = grid.createState();
		const restored = disposables.add(PartGrid.restore(createContainer(), state, (id, partState) => ({ part: createPart(parts, partState) }), parts));
		restored.layout(1000, 800);

		assert.deepStrictEqual({
			shape: restored.describe(),
			sideWidth: restored.getCellSize('side').width,
			bottomVisible: restored.isCellVisible('bottom'),
			sideEmpty: restored.isPartEmpty('side'),
		}, { shape: 'column(row(side, chat), bottom)', sideWidth: 300, bottomVisible: false, sideEmpty: false });
	});

	test('cards keep their share of the gap to visible cells beside them, none to the window edges, inside the outer insets', async () => {
		const parts = await createParts();
		const container = createContainer();
		const grid = disposables.add(new PartGrid(container, parts));
		const side = createPart(parts);
		const chat = createPart(parts);
		const bottom = createPart(parts);
		await Promise.all([openEditor(side, '/side.txt'), openEditor(chat, '/chat.txt'), openEditor(bottom, '/bottom.txt')]);
		grid.addPart('side', side);
		grid.addPart('chat', chat, { reference: 'side', direction: Direction.Right });
		grid.addPart('bottom', bottom, { edge: Direction.Down });
		grid.setGap(8);
		grid.setOuterInsets({ top: 0, right: 8, bottom: 8, left: 8 });
		grid.layout(1000, 800);

		const insetOf = (id: string) => container.querySelector<HTMLElement>(`[data-part-grid-cell="${id}"] > .part-grid-card`)!.style.inset;
		const withAll = { side: insetOf('side'), chat: insetOf('chat'), bottom: insetOf('bottom') };
		grid.setCellVisible('bottom', false);
		const withoutBottom = { side: insetOf('side'), chat: insetOf('chat') };
		const gridElement = container.querySelector<HTMLElement>('.part-grid')!;

		assert.deepStrictEqual({
			withAll,
			withoutBottom,
			margin: gridElement.style.margin,
			gapSashes: container.querySelectorAll(`.monaco-sash.${GRID_GAP_SASH_CLASS}`).length > 0
		}, {
			withAll: { side: '0px 4px 4px 0px', chat: '0px 0px 4px 4px', bottom: '4px 0px 0px' },
			withoutBottom: { side: '0px 4px 0px 0px', chat: '0px 0px 0px 4px' },
			margin: '0px 8px 8px',
			gapSashes: true
		});
	});

	test('a part that shows while empty shows without editors; other parts hide then', async () => {
		const parts = await createParts();
		const grid = createGrid();
		grid.addPart('main', createPart(parts), undefined, undefined, { showWhileEmpty: true });
		grid.addPart('terminals', createPart(parts), { edge: Direction.Down });

		assert.deepStrictEqual({ main: grid.isCellVisible('main'), mainEmpty: grid.isPartEmpty('main'), terminals: grid.isCellVisible('terminals') }, { main: true, mainEmpty: true, terminals: false });
	});

	test('a card whose content draws its own frame takes the room of that frame from the gap beside it, and tells its content its insets', async () => {
		const parts = await createParts();
		const container = createContainer();
		container.style.setProperty('--part-grid-card-border-width', '1px');
		const grid = disposables.add(new PartGrid(container, parts));
		const chat = createPart(parts);
		const main = createPart(parts);
		await Promise.all([openEditor(chat, '/chat.txt'), openEditor(main, '/main.txt')]);
		grid.addPart('chat', chat);
		grid.addPart('main', main, { reference: 'chat', direction: Direction.Right });
		container.querySelector<HTMLElement>('[data-part-grid-cell="main"] > .part-grid-card')!.style.setProperty('--part-grid-card-frame-owner', 'content');
		grid.setGap(4);
		grid.layout(1000, 800);

		const cardOf = (id: string) => container.querySelector<HTMLElement>(`[data-part-grid-cell="${id}"] > .part-grid-card`)!;
		const read = (id: string) => ({ inset: cardOf(id).style.inset, right: cardOf(id).style.getPropertyValue('--part-grid-card-inset-right'), left: cardOf(id).style.getPropertyValue('--part-grid-card-inset-left') });

		assert.deepStrictEqual({ chat: read('chat'), main: read('main') }, {
			chat: { inset: '0px 2px 0px 0px', right: '2px', left: '0px' },
			main: { inset: '0px 0px 0px 1px', right: '0px', left: '1px' },
		});
	});

	test('a cell that keeps no gap has no inset, and the cells beside it none towards it', () => {
		const container = createContainer();
		const grid = disposables.add(new PartGrid(container, new class extends mock<IEditorGroupsService>() { }()));
		grid.addView('title', createView(), undefined, undefined, { keepsNoGap: true });
		grid.addView('side', createView(), { edge: Direction.Down });
		grid.addView('chat', createView(), { reference: 'side', direction: Direction.Right });
		grid.setGap(4);
		grid.layout(1000, 800);

		const card = (id: string) => container.querySelector<HTMLElement>(`[data-part-grid-cell="${id}"] > .part-grid-card`)!.style;
		const vertical = (id: string) => `${card(id).top} ${card(id).bottom}`;
		assert.deepStrictEqual({ title: vertical('title'), side: vertical('side'), chat: vertical('chat'), between: `${card('side').right} ${card('chat').left}` }, { title: '0px 0px', side: '0px 0px', chat: '0px 0px', between: '2px 2px' });
	});

	test('a cell across the grid stays inside the outer insets', () => {
		const container = createContainer();
		container.style.width = '1000px';
		container.style.height = '800px';
		const grid = disposables.add(new PartGrid(container, new class extends mock<IEditorGroupsService>() { }()));
		grid.addView('title', createView());
		grid.addView('bottom', { ...createView(), minimumHeight: 0, maximumHeight: Number.POSITIVE_INFINITY }, { edge: Direction.Down });
		grid.setOuterInsets({ top: 0, right: 4, bottom: 4, left: 4 });
		grid.layout(1000, 800);

		const rect = (id: string) => { const r = container.querySelector<HTMLElement>(`[data-part-grid-cell="${id}"]`)!.getBoundingClientRect(); const c = container.getBoundingClientRect(); return { left: r.left - c.left, right: c.right - r.right }; };
		assert.deepStrictEqual({ title: rect('title'), bottom: rect('bottom') }, { title: { left: 4, right: 4 }, bottom: { left: 4, right: 4 } });
	});

	test('the gripper on a gap sash draws its outer dots the grid gap apart', () => {
		const container = createContainer();
		container.style.setProperty('--part-grid-gap', '6px');
		const sash = container.appendChild(mainWindow.document.createElement('div'));
		sash.classList.add('monaco-sash', 'vertical', GRID_GAP_SASH_CLASS);

		const style = mainWindow.getComputedStyle(sash, '::after');

		assert.deepStrictEqual({ content: style.content, shadow: style.boxShadow.replace(/rgba?\([^)]*\)\s*/g, '').trim() }, { content: '""', shadow: '0px -6px 0px 0px, 0px 6px 0px 0px' });
	});

	test('with no gap between the cards, the grabber of the lower part takes the pointer over the sash on its edge within its span; the sash keeps the rest of the edge', async () => {
		const parts = await createParts();
		const container = boxAt(0, 0, 1000, 800);
		// The grabber is as tall as this size token of the workbench
		container.style.setProperty('--vscode-spacing-size40', '8px');
		const grid = disposables.add(new PartGrid(container, parts));
		const [top, bottom] = [createPart(parts), createPart(parts)];
		await Promise.all([openEditor(top, '/top.txt'), openEditor(bottom, '/bottom.txt')]);
		grid.addPart('top', top);
		grid.addPart('bottom', bottom, { reference: 'top', direction: Direction.Down });
		grid.layout(1000, 800);

		const handle = container.querySelector<HTMLElement>('[data-part-grid-cell="bottom"] .part-grid-drag-handle')!;
		const edge = container.querySelector<HTMLElement>('[data-part-grid-cell="bottom"]')!.getBoundingClientRect().top;
		const grabber = handle.getBoundingClientRect();
		const at = (x: number) => {
			const element = mainWindow.document.elementFromPoint(x, edge + 1);
			return element === handle ? 'grabber' : element?.closest('.monaco-sash') ? 'sash' : element?.className;
		};

		assert.deepStrictEqual({ onTheGrabber: at(grabber.left + grabber.width / 2), besideIt: at(grabber.left - 50) }, { onTheGrabber: 'grabber', besideIt: 'sash' });
	});

	test('a cell keeps its hidden state when it swaps places, and its part is told when it hides or shows', async () => {
		const parts = await createParts();
		const grid = createGrid();
		const side = createPart(parts);
		const chat = createPart(parts);
		await openEditor(side, '/side.txt');
		await openEditor(chat, '/chat.txt');
		grid.addPart('side', side);
		grid.addPart('chat', chat, { reference: 'side', direction: Direction.Right });
		const visibility: boolean[] = [];
		disposables.add((side as ContentPart).onDidVisibilityChange(visible => visibility.push(visible)));

		grid.setCellVisible('side', false);
		grid.swapCells('side', 'chat');

		assert.deepStrictEqual({ shape: grid.describe(), sideVisible: grid.isCellVisible('side'), sideWidth: grid.getCellSize('side').width, chatWidth: grid.getCellSize('chat').width, visibility: visibility.includes(false) }, {
			shape: 'row(chat, side)', sideVisible: false, sideWidth: 0, chatWidth: 1000, visibility: true
		});
	});

	test('the border of a card counts in the size constraints of its cell', () => {
		const container = createContainer();
		container.style.setProperty('--part-grid-card-border-width', '1px');
		const grid = disposables.add(new PartGrid(container, new class extends mock<IEditorGroupsService>() { }()));
		const heights: number[] = [];
		const fixed: IPartGridView = { ...createView(), layout: (width, height) => heights.push(height) };
		grid.addView('title', fixed);
		grid.addView('other', createView(), { edge: Direction.Down });
		grid.layout(1000, 800);

		assert.deepStrictEqual({ cellHeight: grid.getCellSize('title').height, contentHeight: heights[heights.length - 1] }, { cellHeight: 32, contentHeight: 30 });
	});

	test('a card whose frame is drawn only after it was laid out, as styles load later in an auxiliary window, keeps its content inside the frame', () => {
		const container = createContainer();
		const grid = disposables.add(new PartGrid(container, new class extends mock<IEditorGroupsService>() { }()));
		const heights: number[] = [];
		grid.addView('title', { ...createView(), layout: (width, height) => heights.push(height) });
		grid.addView('other', createView(), { edge: Direction.Down });
		grid.layout(1000, 800);
		const before = { cellHeight: grid.getCellSize('title').height, contentHeight: heights[heights.length - 1] };

		container.style.setProperty('--part-grid-card-border-width', '1px');
		grid.layout(1000, 800);

		assert.deepStrictEqual({ before, after: { cellHeight: grid.getCellSize('title').height, contentHeight: heights[heights.length - 1] } }, {
			before: { cellHeight: 30, contentHeight: 30 },
			after: { cellHeight: 32, contentHeight: 30 }
		});
	});

	test('laying cells out, such as dragging a sash, does not read the frames of the cards again; updating the look does', () => {
		const container = createContainer();
		const grid = disposables.add(new PartGrid(container, new class extends mock<IEditorGroupsService>() { }()));
		grid.addView('title', createView());
		grid.addView('other', { ...createView(), minimumHeight: 0, maximumHeight: Number.POSITIVE_INFINITY }, { edge: Direction.Down });
		grid.layout(1000, 800);

		container.style.setProperty('--part-grid-card-border-width', '1px');
		grid.resizeCell('other', { width: 1000, height: 700 });
		const afterCellLayout = grid.getCellSize('title').height;
		grid.updateLook();

		assert.deepStrictEqual({ afterCellLayout, afterUpdateLook: grid.getCellSize('title').height }, { afterCellLayout: 30, afterUpdateLook: 32 });
	});

	function locationOf(drop: IPartGridDrop | undefined) {
		return drop && hasKey(drop, { location: true }) ? drop.location : undefined;
	}

	function dispatch(target: Element, type: string, clientX = 0, clientY = 0): void {
		target.dispatchEvent(new DragEvent(type, { dataTransfer: new DataTransfer(), clientX, clientY, bubbles: true, cancelable: true }));
	}

	function boxAt(left: number, top: number, width: number, height: number): HTMLElement {
		const element = createContainer();
		element.style.cssText = `position: fixed; left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px;`;

		return element;
	}

	test('a drop goes to the window edge near it, else beside the cell under it on its nearest side, not onto the dragged cell', () => {
		const container = { left: 0, top: 0, width: 400, height: 200 };
		const cells = [{ id: 'a', element: boxAt(0, 0, 200, 200) }, { id: 'b', element: boxAt(200, 0, 200, 200) }];
		const at = (x: number, y: number, excluded?: string) => locationOf(getPartGridDrop(x, y, container, cells, excluded));

		assert.deepStrictEqual({
			windowLeft: at(5, 100),
			windowBottom: at(300, 195),
			aRight: at(180, 100),
			bTop: at(300, 40),
			onDragged: at(300, 40, 'b'),
			outside: at(500, 100)
		}, {
			windowLeft: { edge: Direction.Left },
			windowBottom: { edge: Direction.Down },
			aRight: { reference: 'a', direction: Direction.Right },
			bTop: { reference: 'b', direction: Direction.Up },
			onDragged: undefined,
			outside: undefined
		});
	});

	test('the edges of the window are those of the parts: below a title row across the top, and the room to the edges of the window counts', () => {
		const container = { left: 0, top: 0, width: 400, height: 200 };
		const cells = [{ id: 'a', element: boxAt(4, 33, 196, 163) }, { id: 'b', element: boxAt(200, 33, 196, 163) }];
		const at = (x: number, y: number) => getPartGridDrop(x, y, container, cells);

		assert.deepStrictEqual({ belowTitle: at(300, 40), inset: at(2, 100), aMiddle: locationOf(at(100, 120)), aTopFar: locationOf(at(100, 60)) }, {
			belowTitle: { location: { edge: Direction.Up }, indicator: { left: 4, top: 33, width: 392, height: 163 * 0.25 } },
			inset: { location: { edge: Direction.Left }, indicator: { left: 4, top: 33, width: 392 * 0.25, height: 163 } },
			aMiddle: { reference: 'a', direction: Direction.Down },
			aTopFar: { reference: 'a', direction: Direction.Up }
		});
	});

	function pointer(target: EventTarget, type: string, clientX: number, clientY: number): void {
		target.dispatchEvent(new PointerEvent(type, { clientX, clientY, button: 0, pointerId: 1, isPrimary: true, bubbles: true, cancelable: true }));
	}

	/**
	 * Drags the card of a part by its grabber: down on the grabber, a move
	 * that lifts it, then moves to each point, and, unless it stays held,
	 * up at the last one.
	 */
	function dragCard(container: HTMLElement, id: string, points: readonly (readonly [number, number])[], options?: { readonly hold?: boolean }): void {
		const handle = container.querySelector<HTMLElement>(`[data-part-grid-cell="${id}"] .part-grid-drag-handle`)!;
		const start = handle.getBoundingClientRect();
		const [x, y] = [start.left + start.width / 2, start.top + start.height / 2];
		pointer(handle, 'pointerdown', x, y);
		pointer(handle, 'pointermove', x + 10, y + 10);
		for (const [px, py] of points) {
			pointer(handle, 'pointermove', px, py);
		}
		if (!options?.hold) {
			const [px, py] = points[points.length - 1];
			pointer(handle, 'pointerup', px, py);
		}
	}

	function pressEscape(): void {
		mainWindow.document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
	}

	test('the grabber of a part shows while the pointer is over the part, also over what draws over it outside its card, such as a webview, until the pointer leaves the window', async () => {
		const parts = await createParts();
		const container = boxAt(0, 0, 1000, 800);
		const grid = disposables.add(new PartGrid(container, parts));
		const [left, right] = [createPart(parts), createPart(parts)];
		await Promise.all([openEditor(left, '/left.txt'), openEditor(right, '/right.txt')]);
		grid.addPart('left', left);
		grid.addPart('right', right, { reference: 'left', direction: Direction.Right });
		grid.layout(1000, 800);

		const cellOf = (id: string) => container.querySelector<HTMLElement>(`[data-part-grid-cell="${id}"]`)!;
		// A webview draws over the left part from outside the grid
		const anchor = cellOf('left').querySelector('.part-grid-card')!.appendChild(mainWindow.document.createElement('div'));
		anchor.style.cssText = 'position: absolute; inset: 0;';
		const overlay = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		const leftRect = cellOf('left').getBoundingClientRect();
		overlay.style.cssText = `position: fixed; left: ${leftRect.left}px; top: ${leftRect.top}px; width: ${leftRect.width}px; height: ${leftRect.height}px; z-index: 1;`;
		const iframe = overlay.appendChild(mainWindow.document.createElement('iframe'));
		iframe.style.cssText = 'width: 100%; height: 100%; border: none; display: block;';
		disposables.add(toDisposable(() => overlay.remove()));
		disposables.add(registerOverlayAnchor(anchor, { setHidden: () => { }, element: overlay }));
		const showing = () => ['left', 'right'].filter(id => cellOf(id).querySelector('.part-grid-card')!.classList.contains('part-grid-pointer-over'));
		const over = (target: Element) => { target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, relatedTarget: null })); return showing(); };

		const overWebview = over(iframe);
		const overOtherPart = over(cellOf('right').querySelector('.part-grid-card')!);
		const outsideTheGrid = over(mainWindow.document.body);
		over(iframe);
		iframe.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: null, clientX: -10, clientY: -10 }));
		const outOfTheWindow = showing();
		// Straight from the other part into the webview, whose frame takes the pointer: the window has only a pointerout to
		// nothing, at the edge of the part it leaves, and no event after it
		over(cellOf('right').querySelector('.part-grid-card')!);
		const rightRect = cellOf('right').getBoundingClientRect();
		cellOf('right').querySelector('.part-grid-card')!.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: null, clientX: rightRect.left + 1, clientY: rightRect.top + rightRect.height / 2, movementX: -3 }));
		const fromOtherPartIntoWebview = showing();
		// Out of the window from inside the webview's frame, which keeps its pointer events: only the window's mouseleave
		over(iframe);
		mainWindow.document.documentElement.dispatchEvent(new MouseEvent('mouseleave'));
		const outFromTheWebview = showing();
		over(iframe);
		mainWindow.dispatchEvent(new FocusEvent('blur'));
		const windowBlurred = showing();
		over(iframe);
		const card = cellOf('left').querySelector('.part-grid-card')!;
		grid.removeCell('left');
		const partLeft = card.classList.contains('part-grid-pointer-over');

		assert.deepStrictEqual({ overWebview, overOtherPart, outsideTheGrid, outOfTheWindow, fromOtherPartIntoWebview, outFromTheWebview, windowBlurred, partLeft }, {
			overWebview: ['left'],
			overOtherPart: ['right'],
			outsideTheGrid: [],
			outOfTheWindow: [],
			fromOtherPartIntoWebview: ['left'],
			outFromTheWebview: [],
			windowBlurred: [],
			partLeft: false
		});
	});

	test('from the press on its grabber, a layer over the window takes the pointer, also over a webview the first move goes into, so that a card dragged toward it lifts; a press that loses the pointer ends', async () => {
		const parts = await createParts();
		const container = boxAt(0, 0, 1000, 800);
		container.style.setProperty('--vscode-spacing-size40', '8px');
		const grid = disposables.add(new PartGrid(container, parts));
		const [top, bottom] = [createPart(parts), createPart(parts)];
		await Promise.all([openEditor(top, '/top.txt'), openEditor(bottom, '/bottom.txt')]);
		grid.addPart('top', top);
		grid.addPart('bottom', bottom, { reference: 'top', direction: Direction.Down });
		grid.layout(1000, 800);

		// A webview over the top part, drawn above the cards as webviews are
		const topRect = container.querySelector<HTMLElement>('[data-part-grid-cell="top"]')!.getBoundingClientRect();
		const webview = container.appendChild(mainWindow.document.createElement('iframe'));
		webview.style.cssText = `position: fixed; left: ${topRect.left}px; top: ${topRect.top}px; width: ${topRect.width}px; height: ${topRect.height}px; z-index: 2; border: none;`;
		const handle = container.querySelector<HTMLElement>('[data-part-grid-cell="bottom"] .part-grid-drag-handle')!;
		const start = handle.getBoundingClientRect();
		const [x, y] = [start.left + start.width / 2, start.top + start.height / 2];
		const firstMove = [x, y - 20] as const;

		const beforePress = mainWindow.document.elementFromPoint(...firstMove) === webview;
		pointer(handle, 'pointerdown', x, y);
		const takesThePointer = mainWindow.document.elementFromPoint(...firstMove);
		pointer(takesThePointer!, 'pointermove', ...firstMove);
		const lifted = container.classList.contains('part-grid-card-dragging');
		pressEscape();
		pointer(mainWindow.document.body, 'pointerup', ...firstMove);
		pointer(handle, 'pointerdown', x, y);
		handle.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1 }));

		assert.deepStrictEqual({ beforePress, layerTakesThePointer: takesThePointer?.classList.contains('part-grid-drag-cursor'), lifted, layerAfterLostPress: !!container.querySelector('.part-grid-drag-cursor') }, {
			beforePress: true,
			layerTakesThePointer: true,
			lifted: true,
			layerAfterLostPress: false
		});
	});

	test('the grabber shows for a part whose webview the pointer is in, also when the window had no event as the pointer went in, and hides once it left the window from there', async () => {
		const parts = await createParts();
		const container = boxAt(0, 0, 1000, 800);
		const grid = disposables.add(new PartGrid(container, parts));
		const [main, chat] = [createPart(parts), createPart(parts)];
		await Promise.all([openEditor(main, '/main.txt'), openEditor(chat, '/chat.txt')]);
		grid.addPart('main', main);
		grid.addPart('chat', chat, { reference: 'main', direction: Direction.Down });
		grid.layout(1000, 800);

		const cardOf = (id: string) => container.querySelector<HTMLElement>(`[data-part-grid-cell="${id}"] > .part-grid-card`)!;
		// A webview over the main part, which the pointer can be in without the window knowing
		const anchor = cardOf('main').appendChild(mainWindow.document.createElement('div'));
		const overlay = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		disposables.add(toDisposable(() => overlay.remove()));
		let pointerInWebview = false;
		disposables.add(registerOverlayAnchor(anchor, { setHidden: () => { }, element: overlay, isPointerOver: () => pointerInWebview }));
		const showing = () => ['main', 'chat'].filter(id => cardOf(id).classList.contains('part-grid-pointer-over'));

		cardOf('chat').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
		// The last event of the window: a move inside the chat; then the pointer is in the webview
		cardOf('chat').dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
		pointerInWebview = true;
		const atOnce = showing();
		await timeout(150);
		const once = showing();
		await timeout(300);
		const stillThere = showing();
		pointerInWebview = false;
		await timeout(300);

		assert.deepStrictEqual({ atOnce, once, stillThere, leftTheWindow: showing() }, {
			atOnce: ['chat'],
			once: ['main'],
			stillThere: ['main'],
			leftTheWindow: []
		});
	});

	test('the grabber of a part stays shown as the pointer goes to it from the title row above or from a region of the card that moves the window, where the window has no events, until the pointer leaves the window', async () => {
		const parts = await createParts();
		const container = boxAt(0, 0, 1000, 800);
		const grid = disposables.add(new PartGrid(container, parts));
		const [chat, main] = [createPart(parts), createPart(parts)];
		await Promise.all([openEditor(chat, '/chat.txt'), openEditor(main, '/main.txt')]);
		grid.addPart('chat', chat);
		grid.addPart('main', main, { reference: 'chat', direction: Direction.Right });
		const titleRow = createView();
		grid.addView('title', titleRow, { edge: Direction.Up });
		grid.layout(1000, 800);

		const cardOf = (id: string) => container.querySelector<HTMLElement>(`[data-part-grid-cell="${id}"] > .part-grid-card`)!;
		const showing = () => ['chat', 'main'].filter(id => cardOf(id).classList.contains('part-grid-pointer-over'));
		const chatRect = cardOf('chat').getBoundingClientRect();
		cardOf('chat').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
		// Over the title row across the window, which is not a part
		titleRow.element.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
		const overTitleRow = showing();
		// Into the top of the card, a region that moves the window: a pointerout to nothing, and a mouseleave, inside the window
		cardOf('chat').dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: null, clientX: chatRect.left + 40, clientY: chatRect.top + 6 }));
		mainWindow.document.documentElement.dispatchEvent(new MouseEvent('mouseleave', { clientX: chatRect.left + 40, clientY: chatRect.top + 6 }));
		const overDragRegion = showing();
		await timeout(150);
		const afterQuiet = showing();
		mainWindow.document.documentElement.dispatchEvent(new MouseEvent('mouseleave', { clientX: chatRect.left + 40, clientY: -1 }));

		assert.deepStrictEqual({ overTitleRow, overDragRegion, afterQuiet, leftTheWindow: showing() }, {
			overTitleRow: ['chat'],
			overDragRegion: ['chat'],
			afterQuiet: ['chat'],
			leftTheWindow: []
		});
	});

	async function createVideoLayout() {
		const parts = await createParts();
		const container = boxAt(0, 0, 1000, 800);
		container.style.setProperty('--vscode-spacing-size40', '8px');
		const grid = disposables.add(new PartGrid(container, parts));
		const [main, chat, terminals] = [createPart(parts), createPart(parts), createPart(parts)];
		const file = await openEditor(main, '/main.txt');
		await Promise.all([openEditor(main, '/other.txt'), openEditor(chat, '/chat.txt'), openEditor(terminals, '/terminals.txt')]);
		grid.addPart('main', main);
		grid.addPart('chat', chat, { reference: 'main', direction: Direction.Right });
		grid.addPart('terminals', terminals, { edge: Direction.Down });
		grid.layout(1000, 800);
		grid.resizeCell('main', { width: 580, height: grid.getCellSize('main').height });
		const cards = () => new Map(['main', 'chat', 'terminals', 'new'].filter(id => container.querySelector(`[data-part-grid-cell="${id}"]`)).map(id => {
			const { left, top, width, height } = container.querySelector(`[data-part-grid-cell="${id}"] > .part-grid-card`)!.getBoundingClientRect();
			return [id, { left, top, width, height }];
		}));
		return { parts, container, grid, main, file, cards };
	}

	const round = (rects: ReadonlyMap<string, IPartGridRect> | undefined) => Object.fromEntries(Array.from(rects ?? [], ([id, { left, top, width, height }]) => [id, [left, top, width, height].map(Math.round)]));

	test('a part dropped beside a part at an edge of the window goes where a drop at that edge puts it, with the same size: an even share of where it goes; and the drop ends where its preview showed', async () => {
		const { container, grid, cards } = await createVideoLayout();

		const besideChat = round(grid.previewArrangement('terminals', { location: { reference: 'chat', direction: Direction.Right } }));
		const atRightEdge = round(grid.previewArrangement('terminals', { location: { edge: Direction.Right } }));
		// Dropped there by its card, without motion: at once
		const handle = container.querySelector<HTMLElement>('[data-part-grid-cell="terminals"] .part-grid-drag-handle')!.getBoundingClientRect();
		dragCard(container, 'terminals', [[handle.left + handle.width / 2, 300], [996, 300]]);

		assert.deepStrictEqual({ besideChat, dropped: { shape: grid.describe(), cards: round(cards()) } }, {
			besideChat: atRightEdge,
			dropped: { shape: 'row(main, chat, terminals)', cards: atRightEdge }
		});
		// An even share: a third of the window, the others making room in proportion to their 580 and 420
		assert.deepStrictEqual(atRightEdge.terminals[2], 333);
	});

	test('editors dropped into a new part at an edge of the window or on the rim of the part at that edge give the same part, with an even share of where it goes, as its preview showed', async () => {
		const { parts, grid, main, file, cards } = await createVideoLayout();
		disposables.add(grid.setPartFactory({ createPart: () => ({ id: 'new', part: createPart(parts) }) }));

		const atEdge = round(grid.previewNewPart('new', { edge: Direction.Right }, 'main', false, true));
		const onRim = round(grid.previewNewPart('new', { reference: 'chat', direction: Direction.Right }, 'main', false, true));
		grid.moveEditorsIntoNewPart([{ editor: file, groupId: main.activeGroup.id }], { reference: 'chat', direction: Direction.Right }, { dropped: true });

		assert.deepStrictEqual({ onRim, dropped: { shape: grid.describe(), cards: round(cards()) } }, {
			onRim: atEdge,
			dropped: { shape: 'row(column(row(main, chat), terminals), new)', cards: atEdge }
		});
	});

	test('the grid does not look for the pointer over a webview while its window has no focus, and looks again once it has', async () => {
		const parts = await createParts();
		const container = boxAt(0, 0, 1000, 800);
		const grid = disposables.add(new PartGrid(container, parts));
		const [main, chat] = [createPart(parts), createPart(parts)];
		await Promise.all([openEditor(main, '/main.txt'), openEditor(chat, '/chat.txt')]);
		grid.addPart('main', main);
		grid.addPart('chat', chat, { reference: 'main', direction: Direction.Down });
		grid.layout(1000, 800);

		const cardOf = (id: string) => container.querySelector<HTMLElement>(`[data-part-grid-cell="${id}"] > .part-grid-card`)!;
		const anchor = cardOf('main').appendChild(mainWindow.document.createElement('div'));
		const overlay = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		disposables.add(toDisposable(() => overlay.remove()));
		let looked = 0;
		disposables.add(registerOverlayAnchor(anchor, { setHidden: () => { }, element: overlay, isPointerOver: () => { looked++; return true; } }));
		const showing = () => ['main', 'chat'].filter(id => cardOf(id).classList.contains('part-grid-pointer-over'));

		cardOf('chat').dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
		await timeout(150);
		const inWebview = showing();
		mainWindow.dispatchEvent(new FocusEvent('blur'));
		const lookedAtBlur = looked;
		await timeout(600);
		const whileBlurred = { showing: showing(), looksAgain: looked > lookedAtBlur };
		mainWindow.dispatchEvent(new FocusEvent('focus'));
		await timeout(150);

		assert.deepStrictEqual({ inWebview, whileBlurred, focusedAgain: showing() }, {
			inWebview: ['main'],
			whileBlurred: { showing: [], looksAgain: false },
			focusedAgain: ['main']
		});
	});

	test('a part dragged by the grabber on its card drops beside another part or at a window edge, with a drop indicator', async () => {
		const parts = await createParts();
		const container = boxAt(0, 0, 1000, 800);
		const grid = disposables.add(new PartGrid(container, parts));
		const side = createPart(parts);
		const chat = createPart(parts);
		const bottom = createPart(parts);
		await Promise.all([openEditor(side, '/side.txt'), openEditor(chat, '/chat.txt'), openEditor(bottom, '/bottom.txt')]);
		grid.addPart('side', side);
		grid.addPart('chat', chat, { reference: 'side', direction: Direction.Right });
		grid.addPart('bottom', bottom, { edge: Direction.Down });
		grid.layout(1000, 800);

		const cellOf = (id: string) => container.querySelector<HTMLElement>(`[data-part-grid-cell="${id}"]`)!;
		const slot = () => container.querySelector<HTMLElement>('.part-grid-drop-indicator.part');
		const drag = (id: string, x: (rect: DOMRect) => number, y: (rect: DOMRect) => number, over = 'side') => {
			const rect = over === 'window' ? container.getBoundingClientRect() : cellOf(over).getBoundingClientRect();
			const point = [x(rect), y(rect)] as const;
			dragCard(container, id, [point], { hold: true });
			const indicatorShown = !!slot() && slot()!.style.display !== 'none';
			pointer(mainWindow.document.body, 'pointerup', ...point);
			return { indicatorShown, shape: grid.describe() };
		};

		const besideSide = drag('bottom', rect => rect.left + rect.width * 0.2, rect => rect.top + rect.height / 2);
		const toBottomEdge = drag('bottom', rect => rect.left + rect.width / 2, rect => rect.bottom - 4, 'window');
		const ontoItself = drag('side', rect => rect.left + rect.width / 2, rect => rect.top + rect.height / 2);

		assert.deepStrictEqual({ besideSide, toBottomEdge, ontoItself, indicatorAfter: !!slot() }, {
			besideSide: { indicatorShown: true, shape: 'row(bottom, side, chat)' },
			toBottomEdge: { indicatorShown: true, shape: 'column(row(side, chat), bottom)' },
			ontoItself: { indicatorShown: false, shape: 'column(row(side, chat), bottom)' },
			indicatorAfter: false
		});
	});

	test('a part dragged beside another shows its whole slot after the move, the others shifted, not half of the part under it', async () => {
		const parts = await createParts();
		const container = boxAt(0, 0, 1000, 800);
		const grid = disposables.add(new PartGrid(container, parts));
		const [left, right] = [createPart(parts), createPart(parts)];
		await Promise.all([openEditor(left, '/left.txt'), openEditor(right, '/right.txt')]);
		grid.addPart('left', left);
		grid.addPart('right', right, { reference: 'left', direction: Direction.Right });
		grid.layout(1000, 800);
		grid.resizeCell('left', { width: 700, height: 800 });

		const cellOf = (id: string) => container.querySelector<HTMLElement>(`[data-part-grid-cell="${id}"]`)!;
		const rectOf = (element: HTMLElement) => { const r = element.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); };

		// The right part over the left side of the left part takes the left slot, the left part moving right
		const target = cellOf('left').getBoundingClientRect();
		const point = [target.left + target.width * 0.1, target.top + target.height / 2] as const;
		dragCard(container, 'right', [point], { hold: true });
		const shown = rectOf(container.querySelector<HTMLElement>('.part-grid-drop-indicator.part')!);
		pointer(mainWindow.document.body, 'pointerup', ...point);

		assert.deepStrictEqual({ shape: grid.describe(), shown, slotAfterDrop: rectOf(cellOf('right')), halfOfTarget: shown[2] === Math.round(target.width / 2) }, {
			shape: 'row(right, left)',
			shown: rectOf(cellOf('right')),
			slotAfterDrop: rectOf(cellOf('right')),
			halfOfTarget: false
		});
	});

	test('the empty space of the title of a group below the top edge of the window drags its part; at the top edge, which moves the window, it drags the group as before', async () => {
		const parts = await createParts();
		const container = boxAt(0, 0, 900, 600);
		const grid = disposables.add(new PartGrid(container, parts));
		const [top, below] = [createPart(parts), createPart(parts)];
		await Promise.all([openEditor(top, '/top.txt'), openEditor(below, '/below.txt')]);
		grid.addPart('top', top);
		grid.addPart('below', below, { edge: Direction.Down });
		grid.layout(900, 600);

		const cellOf = (id: string) => container.querySelector<HTMLElement>(`[data-part-grid-cell="${id}"]`)!;
		const groupTransfer = LocalSelectionTransfer.getInstance<DraggedEditorGroupIdentifier>();
		const editorTransfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();
		const lifted = () => container.classList.contains('part-grid-card-dragging');
		const press = (element: Element, to: readonly [number, number]) => {
			const rect = element.getBoundingClientRect();
			const [x, y] = [rect.left + rect.width - 4, rect.top + rect.height / 2];
			pointer(element, 'pointerdown', x, y);
			pointer(element, 'pointermove', x + 10, y + 10);
			pointer(element, 'pointermove', ...to);
			const dragStart = new DragEvent('dragstart', { dataTransfer: new DataTransfer(), bubbles: true, cancelable: true });
			element.dispatchEvent(dragStart);
			const result = { lifted: lifted(), nativeDrag: !dragStart.defaultPrevented, group: groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype), editor: editorTransfer.hasData(DraggedEditorIdentifier.prototype) };
			// A drag of a group or an editor that ends here is not dropped elsewhere: its transfer goes, as at its end
			groupTransfer.clearData(DraggedEditorGroupIdentifier.prototype);
			editorTransfer.clearData(DraggedEditorIdentifier.prototype);
			pointer(element, 'pointerup', ...to);
			return result;
		};

		const target = cellOf('top').getBoundingClientRect();
		const point = [target.left + target.width * 0.1, target.top + target.height / 2] as const;
		const fromTop = press(cellOf('top').querySelector('.title .tabs-container')!, point);
		const fromTab = press(cellOf('below').querySelector('.title .tab')!, point);
		const shapeBefore = grid.describe();
		const fromBelow = press(cellOf('below').querySelector('.title .tabs-container')!, point);

		assert.deepStrictEqual({ fromTop, fromTab, shapeBefore, fromBelow, shape: grid.describe(), afterEnd: lifted() || groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype) }, {
			fromTop: { lifted: false, nativeDrag: true, group: true, editor: false },
			fromTab: { lifted: false, nativeDrag: true, group: false, editor: true },
			shapeBefore: 'column(top, below)',
			fromBelow: { lifted: true, nativeDrag: false, group: false, editor: false },
			shape: 'row(below, top)',
			afterEnd: false
		});
	});

	async function createRowOfThree(motion: boolean) {
		const parts = await createParts();
		const container = boxAt(0, 0, 900, 600);
		if (motion) {
			container.classList.add('monaco-enable-motion');
		}
		const grid = disposables.add(new PartGrid(container, parts));
		const [a, b, c] = [createPart(parts), createPart(parts), createPart(parts)];
		await Promise.all([openEditor(a, '/a.txt'), openEditor(b, '/b.txt'), openEditor(c, '/c.txt')]);
		grid.addPart('a', a);
		grid.addPart('b', b, { edge: Direction.Right });
		grid.addPart('c', c, { edge: Direction.Right });
		grid.layout(900, 600);

		let previews = 0;
		const preview = grid.previewArrangement;
		grid.previewArrangement = (id, drop) => { previews++; return preview.call(grid, id, drop); };
		let arrangementChanges = 0;
		disposables.add(grid.onDidChangeArrangement(() => arrangementChanges++));

		const cellOf = (id: string) => container.querySelector<HTMLElement>(`[data-part-grid-cell="${id}"]`)!;
		// Where the cards that make way go, rounded; the dragged card follows the pointer
		const translates = () => Object.fromEntries(['a', 'b'].map(id => [id, cellOf(id).style.translate.split(' ').map(value => Math.round(parseFloat(value))).filter(value => !isNaN(value))]));
		const start = Object.fromEntries(['a', 'b', 'c'].map(id => [id, cellOf(id).getBoundingClientRect()]));
		// Where a card shows while the dragged card is held: where it was, moved by its translate
		const shownLeft = (id: string) => start[id].left + (parseFloat(cellOf(id).style.translate) || 0);
		// Where the pointer holds c, by its grabber, for the center of the lifted card to be at the middle of the window
		const middleY = 300 - (motion ? (start.c.height / 2 - 4) * 0.6 : 0);

		return { grid, container, cellOf, translates, start, shownLeft, middleY, previews: () => previews, arrangementChanges: () => arrangementChanges };
	}

	test('a dragged card finds where the cards go once for each place, in zones where the cards show, and drops there once', async () => {
		const { grid, container, cellOf, translates, start, shownLeft, middleY: y, previews, arrangementChanges } = await createRowOfThree(true);
		// c takes an even third of the row (300 of 900), as every part put somewhere; a and b make room in proportion
		const makeWay = { a: 300, b: 380 };

		// c, its center, over the left side of a, by small moves: the others make way at once, with one dry run
		dragCard(container, 'c', [[30, y], [32, y + 2], [28, y - 2], [31, y + 5]], { hold: true });
		const overA = { previews: previews(), translates: translates(), lifted: cellOf('c').classList.contains('part-grid-lifted'), slot: !!container.querySelector('.part-grid-frame.slot') };

		// The left side of a where it shows, not where it was, is where c goes already
		const x = shownLeft('a') + (shownLeft('b') - shownLeft('a')) * 0.1;
		const inShownZoneOnly = x > start.a.left + start.a.width * 0.25;
		pointer(mainWindow.document.body, 'pointermove', x, y);
		const overShownA = { inShownZoneOnly, previews: previews(), translates: translates() };

		// Dropped, the card settles into its slot first; the part moves once it settled, once
		pointer(mainWindow.document.body, 'pointerup', x, y);
		const settling = { shape: grid.describe(), arrangementChanges: arrangementChanges() };
		await timeout(PART_GRID_REFLOW_DURATION + 80);
		const dropped = { shape: grid.describe(), arrangementChanges: arrangementChanges() };

		assert.deepStrictEqual({ overA, overShownA, settling, dropped, settled: { translates: translates(), moving: container.querySelectorAll('.part-grid-lifted, .part-grid-reflow, .part-grid-settle, .part-grid-frame-layer').length } }, {
			overA: { previews: 1, translates: { a: [makeWay.a], b: [makeWay.b] }, lifted: true, slot: true },
			overShownA: { inShownZoneOnly: true, previews: 1, translates: { a: [makeWay.a], b: [makeWay.b] } },
			settling: { shape: 'row(a, b, c)', arrangementChanges: 0 },
			dropped: { shape: 'row(c, a, b)', arrangementChanges: 1 },
			settled: { translates: { a: [], b: [] }, moving: 0 }
		});
	});

	test('a dragged card goes beside a part by where its center is, and to an edge of the window where the pointer pushes it, also over its own slot once it left it', async () => {
		const { grid, container, translates, start, arrangementChanges } = await createRowOfThree(true);
		// c takes an even third of the row (300 of 900), as every part put somewhere; a and b make room in proportion
		const makeWay = { a: 300, b: 380 };

		// The pointer over the top of a, the center of the card, below it, over its left side: c goes left of a
		dragCard(container, 'c', [[start.a.left + start.a.width * 0.2, 60]], { hold: true });
		const byCenter = translates();

		// Up to the top edge of the window, over where c shows now
		pointer(mainWindow.document.body, 'pointermove', start.a.left + 20, 4);
		pointer(mainWindow.document.body, 'pointerup', start.a.left + 20, 4);
		await timeout(PART_GRID_REFLOW_DURATION + 80);

		assert.deepStrictEqual({ byCenter, shape: grid.describe(), arrangementChanges: arrangementChanges() }, {
			byCenter: { a: [makeWay.a], b: [makeWay.b] },
			shape: 'column(c, row(a, b))',
			arrangementChanges: 1
		});
	});

	test('a card sliding to where the dragged card makes way changes course without starting over, and only past the border of a zone', async () => {
		const { container, cellOf, shownLeft, middleY: y, previews } = await createRowOfThree(true);

		// Every style b had, in order
		const styles: string[] = [];
		const observer = new MutationObserver(records => styles.push(...records.map(record => record.oldValue ?? '')));
		observer.observe(cellOf('b'), { attributes: true, attributeFilter: ['style'], attributeOldValue: true });

		dragCard(container, 'c', [[30, y]], { hold: true });
		const translateFirst = cellOf('b').style.translate;

		// Just past the left side of a, where it shows, toward its center, then well into the bottom edge of the window below b
		const aWidth = shownLeft('b') - shownLeft('a');
		pointer(mainWindow.document.body, 'pointermove', shownLeft('a') + aWidth * 0.25 + 4, y);
		const nearBorder = previews();
		pointer(mainWindow.document.body, 'pointermove', shownLeft('b') + 20, 600 - 4);
		const translateSecond = cellOf('b').style.translate;
		styles.push(...observer.takeRecords().map(record => record.oldValue ?? ''), cellOf('b').style.cssText);
		observer.disconnect();

		pressEscape();
		await timeout(PART_GRID_REFLOW_DURATION + 80);

		// Where b went, change by change: from where it was to where it makes way, then on to where it makes way next, with no reset between
		const course = styles.map(style => /translate: ([^;]*)/.exec(style)?.[1] ?? '').filter((translate, index, all) => index === 0 || translate !== all[index - 1]);
		assert.deepStrictEqual({ nearBorder, previews: previews(), changedCourse: translateFirst !== translateSecond, course: course.length, restarted: styles.some(style => /transition/.test(style)) }, {
			nearBorder: 1,
			previews: 2,
			changedCourse: true,
			course: 3,
			restarted: false
		});
	});

	test('the cards that make way are laid out for real where they go, as large as where they were while they slide, and as before once Escape put them back', async () => {
		const { grid, container, cellOf } = await createRowOfThree(true);
		const target = grid.previewArrangement('c', { location: { edge: Direction.Down } })!.get('a')!;
		const laidOut = (id: string) => { const card = cellOf(id).querySelector<HTMLElement>('.part-grid-card')!; return [card.offsetWidth, card.offsetHeight]; };
		const before = laidOut('a');

		// c to the bottom edge of the window: a goes wider and lower
		dragCard(container, 'c', [[450, 596]], { hold: true });
		const sliding = laidOut('a');
		await timeout(PART_GRID_REFLOW_DURATION + 60);
		const slid = laidOut('a');
		pressEscape();
		await timeout(PART_GRID_REFLOW_DURATION + 80);
		pointer(mainWindow.document.body, 'pointerup', 450, 596);

		assert.deepStrictEqual({ sliding, slid, afterEscape: laidOut('a'), shape: grid.describe() }, {
			sliding: [Math.round(target.width), before[1]],
			slid: [Math.round(target.width), Math.round(target.height)],
			afterEscape: before,
			shape: 'row(a, b, c)'
		});
	});

	test('over the center of a part, the cards stay as they are as the card lifted, its slot where it was, and only the part it merges into is highlighted; dropped, it merges once, once the card settled', async () => {
		const { grid, container, cellOf, start, middleY: y } = await createRowOfThree(true);
		let merges = 0;
		const merge = grid.mergeCell;
		grid.mergeCell = (id, targetId) => { merges++; return merge.call(grid, id, targetId); };
		const highlights = () => [...container.querySelectorAll<HTMLElement>('.part-grid-drop-indicator.merge')].map(element => { const r = element.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round).join(); });
		const rectOf = (id: string) => [start[id].left, start[id].top, start[id].width, start[id].height].map(Math.round).join();
		const centerOf = (id: string) => start[id].left + start[id].width / 2;

		// c over the center of a: a merge, with the cards as they are
		dragCard(container, 'c', [[centerOf('a'), y]], { hold: true });
		const overCenter = { translated: ['a', 'b'].filter(id => !!cellOf(id).style.translate), highlights: highlights(), slot: !!container.querySelector('.part-grid-frame.slot') };

		// Beside a, the cards make way; back over its center, they are as they were again
		pointer(mainWindow.document.body, 'pointermove', start.a.left + 30, y);
		const beside = { translated: ['a', 'b'].filter(id => !!cellOf(id).style.translate), highlights: highlights().length };
		const shownA = grid.previewArrangement('c', { location: { reference: 'a', direction: Direction.Left } })!.get('a')!;
		pointer(mainWindow.document.body, 'pointermove', shownA.left + shownA.width / 2, y);
		const backOverCenter = { translated: ['a', 'b'].filter(id => !!cellOf(id).style.translate), highlights: highlights() };

		pointer(mainWindow.document.body, 'pointerup', centerOf('a'), y);
		const settling = { merges, cVisible: grid.isCellVisible('c') };
		await timeout(PART_GRID_REFLOW_DURATION + 80);

		assert.deepStrictEqual({ overCenter, beside, backOverCenter, settling, merged: { merges, cVisible: grid.isCellVisible('c') } }, {
			overCenter: { translated: [], highlights: [rectOf('a')], slot: true },
			beside: { translated: ['a', 'b'], highlights: 0 },
			backOverCenter: { translated: [], highlights: [rectOf('a')] },
			settling: { merges: 0, cVisible: true },
			merged: { merges: 1, cVisible: false }
		});
	});

	test('while a card moves, a part with what draws over it, such as a webview, hides it and shows a placeholder with the editor\'s name, its tabs as they are; a part of text editors does not', async () => {
		const { container, cellOf, middleY: y } = await createRowOfThree(true);
		// Something drawing over an element of the editor of a, as a webview does
		const anchor = cellOf('a').querySelector<HTMLElement>('.editor-group-container')!.appendChild(mainWindow.document.createElement('div'));
		anchor.style.cssText = 'width: 100px; height: 100px;';
		const hidden: boolean[] = [];
		disposables.add(registerOverlayAnchor(anchor, { setHidden: value => hidden.push(value) }));
		const read = () => ({
			placeholders: ['a', 'b'].filter(id => cellOf(id).classList.contains(PART_GRID_PLACEHOLDER_CLASS)),
			names: [...container.querySelectorAll('.part-grid-placeholder .part-grid-placeholder-name')].map(element => element.textContent),
			tabsShown: cellOf('a').querySelector<HTMLElement>('.title')!.style.display !== 'none' && cellOf('a').style.visibility !== 'hidden',
			hidden: [...hidden]
		});

		dragCard(container, 'c', [[30, y]], { hold: true });
		const dragging = read();
		pressEscape();
		await timeout(PART_GRID_REFLOW_DURATION + 80);
		pointer(mainWindow.document.body, 'pointerup', 30, y);

		assert.deepStrictEqual({ dragging, after: read() }, {
			dragging: { placeholders: ['a'], names: ['Editor testEditorInputForPartGrid'], tabsShown: true, hidden: [true] },
			after: { placeholders: [], names: [], tabsShown: true, hidden: [true, false] }
		});
	});

	test('a drop that fails as the card settles still ends the drag: no layer over the window, the cards as the grid lays them out, and another drag can start', async () => {
		const { grid, container, start } = await createRowOfThree(true);
		const errors: unknown[] = [];
		const handler = errorHandler.getUnexpectedErrorHandler();
		errorHandler.setUnexpectedErrorHandler(error => errors.push(error));
		disposables.add(toDisposable(() => errorHandler.setUnexpectedErrorHandler(handler)));

		// c dropped beside a, which goes before the drop is done: the drop fails
		dragCard(container, 'c', [[start.a.left + start.a.width * 0.2, 60]], { hold: true });
		pointer(mainWindow.document.body, 'pointerup', start.a.left + start.a.width * 0.2, 60);
		grid.removeCell('a');
		await timeout(PART_GRID_REFLOW_DURATION + 80);
		const after = { errors: errors.length, layers: container.querySelectorAll('.part-grid-drag-cursor, .part-grid-motion-layer, .part-grid-frame-layer').length, dragging: container.classList.contains('part-grid-card-dragging') };

		const handle = container.querySelector<HTMLElement>('[data-part-grid-cell="b"] .part-grid-drag-handle')!;
		const startsAgain = grid.startPartDrag('b', new PointerEvent('pointerdown', { button: 0, clientX: handle.getBoundingClientRect().left, clientY: 2 }));
		pointer(mainWindow.document.body, 'pointerup', 0, 0);

		assert.deepStrictEqual({ after, startsAgain }, { after: { errors: 1, layers: 0, dragging: false }, startsAgain: true });
	});

	test('Escape puts the dragged card and the others back, and moves nothing', async () => {
		const { grid, container, translates, middleY: y, arrangementChanges } = await createRowOfThree(true);
		const before = grid.describe();
		// c takes an even third of the row (300 of 900), as every part put somewhere; a and b make room in proportion
		const makeWay = { a: 300, b: 380 };

		dragCard(container, 'c', [[30, y]], { hold: true });
		const dragging = translates();
		pressEscape();
		const cancelling = container.classList.contains('part-grid-settling');
		await timeout(PART_GRID_REFLOW_DURATION + 80);
		pointer(mainWindow.document.body, 'pointerup', 30, 300);

		assert.deepStrictEqual({ dragging, cancelling, after: { shape: grid.describe(), translates: translates(), arrangementChanges: arrangementChanges(), layers: container.querySelectorAll('.part-grid-frame-layer, .part-grid-motion-layer, .part-grid-drop-indicator.part').length } }, {
			dragging: { a: [makeWay.a], b: [makeWay.b] },
			cancelling: true,
			after: { shape: before, translates: { a: [], b: [] }, arrangementChanges: 0, layers: 0 }
		});
	});

	test('without motion, no card lifts or slides: where it goes shows as a slot, and the drop moves the part at once', async () => {
		const { grid, container, cellOf, translates, arrangementChanges } = await createRowOfThree(false);

		dragCard(container, 'c', [[30, 300]], { hold: true });
		const dragging = { translates: translates(), lifted: cellOf('c').classList.contains('part-grid-lifted'), frames: !!container.querySelector('.part-grid-frame-layer'), slot: !!container.querySelector('.part-grid-drop-indicator.part:not([style*="display: none"])') };
		pointer(mainWindow.document.body, 'pointerup', 30, 300);

		assert.deepStrictEqual({ dragging, dropped: { shape: grid.describe(), arrangementChanges: arrangementChanges(), moving: container.querySelectorAll('.part-grid-moving, .part-grid-settle').length } }, {
			dragging: { translates: { a: [], b: [] }, lifted: false, frames: false, slot: true },
			dropped: { shape: 'row(c, a, b)', arrangementChanges: 1, moving: 0 }
		});
	});

	test('a part dropped on the center of another merges into it, the whole part highlighted; where parts do not merge, it goes beside it, on its nearest side', async () => {
		const parts = await createParts();
		const container = boxAt(0, 0, 1000, 800);
		const grid = disposables.add(new PartGrid(container, parts));
		const [left, right] = [createPart(parts), createPart(parts)];
		const [leftFile, rightFile] = await Promise.all([openEditor(left, '/left.txt'), openEditor(right, '/right.txt')]);
		grid.addPart('left', left);
		grid.addPart('right', right, { reference: 'left', direction: Direction.Right });
		grid.layout(1000, 800);

		const cellOf = (id: string) => container.querySelector<HTMLElement>(`[data-part-grid-cell="${id}"]`)!;
		const rectOf = (element: HTMLElement) => { const r = element.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); };
		const dragToCenter = () => {
			const target = cellOf('left').getBoundingClientRect();
			const point = [target.left + target.width / 2, target.top + target.height / 2] as const;
			dragCard(container, 'right', [point], { hold: true });
			const indicator = container.querySelector<HTMLElement>('.part-grid-drop-indicator.part');
			const feedback = !indicator || indicator.style.display === 'none' ? 'none' : { merge: indicator.classList.contains('merge'), wholeTarget: rectOf(indicator).join() === rectOf(cellOf('left')).join() };
			pointer(mainWindow.document.body, 'pointerup', ...point);
			return { feedback, shape: grid.describe(), rightVisible: grid.isCellVisible('right') };
		};

		grid.setMergeAllowed(false);
		const notMerging = dragToCenter();
		grid.setMergeAllowed(true);
		const merging = dragToCenter();
		await timeout(0);

		assert.deepStrictEqual({ notMerging, merging, leftEditors: left.activeGroup.editors.map(editor => editor === leftFile ? 'left' : editor === rightFile ? 'right' : 'other') }, {
			notMerging: { feedback: { merge: false, wholeTarget: false }, shape: 'row(right, left)', rightVisible: true },
			merging: { feedback: { merge: true, wholeTarget: true }, shape: 'row(right, left)', rightVisible: false },
			leftEditors: ['left', 'right']
		});
	});

	test('Move Part moves the active part past the part beside it, or to that edge of the window', async () => {
		const parts = await createParts();
		const grid = createGrid();
		const [a, b, c] = [createPart(parts), createPart(parts), createPart(parts)];
		await Promise.all([openEditor(a, '/a.txt'), openEditor(b, '/b.txt'), openEditor(c, '/c.txt')]);
		grid.addPart('a', a);
		grid.addPart('b', b, { edge: Direction.Right });
		grid.addPart('c', c, { edge: Direction.Right });

		const focusable = (a.element as HTMLElement).appendChild(mainWindow.document.createElement('div'));
		focusable.tabIndex = 0;
		focusable.focus();
		instantiationService.invokeFunction(accessor => new MovePartRightAction().run(accessor));
		const byCommand = grid.describe();

		const atEdge = grid.moveCellInDirection('c', Direction.Right);
		const toEdge = grid.moveCellInDirection('a', Direction.Down);

		assert.deepStrictEqual({ byCommand, atEdge, toEdge, shape: grid.describe() }, {
			byCommand: 'row(b, a, c)',
			atEdge: false,
			toEdge: true,
			shape: 'column(row(b, c), a)'
		});
	});

	test('Move Part and Move Editor into New Part say so where the parts of the window do not move', async () => {
		const parts = await createParts();
		await parts.mainPart.activeGroup.openEditor(disposables.add(new TestFileEditorInput(URI.file('/main.txt'), TEST_EDITOR_INPUT_ID)), { pinned: true });
		const ariaParent = createContainer();
		setARIAContainer(ariaParent);
		const announced = () => [...ariaParent.querySelectorAll('.monaco-status')].map(element => element.textContent).join('');

		const focusable = parts.testMainPart.getContainer()!.appendChild(mainWindow.document.createElement('div'));
		focusable.tabIndex = 0;
		focusable.focus();
		instantiationService.invokeFunction(accessor => new MovePartRightAction().run(accessor));
		const movePart = announced();
		instantiationService.invokeFunction(accessor => new MoveEditorIntoNewPartBelowAction().run(accessor));
		const newPart = announced();

		assert.deepStrictEqual({ movePart, newPart }, { movePart: 'The parts of this window do not move', newPart: 'Editors do not go into new parts in this window' });
	});

	test('Move Part gives the moved part an even share of the row or column it joins, the other parts making room in proportion, as every part put somewhere', async () => {
		const parts = await createParts();
		const grid = createGrid();
		const [chat, main, terminals] = [createPart(parts), createPart(parts), createPart(parts)];
		await Promise.all([openEditor(chat, '/chat.txt'), openEditor(terminals, '/terminals.txt')]);
		// As a chat window in Chat Only with the terminals across the window: the main part has no editors and hides
		grid.addPart('chat', chat);
		grid.addPart('main', main, { reference: 'chat', direction: Direction.Right });
		grid.addPart('terminals', terminals, { edge: Direction.Down });
		grid.addView('title', createView(), { edge: Direction.Up });
		grid.resizeCell('terminals', { width: 1000, height: 72 });
		const heights = () => ({ shape: grid.describe(), chat: grid.getCellSize('chat').height, terminals: grid.getCellSize('terminals').height });
		const before = heights();

		const down = grid.moveCellInDirection('chat', Direction.Down);
		const movedDown = heights();
		const up = grid.moveCellInDirection('chat', Direction.Up);

		assert.deepStrictEqual({ before, down, movedDown, up, movedUp: heights() }, {
			before: { shape: 'column(title, row(chat, main), terminals)', chat: 698, terminals: 72 },
			down: true,
			movedDown: { shape: 'column(title, main, terminals, chat)', chat: 385, terminals: 385 },
			up: true,
			movedUp: { shape: 'column(title, main, chat, terminals)', chat: 385, terminals: 385 }
		});
	});

	test('Move Part to the edge a part is at already leaves the parts as they are, sizes included', async () => {
		const parts = await createParts();
		const grid = createGrid();
		const [top, bottom] = [createPart(parts), createPart(parts)];
		await Promise.all([openEditor(top, '/top.txt'), openEditor(bottom, '/bottom.txt')]);
		grid.addPart('top', top);
		grid.addPart('bottom', bottom, { edge: Direction.Down });
		grid.resizeCell('bottom', { width: grid.getCellSize('bottom').width, height: 200 });
		const before = { shape: grid.describe(), bottomHeight: grid.getCellSize('bottom').height };

		const moved = grid.moveCellInDirection('bottom', Direction.Down);

		assert.deepStrictEqual({ moved, shape: grid.describe(), bottomHeight: grid.getCellSize('bottom').height }, { moved: false, ...before });
	});

	test('Move Part moves past parts only, not past a view beside it such as a title row', async () => {
		const parts = await createParts();
		const grid = createGrid();
		const [chat, main] = [createPart(parts), createPart(parts)];
		await Promise.all([openEditor(chat, '/chat.txt'), openEditor(main, '/main.txt')]);
		grid.addPart('chat', chat);
		grid.addView('title', createView(), { reference: 'chat', direction: Direction.Up });
		grid.addPart('main', main, { edge: Direction.Right });
		const before = grid.describe();

		const moved = grid.moveCellInDirection('main', Direction.Left);

		assert.deepStrictEqual({ before, moved, after: grid.describe(), mainHeight: grid.getCellSize('main').height > 30 }, {
			before: 'row(column(title, chat), main)',
			moved: true,
			after: 'column(title, row(main, chat))',
			mainHeight: true
		});
	});

	test('a part added or moved to an edge of the window goes beside the parts, and a view spanning the window such as a title row keeps spanning it', async () => {
		const parts = await createParts();
		const grid = createGrid();
		const [chat, main, side] = [createPart(parts), createPart(parts), createPart(parts)];
		await Promise.all([openEditor(chat, '/chat.txt'), openEditor(main, '/main.txt'), openEditor(side, '/side.txt')]);
		grid.addPart('chat', chat);
		grid.addPart('main', main, { reference: 'chat', direction: Direction.Right });
		grid.addView('title', createView(), { edge: Direction.Up });
		const before = grid.describe();

		grid.addPart('side', side, { edge: Direction.Right });
		const added = grid.describe();
		grid.moveCell('chat', { edge: Direction.Up });
		const movedUp = grid.describe();
		grid.moveCell('chat', { edge: Direction.Down });

		assert.deepStrictEqual({ before, added, movedUp, movedDown: grid.describe() }, {
			before: 'column(title, row(chat, main))',
			added: 'column(title, row(chat, main, side))',
			movedUp: 'column(title, chat, row(main, side))',
			movedDown: 'column(title, row(main, side), chat)'
		});
	});

	test('an editor dropped on an edge of the window outside the parts goes into a new part there, which closes with its last editor', async () => {
		const parts = await createParts();
		const container = boxAt(0, 0, 1000, 800);
		const grid = disposables.add(new PartGrid(container, parts));
		const side = createPart(parts);
		const file = await openEditor(side, '/file.txt');
		await openEditor(side, '/other.txt');
		grid.addPart('side', side);
		grid.setOuterInsets({ top: 8, right: 8, bottom: 8, left: 8 });
		grid.layout(1000, 800);

		const editorTransfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();
		const dropFile = (x: number, y: number) => {
			editorTransfer.setData([new DraggedEditorIdentifier({ editor: file, groupId: side.activeGroup.id })], DraggedEditorIdentifier.prototype);
			const target = container.querySelector('.part-grid')!;
			dispatch(target, 'dragover', x, y);
			const indicatorShown = container.querySelector<HTMLElement>('.part-grid-drop-indicator')!.style.display !== 'none';
			dispatch(target, 'drop', x, y);
			editorTransfer.clearData(DraggedEditorIdentifier.prototype);
			return indicatorShown;
		};

		// Without a part factory, editors do not go into new parts
		const withoutFactory = { indicatorShown: dropFile(996, 400), shape: grid.describe() };

		let created = 0;
		disposables.add(grid.setPartFactory({ createPart: () => ({ id: `new${++created}`, part: createPart(parts) }) }));
		const atRightEdge = { indicatorShown: dropFile(996, 400), shape: grid.describe() };
		const newPart = PartGrid.findPart(parts.getPart(parts.groups.find(group => group.contains(file))!))?.id;

		// Closing its last editor closes the new part
		await parts.getPart(parts.groups.find(group => group.contains(file))!).activeGroup.closeEditor(file);
		await timeout(0);

		assert.deepStrictEqual({ withoutFactory, atRightEdge, newPart, afterClose: grid.describe() }, {
			withoutFactory: { indicatorShown: false, shape: 'side' },
			atRightEdge: { indicatorShown: true, shape: 'row(side, new1)' },
			newPart: 'new1',
			afterClose: 'side'
		});
	});

	test('the cell of a part split into groups is marked, so that a look can frame the part once, as one card, and the card follows that look as it splits and joins', async () => {
		const parts = await createParts();
		const container = boxAt(0, 0, 1000, 800);
		// A look where the content of a card draws its frame, except where the part is split: then the card frames all its groups
		const style = container.appendChild(mainWindow.document.createElement('style'));
		style.textContent = '.part-grid-cell > .part-grid-card { --part-grid-card-border-width: 1px; --part-grid-card-frame-owner: content; } .part-grid-cell[data-part-grid-split] > .part-grid-card { --part-grid-card-frame-owner: card; }';
		const grid = disposables.add(new PartGrid(container, parts));
		const [side, main] = [createPart(parts), createPart(parts)];
		await Promise.all([openEditor(side, '/side.txt'), openEditor(main, '/main.txt')]);
		grid.addPart('side', side);
		grid.addPart('main', main, { reference: 'side', direction: Direction.Right });
		grid.setGap(8);
		grid.layout(1000, 800);
		const cellOf = (id: string) => container.querySelector<HTMLElement>(`[data-part-grid-cell="${id}"]`)!;
		const read = () => ({ split: cellOf('main').dataset.partGridSplit !== undefined, cardLeft: cellOf('main').querySelector<HTMLElement>('.part-grid-card')!.getBoundingClientRect().left - cellOf('main').getBoundingClientRect().left });

		const single = read();
		const added = main.addGroup(main.activeGroup, GroupDirection.DOWN);
		const split = read();
		main.removeGroup(added);

		assert.deepStrictEqual({ single, split, joined: read() }, {
			single: { split: false, cardLeft: 3 },
			split: { split: true, cardLeft: 4 },
			joined: { split: false, cardLeft: 3 }
		});
	});

	test('the cells of the parts the grid created are marked, so that a look can frame them as the parts they are like, with their cards at the same edges', async () => {
		const parts = await createParts();
		const container = boxAt(0, 0, 1000, 800);
		// A look that leaves the frame of the main part, and of the parts like it, to their content
		const style = container.appendChild(mainWindow.document.createElement('style'));
		style.textContent = '.part-grid-cell > .part-grid-card { --part-grid-card-border-width: 1px; } .part-grid-cell:is([data-part-grid-cell="main"], [data-part-grid-created]) > .part-grid-card { --part-grid-card-frame-owner: content; }';
		const grid = disposables.add(new PartGrid(container, parts));
		const [side, main] = [createPart(parts), createPart(parts)];
		await openEditor(side, '/side.txt');
		const file = await openEditor(main, '/file.txt');
		await openEditor(main, '/other.txt');
		grid.addPart('side', side);
		grid.addPart('main', main, { reference: 'side', direction: Direction.Right });
		grid.setGap(8);
		disposables.add(grid.setPartFactory({ createPart: () => ({ id: 'created', part: createPart(parts) }) }));
		// Below the main part, beside the side part: the cards keep a gap to it
		grid.moveEditorsIntoNewPart([{ editor: file, groupId: main.activeGroup.id }], { reference: 'main', direction: Direction.Down });
		grid.layout(1000, 800);

		const card = (id: string) => container.querySelector<HTMLElement>(`[data-part-grid-cell="${id}"] > .part-grid-card`)!.getBoundingClientRect();
		const cellOf = (id: string) => container.querySelector<HTMLElement>(`[data-part-grid-cell="${id}"]`)!;
		assert.deepStrictEqual({
			shape: grid.describe(),
			marked: ['side', 'main', 'created'].filter(id => cellOf(id).dataset.partGridCreated !== undefined),
			left: card('created').left - card('main').left,
			right: card('created').right - card('main').right
		}, { shape: 'row(side, column(main, created))', marked: ['created'], left: 0, right: 0 });
	});

	test('with no gap or insets, an editor dropped where the last move showed a new part goes there, also when what is under the pointer then is outside the grid', async () => {
		const parts = await createParts();
		const container = boxAt(0, 0, 1000, 800);
		const grid = disposables.add(new PartGrid(container, parts));
		const main = createPart(parts);
		const file = await openEditor(main, '/file.txt');
		await openEditor(main, '/other.txt');
		grid.addPart('main', main);
		grid.setGap(0);
		grid.layout(1000, 800);
		disposables.add(grid.setPartFactory({ createPart: () => ({ id: 'new', part: createPart(parts) }) }));

		const editorTransfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();
		editorTransfer.setData([new DraggedEditorIdentifier({ editor: file, groupId: main.activeGroup.id })], DraggedEditorIdentifier.prototype);
		const over = new DragEvent('dragover', { dataTransfer: new DataTransfer(), clientX: 3, clientY: 300, bubbles: true, cancelable: true });
		mainWindow.document.elementFromPoint(3, 300)!.dispatchEvent(over);
		// As the cards made way, what is under the pointer is something outside the grid, such as a webview over it
		const outside = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		disposables.add(toDisposable(() => outside.remove()));
		const drop = new DragEvent('drop', { dataTransfer: new DataTransfer(), clientX: 3, clientY: 300, bubbles: true, cancelable: true });
		outside.dispatchEvent(drop);
		editorTransfer.clearData(DraggedEditorIdentifier.prototype);
		await timeout(PART_GRID_REFLOW_DURATION + 60);

		assert.deepStrictEqual({ accepted: over.defaultPrevented, dropHandled: drop.defaultPrevented, shape: grid.describe() }, {
			accepted: true,
			dropHandled: true,
			shape: 'row(new, main)'
		});
	});

	test('without outer insets, an editor dragged over a part near an edge of the window goes into a new part there, and the part\'s own drop overlay goes away', async () => {
		const parts = await createParts();
		const container = boxAt(0, 0, 1000, 800);
		const grid = disposables.add(new PartGrid(container, parts));
		const side = createPart(parts);
		const file = await openEditor(side, '/file.txt');
		await openEditor(side, '/other.txt');
		grid.addPart('side', side);
		grid.layout(1000, 800);
		disposables.add(grid.setPartFactory({ createPart: () => ({ id: 'new', part: createPart(parts) }) }));

		const editorTransfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();
		editorTransfer.setData([new DraggedEditorIdentifier({ editor: file, groupId: side.activeGroup.id })], DraggedEditorIdentifier.prototype);
		const groupElement = container.querySelector<HTMLElement>('.editor-group-container')!;
		dispatch(groupElement, 'dragenter', 500, 300);
		const partOverlay = !!container.querySelector('#monaco-workbench-editor-drop-overlay');
		dispatch(mainWindow.document.elementFromPoint(500, 4)!, 'dragover', 500, 4);
		const atTopEdge = { indicatorShown: container.querySelector<HTMLElement>('.part-grid-drop-indicator')!.style.display !== 'none', partOverlay: !!container.querySelector('#monaco-workbench-editor-drop-overlay') };
		dispatch(mainWindow.document.elementFromPoint(500, 4)!, 'drop', 500, 4);
		editorTransfer.clearData(DraggedEditorIdentifier.prototype);

		assert.deepStrictEqual({ partOverlay, atTopEdge, shape: grid.describe() }, {
			partOverlay: true,
			atTopEdge: { indicatorShown: true, partOverlay: false },
			shape: 'column(new, side)'
		});
	});

	test('editors go into a new part at an edge of the window, on the rim of a card or between cards; further into a card, they are the part\'s', () => {
		const container = { left: 0, top: 0, width: 1000, height: 600 };
		const cells = [{ id: 'a', rect: { left: 8, top: 8, width: 480, height: 584 } }, { id: 'b', rect: { left: 496, top: 8, width: 496, height: 584 } }];
		const at = (x: number, y: number) => getPartGridNewPartZone(x, y, container, cells);

		assert.deepStrictEqual({ windowEdge: at(500, 10), aRim: at(480, 300), gap: at(492, 300), bRim: at(500, 300), aInside: at(240, 300), outside: at(1200, 300) }, {
			windowEdge: { edge: Direction.Up },
			aRim: { reference: 'a', direction: Direction.Right },
			gap: { reference: 'a', direction: Direction.Right },
			bRim: { reference: 'b', direction: Direction.Left },
			aInside: undefined,
			outside: undefined
		});
	});

	async function createEditorDragGrid(motion: boolean) {
		const parts = await createParts();
		const container = boxAt(0, 0, 1000, 800);
		if (motion) {
			container.classList.add('monaco-enable-motion');
		}
		const grid = disposables.add(new PartGrid(container, parts));
		const [side, main] = [createPart(parts), createPart(parts)];
		const file = await openEditor(side, '/file.txt');
		await Promise.all([openEditor(side, '/other.txt'), openEditor(main, '/main.txt')]);
		grid.addPart('side', side);
		grid.addPart('main', main, { reference: 'side', direction: Direction.Right });
		grid.setGap(8);
		grid.layout(1000, 800);
		let created = 0;
		disposables.add(grid.setPartFactory({ createPart: () => ({ id: `new${++created}`, part: createPart(parts) }) }));

		const editorTransfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();
		editorTransfer.setData([new DraggedEditorIdentifier({ editor: file, groupId: side.activeGroup.id })], DraggedEditorIdentifier.prototype);
		disposables.add({ dispose: () => editorTransfer.clearData(DraggedEditorIdentifier.prototype) });
		const card = (id: string) => container.querySelector<HTMLElement>(`[data-part-grid-cell="${id}"] > .part-grid-card`)!.getBoundingClientRect();
		// Over what is there, or, outside the test window, over the grid
		const over = (type: string, x: number, y: number) => dispatch(mainWindow.document.elementFromPoint(x, y) ?? container.querySelector('.part-grid')!, type, x, y);
		const feedback = () => ({
			slot: !!container.querySelector('.part-grid-frame.slot') || container.querySelector<HTMLElement>('.part-grid-drop-indicator')!.style.display !== 'none',
			partOverlay: !!container.querySelector('#monaco-workbench-editor-drop-overlay'),
			mainMoved: !!container.querySelector<HTMLElement>('[data-part-grid-cell="main"]')!.style.translate
		});

		return { grid, container, side, main, card, over, feedback, created: () => created, renew: () => editorTransfer.setData([new DraggedEditorIdentifier({ editor: file, groupId: side.activeGroup.id })], DraggedEditorIdentifier.prototype) };
	}

	test('without motion, editors dragged between two cards or on the rim of a card go into a new part beside it, shown as its slot; further in, the part\'s own drop overlay takes them', async () => {
		const { grid, container, card, over, feedback, created, renew } = await createEditorDragGrid(false);
		const main = card('main');
		const y = main.top + main.height / 2;

		const mainGroup = container.querySelector<HTMLElement>('[data-part-grid-cell="main"] .editor-group-container')!;
		dispatch(mainGroup, 'dragenter', main.left + main.width / 2, y);
		over('dragover', main.left + main.width / 2, y);
		const inside = feedback();
		over('dragover', main.left - 4, y);
		const inGap = feedback();
		over('drop', main.left - 4, y);
		const afterGap = grid.describe();

		renew();
		const moved = card('main');
		over('dragover', moved.left + 6, moved.top + moved.height / 2);
		const onRim = feedback();
		over('drop', moved.left + 6, moved.top + moved.height / 2);

		assert.deepStrictEqual({ inside, inGap, afterGap, onRim, shape: grid.describe(), created: created() }, {
			inside: { slot: false, partOverlay: true, mainMoved: false },
			inGap: { slot: true, partOverlay: false, mainMoved: false },
			afterGap: 'row(side, new1, main)',
			onRim: { slot: true, partOverlay: false, mainMoved: false },
			shape: 'row(side, new1, new2, main)',
			created: 2
		});
	});

	test('with motion, the cards make way for the slot of a new part, slide back as the editors go into a part, and the part comes once, once the cards settled', async () => {
		const { grid, container, card, over, feedback, created } = await createEditorDragGrid(true);
		const main = card('main');
		const y = main.top + main.height / 2;

		over('dragover', main.left + 6, y);
		const onRim = feedback();
		// Into main where it shows, its right side, as the slot took its left
		over('dragover', main.left + main.width - 60, y);
		const intoPart = feedback();
		await timeout(PART_GRID_REFLOW_DURATION + 80);
		const slidBack = { layers: container.querySelectorAll('.part-grid-frame-layer').length, mainMoved: feedback().mainMoved };

		over('dragover', main.left + 6, y);
		over('drop', main.left + 6, y);
		const dropped = { shape: grid.describe(), created: created() };
		await timeout(PART_GRID_REFLOW_DURATION + 80);

		assert.deepStrictEqual({ onRim, intoPart: { slot: intoPart.slot }, slidBack, dropped, settled: { shape: grid.describe(), created: created(), layers: container.querySelectorAll('.part-grid-frame-layer').length } }, {
			onRim: { slot: true, partOverlay: false, mainMoved: true },
			intoPart: { slot: true },
			slidBack: { layers: 0, mainMoved: false },
			dropped: { shape: 'row(side, main)', created: 0 },
			settled: { shape: 'row(side, new1, main)', created: 1, layers: 0 }
		});
	});

	test('a drag of editors from another window that ends there, such as cancelled there, leaves the cards and the slot of a new part as they were', async () => {
		const { container, card, over, feedback } = await createEditorDragGrid(true);
		const frame = append(mainWindow.document.body, $<HTMLIFrameElement>('iframe'));
		disposables.add(toDisposable(() => frame.remove()));
		const otherWindow = frame.contentWindow!;
		ensureCodeWindow(otherWindow, 2000);
		disposables.add(registerWindow(otherWindow));
		const main = card('main');
		const y = main.top + main.height / 2;

		over('dragover', main.left + 6, y);
		const whileDragged = feedback();
		// Escape in the other window: a leave with no related target, inside the grid, and the end there
		dispatch(container.querySelector('.part-grid')!, 'dragleave', main.left + 6, y);
		const afterLeave = feedback();
		otherWindow.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
		await timeout(PART_GRID_REFLOW_DURATION + 80);

		assert.deepStrictEqual({ whileDragged, afterLeave, afterEnd: feedback(), layers: container.querySelectorAll('.part-grid-frame-layer').length }, {
			whileDragged: { slot: true, partOverlay: false, mainMoved: true },
			afterLeave: { slot: true, partOverlay: false, mainMoved: true },
			afterEnd: { slot: false, partOverlay: false, mainMoved: false },
			layers: 0
		});
	});

	test('a dragged card goes back where it was as its window loses focus, and nothing moves', async () => {
		const { grid, container, cellOf, middleY } = await createRowOfThree(true);
		dragCard(container, 'c', [[30, middleY]], { hold: true });
		const lifted = cellOf('c').classList.contains('part-grid-lifted');
		mainWindow.dispatchEvent(new FocusEvent('blur'));
		await timeout(PART_GRID_REFLOW_DURATION + 80);
		pointer(mainWindow.document.body, 'pointerup', 30, middleY);

		assert.deepStrictEqual({ lifted, shape: grid.describe(), moving: container.querySelectorAll('.part-grid-lifted, .part-grid-reflow, .part-grid-frame-layer').length }, { lifted: true, shape: 'row(a, b, c)', moving: 0 });
	});

	test('a grid disposed while a drop still settles drops it: no part is created, and no part moves', async () => {
		const editorDrag = await createEditorDragGrid(true);
		const main = editorDrag.card('main');
		editorDrag.over('dragover', main.left + 6, main.top + main.height / 2);
		editorDrag.over('drop', main.left + 6, main.top + main.height / 2);
		editorDrag.grid.dispose();

		const cardDrag = await createRowOfThree(true);
		dragCard(cardDrag.container, 'c', [[30, cardDrag.middleY]]);
		cardDrag.grid.dispose();
		await timeout(PART_GRID_REFLOW_DURATION + 80);

		assert.deepStrictEqual({ created: editorDrag.created(), arrangementChanges: cardDrag.arrangementChanges() }, { created: 0, arrangementChanges: 0 });
	});

	test('editors dragged with the key that toggles splitting go into the part under them, as into its groups; with the copy key, a new part gets a copy', async () => {
		const { grid, container, side, card, feedback, created } = await createEditorDragGrid(false);
		const file = side.activeGroup.getEditors(EditorsOrder.SEQUENTIAL).find(editor => editor.resource?.path === '/file.txt')!;
		const main = card('main');
		const [x, y] = [main.left - 4, main.top + main.height / 2];
		const withKeys = (type: string, keys: KeyboardEventInit) => (mainWindow.document.elementFromPoint(x, y) ?? container.querySelector('.part-grid')!).dispatchEvent(new DragEvent(type, { dataTransfer: new DataTransfer(), clientX: x, clientY: y, bubbles: true, cancelable: true, ...keys }));
		const toggleSplit = isMacintosh ? { shiftKey: true } : { altKey: true };
		const copy = isMacintosh ? { altKey: true } : { ctrlKey: true };

		withKeys('dragover', toggleSplit);
		const toggled = feedback().slot;
		withKeys('dragover', copy);
		withKeys('drop', copy);

		assert.deepStrictEqual({ toggled, shape: grid.describe(), created: created(), stillInSide: side.activeGroup.contains(file) }, { toggled: false, shape: 'row(side, new1, main)', created: 1, stillInSide: true });
	});

	test('a part that does not lay out in previews, such as one showing terminals, is not laid out as the cards make way or go back, only clipped', async () => {
		const { grid, main, card, over, feedback } = await createEditorDragGrid(true);
		grid.setPreviewLayoutAllowed(id => id !== 'main');
		const layouts: string[] = [];
		const layout = main.layout.bind(main);
		main.layout = (width, height, top, left) => {
			layouts.push(`${width}x${height}`);
			layout(width, height, top, left);
		};
		const rect = card('main');
		const y = rect.top + rect.height / 2;

		// On the rim of main: the slot takes room beside it, and main makes way
		over('dragover', rect.left + 6, y);
		const whileShown = { mainMoved: feedback().mainMoved, layouts: [...layouts] };
		await timeout(PART_GRID_REFLOW_DURATION + 80);
		const afterSlide = [...layouts];
		over('dragleave', 2000, y);
		await timeout(PART_GRID_REFLOW_DURATION + 80);

		assert.deepStrictEqual({ whileShown, afterSlide, afterCancel: layouts }, {
			whileShown: { mainMoved: true, layouts: [] },
			afterSlide: [],
			afterCancel: []
		});
	});

	test('Move Editor into New Part moves the active editor into a new part beside its part', async () => {
		const parts = await createParts();
		const grid = createGrid();
		const side = createPart(parts);
		const file = await openEditor(side, '/file.txt');
		await openEditor(side, '/other.txt');
		await side.activeGroup.openEditor(file);
		grid.addPart('side', side);
		disposables.add(grid.setPartFactory({ createPart: () => ({ id: 'new', part: createPart(parts) }) }));

		const focusable = (side.element as HTMLElement).appendChild(mainWindow.document.createElement('div'));
		focusable.tabIndex = 0;
		focusable.focus();
		instantiationService.invokeFunction(accessor => new MoveEditorIntoNewPartBelowAction().run(accessor));

		assert.deepStrictEqual({ shape: grid.describe(), inSide: side.activeGroup.contains(file) }, { shape: 'column(side, new)', inSide: false });
	});
});
