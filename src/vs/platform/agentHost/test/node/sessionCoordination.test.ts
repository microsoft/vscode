/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SessionStatus, type ISessionOrchestration } from '../../common/state/sessionState.js';
import { transitionSessionCoordination } from '../../node/sessionCoordination.js';

suite('SessionCoordination', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const base: ISessionOrchestration = {
		parentSession: 'copilot:/parent',
		coordinateWithCreator: true,
		notifyOnIdle: 'once',
	};

	test('arms only after work starts', () => {
		assert.deepStrictEqual(transitionSessionCoordination(SessionStatus.Idle, base), { notify: false });
		assert.deepStrictEqual(transitionSessionCoordination(SessionStatus.InProgress, base), {
			orchestration: { ...base, notificationArmed: true },
			notify: false,
		});
	});

	test('notifies once after idle or error', () => {
		const armed = { ...base, notificationArmed: true };
		const expected = {
			orchestration: { ...armed, notificationArmed: false, notificationSent: true },
			notify: true,
		};
		assert.deepStrictEqual(transitionSessionCoordination(SessionStatus.Idle, armed), expected);
		assert.deepStrictEqual(transitionSessionCoordination(SessionStatus.Error, armed), expected);
		assert.deepStrictEqual(transitionSessionCoordination(SessionStatus.InProgress, expected.orchestration), { notify: false });
	});

	test('notifies once when input is needed and deduplicates repeated status', () => {
		const armed = { ...base, notificationArmed: true };
		const transition = transitionSessionCoordination(SessionStatus.InputNeeded, armed);
		assert.deepStrictEqual(transition, {
			orchestration: { ...armed, notificationArmed: false, notificationSent: true },
			notify: true,
		});
		assert.deepStrictEqual(transitionSessionCoordination(SessionStatus.InputNeeded, transition.orchestration!), { notify: false });
	});

	test('always rearms for later work', () => {
		const always: ISessionOrchestration = { ...base, notifyOnIdle: 'always', notificationSent: true };
		assert.deepStrictEqual(transitionSessionCoordination(SessionStatus.InProgress, always), {
			orchestration: { ...always, notificationArmed: true },
			notify: false,
		});
	});

	test('always captures back-to-back work cycles', () => {
		let orchestration: ISessionOrchestration = { ...base, notifyOnIdle: 'always' };
		for (let cycle = 0; cycle < 2; cycle++) {
			const started = transitionSessionCoordination(SessionStatus.InProgress, orchestration);
			assert.strictEqual(started.notify, false);
			orchestration = started.orchestration!;
			const completed = transitionSessionCoordination(SessionStatus.Idle, orchestration);
			assert.strictEqual(completed.notify, true);
			orchestration = completed.orchestration!;
		}
	});
});
