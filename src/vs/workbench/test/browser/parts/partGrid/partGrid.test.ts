/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Direction } from '../../../../../base/browser/ui/grid/grid.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IPartGridView, PartGrid } from '../../../../browser/parts/partGrid/partGrid.js';
import { ContentPart } from '../../../../browser/parts/editor/contentPart.js';
import { GRID_GAP_SASH_CLASS } from '../../../../browser/parts/partGrid/partGridGap.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../common/editor.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';
import { IAuxiliaryWindowService } from '../../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IContentPart, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
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

	async function createParts(): Promise<TestEditorParts> {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
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
		const grid = disposables.add(new PartGrid(createContainer()));
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
		const restored = disposables.add(PartGrid.restore(createContainer(), state, (id, partState) => ({ part: createPart(parts, partState) })));
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
		const grid = disposables.add(new PartGrid(container));
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
		const grid = disposables.add(new PartGrid(container));
		const heights: number[] = [];
		const fixed: IPartGridView = { ...createView(), layout: (width, height) => heights.push(height) };
		grid.addView('title', fixed);
		grid.addView('other', createView(), { edge: Direction.Down });
		grid.layout(1000, 800);

		assert.deepStrictEqual({ cellHeight: grid.getCellSize('title').height, contentHeight: heights[heights.length - 1] }, { cellHeight: 32, contentHeight: 30 });
	});
});
