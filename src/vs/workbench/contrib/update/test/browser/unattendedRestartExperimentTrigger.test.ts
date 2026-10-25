/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IUpdateService, State, UpdateType } from '../../../../../platform/update/common/update.js';
import { IPowerService } from '../../../../services/power/common/powerService.js';
import { UnattendedRestartExperimentTrigger } from '../../browser/unattendedRestartExperimentTrigger.js';

suite('UnattendedRestartExperimentTrigger', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const ready = State.Ready({ version: 'commit' }, false, false);

	function createTrigger(os: OperatingSystem, restartWhenIdle: boolean) {
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
			upcastPartial<IProductService>({ target: 'user' }),
			new TestConfigurationService({ update: { restartWhenIdle, enableWindowsBackgroundUpdates: true } }),
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

	for (const restartWhenIdle of [false, true]) {
		test(`logs when the countdown to the restart starts, in every arm (restartWhenIdle: ${restartWhenIdle})`, () => {
			const lockedWhenReady = createTrigger(OperatingSystem.Macintosh, restartWhenIdle);
			lockedWhenReady.setState(ready);
			lockedWhenReady.lock();

			const readyWhenLocked = createTrigger(OperatingSystem.Windows, restartWhenIdle);
			readyWhenLocked.lock();
			readyWhenLocked.setState(ready);

			const readyAfterUnlock = createTrigger(OperatingSystem.Macintosh, restartWhenIdle);
			readyAfterUnlock.lock();
			readyAfterUnlock.unlock();
			readyAfterUnlock.setState(ready);

			const unsupported = createTrigger(OperatingSystem.Linux, restartWhenIdle);
			unsupported.setState(ready);
			unsupported.lock();

			assert.deepStrictEqual({
				lockedWhenReady: lockedWhenReady.triggers,
				readyWhenLocked: readyWhenLocked.triggers,
				readyAfterUnlock: readyAfterUnlock.triggers,
				unsupported: unsupported.triggers,
			}, {
				lockedWhenReady: ['config.update.restartWhenIdle'],
				readyWhenLocked: ['config.update.restartWhenIdle'],
				readyAfterUnlock: [],
				unsupported: [],
			});
		});
	}
});
