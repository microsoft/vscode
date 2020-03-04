/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as glob from 'vs/base/common/glob';
import { NOTEBOOK_DISPLAY_ORDER, sortMimeTypes } from 'vs/workbench/contrib/notebook/common/notebookCommon';

suite('NotebookCommon', () => {
	test('sortMimeTypes default orders', function () {
		const defaultDisplayOrder = NOTEBOOK_DISPLAY_ORDER.map(pattern => glob.parse(pattern));

		assert.deepEqual(sortMimeTypes(
			[
				'application/json',
				'application/javascript',
				'text/html',
				'image/svg+xml',
				'text/markdown',
				'image/png',
				'image/jpeg',
				'text/plain'
			], [], [], defaultDisplayOrder),
			[
				'application/json',
				'application/javascript',
				'text/html',
				'image/svg+xml',
				'text/markdown',
				'image/png',
				'image/jpeg',
				'text/plain'
			]
		);

		assert.deepEqual(sortMimeTypes(
			[
				'application/json',
				'text/markdown',
				'application/javascript',
				'text/html',
				'text/plain',
				'image/png',
				'image/jpeg',
				'image/svg+xml'
			], [], [], defaultDisplayOrder),
			[
				'application/json',
				'application/javascript',
				'text/html',
				'image/svg+xml',
				'text/markdown',
				'image/png',
				'image/jpeg',
				'text/plain'
			]
		);

		assert.deepEqual(sortMimeTypes(
			[
				'text/markdown',
				'application/json',
				'text/plain',
				'image/jpeg',
				'application/javascript',
				'text/html',
				'image/png',
				'image/svg+xml'
			], [], [], defaultDisplayOrder),
			[
				'application/json',
				'application/javascript',
				'text/html',
				'image/svg+xml',
				'text/markdown',
				'image/png',
				'image/jpeg',
				'text/plain'
			]
		);
	});

	test('sortMimeTypes document orders', function () {
		const defaultDisplayOrder = NOTEBOOK_DISPLAY_ORDER.map(pattern => glob.parse(pattern));
		assert.deepEqual(sortMimeTypes(
			[
				'application/json',
				'application/javascript',
				'text/html',
				'image/svg+xml',
				'text/markdown',
				'image/png',
				'image/jpeg',
				'text/plain'
			], [], [
				'text/markdown',
				'text/html',
				'application/json'
			].map(pattern => glob.parse(pattern)), defaultDisplayOrder),
			[
				'text/markdown',
				'text/html',
				'application/json',
				'application/javascript',
				'image/svg+xml',
				'image/png',
				'image/jpeg',
				'text/plain'
			]
		);

		assert.deepEqual(sortMimeTypes(
			[
				'text/markdown',
				'application/json',
				'text/plain',
				'application/javascript',
				'text/html',
				'image/svg+xml',
				'image/jpeg',
				'image/png'
			], [], [
				'text/html',
				'text/markdown',
				'application/json'
			].map(pattern => glob.parse(pattern)), defaultDisplayOrder),
			[
				'text/html',
				'text/markdown',
				'application/json',
				'application/javascript',
				'image/svg+xml',
				'image/png',
				'image/jpeg',
				'text/plain'
			]
		);
	});

	test('sortMimeTypes user orders', function () {
		const defaultDisplayOrder = NOTEBOOK_DISPLAY_ORDER.map(pattern => glob.parse(pattern));
		assert.deepEqual(sortMimeTypes(
			[
				'application/json',
				'application/javascript',
				'text/html',
				'image/svg+xml',
				'text/markdown',
				'image/png',
				'image/jpeg',
				'text/plain'
			], [
				'image/png',
				'text/plain',
			].map(pattern => glob.parse(pattern)),
			[
				'text/markdown',
				'text/html',
				'application/json'
			].map(pattern => glob.parse(pattern)), defaultDisplayOrder),
			[
				'image/png',
				'text/plain',
				'text/markdown',
				'text/html',
				'application/json',
				'application/javascript',
				'image/svg+xml',
				'image/jpeg',
			]
		);

		assert.deepEqual(sortMimeTypes(
			[
				'text/markdown',
				'application/json',
				'text/plain',
				'application/javascript',
				'text/html',
				'image/svg+xml',
				'image/jpeg',
				'image/png'
			], [
				'application/json',
				'text/html',
			].map(pattern => glob.parse(pattern)),
			[
				'text/html',
				'text/markdown',
				'application/json'
			].map(pattern => glob.parse(pattern)), defaultDisplayOrder),
			[
				'application/json',
				'text/html',
				'text/markdown',
				'application/javascript',
				'image/svg+xml',
				'image/png',
				'image/jpeg',
				'text/plain'
			]
		);
	});

	test('sortMimeTypes glob', function () {
		const defaultDisplayOrder = NOTEBOOK_DISPLAY_ORDER.map(pattern => glob.parse(pattern));

		// unknown mime types come last
		assert.deepEqual(sortMimeTypes(
			[
				'application/json',
				'application/vnd-vega.json',
				'application/vnd-plot.json',
				'application/javascript',
				'text/html'
			], [].map(pattern => glob.parse(pattern)),
			[
				'text/markdown',
				'text/html',
				'application/json'
			].map(pattern => glob.parse(pattern)), defaultDisplayOrder),
			[
				'text/html',
				'application/json',
				'application/javascript',
				'application/vnd-vega.json',
				'application/vnd-plot.json'
			],
			'unknown mimetypes keep the ordering'
		);

		assert.deepEqual(sortMimeTypes(
			[
				'application/json',
				'application/javascript',
				'text/html',
				'application/vnd-plot.json',
				'application/vnd-vega.json'
			], [].map(pattern => glob.parse(pattern)),
			[
				'application/vnd-vega*',
				'text/markdown',
				'text/html',
				'application/json'
			].map(pattern => glob.parse(pattern)), defaultDisplayOrder),
			[
				'application/vnd-vega.json',
				'text/html',
				'application/json',
				'application/javascript',
				'application/vnd-plot.json'
			],
			'glob *'
		);
	});
});
