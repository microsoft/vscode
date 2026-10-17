/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ITerminalChildProcess } from '../../common/terminal.js';
import { AutoRepliesPtyServiceContribution } from '../../node/terminalContrib/autoReplies/autoRepliesContribController.js';

suite('AutoRepliesPtyServiceContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const readyBeforeUninstall of [true, false]) {
		test(`does not use removed replies in ${readyBeforeUninstall ? 'existing' : 'new'} terminals`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const data = store.add(new Emitter<string>());
			const replies: string[] = [];
			const process = new class extends mock<ITerminalChildProcess>() {
				override readonly onProcessData = data.event;
				override input(value: string): void { replies.push(value); }
			};
			const contribution = new AutoRepliesPtyServiceContribution(new NullLogService());
			try {
				await contribution.installAutoReply('old prompt', 'old reply', 'window A');
				if (readyBeforeUninstall) {
					contribution.handleProcessReady(1, process);
				}
				await contribution.uninstallAllAutoReplies('window A');
				await contribution.installAutoReply('new prompt', 'new reply', 'window A');
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
		}));
	}

	for (const readyBeforeUninstall of [true, false]) {
		test(`preserves another owner's replies in ${readyBeforeUninstall ? 'existing' : 'new'} terminals`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const data = store.add(new Emitter<string>());
			const replies: string[] = [];
			const process = new class extends mock<ITerminalChildProcess>() {
				override readonly onProcessData = data.event;
				override input(value: string): void { replies.push(value); }
			};
			const contribution = new AutoRepliesPtyServiceContribution(new NullLogService());
			try {
				await contribution.installAutoReply('A prompt', 'A reply', 'window A');
				await contribution.installAutoReply('B prompt', 'B reply', 'window B');
				if (readyBeforeUninstall) {
					contribution.handleProcessReady(1, process);
				}
				// B removes its configuration entirely. A receives no configuration event.
				await contribution.uninstallAllAutoReplies('window B');
				if (!readyBeforeUninstall) {
					contribution.handleProcessReady(1, process);
				}
				data.fire('A prompt');
				data.fire('B prompt');

				assert.deepStrictEqual(replies, ['A reply']);

				// B installs a replacement without disturbing A's saved configuration.
				await contribution.installAutoReply('new B prompt', 'new B reply', 'window B');
				await timeout(1100);
				data.fire('A prompt');
				data.fire('B prompt');
				data.fire('new B prompt');
				assert.deepStrictEqual(replies, ['A reply', 'A reply', 'new B reply']);
			} finally {
				contribution.handleProcessDispose(1);
				await timeout(1100);
			}
		}));
	}

	for (const removedOwner of ['window A', 'window B']) {
		test(`preserves a shared prompt when removing ${removedOwner}`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const data = store.add(new Emitter<string>());
			const replies: string[] = [];
			const process = new class extends mock<ITerminalChildProcess>() {
				override readonly onProcessData = data.event;
				override input(value: string): void { replies.push(value); }
			};
			const contribution = new AutoRepliesPtyServiceContribution(new NullLogService());
			try {
				await contribution.installAutoReply('shared prompt', 'A reply', 'window A');
				await contribution.installAutoReply('shared prompt', 'B reply', 'window B');
				// Replacing an owner's reply makes it the most recently installed reply.
				await contribution.installAutoReply('shared prompt', 'updated A reply', 'window A');
				contribution.handleProcessReady(1, process);
				data.fire('shared prompt');
				await timeout(1100);
				await contribution.uninstallAllAutoReplies(removedOwner);
				data.fire('shared prompt');
				await timeout(1100);
				// New terminals must use the same remaining owner's reply.
				contribution.handleProcessReady(1, process);
				data.fire('shared prompt');
				await timeout(1100);
				await contribution.uninstallAllAutoReplies(removedOwner === 'window A' ? 'window B' : 'window A');
				data.fire('shared prompt');
				contribution.handleProcessReady(1, process);
				data.fire('shared prompt');

				const remainingReply = removedOwner === 'window A' ? 'B reply' : 'updated A reply';
				assert.deepStrictEqual(replies, ['updated A reply', remainingReply, remainingReply]);
			} finally {
				contribution.handleProcessDispose(1);
				await timeout(1100);
			}
		}));
	}

	test('does not duplicate replies when a persistent process becomes ready again', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const data = store.add(new Emitter<string>());
		const replies: string[] = [];
		const process = new class extends mock<ITerminalChildProcess>() {
			override readonly onProcessData = data.event;
			override input(value: string): void { replies.push(value); }
		};
		const contribution = new AutoRepliesPtyServiceContribution(new NullLogService());
		try {
			await contribution.installAutoReply('prompt', 'reply', 'window A');
			contribution.handleProcessReady(1, process);
			// Simulates the replay that happens when the process is reattached
			contribution.handleProcessReady(1, process);
			data.fire('prompt');

			assert.deepStrictEqual(replies, ['reply']);
		} finally {
			contribution.handleProcessDispose(1);
			// Let the response throttle finish (in virtual time) before checking disposable ownership.
			await timeout(1100);
		}
	}));
});
