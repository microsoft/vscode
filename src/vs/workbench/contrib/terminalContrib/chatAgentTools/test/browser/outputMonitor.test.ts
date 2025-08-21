/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { OutputMonitor } from '../../browser/tools/monitoring/outputMonitor.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { OutputMonitorState } from '../../browser/tools/monitoring/types.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';

suite('OutputMonitor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let monitor: OutputMonitor;
	let execution: { getOutput: () => string; isActive?: () => Promise<boolean>; instance: Pick<ITerminalInstance, 'instanceId' | 'sendText'> };
	let cts: CancellationTokenSource;
	let instantiationService: TestInstantiationService;

	setup(() => {
		execution = {
			getOutput: () => 'test output',
			isActive: async () => true,
			instance: {
				instanceId: 1,
				sendText: async () => { }
			}
		};
		instantiationService = new TestInstantiationService();
		cts = new CancellationTokenSource();
	});

	teardown(() => {
		cts.dispose();
	});

	test('startMonitoring returns immediately when polling succeeds', async () => {
		monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined));

		const result = await monitor.startMonitoring(
			'test command',
			{ sessionId: '1' },
			cts.token
		);

		assert.strictEqual(result.state, OutputMonitorState.Idle);
		assert.strictEqual(result.output, 'test output');
	});
});
