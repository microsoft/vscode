/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITelemetryItem, ITelemetryUnloadState } from '@microsoft/1ds-core-js';
import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IMeteredConnectionService } from '../../../meteredConnection/common/meteredConnection.js';
import { IAppInsightsCore } from '../../common/1dsAppender.js';
import { OneDataSystemAppender } from '../../node/1dsAppender.js';

class TestAppInsightsCore implements IAppInsightsCore {
	pluginVersionString = '';
	unloadCount = 0;

	track(_item: ITelemetryItem): void { }

	unload(isAsync: boolean, unloadComplete: (unloadState: ITelemetryUnloadState) => void): void {
		this.unloadCount++;
		unloadComplete({ reason: 0, isAsync });
	}
}

class TestMeteredConnectionService extends Disposable implements IMeteredConnectionService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeIsConnectionMetered = this._register(new Emitter<boolean>());
	readonly onDidChangeIsConnectionMetered = this._onDidChangeIsConnectionMetered.event;

	constructor(public isConnectionMetered: boolean) {
		super();
	}

	setIsConnectionMetered(isMetered: boolean): void {
		this.isConnectionMetered = isMetered;
		this._onDidChangeIsConnectionMetered.fire(isMetered);
	}
}

class TestOneDataSystemAppender extends OneDataSystemAppender {
	installTransmissionController(transmissionController: { pause(): void; resume(): void }): void {
		this.setTransmissionController(transmissionController);
	}
}

suite('OneDataSystemAppender', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('pauses and resumes transmission with the metered connection', async () => {
		const core = new TestAppInsightsCore();
		const meteredConnectionService = store.add(new TestMeteredConnectionService(false));
		const appender = new TestOneDataSystemAppender(undefined, false, 'test', null, () => core, meteredConnectionService);
		const transmissionChanges: string[] = [];
		appender.installTransmissionController({
			pause: () => transmissionChanges.push('paused'),
			resume: () => transmissionChanges.push('resumed'),
		});

		meteredConnectionService.setIsConnectionMetered(true);
		meteredConnectionService.setIsConnectionMetered(false);
		await appender.flush();

		assert.deepStrictEqual({
			transmissionChanges,
			unloadCount: core.unloadCount,
		}, {
			transmissionChanges: ['paused', 'resumed'],
			unloadCount: 1,
		});
	});

	test('does not flush while metered', async () => {
		const core = new TestAppInsightsCore();
		const meteredConnectionService = store.add(new TestMeteredConnectionService(true));
		const appender = new TestOneDataSystemAppender(undefined, false, 'test', null, () => core, meteredConnectionService);
		const transmissionChanges: string[] = [];
		appender.installTransmissionController({
			pause: () => transmissionChanges.push('paused'),
			resume: () => transmissionChanges.push('resumed'),
		});

		await appender.flush();

		assert.deepStrictEqual({
			transmissionChanges,
			unloadCount: core.unloadCount,
		}, {
			transmissionChanges: ['paused'],
			unloadCount: 0,
		});
	});
});
