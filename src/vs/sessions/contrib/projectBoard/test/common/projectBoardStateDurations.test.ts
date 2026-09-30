/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { ProjectBoardStateDurations } from '../../common/projectBoardStateDurations.js';

suite('ProjectBoardStateDurations', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const card = { id: 'child', status: SessionStatus.InProgress, connection: undefined };

	test('initial states are lower bounds and unrelated updates do not reset elapsed time', () => {
		const durations = new ProjectBoardStateDurations();
		durations.update([card], 1000);
		durations.update([{ ...card }], 30000);
		assert.strictEqual(durations.getLabel(card.id, 62000), 'Time in state: at least 01:01');
		assert.strictEqual(durations.getLabel(card.id, 62000, true), '≥ 01:01');
		assert.strictEqual(durations.getLabel(card.id, 3662000), 'Time in state: at least 1:01:01');
	});

	test('every observed status transition resets independently, including Busy resuming after input', () => {
		const durations = new ProjectBoardStateDurations();
		durations.update([card, { ...card, id: 'peer' }], 0);
		for (const [index, status] of [SessionStatus.NeedsInput, SessionStatus.InProgress, SessionStatus.Error, SessionStatus.Completed].entries()) {
			const now = (index + 1) * 10000;
			durations.update([{ ...card, status }, { ...card, id: 'peer' }], now);
			assert.strictEqual(durations.getLabel(card.id, now + 2000), 'Time in state: 00:02');
			assert.strictEqual(durations.getLabel(card.id, now + 2000, true), '00:02');
		}
		assert.strictEqual(durations.getLabel('peer', 60000), 'Time in state: at least 01:00');
	});

	test('disconnects and rediscovery never claim to know unobserved transitions', () => {
		const durations = new ProjectBoardStateDurations();
		durations.update([card], 1000);
		durations.update([{ ...card, connection: 'disconnected' }], 2000);
		assert.strictEqual(durations.getLabel(card.id, 3000), 'Time in state: unavailable');
		assert.strictEqual(durations.getLabel(card.id, 3000, true), 'Unavailable');
		durations.update([card], 5000);
		assert.strictEqual(durations.getLabel(card.id, 10000), 'Time in state: at least 00:05');
		durations.update([], 10000);
		assert.strictEqual(durations.getLabel(card.id), 'Time in state: unavailable');
		durations.update([card], 20000);
		assert.strictEqual(durations.getLabel(card.id, 21000), 'Time in state: at least 00:01');
		assert.strictEqual(durations.getLabel(card.id, 10000), 'Time in state: at least 00:00');
	});

	test('busy severity changes strictly after 30 minutes and 2 hours, including lower bounds', () => {
		const durations = new ProjectBoardStateDurations();
		const start = 1000;
		durations.update([card], start);
		assert.deepStrictEqual(
			[-1, 0, 1799999, 1800000, 1800001, 7199999, 7200000, 7200001].map(elapsed => durations.getSeverity(card.id, start + elapsed)),
			[undefined, undefined, undefined, undefined, 'warning', 'warning', 'warning', 'error'],
		);
		durations.update([{ ...card }], start + 7200002);
		assert.strictEqual(durations.getSeverity(card.id, start + 7200002), 'error');
	});

	test('non-busy states never escalate and a new busy period starts without a warning', () => {
		const durations = new ProjectBoardStateDurations();
		for (const status of [SessionStatus.NeedsInput, SessionStatus.Error, SessionStatus.Completed, SessionStatus.Untitled]) {
			durations.update([{ ...card, status }], 0);
			assert.strictEqual(durations.getSeverity(card.id, 8000000), undefined);
			durations.update([card], 8000000);
			assert.strictEqual(durations.getSeverity(card.id, 8000001), undefined);
			assert.strictEqual(durations.getSeverity(card.id, 9800001), 'warning');
		}
	});

	test('disconnect, removal and reconnect clear busy severity rather than counting unseen time', () => {
		const durations = new ProjectBoardStateDurations();
		durations.update([card], 0);
		assert.strictEqual(durations.getSeverity(card.id, 8000000), 'error');
		durations.update([{ ...card, connection: 'disconnected' }], 8000000);
		assert.strictEqual(durations.getSeverity(card.id, 16000000), undefined);
		durations.update([card], 16000000);
		assert.strictEqual(durations.getSeverity(card.id, 16000001), undefined);
		durations.update([], 20000000);
		assert.strictEqual(durations.getSeverity(card.id, 30000000), undefined);
	});
});
