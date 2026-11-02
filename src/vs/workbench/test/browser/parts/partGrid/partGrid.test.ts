/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { Direction, Orientation } from '../../../../../base/browser/ui/grid/grid.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { LocalSelectionTransfer } from '../../../../../platform/dnd/browser/dnd.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IPartGridView, PART_GRID_TOP_EDGE_CLASS, PART_GRID_TOP_EDGE_GROUP_CLASS, PART_GRID_TOP_RIGHT_GROUP_CLASS, PartGrid } from '../../../../browser/parts/partGrid/partGrid.js';
import { IEditorGroupView } from '../../../../browser/parts/editor/editor.js';
import { DraggedEditorIdentifier } from '../../../../browser/dnd.js';
import { ContentPart } from '../../../../browser/parts/editor/contentPart.js';
import { MoveEditorIntoNewPartBelowAction, MovePartRightAction } from '../../../../browser/parts/partGrid/partGridActions.js';
import { DraggedPartIdentifier, getPartGridDrop } from '../../../../browser/parts/partGrid/partGridDnd.js';
import { GRID_GAP_SASH_CLASS } from '../../../../browser/parts/partGrid/partGridGap.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../common/editor.js';
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
		const grid = disposables.add(new PartGrid(container));
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
		const grid = disposables.add(new PartGrid(container));
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
		const grid = disposables.add(new PartGrid(container));
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
		const grid = disposables.add(new PartGrid(container));
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
		const grid = disposables.add(new PartGrid(container));
		grid.addView('title', createView());
		grid.addView('other', { ...createView(), minimumHeight: 0, maximumHeight: Number.POSITIVE_INFINITY }, { edge: Direction.Down });
		grid.layout(1000, 800);

		container.style.setProperty('--part-grid-card-border-width', '1px');
		grid.resizeCell('other', { width: 1000, height: 700 });
		const afterCellLayout = grid.getCellSize('title').height;
		grid.updateLook();

		assert.deepStrictEqual({ afterCellLayout, afterUpdateLook: grid.getCellSize('title').height }, { afterCellLayout: 30, afterUpdateLook: 32 });
	});

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
		const at = (x: number, y: number, excluded?: string) => getPartGridDrop(x, y, container, cells, excluded)?.location;

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
		const indicator = container.querySelector<HTMLElement>('.part-grid-drop-indicator')!;
		const drag = (id: string, x: (rect: DOMRect) => number, y: (rect: DOMRect) => number, over = 'side') => {
			dispatch(cellOf(id).querySelector('.part-grid-drag-handle')!, 'dragstart');
			const rect = over === 'window' ? container.getBoundingClientRect() : cellOf(over).getBoundingClientRect();
			const point = [x(rect), y(rect)] as const;
			dispatch(cellOf(over === 'window' ? 'side' : over), 'dragover', ...point);
			const indicatorShown = indicator.style.display !== 'none';
			const editorOverlay = !!container.querySelector('#monaco-workbench-editor-drop-overlay');
			dispatch(cellOf(over === 'window' ? 'side' : over), 'drop', ...point);
			dispatch(cellOf(id).querySelector('.part-grid-drag-handle')!, 'dragend');
			return { indicatorShown, editorOverlay, shape: grid.describe() };
		};

		const besideSide = drag('bottom', rect => rect.left + rect.width * 0.2, rect => rect.top + rect.height / 2);
		const toBottomEdge = drag('bottom', rect => rect.left + rect.width / 2, rect => rect.bottom - 4, 'window');
		const ontoItself = drag('side', rect => rect.left + rect.width / 2, rect => rect.top + rect.height / 2);

		assert.deepStrictEqual({ besideSide, toBottomEdge, ontoItself, transfer: LocalSelectionTransfer.getInstance<DraggedPartIdentifier>().hasData(DraggedPartIdentifier.prototype), indicatorAfter: indicator.style.display }, {
			besideSide: { indicatorShown: true, editorOverlay: false, shape: 'row(bottom, side, chat)' },
			toBottomEdge: { indicatorShown: true, editorOverlay: false, shape: 'column(row(side, chat), bottom)' },
			ontoItself: { indicatorShown: false, editorOverlay: false, shape: 'column(row(side, chat), bottom)' },
			transfer: false,
			indicatorAfter: 'none'
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

	test('a part that shows through a view of its owner is a part of the grid: it drags, moves and shows while it has editors', async () => {
		const parts = await createParts();
		const container = createContainer();
		const [a, b] = [createPart(parts), createPart(parts)];
		await openEditor(a, '/a.txt');
		const file = await openEditor(b, '/b.txt');
		const view: IPartGridView = { ...createView(), element: mainWindow.document.createElement('div'), minimumHeight: 0, maximumHeight: Number.POSITIVE_INFINITY, layout: (width, height, top, left) => b.layout(width, height, top, left) };
		view.element.appendChild(b.element as HTMLElement);
		const state = { grid: { root: { type: 'branch' as const, data: [{ type: 'leaf' as const, data: { id: 'a' }, size: 500 }, { type: 'leaf' as const, data: { id: 'b' }, size: 500 }], size: 800 }, orientation: Orientation.HORIZONTAL, width: 1000, height: 800 }, hidden: [], parts: {} };
		const grid = disposables.add(PartGrid.restore(container, state, id => id === 'a' ? { part: a } : { part: b, view }, parts));
		grid.layout(1000, 800);

		const grabber = !!container.querySelector('[data-part-grid-cell="b"] .part-grid-drag-handle');
		const movedPast = grid.moveCellInDirection('a', Direction.Right);
		const shape = grid.describe();
		await b.activeGroup.closeEditor(file);

		assert.deepStrictEqual({ grabber, movedPast, shape, foundThroughView: PartGrid.findPart(b)?.id, visibleWithoutEditors: grid.isCellVisible('b') }, {
			grabber: true,
			movedPast: true,
			shape: 'row(b, a)',
			foundThroughView: 'b',
			visibleWithoutEditors: false
		});
	});
});
