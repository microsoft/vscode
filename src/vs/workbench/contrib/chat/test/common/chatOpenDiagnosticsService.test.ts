/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { getMarks } from '../../../../../base/common/performance.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ChatOpenDiagnosticsService } from '../../common/chatOpenDiagnosticsService.js';
import { clearChatMarks } from '../../common/chatPerf.js';
import { LocalChatSessionUri } from '../../common/model/chatUri.js';

class RecordingLogService extends NullLogService {
	readonly lines: string[] = [];

	override info(message: string): void {
		this.lines.push(`info ${message}`);
	}

	override trace(message: string): void {
		this.lines.push(`trace ${message}`);
	}
}

suite('ChatOpenDiagnosticsService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const chat = LocalChatSessionUri.forSession('abc');
	let log: RecordingLogService;
	let service: ChatOpenDiagnosticsService;

	setup(() => {
		log = new RecordingLogService();
		service = store.add(new ChatOpenDiagnosticsService(log));
	});

	teardown(() => clearChatMarks(chat));

	function outcomes(): string[] {
		return log.lines.filter(line => line.startsWith('info ')).map(line => line.split(' ')[3]);
	}

	test('records TRACE milestones, a bounded INFO summary and performance marks', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const open = service.startOpen('panel', chat, CancellationToken.None);
		service.setModelWasLoaded(chat, false);
		service.setModelWasLoaded(chat, true);
		await timeout(40);
		service.mark(chat, 'contentReceived');
		open.complete();
		open.end();
		open.end();

		assert.deepStrictEqual({
			lines: log.lines.map(line => line.replace(/ resource=.*/, '')),
			marks: getMarks().filter(mark => mark.name.includes('/abc/open/')).map(mark => mark.name.split('/open/')[1]),
		}, {
			lines: [
				'trace [ChatOpen] panel start +0ms',
				'trace [ChatOpen] panel contentReceived +40ms',
				'trace [ChatOpen] panel loaded +40ms',
				'info [ChatOpen] panel completed total=40ms modelWasLoaded=false alreadyShown=false',
			],
			marks: ['start', 'contentReceived', 'loaded'],
		});
	}));

	test('cancellation ends a load immediately and stops recording its milestones', () => {
		const cts = store.add(new CancellationTokenSource());
		const open = service.startOpen('editor', chat, cts.token);
		cts.cancel();
		const afterCancellation = [...log.lines];
		service.mark(chat, 'firstRender');
		open.complete();
		open.end();

		assert.deepStrictEqual({ outcomes: outcomes(), unchanged: log.lines }, { outcomes: ['cancelled'], unchanged: afterCancellation });
	});

	test('an already-cancelled token does not leave a load in flight', () => {
		const open = service.startOpen('panel', chat, CancellationToken.Cancelled);
		const afterStart = [...log.lines];
		service.mark(chat, 'published');
		open.end();
		assert.deepStrictEqual(log.lines, afterStart);
	});

	test('failures, cancellation errors and hidden loads have distinct outcomes', () => {
		for (const result of ['failed', 'cancelled', 'hidden'] as const) {
			const open = service.startOpen('panel', chat, CancellationToken.None);
			if (result === 'hidden') {
				open.complete(false);
			} else {
				open.fail(result === 'cancelled' ? new CancellationError() : new Error('boom'));
			}
			open.end();
		}
		assert.deepStrictEqual(outcomes(), ['failed', 'cancelled', 'hidden']);
	});

	test('two hosts loading the same chat have independent lifetimes', () => {
		const first = service.startOpen('editor', chat, CancellationToken.None);
		const second = service.startOpen('panel', chat, CancellationToken.None, true);
		first.end();
		service.mark(chat, 'firstRender');
		second.complete();
		second.end();
		const afterEnd = [...log.lines];
		service.mark(chat, 'published');

		assert.deepStrictEqual({
			milestones: log.lines.filter(line => line.includes(' firstRender ')).map(line => line.split(' ')[2]),
			outcomes: log.lines.filter(line => line.startsWith('info ')).map(line => [line.split(' ')[2], line.split(' ')[3], line.endsWith('alreadyShown=true')]),
			unchanged: log.lines,
		}, {
			milestones: ['panel'],
			outcomes: [['editor', 'cancelled', false], ['panel', 'completed', true]],
			unchanged: afterEnd,
		});
	});

	test('a re-show is not marked complete before its load can fail', () => {
		const open = service.startOpen('editor', chat, CancellationToken.None, true);
		open.fail(new Error('resolve failed'));
		open.end();
		assert.deepStrictEqual(log.lines.filter(line => line.startsWith('info ')).map(line => [line.split(' ')[3], line.endsWith('alreadyShown=true')]), [['failed', true]]);
	});

	test('disposing the service ends the loads still in flight', () => {
		const open = service.startOpen('panel', chat, CancellationToken.None);
		service.dispose();
		open.complete();
		open.end();
		assert.deepStrictEqual(outcomes(), ['cancelled']);
	});
});
