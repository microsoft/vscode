/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../base/browser/window.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IPoint, IRectangle } from '../../../platform/window/common/window.js';
import { getNewWindowBoundsAtDragEnd } from '../../browser/dnd.js';
import { IHostService } from '../../services/host/browser/host.js';

suite('Workbench DnD', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function hostAt(cursor: { point: IPoint; display: IRectangle } | undefined): IHostService {
		return new class extends mock<IHostService>() {
			override async getCursorScreenPoint() { return cursor; }
		}();
	}

	function element(width: number, height: number): HTMLElement {
		const element = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		element.style.cssText = `width: ${width}px; height: ${height}px;`;

		return element;
	}

	test('a drag that ends outside the windows opens a new window centered on the dragged element at the mouse, kept on its display', async () => {
		const dragged = element(200, 100);
		const outside = mainWindow.screenX + mainWindow.outerWidth + 5000;
		const display = { x: outside, y: 0, width: 2000, height: 2000 };

		try {
			const centered = await getNewWindowBoundsAtDragEnd(hostAt({ point: { x: outside + 500, y: 500 }, display }), new DragEvent('dragend'), dragged);
			const keptOnDisplay = await getNewWindowBoundsAtDragEnd(hostAt({ point: { x: outside + 10, y: 10 }, display }), new DragEvent('dragend'), dragged);
			const fromEvent = await getNewWindowBoundsAtDragEnd(hostAt(undefined), new DragEvent('dragend', { screenX: outside + 500, screenY: 500 }), dragged);

			assert.deepStrictEqual({ centered, keptOnDisplay, fromEvent }, {
				centered: { x: outside + 400, y: 420 },
				keptOnDisplay: { x: outside, y: 0 },
				fromEvent: { x: outside + 400, y: 420 }
			});
		} finally {
			dragged.remove();
		}
	});
});
