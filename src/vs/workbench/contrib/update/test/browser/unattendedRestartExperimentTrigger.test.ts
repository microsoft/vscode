/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IUpdateService, State, UpdateType } from '../../../../../platform/update/common/update.js';
import { IPowerService } from '../../../../services/power/common/powerService.js';
import { UnattendedRestartExperimentTrigger } from '../../browser/unattendedRestartExperimentTrigger.js';

suite('UnattendedRestartExperimentTrigger', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const ready = State.Ready({ version: 'commit' }, false, false);

	function createTrigger(os: OperatingSystem) {
		const onDidLockScreen = disposables.add(new Emitter<void>());
		const onDidUnlockScreen = disposables.add(new Emitter<void>());
		const onStateChange = disposables.add(new Emitter<State>());
		let state: State = State.Idle(UpdateType.Archive);
		const telemetryService = new TestExperimentTriggerTelemetryService();

		disposables.add(new UnattendedRestartExperimentTrigger(
			os,
			upcastPartial<IPowerService>({ onDidLockScreen: onDidLockScreen.event, onDidUnlockScreen: onDidUnlockScreen.event }),
			upcastPartial<IUpdateService>({ get state() { return state; }, onStateChange: onStateChange.event }),
			telemetryService,
		));

		return {
			triggers: telemetryService.triggers,
			lock: () => onDidLockScreen.fire(),
			unlock: () => onDidUnlockScreen.fire(),
			setState: (newState: State) => {
				state = newState;
				onStateChange.fire(newState);
			},
		};
	}

	// The trigger does not read the setting, whose default experiments change, so it logs in every arm
	test('logs when the countdown to the restart starts, on macOS only', () => {
		const lockedWhenReady = createTrigger(OperatingSystem.Macintosh);
		lockedWhenReady.setState(ready);
		lockedWhenReady.lock();

		const readyWhenLocked = createTrigger(OperatingSystem.Macintosh);
		readyWhenLocked.lock();
		readyWhenLocked.setState(ready);

		const readyAfterUnlock = createTrigger(OperatingSystem.Macintosh);
		readyAfterUnlock.lock();
		readyAfterUnlock.unlock();
		readyAfterUnlock.setState(ready);

		const unsupported = [OperatingSystem.Windows, OperatingSystem.Linux].map(os => {
			const trigger = createTrigger(os);
			trigger.setState(ready);
			trigger.lock();
			return trigger.triggers;
		});

		assert.deepStrictEqual({
			lockedWhenReady: lockedWhenReady.triggers,
			readyWhenLocked: readyWhenLocked.triggers,
			readyAfterUnlock: readyAfterUnlock.triggers,
			unsupported,
		}, {
			lockedWhenReady: ['config.update.restartWhenIdle'],
			readyWhenLocked: ['config.update.restartWhenIdle'],
			readyAfterUnlock: [],
			unsupported: [[], []],
		});
	});
});
