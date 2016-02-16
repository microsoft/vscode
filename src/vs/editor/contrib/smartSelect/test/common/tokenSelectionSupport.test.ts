/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/languages/javascript/common/javascript.contribution';
import assert = require('assert');
import Modes = require('vs/editor/common/modes');
import modesUtil = require('vs/editor/test/common/modesUtil');
import {createMockModelService} from 'vs/editor/test/common/servicesTestUtils';
import URI from 'vs/base/common/uri';
import TokenSelectionSupport = require('vs/editor/contrib/smartSelect/common/tokenSelectionSupport');
import {Range} from 'vs/editor/common/core/range';

suite('TokenSelectionSupport', () => {

	let modelService = createMockModelService();
	let tokenSelectionSupport = new TokenSelectionSupport(modelService);
	let _mode: Modes.IMode;

	suiteSetup((done) => {
		modesUtil.load('javascript').then(mode => {
			_mode = mode;
			done();
		});
	});

	function assertGetRangesToPosition(text:string[], lineNumber:number, column:number, ranges:Range[]): void {
		let uri = URI.file('test.js');
		let model = modelService.createModel(text.join('\n'), _mode, uri);

		let actual = tokenSelectionSupport.getRangesToPositionSync(uri, {
			lineNumber: lineNumber,
			column: column
		});

		let actualStr = actual.map(r => new Range(r.range.startLineNumber, r.range.startColumn, r.range.endLineNumber, r.range.endColumn).toString());
		let desiredStr = ranges.map(r => String(r));

		assert.deepEqual(actualStr, desiredStr);

		modelService.destroyModel(uri);
	}

	test('getRangesToPosition #1', () => {

		assertGetRangesToPosition([
			'function a(bar, foo){',
			'\tif (bar) {',
			'\t\treturn (bar + (2 * foo))',
			'\t}',
			'}'
		], 3, 20, [
			new Range(1, 1, 5, 2),
			new Range(1, 21, 5, 2),
			new Range(2, 1, 4, 3),
			new Range(2, 11, 4, 3),
			new Range(3, 1, 4, 2),
			new Range(3, 1, 3, 27),
			new Range(3, 10, 3, 27),
			new Range(3, 11, 3, 26),
			new Range(3, 17, 3, 26),
			new Range(3, 18, 3, 25),
			new Range(3, 19, 3, 20)
		]);
	});
});