/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExperimentalSettingsService } from '../../common/experimentalSettings.js';
import { timeout } from '../../../../../base/common/async.js';

suite('ExperimentalSettingsService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('batches changed settings across microtasks while updating membership synchronously', async () => {
		const service = store.add(new ExperimentalSettingsService());
		const changes: string[][] = [];
		store.add(service.onDidChangeAssignments(keys => changes.push([...keys])));

		service.setAssignment('test.first', false);
		service.setAssignment('test.first', true);
		service.setAssignment('test.first', true);
		await Promise.resolve();
		service.setAssignment('test.second', true);
		service.setAssignment('test.first', false);
		const beforeNotification = changes.length;
		const secondAssignedImmediately = service.hasAssignment('test.second');
		await timeout(0);

		assert.deepStrictEqual({
			changes,
			beforeNotification,
			secondAssignedImmediately,
			first: service.hasAssignment('test.first'),
			second: service.hasAssignment('test.second'),
			missing: service.hasAssignment('test.missing'),
		}, {
			changes: [['test.first', 'test.second']],
			beforeNotification: 0,
			secondAssignedImmediately: true,
			first: false,
			second: true,
			missing: false,
		});
	});

	test('does not notify for unchanged membership or after disposal', async () => {
		const service = store.add(new ExperimentalSettingsService());
		const changes: string[][] = [];
		store.add(service.onDidChangeAssignments(keys => changes.push([...keys])));
		service.setAssignment('test.setting', false);
		await timeout(0);
		service.setAssignment('test.setting', true);
		service.dispose();
		await timeout(0);
		assert.deepStrictEqual(changes, []);
	});
});
