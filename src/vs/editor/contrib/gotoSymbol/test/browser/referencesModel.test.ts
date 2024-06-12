/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { ReferencesModel } from 'vs/editor/contrib/gotoSymbol/browser/referencesModel';

suite('references', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('nearestReference', () => {
		const model = new ReferencesModel([{
			uri: URI.file('/out/obj/can'),
			range: new Range(1, 1, 1, 1)
		}, {
			uri: URI.file('/out/obj/can2'),
			range: new Range(1, 1, 1, 1)
		}, {
			uri: URI.file('/src/can'),
			range: new Range(1, 1, 1, 1)
		}], 'FOO');

		let ref = model.nearestReference(URI.file('/src/can'), new Position(1, 1));
		assert.strictEqual(ref!.uri.path, '/src/can');

		ref = model.nearestReference(URI.file('/src/someOtherFileInSrc'), new Position(1, 1));
		assert.strictEqual(ref!.uri.path, '/src/can');

		ref = model.nearestReference(URI.file('/out/someOtherFile'), new Position(1, 1));
		assert.strictEqual(ref!.uri.path, '/out/obj/can');

		ref = model.nearestReference(URI.file('/out/obj/can2222'), new Position(1, 1));
		assert.strictEqual(ref!.uri.path, '/out/obj/can2');
	});

});
