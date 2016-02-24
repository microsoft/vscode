/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {EditorScrollable} from 'vs/editor/common/viewLayout/editorScrollable';

suite('Editor ViewLayout - EditorScrollable', () => {

	function assertScrollState(scrollable:EditorScrollable, scrollTop:number, scrollLeft:number, width:number, height:number, scrollWidth:number, scrollHeight:number) {
		assert.equal(scrollable.getScrollTop(), scrollTop);
		assert.equal(scrollable.getScrollLeft(), scrollLeft);
		assert.equal(scrollable.getScrollWidth(), scrollWidth);
		assert.equal(scrollable.getScrollHeight(), scrollHeight);
		assert.equal(scrollable.getWidth(), width);
		assert.equal(scrollable.getHeight(), height);
	}

	test('EditorScrollable', () => {
		var scrollable = new EditorScrollable();

		scrollable.setWidth(100);
		scrollable.setHeight(100);

		assertScrollState(scrollable, 0, 0, 100, 100, 100, 100);

		// Make it vertically scrollable
		scrollable.setScrollHeight(1000);
		assertScrollState(scrollable, 0, 0, 100, 100, 100, 1000);

		// Scroll vertically...
		scrollable.setScrollTop(10);
		assertScrollState(scrollable, 10, 0, 100, 100, 100, 1000);
		scrollable.setScrollTop(900);
		assertScrollState(scrollable, 900, 0, 100, 100, 100, 1000);
		scrollable.setScrollTop(-1);
		assertScrollState(scrollable, 0, 0, 100, 100, 100, 1000);
		scrollable.setScrollTop(901);
		assertScrollState(scrollable, 900, 0, 100, 100, 100, 1000);
		scrollable.setScrollTop(9001);
		assertScrollState(scrollable, 900, 0, 100, 100, 100, 1000);

		// Increase vertical size => scrollTop should readjust
		scrollable.setHeight(200);
		assertScrollState(scrollable, 800, 0, 100, 200, 100, 1000);

		// Reset height & scrollHeight
		scrollable.setScrollHeight(100);
		assertScrollState(scrollable, 0, 0, 100, 200, 100, 200);
		scrollable.setHeight(100);
		assertScrollState(scrollable, 0, 0, 100, 100, 100, 200);
		scrollable.setScrollHeight(100);
		assertScrollState(scrollable, 0, 0, 100, 100, 100, 100);

		// Make it vertically scrollable
		scrollable.setScrollWidth(1000);
		assertScrollState(scrollable, 0, 0, 100, 100, 1000, 100);

		// Scroll horizontally...
		scrollable.setScrollLeft(10);
		assertScrollState(scrollable, 0, 10, 100, 100, 1000, 100);
		scrollable.setScrollLeft(900);
		assertScrollState(scrollable, 0, 900, 100, 100, 1000, 100);
		scrollable.setScrollLeft(-1);
		assertScrollState(scrollable, 0, 0, 100, 100, 1000, 100);
		scrollable.setScrollLeft(901);
		assertScrollState(scrollable, 0, 900, 100, 100, 1000, 100);
		scrollable.setScrollLeft(9001);
		assertScrollState(scrollable, 0, 900, 100, 100, 1000, 100);

		// Increase horizontal size => scrollLeft should readjust
		scrollable.setWidth(200);
		assertScrollState(scrollable, 0, 800, 200, 100, 1000, 100);

		// Validate with / height
		scrollable.setWidth(-1);
		assertScrollState(scrollable, 0, 800, 0, 100, 1000, 100);
		scrollable.setScrollWidth(-1);
		assertScrollState(scrollable, 0, 0, 0, 100, 0, 100);
		scrollable.setHeight(-1);
		assertScrollState(scrollable, 0, 0, 0, 0, 0, 100);
		scrollable.setScrollHeight(-1);
		assertScrollState(scrollable, 0, 0, 0, 0, 0, 0);
	});
});
