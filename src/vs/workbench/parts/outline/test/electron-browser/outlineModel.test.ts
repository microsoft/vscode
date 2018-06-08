/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { OutlineElement, OutlineGroup } from 'vs/workbench/parts/outline/electron-browser/outlineModel';
import { SymbolKind, SymbolInformation } from 'vs/editor/common/modes';
import { Range } from 'vs/editor/common/core/range';
import URI from 'vs/base/common/uri';
import { IMarker } from 'vs/platform/markers/common/markers';

suite('OutlineModel', function () {


	function fakeSymbolInformation(range: Range, name: string = 'foo'): SymbolInformation {
		return {
			name,
			kind: SymbolKind.Boolean,
			location: { uri: URI.parse('some:uri'), range },
			definingRange: range
		};
	}

	function fakeMarker(range: Range): IMarker {
		return { ...range, owner: 'ffff', message: 'test', severity: 0, resource: null };
	}

	test.skip('OutlineElement - updateMarker', function () {

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
		assert.equal(e0.marker.count, 1);
		assert.equal(e1.marker.count, 0);
		assert.equal(e2.marker.count, 2);

		group.updateMarker([]);
		assert.equal(e0.marker.count, 0);
		assert.equal(e1.marker.count, 0);
		assert.equal(e2.marker.count, 0);
	});

});
