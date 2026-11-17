/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IPowerService, PowerSaveBlockerType } from '../../../../../workbench/services/power/common/powerService.js';
import { ISession, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { SessionsKeepAwake } from '../../electron-browser/sessionsKeepAwake.js';

class TestSessionsManagementService extends mock<ISessionsManagementService>() {

	private readonly _onDidChangeSessions = new Emitter<ISessionsChangeEvent>();
	override readonly onDidChangeSessions = this._onDidChangeSessions.event;

	readonly sessions: ISession[] = [];

	override getSessions(): ISession[] {
		return [...this.sessions];
	}

	add(session: ISession): void {
		this.sessions.push(session);
		this._onDidChangeSessions.fire({ added: [session], removed: [], changed: [] });
	}

	dispose(): void {
		this._onDidChangeSessions.dispose();
	}
}

class TestPowerService extends mock<IPowerService>() {

	readonly calls: string[] = [];
	private _nextId = 1;

	override async startPowerSaveBlocker(type: PowerSaveBlockerType): Promise<number> {
		const id = this._nextId++;
		this.calls.push(`start ${type} ${id}`);
		return id;
	}

	override async stopPowerSaveBlocker(id: number): Promise<boolean> {
		this.calls.push(`stop ${id}`);
		return true;
	}
}

function createSession(environment: string, initialStatus: SessionStatus) {
	const status = observableValue<SessionStatus>('status', initialStatus);
	const session = new class extends mock<ISession>() {
		override readonly environment = environment;
		override readonly status = status;
	};
	return { session, status };
}

suite('SessionsKeepAwake', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const management = store.add(new TestSessionsManagementService());
		const power = new TestPowerService();
		const keepAwake = store.add(new SessionsKeepAwake(management, power, new NullLogService()));
		return { management, power, keepAwake };
	}

	test('holds only while an agent on this computer works and releases after a delay', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { management, power } = setup();
		const local = createSession('local', SessionStatus.Completed);
		management.add(createSession('cloud', SessionStatus.InProgress).session);
		management.add(createSession('remote-host', SessionStatus.InProgress).session);
		management.add(local.session);
		await timeout(0);
		const whileOnlyElsewhere = [...power.calls];

		local.status.set(SessionStatus.InProgress, undefined);
		await timeout(0);
		local.status.set(SessionStatus.NeedsInput, undefined);
		await timeout(SessionsKeepAwake.RELEASE_DELAY - 1);
		const beforeDelay = [...power.calls];
		await timeout(1);

		assert.deepStrictEqual({ whileOnlyElsewhere, beforeDelay, after: power.calls }, {
			whileOnlyElsewhere: [],
			beforeDelay: ['start prevent-app-suspension 1'],
			after: ['start prevent-app-suspension 1', 'stop 1'],
		});
	}));

	test('keeps one hold when work resumes before the delay ends', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { management, power } = setup();
		const local = createSession('local', SessionStatus.InProgress);
		management.add(local.session);
		await timeout(0);

		local.status.set(SessionStatus.Completed, undefined);
		await timeout(SessionsKeepAwake.RELEASE_DELAY / 2);
		local.status.set(SessionStatus.InProgress, undefined);
		await timeout(SessionsKeepAwake.RELEASE_DELAY);

		assert.deepStrictEqual(power.calls, ['start prevent-app-suspension 1']);
	}));

	test('stops a blocker that starts after the hold was released', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { management, power, keepAwake } = setup();
		management.add(createSession('local', SessionStatus.InProgress).session);
		keepAwake.dispose();
		await timeout(0);

		assert.deepStrictEqual(power.calls, ['start prevent-app-suspension 1', 'stop 1']);
	}));
});
