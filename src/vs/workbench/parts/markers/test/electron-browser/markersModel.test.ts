/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import { IMarker, MarkerSeverity, IRelatedInformation } from 'vs/platform/markers/common/markers';
import { MarkersModel, Marker, ResourceMarkers, RelatedInformation } from 'vs/workbench/parts/markers/electron-browser/markersModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { workbenchInstantiationService } from 'vs/workbench/test/workbenchTestServices';

class TestMarkersModel extends MarkersModel {

	get filteredResources(): ResourceMarkers[] {
		const res: ResourceMarkers[] = [];
		this.forEachFilteredResource(resource => res.push(resource));
		return res;
	}

}

suite('MarkersModel Test', () => {

	let instantiationService: IInstantiationService;

	setup(() => {
		instantiationService = workbenchInstantiationService();
	});

	test('getFilteredResource return markers grouped by resource', function () {
		const marker1 = aMarker('res1');
		const marker2 = aMarker('res2');
		const marker3 = aMarker('res1');
		const marker4 = aMarker('res3');
		const marker5 = aMarker('res4');
		const marker6 = aMarker('res2');
		const testObject = instantiationService.createInstance(TestMarkersModel, [marker1, marker2, marker3, marker4, marker5, marker6]);

		const actuals = testObject.filteredResources;

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

	test('sort palces resources with no errors at the end', function () {
		const marker1 = aMarker('a/res1', MarkerSeverity.Warning);
		const marker2 = aMarker('a/res2');
		const marker3 = aMarker('res4');
		const marker4 = aMarker('b/res3');
		const marker5 = aMarker('res4');
		const marker6 = aMarker('c/res2', MarkerSeverity.Info);
		const testObject = instantiationService.createInstance(TestMarkersModel, [marker1, marker2, marker3, marker4, marker5, marker6]);

		const actuals = testObject.resources;

		assert.equal(5, actuals.length);
		assert.ok(compareResource(actuals[0], 'a/res2'));
		assert.ok(compareResource(actuals[1], 'b/res3'));
		assert.ok(compareResource(actuals[2], 'res4'));
		assert.ok(compareResource(actuals[3], 'a/res1'));
		assert.ok(compareResource(actuals[4], 'c/res2'));
	});

	test('sort resources by file path', function () {
		const marker1 = aMarker('a/res1');
		const marker2 = aMarker('a/res2');
		const marker3 = aMarker('res4');
		const marker4 = aMarker('b/res3');
		const marker5 = aMarker('res4');
		const marker6 = aMarker('c/res2');
		const testObject = instantiationService.createInstance(TestMarkersModel, [marker1, marker2, marker3, marker4, marker5, marker6]);

		const actuals = testObject.resources;

		assert.equal(5, actuals.length);
		assert.ok(compareResource(actuals[0], 'a/res1'));
		assert.ok(compareResource(actuals[1], 'a/res2'));
		assert.ok(compareResource(actuals[2], 'b/res3'));
		assert.ok(compareResource(actuals[3], 'c/res2'));
		assert.ok(compareResource(actuals[4], 'res4'));
	});

	test('sort markers by severity, line and column', function () {
		const marker1 = aWarningWithRange(8, 1, 9, 3);
		const marker2 = aWarningWithRange(3);
		const marker3 = anErrorWithRange(8, 1, 9, 3);
		const marker4 = anIgnoreWithRange(5);
		const marker5 = anInfoWithRange(8, 1, 8, 4, 'ab');
		const marker6 = anErrorWithRange(3);
		const marker7 = anErrorWithRange(5);
		const marker8 = anInfoWithRange(5);
		const marker9 = anErrorWithRange(8, 1, 8, 4, 'ab');
		const marker10 = anErrorWithRange(10);
		const marker11 = anErrorWithRange(8, 1, 8, 4, 'ba');
		const marker12 = anIgnoreWithRange(3);
		const marker13 = aWarningWithRange(5);
		const marker14 = anErrorWithRange(4);
		const marker15 = anErrorWithRange(8, 2, 8, 4);
		const testObject = instantiationService.createInstance(TestMarkersModel, [marker1, marker2, marker3, marker4, marker5, marker6, marker7, marker8, marker9, marker10, marker11, marker12, marker13, marker14, marker15]);

		const actuals = testObject.resources[0].markers;

		assert.equal(actuals[0].raw, marker6);
		assert.equal(actuals[1].raw, marker14);
		assert.equal(actuals[2].raw, marker7);
		assert.equal(actuals[3].raw, marker9);
		assert.equal(actuals[4].raw, marker11);
		assert.equal(actuals[5].raw, marker3);
		assert.equal(actuals[6].raw, marker15);
		assert.equal(actuals[7].raw, marker10);
		assert.equal(actuals[8].raw, marker2);
		assert.equal(actuals[9].raw, marker13);
		assert.equal(actuals[10].raw, marker1);
		assert.equal(actuals[11].raw, marker8);
		assert.equal(actuals[12].raw, marker5);
		assert.equal(actuals[13].raw, marker12);
		assert.equal(actuals[14].raw, marker4);
	});

	test('toString()', function () {
		let marker = aMarker('a/res1');
		marker.code = '1234';
		assert.equal(JSON.stringify({ ...marker, resource: marker.resource.path }, null, '\t'), instantiationService.createInstance(Marker, '', marker, null).toString());

		marker = aMarker('a/res2', MarkerSeverity.Warning);
		assert.equal(JSON.stringify({ ...marker, resource: marker.resource.path }, null, '\t'), instantiationService.createInstance(Marker, '', marker, null).toString());

		marker = aMarker('a/res2', MarkerSeverity.Info, 1, 2, 1, 8, 'Info', '');
		assert.equal(JSON.stringify({ ...marker, resource: marker.resource.path }, null, '\t'), instantiationService.createInstance(Marker, '', marker, null).toString());

		marker = aMarker('a/res2', MarkerSeverity.Hint, 1, 2, 1, 8, 'Ignore message', 'Ignore');
		assert.equal(JSON.stringify({ ...marker, resource: marker.resource.path }, null, '\t'), instantiationService.createInstance(Marker, '', marker, null).toString());

		marker = aMarker('a/res2', MarkerSeverity.Warning, 1, 2, 1, 8, 'Warning message', '', [{ startLineNumber: 2, startColumn: 5, endLineNumber: 2, endColumn: 10, message: 'some info', resource: URI.file('a/res3') }]);
		const testObject = instantiationService.createInstance(Marker, '', marker, null);
		testObject.resourceRelatedInformation = marker.relatedInformation.map(r => new RelatedInformation('', r));
		assert.equal(JSON.stringify({ ...marker, resource: marker.resource.path, relatedInformation: marker.relatedInformation.map(r => ({ ...r, resource: r.resource.path })) }, null, '\t'), testObject.toString());
	});

	function hasMarker(markers: Marker[], marker: IMarker): boolean {
		return markers.filter((m): boolean => {
			return m.raw === marker;
		}).length === 1;
	}

	function compareResource(a: ResourceMarkers, b: string): boolean {
		return a.uri.toString() === URI.file(b).toString();
	}

	function anErrorWithRange(startLineNumber: number = 10,
		startColumn: number = 5,
		endLineNumber: number = startLineNumber + 1,
		endColumn: number = startColumn + 5,
		message: string = 'some message',
	): IMarker {
		return aMarker('some resource', MarkerSeverity.Error, startLineNumber, startColumn, endLineNumber, endColumn, message);
	}

	function aWarningWithRange(startLineNumber: number = 10,
		startColumn: number = 5,
		endLineNumber: number = startLineNumber + 1,
		endColumn: number = startColumn + 5,
		message: string = 'some message',
	): IMarker {
		return aMarker('some resource', MarkerSeverity.Warning, startLineNumber, startColumn, endLineNumber, endColumn, message);
	}

	function anInfoWithRange(startLineNumber: number = 10,
		startColumn: number = 5,
		endLineNumber: number = startLineNumber + 1,
		endColumn: number = startColumn + 5,
		message: string = 'some message',
	): IMarker {
		return aMarker('some resource', MarkerSeverity.Info, startLineNumber, startColumn, endLineNumber, endColumn, message);
	}

	function anIgnoreWithRange(startLineNumber: number = 10,
		startColumn: number = 5,
		endLineNumber: number = startLineNumber + 1,
		endColumn: number = startColumn + 5,
		message: string = 'some message',
	): IMarker {
		return aMarker('some resource', MarkerSeverity.Hint, startLineNumber, startColumn, endLineNumber, endColumn, message);
	}

	function aMarker(resource: string = 'some resource',
		severity: MarkerSeverity = MarkerSeverity.Error,
		startLineNumber: number = 10,
		startColumn: number = 5,
		endLineNumber: number = startLineNumber + 1,
		endColumn: number = startColumn + 5,
		message: string = 'some message',
		source: string = 'tslint',
		relatedInformation?: IRelatedInformation[]
	): IMarker {
		return {
			owner: 'someOwner',
			resource: URI.file(resource),
			severity,
			message,
			startLineNumber,
			startColumn,
			endLineNumber,
			endColumn,
			source,
			relatedInformation
		};
	}
});
