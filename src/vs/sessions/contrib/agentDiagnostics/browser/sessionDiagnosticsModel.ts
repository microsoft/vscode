/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, Throttler } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOTelDiagnosticsLog, IOTelDiagnosticsMessage, IOTelDiagnosticsService, IOTelDiagnosticsSessionSummary, IOTelDiagnosticsTrace, IOTelDiagnosticsTraceDetails, IOTelDiagnosticsTraceProjection } from '../../../../platform/otel/common/otelDiagnosticsService.js';
import { IChatDebugEvent, IChatDebugModelTurnEvent, IChatDebugService, IChatDebugUserMessageEvent } from '../../../../workbench/contrib/chat/common/chatDebugService.js';

export interface ISessionDiagnosticsTurn {
	readonly id: string;
	readonly prompt: string;
	readonly startTime: number;
	readonly endTime: number;
	readonly resolvedModel: string | undefined;
	readonly thinkingLevel: string | undefined;
	readonly context: string | number | undefined;
	readonly otelMessages: readonly IOTelDiagnosticsMessage[];
	readonly otelTraces: readonly IOTelDiagnosticsTrace[];
	readonly debugEvents: readonly IChatDebugEvent[];
}

export interface ISessionDiagnosticsState {
	readonly sessionResource: URI;
	readonly chatResource: URI;
	readonly summary: IOTelDiagnosticsSessionSummary | undefined;
	readonly turns: readonly ISessionDiagnosticsTurn[];
	readonly unmatchedTraces: readonly IOTelDiagnosticsTrace[];
	readonly unmatchedDebugEvents: readonly IChatDebugEvent[];
	readonly sessionActivity: readonly IOTelDiagnosticsLog[];
	readonly error: string | undefined;
}

interface IPromptProjection {
	readonly id: string;
	readonly content: string;
	readonly timestamp: number;
}

export class SessionDiagnosticsModel extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly refreshScheduler = this._register(new RunOnceScheduler(() => this.refreshNow(), 750));
	private readonly refreshThrottler = new Throttler();
	private sessionResource: URI | undefined;
	private chatResource: URI | undefined;
	private generation = 0;
	private _state: ISessionDiagnosticsState | undefined;
	private readonly expandedTraceIds = new Set<string>();
	private readonly traceDetails = new Map<string, IOTelDiagnosticsTraceDetails>();
	private readonly traceDetailRequests = new Map<string, Promise<void>>();

	get state(): ISessionDiagnosticsState | undefined {
		return this._state;
	}

	constructor(
		@IOTelDiagnosticsService private readonly otelDiagnosticsService: IOTelDiagnosticsService,
		@IChatDebugService private readonly chatDebugService: IChatDebugService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(this.otelDiagnosticsService.onDidChange(() => this.scheduleRefresh()));
		this._register(this.chatDebugService.onDidAddEvent(event => {
			if (isEqual(event.sessionResource, this.chatResource)) {
				this.scheduleRefresh();
			}
		}));
		this._register(this.chatDebugService.onDidClearProviderEvents(resource => {
			if (isEqual(resource, this.chatResource)) {
				this.scheduleRefresh();
			}
		}));
	}

	setSession(sessionResource: URI | undefined, chatResource: URI | undefined): void {
		if (isEqual(this.sessionResource, sessionResource) && isEqual(this.chatResource, chatResource)) {
			return;
		}
		this.sessionResource = sessionResource;
		this.chatResource = chatResource;
		this.generation++;
		this.expandedTraceIds.clear();
		this.traceDetails.clear();
		this.traceDetailRequests.clear();
		this._state = undefined;
		this._onDidChange.fire();
		this.scheduleRefresh();
	}

	isTraceExpanded(traceId: string): boolean {
		return this.expandedTraceIds.has(traceId);
	}

	getTraceDetails(traceId: string, startTime: number, endTime: number): IOTelDiagnosticsTraceDetails | undefined {
		return this.traceDetails.get(traceDetailsKey(traceId, startTime, endTime));
	}

	toggleTraceExpanded(traceId: string): void {
		if (this.expandedTraceIds.has(traceId)) {
			this.expandedTraceIds.delete(traceId);
		} else {
			this.expandedTraceIds.add(traceId);
		}
		this._onDidChange.fire();
	}

	async expandTrace(traceId: string, startTime: number, endTime: number): Promise<void> {
		if (!this.expandedTraceIds.has(traceId)) {
			this.expandedTraceIds.add(traceId);
			this._onDidChange.fire();
		}
		await this.ensureTraceDetails(traceId, startTime, endTime);
	}

	ensureTraceDetails(traceId: string, startTime: number, endTime: number): Promise<void> {
		const key = traceDetailsKey(traceId, startTime, endTime);
		if (this.traceDetails.has(key)) {
			return Promise.resolve();
		}
		const existingRequest = this.traceDetailRequests.get(key);
		if (existingRequest) {
			return existingRequest;
		}
		const generation = this.generation;
		const request = this.otelDiagnosticsService.getTraceDetails(traceId, startTime, endTime).then(details => {
			if (generation === this.generation && details) {
				this.traceDetails.set(key, details);
				this._onDidChange.fire();
			}
		}).catch(error => {
			this.logService.error('[AgentDiagnostics] Failed to load trace details', error);
		}).finally(() => {
			if (this.traceDetailRequests.get(key) === request) {
				this.traceDetailRequests.delete(key);
			}
		});
		this.traceDetailRequests.set(key, request);
		return request;
	}

	private scheduleRefresh(): void {
		if (!this.refreshScheduler.isScheduled()) {
			this.refreshScheduler.schedule();
		}
	}

	private refreshNow(): void {
		const sessionResource = this.sessionResource;
		const chatResource = this.chatResource;
		if (!sessionResource || !chatResource) {
			return;
		}
		void this.refreshThrottler.queue(async () => {
			const generation = ++this.generation;
			try {
				await this.load(sessionResource, chatResource, generation);
			} catch (error) {
				this.logService.error('[AgentDiagnostics] Failed to refresh combined session diagnostics', error);
				if (generation === this.generation) {
					this._state = {
						sessionResource,
						chatResource,
						summary: undefined,
						turns: [],
						unmatchedTraces: [],
						unmatchedDebugEvents: [],
						sessionActivity: [],
						error: error instanceof Error ? error.message : String(error),
					};
					this._onDidChange.fire();
				}
			}
		});
	}

	private async load(sessionResource: URI, chatResource: URI, generation: number): Promise<void> {
		const resolvedChatResource = this.chatDebugService.resolveSessionResource(chatResource);
		const queryResource = isEqual(resolvedChatResource, chatResource)
			? chatResource.with({ fragment: '' }).toString()
			: resolvedChatResource.toString();
		const [summary, messages, traces, sessionActivity] = await Promise.all([
			this.otelDiagnosticsService.getSessionSummary(queryResource),
			this.otelDiagnosticsService.getSessionMessages(queryResource),
			this.otelDiagnosticsService.getSessionTraces(queryResource),
			this.otelDiagnosticsService.getSessionLogs(queryResource),
		]);
		if (generation !== this.generation) {
			return;
		}
		const debugEvents = this.chatDebugService.getEvents(chatResource);
		const modelOptions = new Map<string, Readonly<Record<string, string | number | boolean | null>>>();
		await Promise.all(debugEvents.map(async event => {
			if (event.kind !== 'modelTurn' || !event.id) {
				return;
			}
			const resolved = await this.chatDebugService.resolveEvent(event.id);
			if (resolved?.kind === 'modelTurn' && resolved.requestOptions) {
				modelOptions.set(event.id, JSON.parse(resolved.requestOptions) as Readonly<Record<string, string | number | boolean | null>>);
			}
		}));
		if (generation !== this.generation) {
			return;
		}
		const debugPrompts = debugEvents.filter((event): event is IChatDebugUserMessageEvent => event.kind === 'userMessage');
		const prompts: IPromptProjection[] = debugPrompts.length > 0
			? debugPrompts.map(event => ({ id: event.id ?? `${event.created.getTime()}`, content: event.message, timestamp: event.created.getTime() }))
			: messages.filter(message => message.role === 'user').map(message => ({ id: message.id, content: message.content, timestamp: message.timestamp }));
		prompts.sort((a, b) => a.timestamp - b.timestamp);
		const windows = prompts.map((prompt, index) => ({
			id: prompt.id,
			startTime: prompt.timestamp,
			endTime: prompts[index + 1]?.timestamp ?? Math.max(
				prompt.timestamp,
				...traces.map(trace => trace.endTime),
				...debugEvents.map(event => event.created.getTime()),
			),
		}));
		const traceProjections = await this.otelDiagnosticsService.getSessionTraceProjections(queryResource, windows);
		if (generation !== this.generation) {
			return;
		}
		const projectionsByWindow = new Map<string, IOTelDiagnosticsTraceProjection[]>();
		for (const projection of traceProjections) {
			const projections = projectionsByWindow.get(projection.windowId) ?? [];
			projections.push(projection);
			projectionsByWindow.set(projection.windowId, projections);
		}

		const assignedTraceIds = new Set<string>();
		const assignedDebugEvents = new Set<IChatDebugEvent>();
		const turns = prompts.map((prompt, index): ISessionDiagnosticsTurn => {
			const endTime = windows[index].endTime;
			const projections = projectionsByWindow.get(prompt.id) ?? [];
			const otelTraces = projections.map(projection => projection.trace);
			const otelMessages = messages.filter(message => message.timestamp >= prompt.timestamp && (index === prompts.length - 1 || message.timestamp < endTime));
			const turnDebugEvents = debugEvents.filter(event => event.created.getTime() >= prompt.timestamp && (index === prompts.length - 1 || event.created.getTime() < endTime));
			otelTraces.forEach(trace => assignedTraceIds.add(trace.traceId));
			turnDebugEvents.forEach(event => assignedDebugEvents.add(event));

			const debugModelEvent = turnDebugEvents.findLast((event): event is IChatDebugModelTurnEvent => event.kind === 'modelTurn');
			const debugModel = debugModelEvent?.model;
			const options = debugModelEvent?.id ? modelOptions.get(debugModelEvent.id) : undefined;
			return {
				id: prompt.id,
				prompt: prompt.content,
				startTime: prompt.timestamp,
				endTime,
				resolvedModel: projections.findLast(projection => projection.responseModel)?.responseModel ?? debugModel,
				thinkingLevel: readStringModelOption(options, 'thinkingLevel', 'reasoningEffort'),
				context: readModelOption(options, 'contextSize', 'contextTier'),
				otelMessages,
				otelTraces,
				debugEvents: turnDebugEvents,
			};
		});

		this._state = {
			sessionResource,
			chatResource,
			summary,
			turns,
			unmatchedTraces: traces.filter(trace => !assignedTraceIds.has(trace.traceId)),
			unmatchedDebugEvents: debugEvents.filter(event => !assignedDebugEvents.has(event)),
			sessionActivity,
			error: undefined,
		};
		this._onDidChange.fire();
	}

}

function traceDetailsKey(traceId: string, startTime: number, endTime: number): string {
	return `${traceId}\0${startTime}\0${endTime}`;
}

function readModelOption(options: Readonly<Record<string, string | number | boolean | null>> | undefined, ...keys: readonly string[]): string | number | undefined {
	for (const key of keys) {
		const value = options?.[key];
		if (typeof value === 'string' || typeof value === 'number') {
			return value;
		}
	}
	return undefined;
}

function readStringModelOption(options: Readonly<Record<string, string | number | boolean | null>> | undefined, ...keys: readonly string[]): string | undefined {
	for (const key of keys) {
		const value = options?.[key];
		if (typeof value === 'string') {
			return value;
		}
	}
	return undefined;
}
