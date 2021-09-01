/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ReplayEntry } from 'vs/platform/terminal/common/terminalProcess';
import { TerminalRecorder } from 'vs/platform/terminal/common/terminalRecorder';

function eventsEqual(recorder: TerminalRecorder, expected: ReplayEntry[]) {
	const actual = recorder.generateReplayEvent().events;
	for (let i = 0; i < expected.length; i++) {
		assert.deepStrictEqual(actual[i], expected[i]);
	}
}

suite('TerminalRecorder', () => {
	test('should record dimensions', () => {
		const recorder = new TerminalRecorder(1, 2);
		eventsEqual(recorder, [
			{ cols: 1, rows: 2, data: '' }
		]);
		recorder.handleData('a');
		recorder.handleResize(3, 4);
		eventsEqual(recorder, [
			{ cols: 1, rows: 2, data: 'a' },
			{ cols: 3, rows: 4, data: '' }
		]);
	});
	test('should ignore resize events without data', () => {
		const recorder = new TerminalRecorder(1, 2);
		eventsEqual(recorder, [
			{ cols: 1, rows: 2, data: '' }
		]);
		recorder.handleResize(3, 4);
		eventsEqual(recorder, [
			{ cols: 3, rows: 4, data: '' }
		]);
	});
	test('should record data and combine it into the previous resize event', () => {
		const recorder = new TerminalRecorder(1, 2);
		recorder.handleData('a');
		recorder.handleData('b');
		recorder.handleResize(3, 4);
		recorder.handleData('c');
		recorder.handleData('d');
		eventsEqual(recorder, [
			{ cols: 1, rows: 2, data: 'ab' },
			{ cols: 3, rows: 4, data: 'cd' }
		]);
	});
});
