/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import assert = require('assert');
import URI from 'vs/base/common/uri';
import markerService = require('vs/platform/markers/common/markerService');
import {NULL_THREAD_SERVICE} from 'vs/platform/test/common/nullThreadService';
import {IMarkerData} from 'vs/platform/markers/common/markers';

function randomMarkerData(): IMarkerData {
	return {
		severity: 1,
		message: Math.random().toString(16),
		startLineNumber: 1,
		startColumn: 1,
		endLineNumber: 1,
		endColumn: 1
	};
}

suite('Marker Service', () => {

	test('query', () => {

		let service = new markerService.MainProcessMarkerService(NULL_THREAD_SERVICE);

		service.changeAll('far', [{
			resource: URI.parse('file:///c/test/file.cs'),
			marker: randomMarkerData()
		}]);

		assert.equal(service.read().length, 1);
		assert.equal(service.read({ owner: 'far' }).length, 1);
		assert.equal(service.read({ resource: URI.parse('file:///c/test/file.cs') }).length, 1);
		assert.equal(service.read({ owner: 'far', resource: URI.parse('file:///c/test/file.cs') }).length, 1);


		service.changeAll('boo', [{
			resource: URI.parse('file:///c/test/file.cs'),
			marker: randomMarkerData()
		}]);

		assert.equal(service.read().length, 2);
		assert.equal(service.read({ owner: 'far' }).length, 1);
		assert.equal(service.read({ owner: 'boo' }).length, 1);
	});


	test('changeOne override', () => {

		let service = new markerService.MainProcessMarkerService(NULL_THREAD_SERVICE);
		service.changeOne('far', URI.parse('/path/only.cs'), [randomMarkerData()]);
		assert.equal(service.read().length, 1);
		assert.equal(service.read({ owner: 'far' }).length, 1);

		service.changeOne('boo', URI.parse('/path/only.cs'), [randomMarkerData()]);
		assert.equal(service.read().length, 2);
		assert.equal(service.read({ owner: 'far' }).length, 1);
		assert.equal(service.read({ owner: 'boo' }).length, 1);

		service.changeOne('far', URI.parse('/path/only.cs'), [randomMarkerData(), randomMarkerData()]);
		assert.equal(service.read({ owner: 'far' }).length, 2);
		assert.equal(service.read({ owner: 'boo' }).length, 1);

	});

	test('changeOne/All clears', () => {

		let service = new markerService.MainProcessMarkerService(NULL_THREAD_SERVICE);
		service.changeOne('far', URI.parse('/path/only.cs'), [randomMarkerData()]);
		service.changeOne('boo', URI.parse('/path/only.cs'), [randomMarkerData()]);
		assert.equal(service.read({ owner: 'far' }).length, 1);
		assert.equal(service.read({ owner: 'boo' }).length, 1);
		assert.equal(service.read().length, 2);

		service.changeOne('far', URI.parse('/path/only.cs'), []);
		assert.equal(service.read({ owner: 'far' }).length, 0);
		assert.equal(service.read({ owner: 'boo' }).length, 1);
		assert.equal(service.read().length, 1);

		service.changeAll('boo', []);
		assert.equal(service.read({ owner: 'far' }).length, 0);
		assert.equal(service.read({ owner: 'boo' }).length, 0);
		assert.equal(service.read().length, 0);
	});

	test('changeAll sends event for cleared', () => {

		let service = new markerService.MainProcessMarkerService(NULL_THREAD_SERVICE);
		service.changeAll('far', [{
			resource: URI.parse('file:///d/path'),
			marker: randomMarkerData()
		}, {
				resource: URI.parse('file:///d/path'),
				marker: randomMarkerData()
			}]);

		assert.equal(service.read({ owner: 'far' }).length, 2);

		service.onMarkerChanged(changedResources => {
			assert.equal(changedResources.length, 1);
			changedResources.forEach(u => assert.equal(u.toString(), 'file:///d/path'));
			assert.equal(service.read({ owner: 'far' }).length, 0);
		});

		service.changeAll('far', []);
	});

	test('changeAll merges', () => {
		let service = new markerService.MainProcessMarkerService(NULL_THREAD_SERVICE);

		service.changeAll('far', [{
			resource: URI.parse('file:///c/test/file.cs'),
			marker: randomMarkerData()
		}, {
				resource: URI.parse('file:///c/test/file.cs'),
				marker: randomMarkerData()
			}]);

		assert.equal(service.read({ owner: 'far' }).length, 2);
	});
});