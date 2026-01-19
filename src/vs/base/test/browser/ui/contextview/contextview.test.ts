/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { layout, LayoutAnchorPosition } from '../../../../browser/ui/contextview/contextview.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('Contextview', function () {

	test('layout', () => {
		assert.strictEqual(layout(200, 20, { offset: 0, size: 0, position: LayoutAnchorPosition.Before }), 0);
		assert.strictEqual(layout(200, 20, { offset: 50, size: 0, position: LayoutAnchorPosition.Before }), 50);
		assert.strictEqual(layout(200, 20, { offset: 200, size: 0, position: LayoutAnchorPosition.Before }), 180);

		assert.strictEqual(layout(200, 20, { offset: 0, size: 0, position: LayoutAnchorPosition.After }), 0);
		assert.strictEqual(layout(200, 20, { offset: 50, size: 0, position: LayoutAnchorPosition.After }), 30);
		assert.strictEqual(layout(200, 20, { offset: 200, size: 0, position: LayoutAnchorPosition.After }), 180);

		assert.strictEqual(layout(200, 20, { offset: 0, size: 50, position: LayoutAnchorPosition.Before }), 50);
		assert.strictEqual(layout(200, 20, { offset: 50, size: 50, position: LayoutAnchorPosition.Before }), 100);
		assert.strictEqual(layout(200, 20, { offset: 150, size: 50, position: LayoutAnchorPosition.Before }), 130);

		assert.strictEqual(layout(200, 20, { offset: 0, size: 50, position: LayoutAnchorPosition.After }), 50);
		assert.strictEqual(layout(200, 20, { offset: 50, size: 50, position: LayoutAnchorPosition.After }), 30);
		assert.strictEqual(layout(200, 20, { offset: 150, size: 50, position: LayoutAnchorPosition.After }), 130);
	});

	test('layout large hover', () => {
		// When the view is large and almost fits on the preferred side, we should prefer to shift it
		// rather than flip it to the other side which might be far away.
		assert.strictEqual(layout(1084, 306, { offset: 296, size: 2, position: LayoutAnchorPosition.After }), 0);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
