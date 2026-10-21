/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BuildLifecycle } from '../buildEvents.ts';

test('overlapping builds retain failures, finish once, and recover next cycle', t => {
	const log = t.mock.method(console, 'log');
	const previous = process.env.VSCODE_BUILD_EVENTS;
	t.after(() => restoreBuildEvents(previous));
	process.env.VSCODE_BUILD_EVENTS = '1';
	const messages = () => log.mock.calls.map(call => call.arguments[0]);
	const lifecycle = new BuildLifecycle();
	const first = lifecycle.start();
	const second = lifecycle.start();
	first(true);
	assert.deepEqual(messages(), ['VSCODE_BUILD_START']);
	first();
	second();
	assert.deepEqual(messages(), ['VSCODE_BUILD_START', 'VSCODE_BUILD_FAILED']);
	lifecycle.start()();
	assert.deepEqual(messages(), [
		'VSCODE_BUILD_START', 'VSCODE_BUILD_FAILED',
		'VSCODE_BUILD_START', 'VSCODE_BUILD_DONE',
	]);
});

test('events require an explicit opt-in and preserve existing log callbacks', t => {
	const log = t.mock.method(console, 'log');
	const previous = process.env.VSCODE_BUILD_EVENTS;
	t.after(() => restoreBuildEvents(previous));
	for (const value of [undefined, '', '0', 'true']) {
		restoreBuildEvents(value);
		const callbacks: string[] = [];
		const lifecycle = new BuildLifecycle(() => callbacks.push('start'), () => callbacks.push('end'));
		const first = lifecycle.start();
		const second = lifecycle.start();
		first(true);
		second();
		assert.deepEqual(callbacks, ['start', 'end']);
	}
	assert.equal(log.mock.callCount(), 0);
});

function restoreBuildEvents(value: string | undefined): void {
	if (value === undefined) {
		delete process.env.VSCODE_BUILD_EVENTS;
	} else {
		process.env.VSCODE_BUILD_EVENTS = value;
	}
}
