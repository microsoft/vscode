/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IMarkerData, MarkerSeverity } from '../../common/markers.js';
import * as markerService from '../../common/markerService.js';

function randomMarkerData(severity = MarkerSeverity.Error): IMarkerData {
	return {
		severity,
		message: Math.random().toString(16),
		startLineNumber: 1,
		startColumn: 1,
		endLineNumber: 1,
		endColumn: 1
	};
}

suite('Marker Service', () => {

	let service: markerService.MarkerService;

	teardown(function () {
		service.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('query', () => {

		service = new markerService.MarkerService();

		service.changeAll('far', [{
			resource: URI.parse('file:///c/test/file.cs'),
			marker: randomMarkerData(MarkerSeverity.Error)
		}]);

		assert.strictEqual(service.read().length, 1);
		assert.strictEqual(service.read({ owner: 'far' }).length, 1);
		assert.strictEqual(service.read({ resource: URI.parse('file:///c/test/file.cs') }).length, 1);
		assert.strictEqual(service.read({ owner: 'far', resource: URI.parse('file:///c/test/file.cs') }).length, 1);


		service.changeAll('boo', [{
			resource: URI.parse('file:///c/test/file.cs'),
			marker: randomMarkerData(MarkerSeverity.Warning)
		}]);

		assert.strictEqual(service.read().length, 2);
		assert.strictEqual(service.read({ owner: 'far' }).length, 1);
		assert.strictEqual(service.read({ owner: 'boo' }).length, 1);

		assert.strictEqual(service.read({ severities: MarkerSeverity.Error }).length, 1);
		assert.strictEqual(service.read({ severities: MarkerSeverity.Warning }).length, 1);
		assert.strictEqual(service.read({ severities: MarkerSeverity.Hint }).length, 0);
		assert.strictEqual(service.read({ severities: MarkerSeverity.Error | MarkerSeverity.Warning }).length, 2);

	});


	test('changeOne override', () => {

		service = new markerService.MarkerService();
		service.changeOne('far', URI.parse('file:///path/only.cs'), [randomMarkerData()]);
		assert.strictEqual(service.read().length, 1);
		assert.strictEqual(service.read({ owner: 'far' }).length, 1);

		service.changeOne('boo', URI.parse('file:///path/only.cs'), [randomMarkerData()]);
		assert.strictEqual(service.read().length, 2);
		assert.strictEqual(service.read({ owner: 'far' }).length, 1);
		assert.strictEqual(service.read({ owner: 'boo' }).length, 1);

		service.changeOne('far', URI.parse('file:///path/only.cs'), [randomMarkerData(), randomMarkerData()]);
		assert.strictEqual(service.read({ owner: 'far' }).length, 2);
		assert.strictEqual(service.read({ owner: 'boo' }).length, 1);

	});

	test('changeOne/All clears', () => {

		service = new markerService.MarkerService();
		service.changeOne('far', URI.parse('file:///path/only.cs'), [randomMarkerData()]);
		service.changeOne('boo', URI.parse('file:///path/only.cs'), [randomMarkerData()]);
		assert.strictEqual(service.read({ owner: 'far' }).length, 1);
		assert.strictEqual(service.read({ owner: 'boo' }).length, 1);
		assert.strictEqual(service.read().length, 2);

		service.changeOne('far', URI.parse('file:///path/only.cs'), []);
		assert.strictEqual(service.read({ owner: 'far' }).length, 0);
		assert.strictEqual(service.read({ owner: 'boo' }).length, 1);
		assert.strictEqual(service.read().length, 1);

		service.changeAll('boo', []);
		assert.strictEqual(service.read({ owner: 'far' }).length, 0);
		assert.strictEqual(service.read({ owner: 'boo' }).length, 0);
		assert.strictEqual(service.read().length, 0);
	});

	test('changeAll sends event for cleared', () => {

		service = new markerService.MarkerService();
		service.changeAll('far', [{
			resource: URI.parse('file:///d/path'),
			marker: randomMarkerData()
		}, {
			resource: URI.parse('file:///d/path'),
			marker: randomMarkerData()
		}]);

		assert.strictEqual(service.read({ owner: 'far' }).length, 2);

		const d = service.onMarkerChanged(changedResources => {
			assert.strictEqual(changedResources.length, 1);
			changedResources.forEach(u => assert.strictEqual(u.toString(), 'file:///d/path'));
			assert.strictEqual(service.read({ owner: 'far' }).length, 0);
		});

		service.changeAll('far', []);

		d.dispose();
	});

	test('changeAll merges', () => {
		service = new markerService.MarkerService();

		service.changeAll('far', [{
			resource: URI.parse('file:///c/test/file.cs'),
			marker: randomMarkerData()
		}, {
			resource: URI.parse('file:///c/test/file.cs'),
			marker: randomMarkerData()
		}]);

		assert.strictEqual(service.read({ owner: 'far' }).length, 2);
	});

	test('changeAll must not break integrety, issue #12635', () => {
		service = new markerService.MarkerService();

		service.changeAll('far', [{
			resource: URI.parse('scheme:path1'),
			marker: randomMarkerData()
		}, {
			resource: URI.parse('scheme:path2'),
			marker: randomMarkerData()
		}]);

		service.changeAll('boo', [{
			resource: URI.parse('scheme:path1'),
			marker: randomMarkerData()
		}]);

		service.changeAll('far', [{
			resource: URI.parse('scheme:path1'),
			marker: randomMarkerData()
		}, {
			resource: URI.parse('scheme:path2'),
			marker: randomMarkerData()
		}]);

		assert.strictEqual(service.read({ owner: 'far' }).length, 2);
		assert.strictEqual(service.read({ resource: URI.parse('scheme:path1') }).length, 2);
	});

	test('invalid marker data', () => {

		const data = randomMarkerData();
		service = new markerService.MarkerService();

		data.message = undefined!;
		service.changeOne('far', URI.parse('some:uri/path'), [data]);
		assert.strictEqual(service.read({ owner: 'far' }).length, 0);

		data.message = null!;
		service.changeOne('far', URI.parse('some:uri/path'), [data]);
		assert.strictEqual(service.read({ owner: 'far' }).length, 0);

		data.message = 'null';
		service.changeOne('far', URI.parse('some:uri/path'), [data]);
		assert.strictEqual(service.read({ owner: 'far' }).length, 1);
	});

	test('MapMap#remove returns bad values, https://github.com/microsoft/vscode/issues/13548', () => {
		service = new markerService.MarkerService();

		service.changeOne('o', URI.parse('some:uri/1'), [randomMarkerData()]);
		service.changeOne('o', URI.parse('some:uri/2'), []);

	});

	test('Error code of zero in markers get removed, #31275', function () {
		const data = <IMarkerData>{
			code: '0',
			startLineNumber: 1,
			startColumn: 2,
			endLineNumber: 1,
			endColumn: 5,
			message: 'test',
			severity: 0 as MarkerSeverity,
			source: 'me'
		};
		service = new markerService.MarkerService();

		service.changeOne('far', URI.parse('some:thing'), [data]);
		const marker = service.read({ resource: URI.parse('some:thing') });

		assert.strictEqual(marker.length, 1);
		assert.strictEqual(marker[0].code, '0');
	});
});
