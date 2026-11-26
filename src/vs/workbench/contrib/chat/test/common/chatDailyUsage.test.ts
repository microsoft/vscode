/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { AgentsWindowUsage } from '../../common/agentsWindowUsage.js';
import { ChatDailyUsage } from '../../common/chatDailyUsage.js';
import { SessionType } from '../../common/chatSessionsService.js';
import { EditorChatUsage } from '../../common/editorChatUsage.js';

/**
 * A window whose local cache never sees other windows' writes, while shared values go to
 * one authoritative map, as they do through the main process.
 */
class WindowStorageService extends InMemoryStorageService {
	constructor(private readonly shared: Map<string, string>) {
		super();
	}

	override async readApplicationSharedValue(key: string): Promise<string | undefined> {
		return this.shared.get(key);
	}

	override async compareAndSwapApplicationSharedValue(key: string, expectedValue: string | undefined, newValue: string): Promise<{ swapped: boolean; currentValue: string | undefined }> {
		const currentValue = this.shared.get(key);
		if (currentValue !== expectedValue) {
			return { swapped: false, currentValue };
		}
		this.shared.set(key, newValue);
		return { swapped: true, currentValue: newValue };
	}
}

suite('ChatDailyUsage', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const minute = 60 * 1000;
	const hour = 60 * minute;
	const day = 24 * hour;

	test('sums messages, new sessions and active days over the current and preceding UTC days and in total', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const empty = new ChatDailyUsage(storage).getTelemetry(100 * day);
		const usage = new ChatDailyUsage(storage);
		usage.startTracking(60 * day);
		usage.recordMessage(true, 70 * day);
		usage.recordMessage(true, 71 * day);
		usage.recordMessage(false, 93 * day + 23 * hour);
		usage.recordMessage(true, 94 * day);
		usage.recordMessage(false, 100 * day + hour);
		usage.recordMessage(false, 100 * day + 2 * hour);
		assert.deepStrictEqual({ empty, recorded: new ChatDailyUsage(storage).getTelemetry(100 * day + 12 * hour) }, {
			empty: { messagesLast7Days: 0, messagesLast30Days: 0, messagesTotal: 0, sessionsLast7Days: 0, sessionsLast30Days: 0, sessionsTotal: 0, activeDaysLast7Days: 0, activeDaysLast30Days: 0, activeDaysTotal: 0, minutesSinceLastMessage: undefined, trackedDays: 0 },
			recorded: { messagesLast7Days: 3, messagesLast30Days: 5, messagesTotal: 6, sessionsLast7Days: 1, sessionsLast30Days: 2, sessionsTotal: 3, activeDaysLast7Days: 2, activeDaysLast30Days: 4, activeDaysTotal: 5, minutesSinceLastMessage: 600, trackedDays: 30 },
		});
	});

	test('claims one report per UTC day across windows sharing storage and keeps the first tracking day', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		const first = new ChatDailyUsage(storage);
		const second = new ChatDailyUsage(storage);
		first.startTracking(10 * day);
		second.startTracking(11 * day);
		first.recordMessage(true, 10 * day + hour);
		assert.deepStrictEqual([
			await first.takeDailyReport(10 * day + 2 * hour),
			await second.takeDailyReport(10 * day + 23 * hour),
			await second.takeDailyReport(11 * day),
			await first.takeDailyReport(11 * day + hour),
		], [
			{ messagesLast7Days: 1, messagesLast30Days: 1, messagesTotal: 1, sessionsLast7Days: 1, sessionsLast30Days: 1, sessionsTotal: 1, activeDaysLast7Days: 1, activeDaysLast30Days: 1, activeDaysTotal: 1, minutesSinceLastMessage: 60, trackedDays: 0 },
			undefined,
			{ messagesLast7Days: 1, messagesLast30Days: 1, messagesTotal: 1, sessionsLast7Days: 1, sessionsLast30Days: 1, sessionsTotal: 1, activeDaysLast7Days: 1, activeDaysLast30Days: 1, activeDaysTotal: 1, minutesSinceLastMessage: 23 * 60, trackedDays: 1 },
			undefined,
		]);
	});

	test('claims the daily report atomically when windows have stale local caches', async () => {
		const shared = new Map<string, string>();
		const first = new ChatDailyUsage(disposables.add(new WindowStorageService(shared)));
		const second = new ChatDailyUsage(disposables.add(new WindowStorageService(shared)));
		const concurrent = await Promise.all([first.takeDailyReport(10 * day), second.takeDailyReport(10 * day)]);
		const sequential = [
			await second.takeDailyReport(10 * day + 23 * hour),
			await second.takeDailyReport(11 * day),
			await first.takeDailyReport(11 * day + hour),
		];
		assert.deepStrictEqual({ concurrent: concurrent.map(Boolean), sequential: sequential.map(Boolean) }, {
			concurrent: [true, false],
			sequential: [false, true, false],
		});
	});

	test('seeds totals and last usage once from editor and Agents Window usage recorded before tracking, and ignores their later usage', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const editor = new EditorChatUsage(storage);
		const agentsWindow = new AgentsWindowUsage(storage);
		editor.recordSubmission(SessionType.Local, true, false, false, 10 * day);
		editor.recordSubmission(SessionType.Local, false, false, false, 10 * day);
		agentsWindow.recordSessionCreated(9 * day);
		const usage = new ChatDailyUsage(storage);
		usage.startTracking(10 * day + 30 * minute);
		const seeded = usage.getTelemetry(10 * day + hour);
		editor.recordSubmission(SessionType.Local, true, false, false, 10 * day + 40 * minute);
		agentsWindow.recordSessionCreated(10 * day + 40 * minute);
		usage.startTracking(10 * day + 40 * minute);
		const restarted = usage.getTelemetry(10 * day + hour);
		usage.recordMessage(true, 10 * day + 45 * minute);
		assert.deepStrictEqual({ seeded, restarted, recorded: usage.getTelemetry(10 * day + hour) }, {
			seeded: { messagesLast7Days: 0, messagesLast30Days: 0, messagesTotal: 3, sessionsLast7Days: 0, sessionsLast30Days: 0, sessionsTotal: 2, activeDaysLast7Days: 0, activeDaysLast30Days: 0, activeDaysTotal: 0, minutesSinceLastMessage: 60, trackedDays: 0 },
			restarted: { messagesLast7Days: 0, messagesLast30Days: 0, messagesTotal: 3, sessionsLast7Days: 0, sessionsLast30Days: 0, sessionsTotal: 2, activeDaysLast7Days: 0, activeDaysLast30Days: 0, activeDaysTotal: 0, minutesSinceLastMessage: 60, trackedDays: 0 },
			recorded: { messagesLast7Days: 1, messagesLast30Days: 1, messagesTotal: 4, sessionsLast7Days: 1, sessionsLast30Days: 1, sessionsTotal: 3, activeDaysLast7Days: 1, activeDaysLast30Days: 1, activeDaysTotal: 1, minutesSinceLastMessage: 15, trackedDays: 0 },
		});
	});

	test('seeds the last message time once for machines that started tracking before it was seeded, from usage up to the end of the first tracked day', () => {
		const storage = disposables.add(new InMemoryStorageService());
		storage.store('chat.dailyUsage.trackingStartDay', 10, StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
		storage.store('chat.dailyUsage', '{"days":[],"messagesTotal":3,"sessionsTotal":2}', StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
		new AgentsWindowUsage(storage).recordSessionCreated(10 * day + 2 * hour);
		const editor = new EditorChatUsage(storage);
		editor.recordSubmission(SessionType.Local, true, false, false, 11 * day);
		const usage = new ChatDailyUsage(storage);
		const unseeded = usage.getTelemetry(12 * day).minutesSinceLastMessage;
		usage.startTracking(12 * day);
		editor.recordSubmission(SessionType.Local, false, false, false, 12 * day);
		new AgentsWindowUsage(storage).recordSessionCreated(12 * day);
		usage.startTracking(12 * day + hour);
		assert.deepStrictEqual({ unseeded, seeded: usage.getTelemetry(12 * day).minutesSinceLastMessage }, { unseeded: undefined, seeded: 46 * 60 });
	});

	test('derives the active day total from retained days for usage stored before the total existed', () => {
		const storage = disposables.add(new InMemoryStorageService());
		storage.store('chat.dailyUsage', '{"days":[[3,2,1],[4,1,0],[5,0,0]],"messagesTotal":10,"sessionsTotal":4}', StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
		const usage = new ChatDailyUsage(storage);
		const totals = [usage.getTelemetry(5 * day).activeDaysTotal];
		for (const time of [5 * day, 5 * day + hour, 6 * day]) {
			usage.recordMessage(false, time);
			totals.push(usage.getTelemetry(6 * day).activeDaysTotal);
		}
		assert.deepStrictEqual(totals, [2, 3, 3, 4]);
	});

	test('recovers from malformed state and keeps usage in machine-local shared storage', () => {
		const storage = disposables.add(new InMemoryStorageService());
		storage.store('chat.dailyUsage', '{"days":[[5,"x",0],[5,2],[4,0,0]],"lastMessage":"y","messagesTotal":-1,"sessionsTotal":"z"}', StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
		const malformed = new ChatDailyUsage(storage).getTelemetry(5 * day);
		storage.store('chat.dailyUsage', 'not json', StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
		const usage = new ChatDailyUsage(storage);
		usage.startTracking(5 * day);
		usage.recordMessage(false, 5 * day);
		assert.deepStrictEqual({
			malformed,
			shared: storage.keys(StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE).sort(),
			synced: storage.keys(StorageScope.APPLICATION_SHARED, StorageTarget.USER),
			application: storage.keys(StorageScope.APPLICATION, StorageTarget.MACHINE),
			recorded: new ChatDailyUsage(storage).getTelemetry(5 * day),
		}, {
			malformed: { messagesLast7Days: 0, messagesLast30Days: 0, messagesTotal: 0, sessionsLast7Days: 0, sessionsLast30Days: 0, sessionsTotal: 0, activeDaysLast7Days: 0, activeDaysLast30Days: 0, activeDaysTotal: 0, minutesSinceLastMessage: undefined, trackedDays: 0 },
			shared: ['chat.dailyUsage', 'chat.dailyUsage.trackingStartDay'],
			synced: [],
			application: [],
			recorded: { messagesLast7Days: 1, messagesLast30Days: 1, messagesTotal: 1, sessionsLast7Days: 0, sessionsLast30Days: 0, sessionsTotal: 0, activeDaysLast7Days: 1, activeDaysLast30Days: 1, activeDaysTotal: 1, minutesSinceLastMessage: 0, trackedDays: 0 },
		});
	});
});
