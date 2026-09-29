/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../base/common/async.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { CompositeDragAndDropObserver } from '../../browser/dnd.js';

suite('CompositeDragAndDropObserver', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('releases disposed target registrations', async function () {
		if (typeof globalThis.gc !== 'function') {
			this.skip(); // Run the Electron suite with --js-flags=--expose-gc.
		}
		function registerAndDispose(): WeakRef<IDisposable> {
			const registration = CompositeDragAndDropObserver.INSTANCE.registerTarget(document.createElement('div'), {});
			registration.dispose();
			return new WeakRef(registration);
		}
		const registration = registerAndDispose();
		await timeout(0);
		await globalThis.gc!({ type: 'major', execution: 'async' });
		assert.strictEqual(registration.deref() === undefined, true, 'The observer still retains the disposed registration');
	});

	test('releases disposed draggable registrations', async function () {
		if (typeof globalThis.gc !== 'function') {
			this.skip(); // Run the Electron suite with --js-flags=--expose-gc.
		}
		function registerAndDispose(): WeakRef<IDisposable> {
			const registration = CompositeDragAndDropObserver.INSTANCE.registerDraggable(document.createElement('div'), () => ({ type: 'view', id: 'test-view' }), {});
			registration.dispose();
			return new WeakRef(registration);
		}
		const registration = registerAndDispose();
		await timeout(0);
		await globalThis.gc!({ type: 'major', execution: 'async' });
		assert.strictEqual(registration.deref() === undefined, true, 'The observer still retains the disposed registration');
	});

	test('delivers the complete drag and drop lifecycle to a live target', () => {
		const source = document.createElement('div');
		const target = document.createElement('div');
		const events: string[] = [];
		store.add(CompositeDragAndDropObserver.INSTANCE.registerDraggable(source, () => ({ type: 'view', id: 'test-view' }), {}));
		store.add(CompositeDragAndDropObserver.INSTANCE.registerTarget(target, {
			onDragStart: e => events.push(`start:${e.dragAndDropData.getData().id}`),
			onDragEnter: () => events.push('enter'),
			onDragOver: () => events.push('over'),
			onDragLeave: () => events.push('leave'),
			onDrop: e => events.push(`drop:${e.dragAndDropData.getData().id}`),
			onDragEnd: () => events.push('end')
		}));
		source.dispatchEvent(new DragEvent('dragstart'));
		for (const type of ['dragenter', 'dragover', 'dragleave', 'drop']) {
			target.dispatchEvent(new DragEvent(type));
		}
		source.dispatchEvent(new DragEvent('dragend'));
		assert.deepStrictEqual(events, ['start:test-view', 'enter', 'over', 'leave', 'drop:test-view', 'end']);
	});

	test('disposing a target repeatedly removes its callbacks but preserves a live peer', () => {
		const source = document.createElement('div');
		const removedTarget = document.createElement('div');
		const liveTarget = document.createElement('div');
		const events: string[] = [];
		store.add(CompositeDragAndDropObserver.INSTANCE.registerDraggable(source, () => ({ type: 'composite', id: 'test-composite' }), {}));
		const removed = store.add(CompositeDragAndDropObserver.INSTANCE.registerTarget(removedTarget, {
			onDragStart: () => events.push('removed-start'),
			onDrop: () => events.push('removed-drop'),
			onDragEnd: () => events.push('removed-end')
		}));
		store.add(CompositeDragAndDropObserver.INSTANCE.registerTarget(liveTarget, {
			onDrop: e => events.push(e.dragAndDropData.getData().id)
		}));
		removed.dispose();
		removed.dispose();
		source.dispatchEvent(new DragEvent('dragstart'));
		removedTarget.dispatchEvent(new DragEvent('drop'));
		liveTarget.dispatchEvent(new DragEvent('drop'));
		source.dispatchEvent(new DragEvent('dragend'));
		assert.deepStrictEqual(events, ['test-composite']);
	});

	test('a disposed draggable no longer starts drags or observes another draggable', () => {
		const source = document.createElement('div');
		const peer = document.createElement('div');
		const events: string[] = [];
		const removed = store.add(CompositeDragAndDropObserver.INSTANCE.registerDraggable(source, () => ({ type: 'view', id: 'removed' }), {
			onDragStart: () => events.push('removed-start'),
			onDragEnd: () => events.push('removed-end')
		}));
		store.add(CompositeDragAndDropObserver.INSTANCE.registerDraggable(peer, () => ({ type: 'view', id: 'peer' }), {
			onDragStart: e => events.push(e.dragAndDropData.getData().id)
		}));
		removed.dispose();
		removed.dispose();
		source.dispatchEvent(new DragEvent('dragstart'));
		source.dispatchEvent(new DragEvent('dragend'));
		peer.dispatchEvent(new DragEvent('dragstart'));
		peer.dispatchEvent(new DragEvent('dragend'));
		assert.deepStrictEqual(events, ['peer']);
	});
});
