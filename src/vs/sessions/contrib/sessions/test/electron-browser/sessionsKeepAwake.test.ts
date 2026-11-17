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
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IPowerService, PowerSaveBlockerType } from '../../../../../workbench/services/power/common/powerService.js';
import { ISession, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { SESSIONS_KEEP_AWAKE_ON_BATTERY_SETTING, SESSIONS_KEEP_AWAKE_SETTING, SessionsKeepAwake } from '../../electron-browser/sessionsKeepAwake.js';

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

	private readonly _onDidChangeOnBatteryPower = new Emitter<boolean>();
	override readonly onDidChangeOnBatteryPower = this._onDidChangeOnBatteryPower.event;

	readonly calls: string[] = [];
	private _nextId = 1;

	override async isOnBatteryPower(): Promise<boolean> {
		return false;
	}

	override async startPowerSaveBlocker(type: PowerSaveBlockerType): Promise<number> {
		const id = this._nextId++;
		this.calls.push(`start ${type} ${id}`);
		return id;
	}

	override async stopPowerSaveBlocker(id: number): Promise<boolean> {
		this.calls.push(`stop ${id}`);
		return true;
	}

	setOnBattery(value: boolean): void {
		this._onDidChangeOnBatteryPower.fire(value);
	}

	dispose(): void {
		this._onDidChangeOnBatteryPower.dispose();
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

	function setup(configuration: Record<string, boolean> = {}) {
		const management = store.add(new TestSessionsManagementService());
		const power = store.add(new TestPowerService());
		const configurationService = new TestConfigurationService({
			[SESSIONS_KEEP_AWAKE_SETTING]: true,
			[SESSIONS_KEEP_AWAKE_ON_BATTERY_SETTING]: true,
			...configuration,
		});
		const keepAwake = store.add(new SessionsKeepAwake(management, power, configurationService, new NullLogService()));
		return { management, power, configurationService, keepAwake };
	}

	function changeSetting(configurationService: TestConfigurationService, key: string, value: boolean): void {
		configurationService.setUserConfiguration(key, value);
		configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string) { return section === key; }
		});
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

	test('releases right away when turned off or on battery with the battery setting off', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { management, power, configurationService } = setup({ [SESSIONS_KEEP_AWAKE_ON_BATTERY_SETTING]: false });
		management.add(createSession('local', SessionStatus.InProgress).session);
		await timeout(0);

		power.setOnBattery(true);
		await timeout(0);
		power.setOnBattery(false);
		await timeout(0);
		changeSetting(configurationService, SESSIONS_KEEP_AWAKE_SETTING, false);
		await timeout(0);

		assert.deepStrictEqual(power.calls, [
			'start prevent-app-suspension 1',
			'stop 1',
			'start prevent-app-suspension 2',
			'stop 2',
		]);
	}));

	test('stops a blocker that starts after the hold was released', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { management, power, configurationService } = setup();
		management.add(createSession('local', SessionStatus.InProgress).session);
		changeSetting(configurationService, SESSIONS_KEEP_AWAKE_SETTING, false);
		await timeout(0);

		assert.deepStrictEqual(power.calls, ['start prevent-app-suspension 1', 'stop 1']);
	}));
});
