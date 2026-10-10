/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { URI } from '../../../../base/common/uri.js';
import { TaskHandleDTO } from '../../common/extHostTask.js';
import * as types from '../../common/extHostTypes.js';

suite('ExtHostTask', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('TaskHandleDTO preserves task type', () => {
		const task = new types.Task(
			{ type: 'custom-type' },
			{ uri: URI.file('/workspace'), name: 'workspace', index: 0 },
			'my-task',
			'custom-source'
		);
		task._id = '12345';

		const dto = TaskHandleDTO.from(task);
		assert.strictEqual(dto.id, '12345');
		assert.strictEqual(dto.type, 'custom-type');
	});
});
