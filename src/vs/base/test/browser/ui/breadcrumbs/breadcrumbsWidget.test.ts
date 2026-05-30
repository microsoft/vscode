/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getBreadcrumbScrollLeft } from '../../../../browser/ui/breadcrumbs/breadcrumbsWidget.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('BreadcrumbsWidget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('minimal reveal scrolls left when item is left-clipped', () => {
		const viewportStart = 30;
		const viewportWidth = 100;
		const itemOffsetLeft = 20;
		const itemWidth = 10;
		const actual = getBreadcrumbScrollLeft(viewportStart, viewportWidth, itemOffsetLeft, itemWidth, true);
		assert.strictEqual(actual, itemOffsetLeft);
	});

	test('minimal reveal scrolls right when item is right-clipped', () => {
		const viewportStart = 10;
		const viewportWidth = 100;
		const itemOffsetLeft = 80;
		const itemWidth = 40;
		const actual = getBreadcrumbScrollLeft(viewportStart, viewportWidth, itemOffsetLeft, itemWidth, true);
		assert.strictEqual(actual, 20);
	});

	test('minimal reveal does not scroll when item is fully visible', () => {
		const actual = getBreadcrumbScrollLeft(10, 100, 20, 30, true);
		assert.strictEqual(actual, undefined);
	});

	test('non-minimal reveal pins item to the left edge', () => {
		const actual = getBreadcrumbScrollLeft(50, 100, 20, 30, false);
		assert.strictEqual(actual, 20);
	});

	test('non-minimal reveal does not scroll when item is already aligned', () => {
		const actual = getBreadcrumbScrollLeft(40, 100, 40, 10, false);
		assert.strictEqual(actual, undefined);
	});
});
