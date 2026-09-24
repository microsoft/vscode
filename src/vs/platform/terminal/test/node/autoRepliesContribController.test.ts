/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ITerminalChildProcess } from '../../common/terminal.js';
import { AutoRepliesPtyServiceContribution } from '../../node/terminalContrib/autoReplies/autoRepliesContribController.js';

suite('AutoRepliesPtyServiceContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const readyBeforeUninstall of [true, false]) {
		test(`does not use removed replies in ${readyBeforeUninstall ? 'existing' : 'new'} terminals`, async () => {
			const data = store.add(new Emitter<string>());
			const replies: string[] = [];
			const process = new class extends mock<ITerminalChildProcess>() {
				override readonly onProcessData = data.event;
				override input(value: string): void { replies.push(value); }
			};
			const contribution = new AutoRepliesPtyServiceContribution(new NullLogService());
			try {
				await contribution.installAutoReply('old prompt', 'old reply');
				if (readyBeforeUninstall) {
					contribution.handleProcessReady(1, process);
				}
				await contribution.uninstallAllAutoReplies();
				await contribution.installAutoReply('new prompt', 'new reply');
				if (!readyBeforeUninstall) {
					contribution.handleProcessReady(1, process);
				}
				data.fire('old prompt');
				data.fire('new prompt');

				assert.deepStrictEqual(replies, ['new reply']);
			} finally {
				contribution.handleProcessDispose(1);
				// Let the response throttle finish before checking disposable ownership.
				await timeout(1100);
			}
		});
	}
});
