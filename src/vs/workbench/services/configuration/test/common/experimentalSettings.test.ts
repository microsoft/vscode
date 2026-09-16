/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExperimentalSettingsService } from '../../common/experimentalSettings.js';

suite('ExperimentalSettingsService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('notifies only when assignment membership changes', () => {
		const service = store.add(new ExperimentalSettingsService());
		const changes: string[][] = [];
		store.add(service.onDidChangeAssignments(keys => changes.push([...keys])));

		service.setAssignment('test.first', false);
		service.setAssignment('test.first', true);
		service.setAssignment('test.first', true);
		service.setAssignment('test.second', true);
		service.setAssignment('test.first', false);

		assert.deepStrictEqual({
			changes,
			first: service.hasAssignment('test.first'),
			second: service.hasAssignment('test.second'),
			missing: service.hasAssignment('test.missing'),
		}, {
			changes: [['test.first'], ['test.second'], ['test.first']],
			first: false,
			second: true,
			missing: false,
		});
	});
});
