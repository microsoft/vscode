/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../base/common/arrays.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { AgentsWindowUsage } from './agentsWindowUsage.js';
import { EditorChatUsage } from './editorChatUsage.js';

const usageStorageKey = 'chat.dailyUsage';
const lastReportedDayStorageKey = 'chat.dailyUsage.lastReportedDay';
const trackingStartDayStorageKey = 'chat.dailyUsage.trackingStartDay';
const dayMs = 24 * 60 * 60 * 1000;
const minuteMs = 60 * 1000;
const retainedDays = 30;

/**
 * Chat usage on this machine. Windows span the current UTC day and the
 * preceding UTC days, e.g. the last 7 days are today and the 6 days before.
 * A window of N days covers all of its days once {@link trackedDays} reaches N.
 * Message and session totals and the last message time include usage recorded
 * by older counters before tracking started. Those counters have no per-day
 * data, so the active day total only covers days since tracking started.
 */
export interface IChatDailyUsageTelemetry {
	readonly messagesLast7Days: number;
	readonly messagesLast30Days: number;
	readonly messagesTotal: number;
	readonly sessionsLast7Days: number;
	readonly sessionsLast30Days: number;
	readonly sessionsTotal: number;
	/** UTC days with at least one message. */
	readonly activeDaysLast7Days: number;
	readonly activeDaysLast30Days: number;
	readonly activeDaysTotal: number;
	readonly minutesSinceLastMessage: number | undefined;
	readonly trackedDays: number;
}

type DailyCount = [day: number, messages: number, sessions: number];

interface IStoredChatDailyUsage {
	/** Counts per UTC day (days since the Unix epoch) within the retained window. */
	readonly days: DailyCount[];
	/** Time of the user's most recent message in milliseconds since the Unix epoch. */
	readonly lastMessage?: number;
	readonly messagesTotal: number;
	readonly sessionsTotal: number;
	readonly activeDaysTotal: number;
}

function getUtcDay(time: number): number {
	return Math.floor(time / dayMs);
}

function isCount(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isDailyCount(value: unknown): value is DailyCount {
	return Array.isArray(value) && value.length === 3 && value.every(isCount);
}

/**
 * Best-effort chat usage shared by all windows and profiles on this machine.
 * Overlapping writes from different windows can lose increments.
 */
export class ChatDailyUsage {
	constructor(private readonly storageService: IStorageService) { }

	/**
	 * Records the UTC day this machine started tracking usage and seeds the
	 * totals and last message time from older counters, unless tracking already started.
	 */
	startTracking(now = Date.now()): void {
		const trackingStartDay = this.storageService.getNumber(trackingStartDayStorageKey, StorageScope.APPLICATION_SHARED);
		const usage = this.read();
		if (trackingStartDay !== undefined) {
			// Machines that started tracking before the last message time was seeded. Older counters keep recording after tracking starts,
			// including messages sent by agents, tools and automations, so only their usage up to the end of the first tracked day counts.
			const lastMessage = usage.lastMessage === undefined ? this.getOlderLastUsage((trackingStartDay + 1) * dayMs) : undefined;
			if (lastMessage !== undefined) {
				this.storageService.store(usageStorageKey, JSON.stringify({ ...usage, lastMessage } satisfies IStoredChatDailyUsage), StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
			}
			return;
		}
		// Each Agents Window session started with a message, but its follow-up messages were never counted, so the message total is a lower bound.
		const editor = new EditorChatUsage(this.storageService);
		const agentsWindowSessions = new AgentsWindowUsage(this.storageService).createdSessionCount;
		const seeded: IStoredChatDailyUsage = {
			...usage,
			lastMessage: usage.lastMessage ?? this.getOlderLastUsage(),
			messagesTotal: usage.messagesTotal + editor.messageCount + agentsWindowSessions,
			sessionsTotal: usage.sessionsTotal + editor.sessionCount + agentsWindowSessions,
		};
		this.storageService.storeAll([
			{ key: usageStorageKey, value: JSON.stringify(seeded), scope: StorageScope.APPLICATION_SHARED, target: StorageTarget.MACHINE },
			{ key: trackingStartDayStorageKey, value: getUtcDay(now), scope: StorageScope.APPLICATION_SHARED, target: StorageTarget.MACHINE },
		], false);
	}

	recordMessage(isNewSession: boolean, now = Date.now()): void {
		const today = getUtcDay(now);
		const usage = this.read();
		const days = usage.days.filter(([day]) => day <= today && today - day < retainedDays);
		let entry = days.find(([day]) => day === today);
		if (!entry) {
			entry = [today, 0, 0];
			days.push(entry);
		}
		const isFirstMessageOfDay = entry[1] === 0;
		entry[1]++;
		if (isNewSession) {
			entry[2]++;
		}
		const updated: IStoredChatDailyUsage = {
			days,
			lastMessage: now,
			messagesTotal: usage.messagesTotal + 1,
			sessionsTotal: usage.sessionsTotal + (isNewSession ? 1 : 0),
			activeDaysTotal: usage.activeDaysTotal + (isFirstMessageOfDay ? 1 : 0),
		};
		this.storageService.store(usageStorageKey, JSON.stringify(updated), StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
	}

	getTelemetry(now = Date.now()): IChatDailyUsageTelemetry {
		const today = getUtcDay(now);
		const { days, lastMessage, messagesTotal, sessionsTotal, activeDaysTotal } = this.read();
		let messagesLast7Days = 0, messagesLast30Days = 0, sessionsLast7Days = 0, sessionsLast30Days = 0, activeDaysLast7Days = 0, activeDaysLast30Days = 0;
		for (const [day, messages, sessions] of days) {
			const age = today - day;
			if (age < 0 || age >= retainedDays) {
				continue;
			}
			const active = messages > 0 ? 1 : 0;
			messagesLast30Days += messages;
			sessionsLast30Days += sessions;
			activeDaysLast30Days += active;
			if (age < 7) {
				messagesLast7Days += messages;
				sessionsLast7Days += sessions;
				activeDaysLast7Days += active;
			}
		}
		const trackingStartDay = this.storageService.getNumber(trackingStartDayStorageKey, StorageScope.APPLICATION_SHARED, today);
		return {
			messagesLast7Days,
			messagesLast30Days,
			messagesTotal,
			sessionsLast7Days,
			sessionsLast30Days,
			sessionsTotal,
			activeDaysLast7Days,
			activeDaysLast30Days,
			activeDaysTotal,
			minutesSinceLastMessage: lastMessage !== undefined ? Math.max(0, Math.floor((now - lastMessage) / minuteMs)) : undefined,
			trackedDays: Math.min(retainedDays, Math.max(0, today - trackingStartDay)),
		};
	}

	/** Claims the current UTC day's report across windows. Resolves to `undefined` when another window already claimed it. */
	async takeDailyReport(now = Date.now()): Promise<IChatDailyUsageTelemetry | undefined> {
		const today = String(getUtcDay(now));
		// The local cache lags behind other windows, so it can only rule a report out without a round trip.
		if (this.storageService.get(lastReportedDayStorageKey, StorageScope.APPLICATION_SHARED) === today) {
			return undefined;
		}
		const lastReportedDay = await this.storageService.readApplicationSharedValue(lastReportedDayStorageKey);
		if (lastReportedDay === today) {
			return undefined;
		}
		const { swapped } = await this.storageService.compareAndSwapApplicationSharedValue(lastReportedDayStorageKey, lastReportedDay, today);
		return swapped ? this.getTelemetry(now) : undefined;
	}

	/** Latest usage the older counters recorded before `end`, in milliseconds since the Unix epoch. */
	private getOlderLastUsage(end = Number.POSITIVE_INFINITY): number | undefined {
		const times = coalesce([new EditorChatUsage(this.storageService).lastMessageDate, new AgentsWindowUsage(this.storageService).lastSessionCreated]).filter(time => time < end);
		return times.length ? Math.max(...times) : undefined;
	}

	private read(): IStoredChatDailyUsage {
		const empty: IStoredChatDailyUsage = { days: [], messagesTotal: 0, sessionsTotal: 0, activeDaysTotal: 0 };
		const raw = this.storageService.get(usageStorageKey, StorageScope.APPLICATION_SHARED);
		if (!raw) {
			return empty;
		}
		try {
			const parsed: Partial<Record<keyof IStoredChatDailyUsage, unknown>> | null = JSON.parse(raw);
			const days = Array.isArray(parsed?.days) ? parsed.days.filter(isDailyCount) : [];
			return {
				days,
				lastMessage: isCount(parsed?.lastMessage) ? parsed.lastMessage : undefined,
				messagesTotal: isCount(parsed?.messagesTotal) ? parsed.messagesTotal : 0,
				sessionsTotal: isCount(parsed?.sessionsTotal) ? parsed.sessionsTotal : 0,
				// Usage stored before the active day total existed still has its retained days.
				activeDaysTotal: isCount(parsed?.activeDaysTotal) ? parsed.activeDaysTotal : days.filter(([, messages]) => messages > 0).length,
			};
		} catch {
			return empty;
		}
	}
}
