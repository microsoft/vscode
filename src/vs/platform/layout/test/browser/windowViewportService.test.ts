/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IVisualViewportTarget, IWindowViewportTarget } from '../../../../base/browser/windowViewport.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { WindowViewportService } from '../../browser/windowViewportService.js';

class TestVisualViewport extends EventTarget implements IVisualViewportTarget {
	width = 400;
	height = 300;
	offsetLeft = 0;
	offsetTop = 0;
	scale = 1;
}

class TestWindowViewportTarget extends EventTarget implements IWindowViewportTarget {
	innerWidth = 800;
	innerHeight = 600;
	readonly visualViewport = new TestVisualViewport();
}

suite('WindowViewportService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('shares an observer and classifies viewport changes', () => {
		const service = disposables.add(new WindowViewportService());
		const target = new TestWindowViewportTarget();
		const viewport = service.getViewport(target);
		const changes: object[] = [];
		disposables.add(viewport.onDidChange(event => changes.push(event)));

		assert.strictEqual(service.getViewport(target), viewport);

		target.visualViewport.height = 250;
		target.visualViewport.dispatchEvent(new Event('resize'));
		target.visualViewport.dispatchEvent(new Event('resize'));

		target.innerWidth = 700;
		target.dispatchEvent(new Event('resize'));

		target.visualViewport.offsetTop = 10;
		target.visualViewport.scale = 1.5;
		target.visualViewport.dispatchEvent(new Event('scroll'));

		assert.deepStrictEqual(changes, [
			{
				state: {
					hasVisualViewport: true,
					layoutWidth: 800,
					layoutHeight: 600,
					visualWidth: 400,
					visualHeight: 250,
					visualOffsetLeft: 0,
					visualOffsetTop: 0,
					visualScale: 1,
				},
				layoutDimensionChanged: false,
				visualDimensionChanged: true,
				visualOffsetChanged: false,
				visualScaleChanged: false,
			},
			{
				state: {
					hasVisualViewport: true,
					layoutWidth: 700,
					layoutHeight: 600,
					visualWidth: 400,
					visualHeight: 250,
					visualOffsetLeft: 0,
					visualOffsetTop: 0,
					visualScale: 1,
				},
				layoutDimensionChanged: true,
				visualDimensionChanged: false,
				visualOffsetChanged: false,
				visualScaleChanged: false,
			},
			{
				state: {
					hasVisualViewport: true,
					layoutWidth: 700,
					layoutHeight: 600,
					visualWidth: 400,
					visualHeight: 250,
					visualOffsetLeft: 0,
					visualOffsetTop: 10,
					visualScale: 1.5,
				},
				layoutDimensionChanged: false,
				visualDimensionChanged: false,
				visualOffsetChanged: true,
				visualScaleChanged: true,
			},
		]);
	});

	test('removes window listeners when disposed', () => {
		const service = new WindowViewportService();
		const target = new TestWindowViewportTarget();
		const viewport = service.getViewport(target);
		let changeCount = 0;
		disposables.add(viewport.onDidChange(() => changeCount++));

		service.dispose();
		target.innerWidth = 700;
		target.dispatchEvent(new Event('resize'));
		target.visualViewport.height = 250;
		target.visualViewport.dispatchEvent(new Event('resize'));

		assert.strictEqual(changeCount, 0);
	});
});
