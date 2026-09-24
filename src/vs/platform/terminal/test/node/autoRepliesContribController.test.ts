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

	test('does not duplicate replies when a persistent process becomes ready again', async () => {
		const data = store.add(new Emitter<string>());
		const replies: string[] = [];
		const process = new class extends mock<ITerminalChildProcess>() {
			override readonly onProcessData = data.event;
			override input(value: string): void { replies.push(value); }
		};
		const contribution = new AutoRepliesPtyServiceContribution(new NullLogService());
		try {
			await contribution.installAutoReply('prompt', 'reply');
			contribution.handleProcessReady(1, process);
			// Simulates the replay that happens when the process is reattached
			contribution.handleProcessReady(1, process);
			data.fire('prompt');

			assert.deepStrictEqual(replies, ['reply']);
		} finally {
			contribution.handleProcessDispose(1);
			// Let the response throttle finish before checking disposable ownership.
			await timeout(1100);
		}
	});
});
