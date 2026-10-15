/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { markChat } from './chatPerf.js';
import { isLocalAgentHostTarget, isRemoteAgentHostTarget, localChatSessionType, SessionType } from './chatSessionsService.js';
import { getChatSessionType } from './model/chatUri.js';

/** An open that has not completed by then is reported as timed out, so it never stays tracked. */
export const CHAT_OPEN_TIMEOUT_MS = 60_000;

export type ChatOpenSurface = 'agentsWindow' | 'editor' | 'panel';
export type ChatOpenOutcome = 'completed' | 'cancelled' | 'switchedAway' | 'failed' | 'timeout' | 'hidden';
export type ChatOpenSessionType = 'local' | 'localAgentHost' | 'remoteAgentHost' | 'cloud' | 'other';

/** What initiated an open. The editor and the panel cannot tell and report `unknown`. */
export type SessionOpenSource = 'sessionsList' | 'navigation' | 'link' | 'notification' | 'automation' | 'chat' | 'voice' | 'fork' | 'fallback' | 'unknown';

/** Steps of a chat open that shared code reports; they are only logged and never start or end an open. */
export type ChatOpenMilestone = 'selectionHandled' | 'contentRequested' | 'contentReceived' | 'replayDone' | 'published' | 'modelAttached' | 'firstRender';

/**
 * What the Agents window knows about a click before the chat view loads the chat. The view
 * that owns the open reads it when it starts the open; the Agents window never starts one.
 */
export interface IChatOpenRequest {
	/** The chat the click opens. */
	readonly resource: URI;
	/**
	 * The open is reported by the Agents window as `agents/sessionOpen` only: startup restores and
	 * untitled chats are not chat opens, but that event has always reported them. No view takes it.
	 */
	readonly sessionOpenOnly?: boolean;
	/** When the user selected the chat. */
	readonly startTime: number;
	/** When the session resource and provider were resolved. */
	readonly resolvedTime: number;
	readonly source: SessionOpenSource;
	/** Bounded provider category. */
	readonly provider: string;
	/** The session was the active one before the click (`agents/sessionOpen`'s `alreadyActive`). */
	readonly alreadyActive: boolean;
	/** The chat itself was shown already, so the open only re-shows it. */
	readonly chatAlreadyShown: boolean;
	/** The click is an automatic restore or fallback: it is reported as `agents/sessionOpen` only. */
	readonly automatic?: boolean;
	readonly sessionWasLoading: boolean;
	/** A view had the chat model bound when the click was recorded (see `registerChatOpenHost`). */
	modelAlreadyBound?: boolean;
	/** When provider-backed session loading completed; it can be set after the open started. */
	sessionLoadedTime?: number;
	/** The function that handles the click has ended; nothing more will load. */
	serviceDone?: boolean;
	/** Why it ended, if it failed or was cancelled. */
	serviceError?: unknown;
}

export interface IChatOpenOptions {
	/** The editor group of an `editor` open; it only separates opens and is never reported. */
	readonly groupId?: number;
	/** The Agents window request that started the open. */
	readonly request?: IChatOpenRequest;
	/** The chat was shown already, so the open only re-shows it. Overridden by the request. */
	readonly alreadyShown?: boolean;
	/** The origin of a re-show that is reported without the request. Overridden by the request. */
	readonly source?: SessionOpenSource;
	/** When the open started, if before now. Overridden by the request. */
	readonly startTime?: number;
}

/**
 * One measured open, started and finished by the single function that owns it:
 * `complete()` or `fail()` decides the outcome and `end()` reports it. An open that
 * neither completed nor failed ends as cancelled. Everything after the first `end()`
 * is ignored.
 */
export interface IChatOpen {
	readonly resource: URI;
	/** Logs a step of the open. It never completes the open. */
	mark(milestone: ChatOpenMilestone): void;
	/** The chat model is bound, which `agents/sessionOpen` reports as its own duration. */
	modelBound(): void;
	/** The chat is loaded and its input is usable. When it is not visible, the open is reported as hidden. */
	complete(visible?: boolean): void;
	/** A cancellation is reported as cancelled, anything else as failed. */
	fail(error: unknown): void;
	end(): void;
}

/** The long-standing Agents window event; its shape and meaning are unchanged. */
export type SessionOpenEvent = {
	outcome: string;
	source: string;
	provider: string;
	alreadyActive: boolean | undefined;
	sessionWasLoading: boolean | undefined;
	modelAlreadyBound: boolean | undefined;
	resourceResolvedDurationMs: number | undefined;
	sessionLoadedDurationMs: number | undefined;
	modelBoundDurationMs: number | undefined;
	totalDurationMs: number;
};

export type SessionOpenClassification = {
	owner: 'roblourens';
	comment: 'Measures terminal outcomes and cumulative latency milestones for existing-session open requests in the Agents window.';
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Terminal outcome: success, cancelled, failure, or timeout.' };
	source: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded surface that initiated the open request, or unknown when the caller does not provide one.' };
	provider: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded provider category, or unknown when resolution did not identify a provider.' };
	alreadyActive: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the requested session was already active before this open changed visibility.' };
	sessionWasLoading: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the resolved session was loading when it was opened.' };
	modelAlreadyBound: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the requested session already had a chat model bound in its view.' };
	resourceResolvedDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Cumulative milliseconds from the open request until the session resource and provider were resolved.' };
	sessionLoadedDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Cumulative milliseconds from the open request until provider-backed session loading completed.' };
	modelBoundDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Cumulative milliseconds from the open request until the requested chat model was bound, view state was restored, and chat loading exited.' };
	totalDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the open request until its terminal outcome.' };
};

export type ChatOpenEvent = {
	surface: string;
	outcome: string;
	sessionType: string;
	source: string;
	totalDurationMs: number;
	modelWasLoaded: boolean | undefined;
	alreadyShown: boolean;
};

export type ChatOpenClassification = {
	owner: 'sandy081';
	comment: 'Measures the outcome and end-to-end latency of opening a chat in the Agents window, the chat editor or the chat panel. In the Agents window it describes the same open as agents/sessionOpen, with the same total.';
	surface: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Where the chat was opened: agentsWindow, editor, or panel.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Terminal outcome: completed, cancelled, switchedAway (another open replaced this one), failed, timeout, or hidden (the chat was not visible when loaded).' };
	sessionType: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded category of the chat session: local, localAgentHost, remoteAgentHost, cloud, or other.' };
	source: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded origin of the open. Reported by the Agents window; unknown in the editor and the panel.' };
	totalDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the open start until its terminal outcome.' };
	modelWasLoaded: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the chat model was already in memory when the open started.' };
	alreadyShown: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the chat was already shown before this open, which then only re-shows it.' };
};

/** The outcomes of `agents/sessionOpen`; a hidden chat was bound, which that event always reported as success. */
const sessionOpenOutcomes: Record<ChatOpenOutcome, string> = {
	completed: 'success',
	failed: 'failure',
	cancelled: 'cancelled',
	switchedAway: 'cancelled',
	timeout: 'timeout',
	hidden: 'success',
};

/**
 * The `agents/sessionOpen` outcome of a view-owned open. When the click's handling ended before
 * its session loaded, the chat can still load for the user, but that event, as ever, reports the
 * click as cancelled, or as failed on an error.
 */
function sessionOpenOutcome(request: IChatOpenRequest, outcome: ChatOpenOutcome): string {
	const result = sessionOpenOutcomes[outcome];
	if (result === 'success' && request.serviceDone && request.sessionLoadedTime === undefined) {
		return request.serviceError !== undefined && !isCancellationError(request.serviceError) ? 'failure' : 'cancelled';
	}
	return result;
}

/**
 * Returns a bounded category of the session type of a chat, without any connection details.
 */
export function getChatOpenSessionType(chatResource: URI | undefined): ChatOpenSessionType {
	if (!chatResource) {
		return 'other';
	}
	const sessionType = getChatSessionType(chatResource);
	if (sessionType === localChatSessionType) {
		return 'local';
	}
	if (isLocalAgentHostTarget(sessionType)) {
		return 'localAgentHost';
	}
	if (isRemoteAgentHostTarget(sessionType)) {
		return 'remoteAgentHost';
	}
	if (sessionType === SessionType.CopilotCloud || sessionType === SessionType.CloudSandbox) {
		return 'cloud';
	}
	return 'other';
}

/** The opens in flight, by chat and by surface (and editor group), so that each surface tracks one open at a time. */
const measurementsByChat = new ResourceMap<ChatOpenMeasurement>();
const measurementsBySurface = new Map<string, ChatOpenMeasurement>();

interface IPendingRequest {
	readonly request: IChatOpenRequest;
	readonly logService: ILogService;
	readonly telemetryService: ITelemetryService;
	readonly timer: ReturnType<typeof setTimeout>;
}

/** The Agents window requests that no chat view started an open for yet. */
const pendingRequests = new ResourceMap<IPendingRequest>();
const settleListeners = new WeakMap<IChatOpenRequest, Set<() => void>>();

/** An Agents window view that shows a chat with its model bound. */
export interface IChatOpenHost {
	/**
	 * Called when the user opens the chat this host registered for. Returns whether the host
	 * still shows the chat with its model bound; if so, it reports the re-show itself.
	 */
	reshow(request: IChatOpenRequest): boolean;
}

/** The hosts that have a chat bound, by chat. */
const chatOpenHosts = new ResourceMap<Set<IChatOpenHost>>();

/** Registers a view that shows the given chat with its model bound, until the returned disposable is disposed. */
export function registerChatOpenHost(resource: URI, host: IChatOpenHost): IDisposable {
	let hosts = chatOpenHosts.get(resource);
	if (!hosts) {
		hosts = new Set();
		chatOpenHosts.set(resource, hosts);
	}
	hosts.add(host);
	return toDisposable(() => {
		const current = chatOpenHosts.get(resource);
		if (current?.delete(host) && current.size === 0) {
			chatOpenHosts.delete(resource);
		}
	});
}

function settleRequest(request: IChatOpenRequest): void {
	const listeners = settleListeners.get(request);
	settleListeners.delete(request);
	listeners?.forEach(listener => listener());
}

/**
 * Records the click on a chat, to be taken by the view that owns the open. A request nobody
 * finishes is reported as timed out, like any open. As `agents/sessionOpen` has always counted
 * one open at a time, a click cancels every earlier one that has not been reported yet.
 */
export function requestChatOpen(request: IChatOpenRequest, logService: ILogService, telemetryService: ITelemetryService): void {
	for (const previous of [...pendingRequests.values()]) {
		clearTimeout(previous.timer);
		pendingRequests.delete(previous.request.resource);
		reportUnclaimed(previous, 'cancelled');
	}
	for (const measurement of [...measurementsBySurface.values()]) {
		measurement.cancelSessionOpen();
	}
	const timer = setTimeout(() => {
		const pending = pendingRequests.get(request.resource);
		if (pending?.request === request) {
			pendingRequests.delete(request.resource);
			reportUnclaimed(pending, 'timeout');
		}
	}, Math.max(0, CHAT_OPEN_TIMEOUT_MS - (Date.now() - request.startTime)));
	pendingRequests.set(request.resource, { request, logService, telemetryService, timer });
	for (const host of [...chatOpenHosts.get(request.resource) ?? []]) {
		if (host.reshow(request)) {
			request.modelAlreadyBound = true;
			break;
		}
	}
}

/** Takes the recorded click on a chat. The view that takes it owns the open from then on. */
export function takeChatOpenRequest(resource: URI): IChatOpenRequest | undefined {
	const pending = pendingRequests.get(resource);
	if (!pending || pending.request.sessionOpenOnly) {
		return undefined;
	}
	clearTimeout(pending.timer);
	pendingRequests.delete(resource);
	return pending.request;
}

/** The provider-backed session of the click finished loading. */
export function markChatOpenSessionLoaded(request: IChatOpenRequest): void {
	request.sessionLoadedTime ??= Date.now();
	settleRequest(request);
}

/** Waits until the session of the click loaded, its handling ended, or the token is cancelled. */
export function waitForChatOpenSession(request: IChatOpenRequest, token: CancellationToken): Promise<void> {
	if (request.sessionLoadedTime !== undefined || request.serviceDone || token.isCancellationRequested) {
		return Promise.resolve();
	}
	return new Promise<void>(resolve => {
		const listeners = settleListeners.get(request) ?? new Set<() => void>();
		settleListeners.set(request, listeners);
		const done = () => {
			listeners.delete(done);
			cancellation.dispose();
			resolve();
		};
		listeners.add(done);
		const cancellation = token.onCancellationRequested(done);
	});
}

class ChatOpenMeasurement implements IChatOpen {

	modelWasLoaded: boolean | undefined;
	private ended = false;
	private sessionOpenReported = false;
	private outcome: ChatOpenOutcome | undefined;
	private readonly timeout: ReturnType<typeof setTimeout>;
	private modelBoundMs: number | undefined;

	constructor(
		readonly surface: ChatOpenSurface,
		readonly surfaceKey: string,
		readonly resource: URI,
		private readonly options: IChatOpenOptions,
		private readonly startTime: number,
		private readonly logService: ILogService,
		private readonly telemetryService: ITelemetryService,
	) {
		this.timeout = setTimeout(() => this.finish('timeout'), Math.max(0, CHAT_OPEN_TIMEOUT_MS - this.elapsed()));
	}

	elapsed(): number {
		return Math.max(0, Date.now() - this.startTime);
	}

	trace(message: string): void {
		this.logService.trace(`[ChatOpen] ${this.surface} ${message}`);
	}

	mark(milestone: ChatOpenMilestone): void {
		if (this.ended) {
			return;
		}
		markChat(this.resource, `open/${milestone}`);
		this.trace(`${milestone} +${this.elapsed()}ms`);
	}

	modelBound(): void {
		if (!this.ended) {
			this.modelBoundMs ??= this.elapsed();
		}
	}

	complete(visible = true): void {
		if (this.ended || this.outcome) {
			return;
		}
		markChat(this.resource, 'open/loaded');
		this.trace(`loaded +${this.elapsed()}ms`);
		this.modelBound();
		// A hidden widget defers rendering, so the transcript was not rendered for the user.
		this.outcome = visible ? 'completed' : 'hidden';
	}

	fail(error: unknown): void {
		if (!this.ended && !this.outcome) {
			this.outcome = isCancellationError(error) ? 'cancelled' : 'failed';
		}
	}

	end(): void {
		this.finish(this.outcome ?? 'cancelled');
	}

	/** Ends the open without reporting it. */
	discard(): void {
		this.finish(undefined);
	}

	finish(outcome: ChatOpenOutcome | undefined): void {
		if (this.ended) {
			return;
		}
		this.ended = true;
		clearTimeout(this.timeout);
		if (measurementsBySurface.get(this.surfaceKey) === this) {
			measurementsBySurface.delete(this.surfaceKey);
		}
		if (measurementsByChat.get(this.resource) === this) {
			measurementsByChat.delete(this.resource);
		}
		const request = this.options.request;
		if (request) {
			settleRequest(request);
		}
		if (!outcome) {
			return;
		}

		const durations = this.durations();
		const totalDurationMs = durations.totalDurationMs;
		const sessionType = getChatOpenSessionType(this.resource);
		this.logService.info(`[ChatOpen] ${this.surface} ${outcome} total=${totalDurationMs}ms sessionType=${sessionType} modelWasLoaded=${this.modelWasLoaded}`);
		// Automatic restores are not chat opens.
		if (!request?.automatic) {
			this.telemetryService.publicLog2<ChatOpenEvent, ChatOpenClassification>('agents/chatOpen', {
				surface: this.surface,
				outcome,
				sessionType,
				source: request?.source ?? this.options.source ?? 'unknown',
				totalDurationMs,
				modelWasLoaded: this.modelWasLoaded,
				alreadyShown: request ? request.chatAlreadyShown : this.options.alreadyShown ?? false,
			});
		}
		if (request && this.surface === 'agentsWindow' && !this.sessionOpenReported) {
			this.sessionOpenReported = true;
			publishSessionOpen(this.telemetryService, request, sessionOpenOutcome(request, outcome), durations);
		}
	}

	/**
	 * A newer click in the Agents window cancels this open for `agents/sessionOpen`, which has
	 * always counted one open at a time. The open itself goes on, e.g. in another slot of the grid.
	 */
	cancelSessionOpen(): void {
		const request = this.options.request;
		if (this.ended || this.sessionOpenReported || !request || this.surface !== 'agentsWindow') {
			return;
		}
		this.sessionOpenReported = true;
		const durations = this.durations();
		this.logService.info(`[ChatOpen] ${this.surface} cancelled total=${durations.totalDurationMs}ms (session open only, superseded)`);
		publishSessionOpen(this.telemetryService, request, 'cancelled', durations);
	}

	/** The intermediate durations are cumulative and only reported for the Agents window. */
	private durations(): ISessionOpenDurations {
		const request = this.options.request;
		const resourceResolved = request ? Math.max(0, request.resolvedTime - this.startTime) : undefined;
		const sessionLoaded = request && request.sessionLoadedTime !== undefined ? Math.max(resourceResolved!, request.sessionLoadedTime - this.startTime) : undefined;
		const modelBound = request && this.modelBoundMs !== undefined ? Math.max(sessionLoaded ?? resourceResolved!, this.modelBoundMs) : undefined;
		const totalDurationMs = Math.max(modelBound ?? sessionLoaded ?? resourceResolved ?? 0, this.elapsed());
		return { resourceResolved, sessionLoaded, modelBound, totalDurationMs };
	}
}

interface ISessionOpenDurations {
	readonly resourceResolved: number | undefined;
	readonly sessionLoaded: number | undefined;
	readonly modelBound: number | undefined;
	readonly totalDurationMs: number;
}

function publishSessionOpen(telemetryService: ITelemetryService, request: IChatOpenRequest, outcome: string, durations: ISessionOpenDurations): void {
	telemetryService.publicLog2<SessionOpenEvent, SessionOpenClassification>('agents/sessionOpen', {
		outcome,
		source: request.source,
		provider: request.provider,
		alreadyActive: request.alreadyActive,
		sessionWasLoading: request.sessionWasLoading,
		modelAlreadyBound: request.modelAlreadyBound ?? false,
		resourceResolvedDurationMs: durations.resourceResolved,
		sessionLoadedDurationMs: durations.sessionLoaded,
		modelBoundDurationMs: durations.modelBound,
		totalDurationMs: durations.totalDurationMs,
	});
}

/** Reports `agents/sessionOpen` for a request that no chat view took. `agents/chatOpen` is not reported for these. */
function reportUnclaimed({ request, logService, telemetryService }: IPendingRequest, outcome: string): void {
	const resourceResolved = Math.max(0, request.resolvedTime - request.startTime);
	const sessionLoaded = request.sessionLoadedTime !== undefined ? Math.max(resourceResolved, request.sessionLoadedTime - request.startTime) : undefined;
	// A chat whose model was bound already needs no more time to bind.
	const modelBound = request.modelAlreadyBound && outcome === 'success' ? sessionLoaded : undefined;
	const totalDurationMs = Math.max(modelBound ?? sessionLoaded ?? resourceResolved, Date.now() - request.startTime);
	logService.info(`[ChatOpen] agentsWindow ${outcome} total=${totalDurationMs}ms (session open only) resource=${request.resource.toString()}`);
	publishSessionOpen(telemetryService, request, outcome, { resourceResolved, sessionLoaded, modelBound, totalDurationMs });
	settleRequest(request);
}

/**
 * Called by the function that handles an Agents window click when it ends. When no chat view took
 * the request (a session shown without loading a chat, an automatic restore, an untitled chat), it
 * reports `agents/sessionOpen`: a success if the session loaded, a failure on an error, otherwise
 * cancelled. When a view owns the open, it tells the view that nothing more will load.
 */
export function finishChatOpenRequest(request: IChatOpenRequest, error?: unknown): void {
	const pending = pendingRequests.get(request.resource);
	request.serviceDone = true;
	request.serviceError = error;
	if (pending?.request === request) {
		clearTimeout(pending.timer);
		pendingRequests.delete(request.resource);
		reportUnclaimed(pending, error !== undefined && !isCancellationError(error) ? 'failure' : request.sessionLoadedTime !== undefined ? 'success' : 'cancelled');
	} else {
		settleRequest(request);
	}
}

/**
 * Converts an epoch time to the clock `mark` of `vs/base/common/performance` expects for `startTime`:
 * the native clock where it uses the native API, else the epoch clock of its polyfill (as in Node).
 */
function toPerformanceTime(epochTime: number): number {
	const perf: { mark?: unknown; timeOrigin?: unknown; nodeTiming?: unknown } | undefined = globalThis.performance;
	const usesNativeMarks = typeof perf === 'object' && typeof perf.mark === 'function' && !perf.nodeTiming && typeof perf.timeOrigin === 'number';
	return usesNativeMarks ? epochTime - (perf.timeOrigin as number) : epochTime;
}

/**
 * Starts measuring an open of the given chat and returns it; the caller finishes it in a
 * `try`/`finally` of the same function. An open still in flight on the same surface (and
 * editor group), or of the same chat, is ended as `switchedAway`.
 */
export function startChatOpen(surface: ChatOpenSurface, resource: URI, logService: ILogService, telemetryService: ITelemetryService, options: IChatOpenOptions = {}): IChatOpen {
	const surfaceKey = options.groupId === undefined ? surface : `${surface}/${options.groupId}`;
	measurementsBySurface.get(surfaceKey)?.finish('switchedAway');
	measurementsByChat.get(resource)?.finish('switchedAway');
	const startTime = options.request?.startTime ?? options.startTime ?? Date.now();
	const measurement = new ChatOpenMeasurement(surface, surfaceKey, resource, options, startTime, logService, telemetryService);
	measurementsBySurface.set(surfaceKey, measurement);
	measurementsByChat.set(resource, measurement);
	markChat(resource, 'open/start', options.request ? toPerformanceTime(startTime) : undefined);
	measurement.trace(`start +${measurement.elapsed()}ms resource=${resource.toString()}`);
	return measurement;
}

/** Logs a step of the open of the given chat, if one is in flight. It never starts or ends an open. */
export function markChatOpen(resource: URI, milestone: ChatOpenMilestone): void {
	measurementsByChat.get(resource)?.mark(milestone);
}

/** Records whether the model of the chat was in memory when its open started. */
export function setChatOpenModelWasLoaded(resource: URI, loaded: boolean): void {
	const measurement = measurementsByChat.get(resource);
	if (measurement) {
		measurement.modelWasLoaded ??= loaded;
	}
}

/** Drops all opens in flight and recorded requests without reporting them. */
export function resetChatOpenMeasurementsForTests(): void {
	for (const measurement of [...measurementsBySurface.values()]) {
		measurement.discard();
	}
	for (const pending of pendingRequests.values()) {
		clearTimeout(pending.timer);
	}
	pendingRequests.clear();
	chatOpenHosts.clear();
}
