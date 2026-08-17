/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MainThreadTaskShape } from '../../common/extHost.protocol.js';
import { WorkerExtHostTask } from '../../common/extHostTask.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('ExtHostTask', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('unregisters task systems on dispose', function () {
		const events: string[] = [];
		const proxy = new class extends mock<MainThreadTaskShape>() {
			override $registerTaskSystem(handle: number): void {
				events.push(`register ${handle}`);
			}

			override $unregisterTaskSystem(handle: number): void {
				events.push(`unregister ${handle}`);
			}

			override $registerSupportedExecutions(): Promise<void> {
				return Promise.resolve();
			}
		};
		const extHostTask = new WorkerExtHostTask(SingleProxyRPCProtocol(proxy), undefined!, undefined!, undefined!, undefined!, undefined!, undefined!, undefined!);

		extHostTask.dispose();
		assert.deepStrictEqual(events, ['register 0', 'unregister 0']);
	});
});
