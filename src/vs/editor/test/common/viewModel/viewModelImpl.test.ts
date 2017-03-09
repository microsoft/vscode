/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Range } from 'vs/editor/common/core/range';
import { testViewModel } from 'vs/editor/test/common/viewModel/testViewModel';

suite('ViewModel', () => {

	test('issue #21073: SplitLinesCollection: attempt to access a \'newer\' model', () => {
		const text = [''];
		const opts = {
			lineNumbersMinChars: 1
		};
		testViewModel(text, opts, (viewModel, model) => {
			assert.equal(viewModel.getLineCount(), 1);

			viewModel.setViewport(1, 1, 1);

			model.applyEdits([{
				identifier: null,
				range: new Range(1, 1, 1, 1),
				text: [
					'line01',
					'line02',
					'line03',
					'line04',
					'line05',
					'line06',
					'line07',
					'line08',
					'line09',
					'line10',
				].join('\n'),
				forceMoveMarkers: false
			}]);

			assert.equal(viewModel.getLineCount(), 10);
		});
	});
});
