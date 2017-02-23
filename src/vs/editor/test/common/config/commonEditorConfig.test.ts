/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { EditorZoom } from 'vs/editor/common/config/editorZoom';
import { TestConfiguration } from 'vs/editor/test/common/mocks/testConfiguration';

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

	class TestWrappingConfiguration extends TestConfiguration {
		protected getOuterWidth(): number {
			return 1000;
		}
	}

	function assertWrapping(config: TestConfiguration, isViewportWrapping: boolean, wrappingColumn: number): void {
		assert.equal(config.editor.wrappingInfo.isViewportWrapping, isViewportWrapping);
		assert.equal(config.editor.wrappingInfo.wrappingColumn, wrappingColumn);
	}

	test('wordWrap default', () => {
		let config = new TestWrappingConfiguration({});
		assertWrapping(config, false, -1);
	});

	test('wordWrap compat false', () => {
		let config = new TestWrappingConfiguration({
			wordWrap: <any>false
		});
		assertWrapping(config, false, -1);
	});

	test('wordWrap compat true', () => {
		let config = new TestWrappingConfiguration({
			wordWrap: <any>true
		});
		assertWrapping(config, true, 89);
	});

	test('wordWrap on', () => {
		let config = new TestWrappingConfiguration({
			wordWrap: 'on'
		});
		assertWrapping(config, true, 89);
	});

	test('wordWrap on does not use wordWrapColumn', () => {
		let config = new TestWrappingConfiguration({
			wordWrap: 'on',
			wordWrapColumn: 10
		});
		assertWrapping(config, true, 89);
	});

	test('wordWrap off', () => {
		let config = new TestWrappingConfiguration({
			wordWrap: 'off'
		});
		assertWrapping(config, false, -1);
	});

	test('wordWrap off does not use wordWrapColumn', () => {
		let config = new TestWrappingConfiguration({
			wordWrap: 'off',
			wordWrapColumn: 10
		});
		assertWrapping(config, false, -1);
	});

	test('wordWrap fixed uses default wordWrapColumn', () => {
		let config = new TestWrappingConfiguration({
			wordWrap: 'fixed'
		});
		assertWrapping(config, false, 80);
	});

	test('wordWrap fixed uses wordWrapColumn', () => {
		let config = new TestWrappingConfiguration({
			wordWrap: 'fixed',
			wordWrapColumn: 100
		});
		assertWrapping(config, false, 100);
	});

	test('wordWrap fixed validates wordWrapColumn', () => {
		let config = new TestWrappingConfiguration({
			wordWrap: 'fixed',
			wordWrapColumn: -1
		});
		assertWrapping(config, false, 1);
	});

	test('wordWrap clamped uses default wordWrapColumn', () => {
		let config = new TestWrappingConfiguration({
			wordWrap: 'clamped'
		});
		assertWrapping(config, true, 80);
	});

	test('wordWrap clamped uses wordWrapColumn', () => {
		let config = new TestWrappingConfiguration({
			wordWrap: 'clamped',
			wordWrapColumn: 40
		});
		assertWrapping(config, true, 40);
	});

	test('wordWrap clamped validates wordWrapColumn', () => {
		let config = new TestWrappingConfiguration({
			wordWrap: 'clamped',
			wordWrapColumn: -1
		});
		assertWrapping(config, true, 1);
	});
});
