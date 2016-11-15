/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { EditorSimpleWorkerImpl, ICommonModel } from 'vs/editor/common/services/editorSimpleWorker';

suite('EditorSimpleWorker', () => {


	let worker: EditorSimpleWorkerImpl;
	let model: ICommonModel;

	setup(() => {
		worker = new class extends EditorSimpleWorkerImpl {

			constructor() {
				super();
				this.acceptNewModel({
					url: 'test:file',
					versionId: 1,
					value: {
						EOL: '\n',
						lines: [
							'This is line one', //16
							'and this is line number two', //27
							'it is followed by #3', //20
							'and finished with the fourth.', //29
						],
						BOM: undefined,
						containsRTL: undefined,
						length: undefined,
						options: undefined
					}
				});
				model = this._getModel('test:file');
			}
		};
	});

	function assertPositionAt(offset: number, line: number, column: number) {
		let position = model.positionAt(offset);
		assert.equal(position.lineNumber, line);
		assert.equal(position.column, column);
	}

	function assertOffsetAt(lineNumber: number, column: number, offset: number) {
		let actual = model.offsetAt({ lineNumber, column });
		assert.equal(actual, offset);
	}

	test('ICommonModel#offsetAt', function () {
		assertOffsetAt(1, 1, 0);
		assertOffsetAt(1, 2, 1);
		assertOffsetAt(1, 17, 16);
		assertOffsetAt(2, 1, 17);
		assertOffsetAt(2, 4, 20);
		assertOffsetAt(3, 1, 45);
		assertOffsetAt(5, 30, 95);
		assertOffsetAt(5, 31, 95);
		assertOffsetAt(5, Number.MAX_VALUE, 95);
		assertOffsetAt(6, 30, 95);
		assertOffsetAt(Number.MAX_VALUE, 30, 95);
		assertOffsetAt(Number.MAX_VALUE, Number.MAX_VALUE, 95);
	});

	test('ICommonModel#positionAt', function () {
		assertPositionAt(0, 1, 1);
		assertPositionAt(Number.MIN_VALUE, 1, 1);
		assertPositionAt(1, 1, 2);
		assertPositionAt(16, 1, 17);
		assertPositionAt(17, 2, 1);
		assertPositionAt(20, 2, 4);
		assertPositionAt(45, 3, 1);
		assertPositionAt(95, 4, 30);
		assertPositionAt(96, 4, 30);
		assertPositionAt(99, 4, 30);
		assertPositionAt(Number.MAX_VALUE, 4, 30);
	});
});
