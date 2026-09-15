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
});
