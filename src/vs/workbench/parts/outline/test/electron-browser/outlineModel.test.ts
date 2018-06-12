/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { OutlineElement, OutlineGroup } from 'vs/workbench/parts/outline/electron-browser/outlineModel';
import { SymbolKind, DocumentSymbol } from 'vs/editor/common/modes';
import { Range } from 'vs/editor/common/core/range';
import { IMarker, MarkerSeverity } from 'vs/platform/markers/common/markers';

suite('OutlineModel', function () {


	function fakeSymbolInformation(range: Range, name: string = 'foo'): DocumentSymbol {
		return {
			name,
			kind: SymbolKind.Boolean,
			identifierRange: range,
			fullRange: range
		};
	}

	function fakeMarker(range: Range): IMarker {
		return { ...range, owner: 'ffff', message: 'test', severity: MarkerSeverity.Error, resource: null };
	}

	test('OutlineElement - updateMarker', function () {

		let e0 = new OutlineElement('foo1', null, fakeSymbolInformation(new Range(1, 1, 1, 10)));
		let e1 = new OutlineElement('foo2', null, fakeSymbolInformation(new Range(2, 1, 5, 1)));
		let e2 = new OutlineElement('foo3', null, fakeSymbolInformation(new Range(6, 1, 10, 10)));

		let group = new OutlineGroup('group', null, null, 1);
		group.children[e0.id] = e0;
		group.children[e1.id] = e1;
		group.children[e2.id] = e2;

		const data = [fakeMarker(new Range(6, 1, 6, 7)), fakeMarker(new Range(1, 1, 1, 4)), fakeMarker(new Range(10, 2, 14, 1))];
		data.sort(Range.compareRangesUsingStarts); // model does this

		group.updateMarker(data);
		assert.equal(data.length, 0); // all 'stolen'
		assert.equal(e0.marker.count, 1);
		assert.equal(e1.marker, undefined);
		assert.equal(e2.marker.count, 2);

		group.updateMarker([]);
		assert.equal(e0.marker, undefined);
		assert.equal(e1.marker, undefined);
		assert.equal(e2.marker, undefined);
	});

	test('OutlineElement - updateMarker, 2', function () {

		let p = new OutlineElement('A', null, fakeSymbolInformation(new Range(1, 1, 11, 1)));
		let c1 = new OutlineElement('A/B', null, fakeSymbolInformation(new Range(2, 4, 5, 4)));
		let c2 = new OutlineElement('A/C', null, fakeSymbolInformation(new Range(6, 4, 9, 4)));

		let group = new OutlineGroup('group', null, null, 1);
		group.children[p.id] = p;
		p.children[c1.id] = c1;
		p.children[c2.id] = c2;

		let data = [
			fakeMarker(new Range(2, 4, 5, 4))
		];

		group.updateMarker(data);
		assert.equal(p.marker.count, 0);
		assert.equal(c1.marker.count, 1);
		assert.equal(c2.marker, undefined);

		data = [
			fakeMarker(new Range(2, 4, 5, 4)),
			fakeMarker(new Range(2, 6, 2, 8)),
			fakeMarker(new Range(7, 6, 7, 8)),
		];
		group.updateMarker(data);
		assert.equal(p.marker.count, 0);
		assert.equal(c1.marker.count, 2);
		assert.equal(c2.marker.count, 1);

		data = [
			fakeMarker(new Range(1, 4, 1, 11)),
			fakeMarker(new Range(7, 6, 7, 8)),
		];
		group.updateMarker(data);
		assert.equal(p.marker.count, 1);
		assert.equal(c1.marker, undefined);
		assert.equal(c2.marker.count, 1);
	});
});
