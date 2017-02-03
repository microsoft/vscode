/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { EditorZoom } from 'vs/editor/common/config/editorZoom';

suite('Common Editor Config', () => {
	test('Zoom Level', () => {

		//Zoom levels are defined to go between -9, 9 inclusive
		var zoom = EditorZoom;

		zoom.setZoomLevel(0);
		assert.equal(zoom.getZoomLevel(), 0);

		zoom.setZoomLevel(-0);
		assert.equal(zoom.getZoomLevel(), 0);

		zoom.setZoomLevel(5);
		assert.equal(zoom.getZoomLevel(), 5);

		zoom.setZoomLevel(-1);
		assert.equal(zoom.getZoomLevel(), -1);

		zoom.setZoomLevel(9);
		assert.equal(zoom.getZoomLevel(), 9);

		zoom.setZoomLevel(-9);
		assert.equal(zoom.getZoomLevel(), -9);

		zoom.setZoomLevel(10);
		assert.equal(zoom.getZoomLevel(), 9);

		zoom.setZoomLevel(-10);
		assert.equal(zoom.getZoomLevel(), -9);

		zoom.setZoomLevel(9.1);
		assert.equal(zoom.getZoomLevel(), 9);

		zoom.setZoomLevel(-9.1);
		assert.equal(zoom.getZoomLevel(), -9);

		zoom.setZoomLevel(Infinity);
		assert.equal(zoom.getZoomLevel(), 9);

		zoom.setZoomLevel(Number.NEGATIVE_INFINITY);
		assert.equal(zoom.getZoomLevel(), -9);
	});
});
