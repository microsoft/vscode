/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DomReadingContext } from '../../../../browser/viewParts/viewLines/domReadingContext.js';
import { RangeUtil } from '../../../../browser/viewParts/viewLines/rangeUtil.js';

suite('RangeUtil', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let container: HTMLElement;

	setup(() => {
		container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
	});

	teardown(() => {
		container.remove();
	});

	function createLine(parts: string[]): { lineNode: HTMLElement; endNode: HTMLElement } {
		const lineNode = mainWindow.document.createElement('span');
		for (const part of parts) {
			const span = mainWindow.document.createElement('span');
			if (part.length > 0) {
				span.textContent = part;
			}
			lineNode.appendChild(span);
		}
		const endNode = mainWindow.document.createElement('span');
		container.appendChild(lineNode);
		container.appendChild(endNode);
		return { lineNode, endNode };
	}

	test('reads range ending at a single trailing empty span', () => {
		const { lineNode, endNode } = createLine(['hello world', '']);
		const ranges = RangeUtil.readHorizontalRanges(lineNode, 0, 5, 1, 0, new DomReadingContext(lineNode, endNode));
		assert.ok(ranges && ranges.length > 0);
	});

	test('reads range ending at two trailing empty spans', () => {
		const { lineNode, endNode } = createLine(['hello world', '', '']);
		const ranges = RangeUtil.readHorizontalRanges(lineNode, 0, 5, 2, 0, new DomReadingContext(lineNode, endNode));
		assert.ok(ranges && ranges.length > 0);
	});

	test('reads range starting and ending at trailing empty spans', () => {
		const { lineNode, endNode } = createLine(['hello world', '', '']);
		const ranges = RangeUtil.readHorizontalRanges(lineNode, 1, 0, 2, 0, new DomReadingContext(lineNode, endNode));
		assert.ok(ranges && ranges.length > 0);
	});

	test('returns null when there is no text to fall back to', () => {
		const { lineNode, endNode } = createLine(['', '']);
		const ranges = RangeUtil.readHorizontalRanges(lineNode, 0, 0, 1, 0, new DomReadingContext(lineNode, endNode));
		assert.strictEqual(ranges, null);
	});
});
