/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { toolResultMessageFromResponse } from '../../browser/tools/task/taskHelpers.js';
import { OutputMonitorState } from '../../browser/tools/monitoring/types.js';
import { URI } from '../../../../../../base/common/uri.js';

suite('TaskHelpers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('toolResultMessageFromResponse', () => {
		test('should show "finished" for idle tasks when task is not active', () => {
			const terminalResults = [
				{
					output: 'Task completed successfully',
					state: OutputMonitorState.Idle,
					resources: []
				}
			];

			const result = toolResultMessageFromResponse(undefined, 'test-task', [], terminalResults, false);
			assert.strictEqual(result.value, '`test-task` task finished');
		});

		test('should show "started and will continue to run" for idle tasks when task is still active', () => {
			const terminalResults = [
				{
					output: 'Watching for file changes...',
					state: OutputMonitorState.Idle,
					resources: []
				}
			];

			const result = toolResultMessageFromResponse(undefined, 'watch-task', [], terminalResults, true);
			assert.strictEqual(result.value, '`watch-task` task started and will continue to run in the background');
		});

		test('should show "finished with problems" for idle tasks with problems when task is not active', () => {
			const terminalResults = [
				{
					output: 'Task completed with errors',
					state: OutputMonitorState.Idle,
					resources: []
				}
			];
			const toolResultDetails = [URI.file('/path/to/file.ts')];

			const result = toolResultMessageFromResponse(undefined, 'test-task', toolResultDetails, terminalResults, false);
			assert.strictEqual(result.value, '`test-task` task finished with `1` problem');
		});

		test('should show "started and will continue to run" for non-idle tasks regardless of task activity', () => {
			const terminalResults = [
				{
					output: 'Watching for file changes...',
					state: OutputMonitorState.PollingForIdle,
					resources: []
				}
			];

			// Even if task activity is unknown, non-idle terminal should show "started and will continue"
			const result = toolResultMessageFromResponse(undefined, 'watch-task', [], terminalResults, undefined);
			assert.strictEqual(result.value, '`watch-task` task started and will continue to run in the background');
		});

		test('should show "started and will continue to run with problems" for non-idle tasks with problems', () => {
			const terminalResults = [
				{
					output: 'Watching with some errors...',
					state: OutputMonitorState.PollingForIdle,
					resources: []
				}
			];
			const toolResultDetails = [URI.file('/path/to/file1.ts'), URI.file('/path/to/file2.ts')];

			const result = toolResultMessageFromResponse(undefined, 'watch-task', toolResultDetails, terminalResults, true);
			assert.strictEqual(result.value, '`watch-task` task started and will continue to run in the background with `2` problems');
		});

		test('should handle mixed terminal results - non-idle takes precedence', () => {
			const terminalResults = [
				{
					output: 'Task 1 finished',
					state: OutputMonitorState.Idle,
					resources: []
				},
				{
					output: 'Task 2 still watching...',
					state: OutputMonitorState.PollingForIdle,
					resources: []
				}
			];

			const result = toolResultMessageFromResponse(undefined, 'mixed-task', [], terminalResults, false);
			assert.strictEqual(result.value, '`mixed-task` task started and will continue to run in the background');
		});

		test('should handle backward compatibility when isTaskStillActive is undefined', () => {
			const terminalResults = [
				{
					output: 'Task completed',
					state: OutputMonitorState.Idle,
					resources: []
				}
			];

			// When isTaskStillActive is undefined, should fall back to old behavior (only check terminal state)
			const result = toolResultMessageFromResponse(undefined, 'test-task', [], terminalResults, undefined);
			assert.strictEqual(result.value, '`test-task` task finished');
		});

		test('should handle task that failed with exit code', () => {
			const taskSummary = { exitCode: 1 };
			const terminalResults = [
				{
					output: 'Task failed',
					state: OutputMonitorState.Idle,
					resources: []
				}
			];

			const result = toolResultMessageFromResponse(taskSummary, 'failed-task', [], terminalResults);
			assert.strictEqual(result.value, 'Task `failed-task` failed with exit code 1.');
		});
	});
});