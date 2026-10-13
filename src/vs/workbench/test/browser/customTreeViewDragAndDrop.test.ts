/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ElementsDragAndDropData } from '../../../base/browser/ui/list/listView.js';
import { DeferredPromise } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { createStringDataTransferItem, VSDataTransfer } from '../../../base/common/dataTransfer.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { TreeViewsDnDService } from '../../../editor/common/services/treeViewsDnd.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../platform/label/common/label.js';
import { NullLogService } from '../../../platform/log/common/log.js';
import { CustomTreeViewDragAndDrop } from '../../browser/parts/views/treeView.js';
import { ITreeItem, TreeItemCollapsibleState } from '../../common/views.js';

suite('CustomTreeViewDragAndDrop', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const item: ITreeItem = { handle: 'item', label: { label: 'Drag item' }, collapsibleState: TreeItemCollapsibleState.None };

	function successfulDragEnd(): DragEvent {
		// Synthetic browser DragEvents reset dropEffect to 'none'.
		return new class extends mock<DragEvent>() {
			override readonly dataTransfer = new class extends mock<DataTransfer>() {
				override dropEffect: 'copy' = 'copy';
			}();
		}();
	}

	function createDrag(provideTransfer?: (token: CancellationToken) => Promise<VSDataTransfer | undefined>) {
		const service = new TreeViewsDnDService<VSDataTransfer>();
		const operations: Map<string, Promise<VSDataTransfer | undefined>> = Reflect.get(service, '_dragOperations');
		const transfer = new VSDataTransfer();
		transfer.replace('application/test-transfer', createStringDataTransferItem('Owned transfer'));
		const tokens: CancellationToken[] = [];
		const drops: VSDataTransfer[] = [];
		const released: string[] = [];
		const drag = disposables.add(new CustomTreeViewDragAndDrop('test-tree', new class extends mock<ILabelService>() { }(), new class extends mock<IInstantiationService>() { }(), service, new NullLogService()));
		drag.controller = {
			dragMimeTypes: ['application/test-transfer'],
			dropMimeTypes: ['application/test-transfer'],
			handleDrag: async (_handles, _uuid, token) => {
				tokens.push(token);
				return provideTransfer ? provideTransfer(token) : transfer;
			},
			handleDrop: async value => { drops.push(value); },
			handleDragEnd: uuid => { released.push(uuid); }
		};
		const data = new ElementsDragAndDropData([item]);
		const start = () => {
			const dataTransfer = new DataTransfer();
			drag.onDragStart(data, new DragEvent('dragstart', { dataTransfer }));
			return dataTransfer;
		};
		return { drag, service, operations, transfer, tokens, drops, released, data, start };
	}

	test('keeps completed data available while its drag is active', async () => {
		const state = createDrag();
		state.start();
		const pending = [...state.operations.values()];
		assert.strictEqual(await pending[0], state.transfer);
		assert.deepStrictEqual({ operations: state.operations.size, canceled: state.tokens[0].isCancellationRequested }, { operations: 1, canceled: false });
	});

	test('releases a completed transfer when the drag is canceled', async () => {
		const state = createDrag();
		const dataTransfer = state.start();
		await Promise.all(state.operations.values());
		dataTransfer.dropEffect = 'none';
		state.drag.onDragEnd(new DragEvent('dragend', { dataTransfer }));
		assert.deepStrictEqual({ operations: state.operations.size, canceled: state.tokens[0].isCancellationRequested }, { operations: 0, canceled: true });
	});

	test('does not restore a canceled transfer after the provider completes', async () => {
		const pending = new DeferredPromise<VSDataTransfer>();
		const state = createDrag(() => pending.p);
		const dataTransfer = state.start();
		const creation = Promise.all(state.operations.values());
		dataTransfer.dropEffect = 'none';
		state.drag.onDragEnd(new DragEvent('dragend', { dataTransfer }));
		await pending.complete(state.transfer);
		await creation;
		assert.deepStrictEqual({ operations: state.operations.size, canceled: state.tokens[0].isCancellationRequested }, { operations: 0, canceled: true });
	});

	test('does not accumulate completed canceled drag records', async () => {
		const state = createDrag();
		for (let index = 0; index < 37; index++) {
			const dataTransfer = state.start();
			await Promise.all(state.operations.values());
			dataTransfer.dropEffect = 'none';
			state.drag.onDragEnd(new DragEvent('dragend', { dataTransfer }));
		}
		assert.strictEqual(state.operations.size, 0);
	});

	test('preserves transfer data for a successful drop', async () => {
		const state = createDrag();
		const dataTransfer = state.start();
		await Promise.all(state.operations.values());
		await state.drag.drop(state.data, undefined, undefined, undefined, new DragEvent('drop', { dataTransfer }));
		state.drag.onDragEnd(successfulDragEnd());
		const retainsTransferItem = Array.from(state.drops[0]).some(([, item]) => item === state.transfer.get('application/test-transfer'));
		assert.deepStrictEqual({ operations: state.operations.size, drops: state.drops.length, retainsTransferItem }, { operations: 0, drops: 1, retainsTransferItem: true });
	});

	test('releases an active drag when the view is disposed', async () => {
		const state = createDrag();
		state.start();
		await Promise.all(state.operations.values());
		state.drag.dispose();
		assert.deepStrictEqual({ operations: state.operations.size, canceled: state.tokens[0].isCancellationRequested }, { operations: 0, canceled: true });
	});

	test('releases only its own canceled transfer and notifies its original controller once', async () => {
		const state = createDrag();
		const dataTransfer = state.start();
		const uuid = [...state.operations.keys()][0];
		const unrelated = Promise.resolve(new VSDataTransfer());
		state.service.addDragOperationTransfer('unrelated', unrelated);
		await Promise.all(state.operations.values());
		state.drag.onDragEnd(new DragEvent('dragend', { dataTransfer }));
		state.drag.dispose();
		assert.deepStrictEqual({ keys: [...state.operations.keys()], released: state.released }, { keys: ['unrelated'], released: [uuid] });
	});

	test('releases an abandoned operation before starting another drag', async () => {
		const state = createDrag();
		state.start();
		const firstUuid = [...state.operations.keys()][0];
		await Promise.all(state.operations.values());
		state.start();
		assert.deepStrictEqual({ operations: state.operations.size, canceled: state.tokens.map(token => token.isCancellationRequested), released: state.released }, { operations: 1, canceled: [true, false], released: [firstUuid] });
	});

	test('releases active data when its controller is removed', async () => {
		const state = createDrag();
		state.start();
		const uuid = [...state.operations.keys()][0];
		await Promise.all(state.operations.values());
		state.drag.controller = undefined;
		assert.deepStrictEqual({ operations: state.operations.size, canceled: state.tokens[0].isCancellationRequested, released: state.released }, { operations: 0, canceled: true, released: [uuid] });
	});

	test('keeps pending data when successful drag-end precedes asynchronous drop completion', async () => {
		const pending = new DeferredPromise<VSDataTransfer>();
		const state = createDrag(() => pending.p);
		const dataTransfer = state.start();
		const dropping = state.drag.drop(state.data, undefined, undefined, undefined, new DragEvent('drop', { dataTransfer }));
		state.drag.onDragEnd(successfulDragEnd());
		await pending.complete(state.transfer);
		await dropping;
		const retainsTransferItem = Array.from(state.drops[0]).some(([, item]) => item === state.transfer.get('application/test-transfer'));
		assert.deepStrictEqual({ operations: state.operations.size, drops: state.drops.length, canceled: state.tokens[0].isCancellationRequested, released: state.released, retainsTransferItem }, { operations: 0, drops: 1, canceled: false, released: [], retainsTransferItem: true });
	});
});
