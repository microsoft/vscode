/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PastePayload } from '../../../../../../editor/browser/editorBrowser.js';
import { CursorsController } from '../../../../../../editor/common/cursor/cursor.js';
import { Handler, ITriggerEditorOperationEvent } from '../../../../../../editor/common/editorCommon.js';
import { IUndoRedoElement, IUndoRedoService, IWorkspaceUndoRedoElement, UndoRedoElementType } from '../../../../../../platform/undoRedo/common/undoRedo.js';
import { NotebookMultiCursorController } from '../../../browser/contrib/multicursor/notebookMulticursor.js';
import { ICellViewModel } from '../../../browser/notebookBrowser.js';

interface TestNotebookMultiCursorController {
	handleEditorOperationEvent(event: ITriggerEditorOperationEvent): void;
}

suite('NotebookMultiCursorController', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards block paste to mirrored cells', () => {
		const anchorCell = new class extends mock<ICellViewModel>() {
			override readonly handle = 1;
			override readonly uri = URI.parse('test:///notebook/cell1');
		};
		const mirroredCell = new class extends mock<ICellViewModel>() {
			override readonly handle = 2;
			override readonly uri = URI.parse('test:///notebook/cell2');
		};
		const mirroredController: CursorsController = Object.create(CursorsController.prototype);
		let mirroredIsBlock: boolean | undefined;
		mirroredController.paste = (_eventsCollector, _text, _pasteOnNewLine, _multicursorText, _source, isBlock) => {
			mirroredIsBlock = isBlock;
		};

		const cursorsControllers = new ResourceMap<CursorsController>();
		cursorsControllers.set(mirroredCell.uri, mirroredController);
		const controller: TestNotebookMultiCursorController = Object.assign(
			Object.create(NotebookMultiCursorController.prototype),
			{
				anchorCell: [anchorCell, Object.create(null)],
				trackedCells: [{ cellViewModel: anchorCell }, { cellViewModel: mirroredCell }],
				cursorsControllers,
			}
		);

		const event: ITriggerEditorOperationEvent = {
			handlerId: Handler.Paste,
			payload: {
				text: 'A\nBC\nD',
				pasteOnNewLine: false,
				multicursorText: ['A', 'BC', 'D'],
				mode: null,
				isBlock: true,
			} satisfies PastePayload,
			source: 'keyboard',
		};
		controller.handleEditorOperationEvent(event);

		assert.strictEqual(mirroredIsBlock, true);
	});

	test('updateFinalUndoRedo executes undo in reverse order and redo in forward order without mutating elements', async () => {
		const cell1 = new class extends mock<ICellViewModel>() {
			override readonly handle = 1;
			override readonly uri = URI.parse('test:///notebook/cell1');
		};

		const executionOrder: string[] = [];
		const el1: IUndoRedoElement = {
			type: UndoRedoElementType.Resource,
			resource: cell1.uri,
			label: 'edit1',
			code: 'edit1',
			confirmBeforeUndo: false,
			undo: async () => { executionOrder.push('undo1'); },
			redo: async () => { executionOrder.push('redo1'); },
		};
		const el2: IUndoRedoElement = {
			type: UndoRedoElementType.Resource,
			resource: cell1.uri,
			label: 'edit2',
			code: 'edit2',
			confirmBeforeUndo: false,
			undo: async () => { executionOrder.push('undo2'); },
			redo: async () => { executionOrder.push('redo2'); },
		};

		let pushedElement: IWorkspaceUndoRedoElement | undefined;
		const fakeUndoRedoService = new class extends mock<IUndoRedoService>() {
			override getElements() {
				return { past: [el1, el2], future: [] };
			}
			override removeElements() { }
			override pushElement(element: IUndoRedoElement) {
				if (element.type === UndoRedoElementType.Workspace) {
					pushedElement = element as IWorkspaceUndoRedoElement;
				}
			}
		};

		const fakeEditor = {
			getModel: () => ({})
		};

		const controller = Object.assign(
			Object.create(NotebookMultiCursorController.prototype),
			{
				anchorCell: [cell1, fakeEditor],
				trackedCells: [{
					cellViewModel: cell1,
					undoRedoHistory: { past: [], future: [] }
				}],
				undoRedoService: fakeUndoRedoService
			}
		);

		(controller as any).updateFinalUndoRedo();

		assert.ok(pushedElement, 'Workspace undo redo element should be pushed');

		// First undo: should execute in reverse order (el2 then el1)
		executionOrder.length = 0;
		await pushedElement.undo();
		assert.deepStrictEqual(executionOrder, ['undo2', 'undo1']);

		// Redo: should execute in forward order (el1 then el2)
		executionOrder.length = 0;
		await pushedElement.redo();
		assert.deepStrictEqual(executionOrder, ['redo1', 'redo2']);

		// Second undo: must still execute in reverse order (not mutated by first undo)
		executionOrder.length = 0;
		await pushedElement.undo();
		assert.deepStrictEqual(executionOrder, ['undo2', 'undo1']);
	});

	test('updateFinalUndoRedo sequentially awaits child undo/redo operations and stays pending until settled', async () => {
		const cell1 = new class extends mock<ICellViewModel>() {
			override readonly handle = 1;
			override readonly uri = URI.parse('test:///notebook/cell1');
		};

		const defUndo1 = new DeferredPromise<void>();
		const defUndo2 = new DeferredPromise<void>();
		let undo1Started = false;
		let undo2Started = false;

		const defRedo1 = new DeferredPromise<void>();
		const defRedo2 = new DeferredPromise<void>();
		let redo1Started = false;
		let redo2Started = false;

		const el1: IUndoRedoElement = {
			type: UndoRedoElementType.Resource,
			resource: cell1.uri,
			label: 'edit1',
			code: 'edit1',
			confirmBeforeUndo: false,
			undo: () => { undo1Started = true; return defUndo1.p; },
			redo: () => { redo1Started = true; return defRedo1.p; },
		};
		const el2: IUndoRedoElement = {
			type: UndoRedoElementType.Resource,
			resource: cell1.uri,
			label: 'edit2',
			code: 'edit2',
			confirmBeforeUndo: false,
			undo: () => { undo2Started = true; return defUndo2.p; },
			redo: () => { redo2Started = true; return defRedo2.p; },
		};

		let pushedElement: IWorkspaceUndoRedoElement | undefined;
		const fakeUndoRedoService = new class extends mock<IUndoRedoService>() {
			override getElements() {
				return { past: [el1, el2], future: [] };
			}
			override removeElements() { }
			override pushElement(element: IUndoRedoElement) {
				if (element.type === UndoRedoElementType.Workspace) {
					pushedElement = element as IWorkspaceUndoRedoElement;
				}
			}
		};

		const fakeEditor = {
			getModel: () => ({})
		};

		const controller = Object.assign(
			Object.create(NotebookMultiCursorController.prototype),
			{
				anchorCell: [cell1, fakeEditor],
				trackedCells: [{
					cellViewModel: cell1,
					undoRedoHistory: { past: [], future: [] }
				}],
				undoRedoService: fakeUndoRedoService
			}
		);

		(controller as any).updateFinalUndoRedo();
		assert.ok(pushedElement, 'Workspace undo redo element should be pushed');

		// Undo path: el2 must start first; el1 must NOT start while el2 is pending; workspace stays pending
		let undoSettled = false;
		const undoPromise = pushedElement.undo().then(() => { undoSettled = true; });

		assert.strictEqual(undo2Started, true, 'el2 undo should start first');
		assert.strictEqual(undo1Started, false, 'el1 undo should not start while el2 is pending');
		assert.strictEqual(undoSettled, false, 'workspace undo should remain pending');

		defUndo2.complete();
		await timeout(0);

		assert.strictEqual(undo1Started, true, 'el1 undo should start after el2 settles');
		assert.strictEqual(undoSettled, false, 'workspace undo should still be pending while el1 is unresolved');

		defUndo1.complete();
		await undoPromise;
		assert.strictEqual(undoSettled, true, 'workspace undo should settle once all children settle');

		// Redo path: el1 must start first; el2 must NOT start while el1 is pending; workspace stays pending
		let redoSettled = false;
		const redoPromise = pushedElement.redo().then(() => { redoSettled = true; });

		assert.strictEqual(redo1Started, true, 'el1 redo should start first');
		assert.strictEqual(redo2Started, false, 'el2 redo should not start while el1 is pending');
		assert.strictEqual(redoSettled, false, 'workspace redo should remain pending');

		defRedo1.complete();
		await timeout(0);

		assert.strictEqual(redo2Started, true, 'el2 redo should start after el1 settles');
		assert.strictEqual(redoSettled, false, 'workspace redo should still be pending while el2 is unresolved');

		defRedo2.complete();
		await redoPromise;
		assert.strictEqual(redoSettled, true, 'workspace redo should settle once all children settle');
	});

	test('updateFinalUndoRedo propagates child rejections for undo and redo', async () => {
		const cell1 = new class extends mock<ICellViewModel>() {
			override readonly handle = 1;
			override readonly uri = URI.parse('test:///notebook/cell1');
		};

		const el: IUndoRedoElement = {
			type: UndoRedoElementType.Resource,
			resource: cell1.uri,
			label: 'edit',
			code: 'edit',
			confirmBeforeUndo: false,
			undo: async () => { throw new Error('child undo error'); },
			redo: async () => { throw new Error('child redo error'); },
		};

		let pushedElement: IWorkspaceUndoRedoElement | undefined;
		const fakeUndoRedoService = new class extends mock<IUndoRedoService>() {
			override getElements() {
				return { past: [el], future: [] };
			}
			override removeElements() { }
			override pushElement(element: IUndoRedoElement) {
				if (element.type === UndoRedoElementType.Workspace) {
					pushedElement = element as IWorkspaceUndoRedoElement;
				}
			}
		};

		const controller = Object.assign(
			Object.create(NotebookMultiCursorController.prototype),
			{
				anchorCell: [cell1, { getModel: () => ({}) }],
				trackedCells: [{
					cellViewModel: cell1,
					undoRedoHistory: { past: [], future: [] }
				}],
				undoRedoService: fakeUndoRedoService
			}
		);

		(controller as any).updateFinalUndoRedo();
		assert.ok(pushedElement, 'Workspace undo redo element should be pushed');

		await assert.rejects(pushedElement.undo(), /child undo error/);
		await assert.rejects(pushedElement.redo(), /child redo error/);
	});
});
