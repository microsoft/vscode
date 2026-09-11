/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { hash } from '../../../../base/common/hash.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatOriginKind, IChat, ISession, SessionStatus } from '../../../services/sessions/common/session.js';

export enum AgentsDashboardHistoryEventType {
	SessionStarted = 'sessionStarted',
	SessionDone = 'sessionDone',
	PullRequestCreated = 'pullRequestCreated',
	PullRequestMerged = 'pullRequestMerged',
	DiskUsage = 'diskUsage',
	ChatCreated = 'chatCreated',
	ChatInteraction = 'chatInteraction',
	ChatDelegatedRequest = 'chatDelegatedRequest',
	ChatStatusChanged = 'chatStatusChanged',
}

export type AgentsDashboardChatKind = 'main' | 'chat' | 'fork' | 'sideChat' | 'subagent';
export type AgentsDashboardChatStatus = 'working' | 'inputNeeded' | 'done' | 'failed';

export type AgentsDashboardHistoryEvent =
	| { readonly id: string; readonly type: AgentsDashboardHistoryEventType.SessionStarted; readonly timestamp: number }
	| { readonly id: string; readonly type: AgentsDashboardHistoryEventType.SessionDone; readonly timestamp: number; readonly durationMs: number }
	| { readonly id: string; readonly type: AgentsDashboardHistoryEventType.PullRequestCreated; readonly timestamp: number; readonly sessionId?: string }
	| { readonly id: string; readonly type: AgentsDashboardHistoryEventType.PullRequestMerged; readonly timestamp: number; readonly sessionId?: string }
	| {
		readonly id: string;
		readonly type: AgentsDashboardHistoryEventType.DiskUsage;
		readonly timestamp: number;
		readonly value: number;
		readonly medianSessionBytes?: number;
		readonly largestSessionBytes?: number;
	}
	| {
		readonly id: string;
		readonly type: AgentsDashboardHistoryEventType.ChatCreated;
		readonly timestamp: number;
		readonly sessionId: string;
		readonly chatId: string;
		readonly chatKind: AgentsDashboardChatKind;
		readonly parentChatId?: string;
	}
	| {
		readonly id: string;
		readonly type: AgentsDashboardHistoryEventType.ChatInteraction;
		readonly timestamp: number;
		readonly sessionId: string;
		readonly chatId: string;
	}
	| {
		readonly id: string;
		readonly type: AgentsDashboardHistoryEventType.ChatDelegatedRequest;
		readonly timestamp: number;
		readonly sessionId: string;
		readonly sourceChatId: string;
		readonly targetChatId: string;
	}
	| {
		readonly id: string;
		readonly type: AgentsDashboardHistoryEventType.ChatStatusChanged;
		readonly timestamp: number;
		readonly sessionId: string;
		readonly chatId: string;
		readonly status: AgentsDashboardChatStatus;
	};

export type AgentsDashboardHistoryRange = 'today' | 'week' | 'month';

export interface IAgentsDashboardHistoryBucket {
	readonly start: number;
	readonly end: number;
	readonly label: string;
	readonly sessionsStarted: number;
	readonly sessionsDone: number;
	readonly pullRequestsCreated: number;
	readonly pullRequestsMerged: number;
	readonly medianCompletionDurationMs: number | undefined;
	readonly diskUsageBytes: number | undefined;
	readonly medianSessionStorageBytes: number | undefined;
	readonly largestSessionStorageBytes: number | undefined;
}

export interface IAgentsDashboardChatActivityEvent {
	readonly type: AgentsDashboardHistoryEventType.ChatCreated | AgentsDashboardHistoryEventType.ChatInteraction | AgentsDashboardHistoryEventType.ChatDelegatedRequest;
	readonly timestamp: number;
	readonly direction?: 'sent' | 'received';
	readonly peerChatId?: string;
}

export interface IAgentsDashboardChatActivityLane {
	readonly chatId: string;
	readonly label: string;
	readonly kind: AgentsDashboardChatKind;
	readonly parentChatId: string | undefined;
	readonly events: readonly IAgentsDashboardChatActivityEvent[];
}

export interface IAgentsDashboardSessionChatActivity {
	readonly sessionId: string;
	readonly label: string;
	readonly chats: readonly IAgentsDashboardChatActivityLane[];
	readonly interactionCount: number;
	readonly pullRequestCreatedAt: readonly number[];
}

export interface IAgentsDashboardChatActivity {
	readonly start: number;
	readonly end: number;
	readonly completed: boolean;
	readonly sessions: readonly IAgentsDashboardSessionChatActivity[];
	readonly totalSessions: number;
	readonly totalChats: number;
	readonly totalInteractions: number;
	readonly totalMultiChatSessions: number;
}

export interface IAgentsDashboardHistoryService {
	readonly _serviceBrand: undefined;
	readonly events: IObservable<readonly AgentsDashboardHistoryEvent[]>;
}

export const IAgentsDashboardHistoryService = createDecorator<IAgentsDashboardHistoryService>('agentsDashboardHistoryService');

export function buildAgentsDashboardHistoryBuckets(
	events: readonly AgentsDashboardHistoryEvent[],
	range: AgentsDashboardHistoryRange,
	now: number,
): IAgentsDashboardHistoryBucket[] {
	const intervals = createIntervals(range, now);
	let lastDiskUsage: number | undefined;
	let medianSessionStorageBytes: number | undefined;
	let largestSessionStorageBytes: number | undefined;
	const diskEvents = events
		.filter((event): event is Extract<AgentsDashboardHistoryEvent, { type: AgentsDashboardHistoryEventType.DiskUsage }> =>
			event.type === AgentsDashboardHistoryEventType.DiskUsage)
		.sort((a, b) => a.timestamp - b.timestamp);
	let diskEventIndex = 0;

	return intervals.map(interval => {
		const bucketEvents = events.filter(event => event.timestamp >= interval.start && event.timestamp < interval.end);
		while (diskEventIndex < diskEvents.length && diskEvents[diskEventIndex].timestamp < interval.end) {
			const event = diskEvents[diskEventIndex++];
			lastDiskUsage = event.value;
			medianSessionStorageBytes = event.medianSessionBytes;
			largestSessionStorageBytes = event.largestSessionBytes;
		}
		const durations = bucketEvents
			.filter((event): event is Extract<AgentsDashboardHistoryEvent, { type: AgentsDashboardHistoryEventType.SessionDone }> =>
				event.type === AgentsDashboardHistoryEventType.SessionDone)
			.map(event => event.durationMs)
			.sort((a, b) => a - b);
		return {
			...interval,
			sessionsStarted: countEvents(bucketEvents, AgentsDashboardHistoryEventType.SessionStarted),
			sessionsDone: countEvents(bucketEvents, AgentsDashboardHistoryEventType.SessionDone),
			pullRequestsCreated: countEvents(bucketEvents, AgentsDashboardHistoryEventType.PullRequestCreated),
			pullRequestsMerged: countEvents(bucketEvents, AgentsDashboardHistoryEventType.PullRequestMerged),
			medianCompletionDurationMs: median(durations),
			diskUsageBytes: lastDiskUsage,
			medianSessionStorageBytes,
			largestSessionStorageBytes,
		};
	});
}

export function buildAgentsDashboardChatActivity(
	events: readonly AgentsDashboardHistoryEvent[],
	sessions: readonly ISession[],
	range: AgentsDashboardHistoryRange,
	now: number,
	selectedSessionId?: string,
): IAgentsDashboardChatActivity {
	const intervals = createIntervals(range, now);
	const selectedSession = selectedSessionId ? sessions.find(session => session.sessionId === selectedSessionId) : undefined;
	const completed = selectedSession?.status.get() === SessionStatus.Completed || selectedSession?.status.get() === SessionStatus.Error;
	const start = selectedSession ? selectedSession.createdAt.getTime() : intervals[0]?.start ?? now;
	const completedAt = selectedSession?.lastTurnEnd.get()?.getTime();
	const end = selectedSession && completed && completedAt !== undefined ? Math.max(start + 1, completedAt + 1) : now + 1;
	const chatEvents = events.filter((event): event is Extract<AgentsDashboardHistoryEvent, {
		type: AgentsDashboardHistoryEventType.ChatCreated | AgentsDashboardHistoryEventType.ChatInteraction;
	}> => (event.type === AgentsDashboardHistoryEventType.ChatCreated
		|| event.type === AgentsDashboardHistoryEventType.ChatInteraction)
	&& (!selectedSessionId || event.sessionId === selectedSessionId)
	&& event.timestamp >= start
		&& event.timestamp < end);
	const delegatedEvents = events.filter((event): event is Extract<AgentsDashboardHistoryEvent, { type: AgentsDashboardHistoryEventType.ChatDelegatedRequest }> =>
		event.type === AgentsDashboardHistoryEventType.ChatDelegatedRequest
		&& (!selectedSessionId || event.sessionId === selectedSessionId)
		&& event.timestamp >= start
		&& event.timestamp < end);
	const createdChats = new Map(events
		.filter((event): event is Extract<AgentsDashboardHistoryEvent, { type: AgentsDashboardHistoryEventType.ChatCreated }> =>
			event.type === AgentsDashboardHistoryEventType.ChatCreated)
		.map(event => [`${event.sessionId}\n${event.chatId}`, event]));
	const liveSessions = new Map(sessions.map(session => [session.sessionId, session]));
	const eventsBySession = new Map<string, typeof chatEvents>();
	for (const event of chatEvents) {
		const sessionEvents = eventsBySession.get(event.sessionId) ?? [];
		sessionEvents.push(event);
		eventsBySession.set(event.sessionId, sessionEvents);
	}
	for (const event of delegatedEvents) {
		if (!eventsBySession.has(event.sessionId)) {
			eventsBySession.set(event.sessionId, []);
		}
	}

	const activitySessions: IAgentsDashboardSessionChatActivity[] = [];
	for (const [sessionId, sessionEvents] of eventsBySession) {
		const liveSession = liveSessions.get(sessionId);
		const liveChats = new Map((liveSession?.chats.get() ?? []).map(chat => [getAgentsDashboardChatId(chat.resource), chat]));
		const visibleChatIds = new Set([...liveChats]
			.filter(([, chat]) => {
				const kind = getAgentsDashboardChatKind(liveSession, chat);
				return kind === 'main' || kind === 'chat';
			})
			.map(([chatId]) => chatId));
		const eventsByChat = new Map<string, typeof sessionEvents>();
		for (const event of sessionEvents) {
			const created = createdChats.get(`${sessionId}\n${event.chatId}`);
			if (!visibleChatIds.has(event.chatId) && created?.chatKind !== 'main' && created?.chatKind !== 'chat') {
				continue;
			}
			const chatActivity = eventsByChat.get(event.chatId) ?? [];
			chatActivity.push(event);
			eventsByChat.set(event.chatId, chatActivity);
		}

		const chats: IAgentsDashboardChatActivityLane[] = [];
		for (const [chatId, eventsForChat] of eventsByChat) {
			const created = createdChats.get(`${sessionId}\n${chatId}`);
			const liveChat = liveChats.get(chatId);
			const delegatedActivity: IAgentsDashboardChatActivityEvent[] = delegatedEvents
				.filter(event => event.sessionId === sessionId && (event.sourceChatId === chatId || event.targetChatId === chatId))
				.map(event => ({
					type: event.type,
					timestamp: event.timestamp,
					direction: event.sourceChatId === chatId ? 'sent' : 'received',
					peerChatId: event.sourceChatId === chatId ? event.targetChatId : event.sourceChatId,
				}));
			chats.push({
				chatId,
				label: getChatActivityLabel(liveSession, liveChat, created?.chatKind ?? 'chat'),
				kind: created?.chatKind ?? getAgentsDashboardChatKind(liveSession, liveChat),
				parentChatId: created?.parentChatId ?? (liveChat?.origin?.parentChat ? getAgentsDashboardChatId(liveChat.origin.parentChat) : undefined),
				events: [...eventsForChat.map(event => ({
					type: event.type,
					timestamp: event.timestamp,
				})), ...delegatedActivity].sort((a, b) => a.timestamp - b.timestamp),
			});
		}
		chats.sort((a, b) => chatKindOrder(a.kind) - chatKindOrder(b.kind) || a.label.localeCompare(b.label));
		activitySessions.push({
			sessionId,
			label: liveSession?.title.get() || localize('agentsDashboard.chatActivity.pastSession', "Past session"),
			chats,
			interactionCount: sessionEvents.filter(event => event.type === AgentsDashboardHistoryEventType.ChatInteraction).length
				+ delegatedEvents.filter(event => event.sessionId === sessionId).length,
			pullRequestCreatedAt: events
				.filter((event): event is Extract<AgentsDashboardHistoryEvent, { type: AgentsDashboardHistoryEventType.PullRequestCreated }> =>
					event.type === AgentsDashboardHistoryEventType.PullRequestCreated
					&& event.sessionId === sessionId
					&& event.timestamp >= start
					&& event.timestamp < end)
				.map(event => event.timestamp),
		});
	}

	activitySessions.sort((a, b) =>
		Number(b.chats.length > 1) - Number(a.chats.length > 1)
		|| b.interactionCount - a.interactionCount
		|| a.label.localeCompare(b.label));
	const selected: IAgentsDashboardSessionChatActivity[] = [];
	let laneCount = 0;
	for (const session of activitySessions) {
		if (selected.length >= 5 || laneCount >= 10) {
			break;
		}
		const remaining = 10 - laneCount;
		selected.push({ ...session, chats: session.chats.slice(0, remaining) });
		laneCount += Math.min(session.chats.length, remaining);
	}
	return {
		start,
		end,
		completed,
		sessions: selected,
		totalSessions: activitySessions.length,
		totalChats: activitySessions.reduce((total, session) => total + session.chats.length, 0),
		totalInteractions: chatEvents.filter(event => event.type === AgentsDashboardHistoryEventType.ChatInteraction).length,
		totalMultiChatSessions: activitySessions.filter(session => session.chats.length > 1).length,
	};
}

export function getAgentsDashboardChatId(resource: URI): string {
	return (hash(resource.toString()) >>> 0).toString(36);
}

export function getAgentsDashboardChatKind(session: ISession | undefined, chat: IChat | undefined): AgentsDashboardChatKind {
	if (!chat) {
		return 'chat';
	}
	if (session && chat.resource.toString() === session.mainChat.get().resource.toString()) {
		return 'main';
	}
	switch (chat.origin?.kind) {
		case ChatOriginKind.Tool:
			return 'subagent';
		case ChatOriginKind.Fork:
			return 'fork';
		case ChatOriginKind.SideChat:
			return 'sideChat';
		default:
			return 'chat';
	}
}

export function getAgentsDashboardChatStatus(status: SessionStatus): AgentsDashboardChatStatus {
	switch (status) {
		case SessionStatus.InProgress:
			return 'working';
		case SessionStatus.NeedsInput:
			return 'inputNeeded';
		case SessionStatus.Error:
			return 'failed';
		default:
			return 'done';
	}
}

function getChatActivityLabel(session: ISession | undefined, chat: IChat | undefined, kind: AgentsDashboardChatKind): string {
	const title = chat?.title.get().trim();
	if (title) {
		return title;
	}
	if (kind === 'main') {
		return localize('agentsDashboard.chatActivity.mainChat', "Main chat");
	}
	const sameKindCount = (session?.chats.get() ?? []).filter(candidate => getAgentsDashboardChatKind(session, candidate) === kind).length;
	const suffix = sameKindCount > 1 ? ` ${sameKindCount}` : '';
	switch (kind) {
		case 'sideChat':
			return localize('agentsDashboard.chatActivity.sideChat', "Side chat{0}", suffix);
		case 'fork':
			return localize('agentsDashboard.chatActivity.fork', "Fork{0}", suffix);
		case 'subagent':
			return localize('agentsDashboard.chatActivity.subagent', "Subagent{0}", suffix);
		default:
			return localize('agentsDashboard.chatActivity.chat', "Chat{0}", suffix);
	}
}

function chatKindOrder(kind: AgentsDashboardChatKind): number {
	switch (kind) {
		case 'main': return 0;
		case 'chat': return 1;
		case 'fork': return 2;
		case 'sideChat': return 3;
		case 'subagent': return 4;
	}
}

function countEvents(events: readonly AgentsDashboardHistoryEvent[], type: AgentsDashboardHistoryEventType): number {
	return events.filter(event => event.type === type).length;
}

function median(values: readonly number[]): number | undefined {
	if (values.length === 0) {
		return undefined;
	}
	const middle = Math.floor(values.length / 2);
	return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
}

function createIntervals(range: AgentsDashboardHistoryRange, now: number): { start: number; end: number; label: string }[] {
	const current = new Date(now);
	if (range === 'today') {
		const start = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
		const intervals: { start: number; end: number; label: string }[] = [];
		for (let bucketStart = start; bucketStart <= now; bucketStart += 60 * 60 * 1000) {
			intervals.push({
				start: bucketStart,
				end: Math.min(bucketStart + 60 * 60 * 1000, now + 1),
				label: new Date(bucketStart).toLocaleTimeString(undefined, { hour: 'numeric', timeZoneName: 'short' }),
			});
		}
		return intervals;
	}

	const days = range === 'week' ? 7 : 30;
	return Array.from({ length: days }, (_, index) => {
		const dayOffset = index - days + 1;
		const bucketStartDate = new Date(current.getFullYear(), current.getMonth(), current.getDate() + dayOffset);
		const bucketEndDate = new Date(current.getFullYear(), current.getMonth(), current.getDate() + dayOffset + 1);
		return {
			start: bucketStartDate.getTime(),
			end: index === days - 1 ? now + 1 : bucketEndDate.getTime(),
			label: bucketStartDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
		};
	});
}
