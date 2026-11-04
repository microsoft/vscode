/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CompositeDragAndDropObserver } from '../../../../browser/dnd.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('CompositeDragAndDropObserver - Drag Image', () => {
	let disposables: DisposableStore;
	let observer: CompositeDragAndDropObserver;

	setup(() => {
		disposables = new DisposableStore();
		observer = CompositeDragAndDropObserver.INSTANCE;
	});

	teardown(() => {
		disposables.dispose();
	});

	test('setDragImage should use action-label element when available', () => {
		const container = document.createElement('div');
		const actionLabel = document.createElement('div');
		actionLabel.className = 'action-label';
		container.appendChild(actionLabel);

		let dragImageElement: HTMLElement | undefined;
		let dragImageX = -1;
		let dragImageY = -1;

		const dragEvent = new DragEvent('dragstart', { bubbles: true, cancelable: true });

		const dataTransfer = {
			setDragImage: (element: HTMLElement, x: number, y: number) => {
				dragImageElement = element;
				dragImageX = x;
				dragImageY = y;
			}
		};

		Object.defineProperty(dragEvent, 'dataTransfer', { value: dataTransfer });

		const registration = observer.registerDraggable(container,
			() => ({ type: 'view', id: 'test' }),
			{
				onDragStart: event => {
					assert.notStrictEqual(dragImageElement, container, 'Should not use container as drag image when action-label is available');
					assert.strictEqual(dragImageElement, actionLabel, 'Expected action-label to be used');
					assert.strictEqual(dragImageX, 0, 'X offset should be 0');
					assert.strictEqual(dragImageY, 0, 'Y offset should be 0');
				}
			}
		);

		disposables.add(registration);
		container.dispatchEvent(dragEvent);
	});

	test('setDragImage should fall back to container when no action-label exists', () => {
		const container = document.createElement('div');

		let dragImageElement: HTMLElement | undefined;
		let dragImageX = -1;
		let dragImageY = -1;

		const dragEvent = new DragEvent('dragstart', { bubbles: true, cancelable: true });

		const dataTransfer = {
			setDragImage: (element: HTMLElement, x: number, y: number) => {
				dragImageElement = element;
				dragImageX = x;
				dragImageY = y;
			}
		};

		Object.defineProperty(dragEvent, 'dataTransfer', { value: dataTransfer });

		const registration = observer.registerDraggable(container,
			() => ({ type: 'view', id: 'test' }),
			{
				onDragStart: event => {
					assert.strictEqual(dragImageElement, container, 'Expected container to be used as fallback');
					assert.strictEqual(dragImageX, 0, 'X offset should be 0');
					assert.strictEqual(dragImageY, 0, 'Y offset should be 0');
				}
			}
		);

		disposables.add(registration);
		container.dispatchEvent(dragEvent);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
