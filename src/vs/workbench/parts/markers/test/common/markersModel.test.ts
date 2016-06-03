/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import assert = require('assert');
import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import { IMarker, MarkerStatistics } from 'vs/platform/markers/common/markers';
import { MarkersModel, Marker, Resource } from 'vs/workbench/parts/markers/common/markersModel';

suite('MarkersModel Test', () => {

	test('getFilteredResource return markers grouped by resource', function() {
		let marker1= aMarker('res1');
		let marker2= aMarker('res2');
		let marker3= aMarker('res1');
		let marker4= aMarker('res3');
		let marker5= aMarker('res4');
		let marker6= aMarker('res2');
		let testObject= new MarkersModel([marker1, marker2, marker3, marker4, marker5, marker6]);

		let actuals= testObject.filteredResources;

		assert.equal(4, actuals.length);

		assert.ok(compareResource(actuals[0], 'res1'));
		assert.equal(2, actuals[0].markers.length);
		assert.ok(hasMarker(actuals[0].markers, marker1));
		assert.ok(hasMarker(actuals[0].markers, marker3));

		assert.ok(compareResource(actuals[1], 'res2'));
		assert.equal(2, actuals[1].markers.length);
		assert.ok(hasMarker(actuals[1].markers, marker2));
		assert.ok(hasMarker(actuals[1].markers, marker6));

		assert.ok(compareResource(actuals[2], 'res3'));
		assert.equal(1, actuals[2].markers.length);
		assert.ok(hasMarker(actuals[2].markers, marker4));

		assert.ok(compareResource(actuals[3], 'res4'));
		assert.equal(1, actuals[3].markers.length);
		assert.ok(hasMarker(actuals[3].markers, marker5));
	});

	test('getFilteredResource return markers grouped by resource sorted by file path', function() {
		let marker1= aMarker('a/res1');
		let marker2= aMarker('a/res2');
		let marker3= aMarker('res4');
		let marker4= aMarker('b/res3');
		let marker5= aMarker('res4');
		let marker6= aMarker('c/res2');
		let testObject= new MarkersModel([marker1, marker2, marker3, marker4, marker5, marker6]);

		let actuals= testObject.filteredResources;

		assert.equal(5, actuals.length);
		assert.ok(compareResource(actuals[0], 'a/res1'));
		assert.ok(compareResource(actuals[1], 'a/res2'));
		assert.ok(compareResource(actuals[2], 'b/res3'));
		assert.ok(compareResource(actuals[3], 'c/res2'));
		assert.ok(compareResource(actuals[4], 'res4'));
	});

	test('getFilteredResource return resources with no errors at the end', function() {
		let marker1= aMarker('a/res1', Severity.Warning);
		let marker2= aMarker('a/res2');
		let marker3= aMarker('res4');
		let marker4= aMarker('b/res3');
		let marker5= aMarker('res4');
		let marker6= aMarker('c/res2', Severity.Info);
		let testObject= new MarkersModel([marker1, marker2, marker3, marker4, marker5, marker6]);

		let actuals= testObject.filteredResources;

		assert.equal(5, actuals.length);
		assert.ok(compareResource(actuals[0], 'a/res2'));
		assert.ok(compareResource(actuals[1], 'b/res3'));
		assert.ok(compareResource(actuals[2], 'res4'));
		assert.ok(compareResource(actuals[3], 'a/res1'));
		assert.ok(compareResource(actuals[4], 'c/res2'));
	});

	test('getFilteredResource return markers sorted by line and column', function() {
		let marker1= aMarkerWithRange(8, 1, 9, 3);
		let marker2= aMarkerWithRange(3);
		let marker3= aMarkerWithRange(5);
		let marker4= aMarkerWithRange(8, 1, 8, 4, 'ab');
		let marker5= aMarkerWithRange(10);
		let marker6= aMarkerWithRange(8, 1, 8, 4, 'ba');
		let marker7= aMarkerWithRange(4);
		let marker8= aMarkerWithRange(8, 2, 8, 4);
		let testObject= new MarkersModel([marker1, marker2, marker3, marker4, marker5, marker6, marker7, marker8]);

		let actuals= testObject.filteredResources;

		assert.equal(8, actuals[0].markers.length);
		assert.equal(actuals[0].markers[0].marker, marker2);
		assert.equal(actuals[0].markers[1].marker, marker7);
		assert.equal(actuals[0].markers[2].marker, marker3);

		assert.equal(actuals[0].markers[3].marker, marker4);
		assert.equal(actuals[0].markers[4].marker, marker6);
		assert.equal(actuals[0].markers[5].marker, marker1);
		assert.equal(actuals[0].markers[6].marker, marker8);

		assert.equal(actuals[0].markers[7].marker, marker5);
	});

	function hasResource(resources:Resource[], resource:string):boolean {
		return resources.filter((r):boolean => {
			return r.uri.toString() === URI.file(resource).toString();
		}).length === 1;
	}

	function hasMarker(markers:Marker[], marker:IMarker):boolean {
		return markers.filter((m):boolean => {
			return m.marker === marker;
		}).length === 1;
	}

	function compareResource(a:Resource, b:string):boolean {
		return a.uri.toString() === URI.file(b).toString();
	}

	function aMarkerWithRange(startLineNumber:number=10,
					startColumn:number=5,
					endLineNumber:number= startLineNumber + 1,
					endColumn:number=startColumn + 5,
					message: string= 'some message'
					):IMarker {
		return aMarker('some resource', Severity.Error, startLineNumber, startColumn, endLineNumber, endColumn, message);
	}

	function aMarker(resource:string='some resource',
					severity:Severity=Severity.Error,
					startLineNumber:number=10,
					startColumn:number=5,
					endLineNumber:number= startLineNumber + 1,
					endColumn:number=startColumn + 5,
					message:string='some message'
					):IMarker {
		return {
			owner: 'someOwner',
			resource: URI.file(resource),
			severity: severity,
			message: message,
			startLineNumber: startLineNumber,
			startColumn: startColumn,
			endLineNumber: endLineNumber,
			endColumn: endColumn
		}
	}
});