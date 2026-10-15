/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { isLocalAgentHostTarget, isRemoteAgentHostTarget, localChatSessionType, SessionType } from './chatSessionsService.js';
import { getChatSessionType } from './model/chatUri.js';

/** An open that has not loaded by then is reported as timed out, so it never stays tracked. */
export const CHAT_OPEN_TIMEOUT_MS = 60_000;

export type ChatOpenSurface = 'agentsWindow' | 'editor' | 'panel';
export type ChatOpenOutcome = 'completed' | 'cancelled' | 'switchedAway' | 'failed' | 'timeout' | 'hidden';
export type ChatOpenSessionType = 'local' | 'localAgentHost' | 'remoteAgentHost' | 'cloud' | 'other';

/** The milestones of a chat open, in the order they are reached. */
export const chatOpenMilestones = ['selectionHandled', 'contentRequested', 'contentReceived', 'replayDone', 'modelPublished', 'modelAttached', 'firstRender', 'loaded'] as const;
export type ChatOpenMilestone = typeof chatOpenMilestones[number];

/**
 * Tracks one open of a chat, from the user selecting it until its transcript is
 * rendered, its input is enabled and its loading progress is hidden.
 */
export interface IChatOpenTracker {
	readonly surface: ChatOpenSurface;
	/** The chat the open loads, once known. */
	readonly chatResource: URI | undefined;
	readonly isFinished: boolean;
	/** Updates the selection target, e.g. after it was redirected to another session, until a chat is bound. */
	setTarget(target: IChatOpenTarget): void;
	/** Binds the chat whose loading this open measures. */
	bindChat(chatResource: URI): void;
	/** Records a milestone the first time it is reached. `loaded` is recorded once the open completes. */
	mark(milestone: Exclude<ChatOpenMilestone, 'loaded'>, detail?: string): void;
	setHistoryItemCount(count: number): void;
	setRestoreYieldCount(count: number): void;
	setModelWasLoaded(loaded: boolean): void;
	setViewReused(reused: boolean): void;
	setProgressHidden(hidden: boolean): void;
	setInputEnabled(enabled: boolean): void;
	/** Ends an open that cannot complete. Only the first outcome is reported. */
	finish(outcome: Exclude<ChatOpenOutcome, 'completed'>): void;
	/** Drops an open that never bound a chat, e.g. a selection showing a new chat, without reporting it. */
	discardIfUnbound(): void;
}

export const IChatOpenTelemetryService = createDecorator<IChatOpenTelemetryService>('chatOpenTelemetryService');

/**
 * Measures how long opening a chat takes and reports it as one `chat.open`
 * event and log lines per open.
 *
 * An open starts where each surface handles the user's selection:
 * - `agentsWindow`: when the sessions service starts opening the selected session or chat,
 *   before the session is resolved and shown. Connecting a remote agent host on demand,
 *   which can include authentication UI, runs alongside loading the chat and is included
 *   in the `contentRequested`/`contentReceived` phases.
 * - `editor`: when the chat editor receives its input, after the editor service has opened
 *   the editor group and created the editor. Creating the editor the first time is not
 *   included; `viewReused` is `false` for the first chat loaded into an editor.
 * - `panel`: when the chat view loads the session, after the view was opened. `viewReused`
 *   is `false` for the first chat loaded into the view.
 *
 * Opens are not measured while the workbench restores, nor when an editor re-shows a chat
 * it had loaded already.
 *
 * One open is tracked per surface, and per editor group for editors: starting an open
 * reports the previous open of the same surface and group as `switchedAway`.
 *
 * Only `completed` opens measure the time until the chat was usable; analysts must filter
 * on `outcome == 'completed'` for latency. A `hidden` open ended when its chat was attached
 * to a widget that was not visible, or when the widget was hidden before the open completed;
 * its phases are meaningful up to `modelAttached` only.
 */
export interface IChatOpenTelemetryService {
	readonly _serviceBrand: undefined;
	/**
	 * Starts tracking an open when the user selects a chat, or a session whose chat is not known yet.
	 * @param groupId The editor group of an `editor` open. It only separates opens of different
	 * groups while they are tracked and is never reported.
	 */
	start(surface: ChatOpenSurface, target?: IChatOpenTarget, groupId?: number): IChatOpenTracker;
	/** Returns the unbound open targeting the given session or chat, binding it to the chat. */
	claim(sessionResource: URI, chatResource: URI): IChatOpenTracker | undefined;
	/** Returns an open loading the given chat, if any. */
	getTracker(chatResource: URI): IChatOpenTracker | undefined;
}

export interface IChatOpenTarget {
	readonly sessionResource?: URI;
	readonly chatResource?: URI;
}

export type ChatOpenEvent = {
	surface: string;
	outcome: string;
	sessionType: string;
	totalMs: number;
	selectionHandledMs: number | undefined;
	contentRequestedMs: number | undefined;
	contentReceivedMs: number | undefined;
	replayDoneMs: number | undefined;
	modelPublishedMs: number | undefined;
	modelAttachedMs: number | undefined;
	firstRenderMs: number | undefined;
	loadedMs: number | undefined;
	historyItemCount: number | undefined;
	restoreYieldCount: number | undefined;
	modelWasLoaded: boolean | undefined;
	viewReused: boolean | undefined;
};

export type ChatOpenClassification = {
	owner: 'sandy081';
	comment: 'Measures how long opening a chat takes, from the user selecting it until its transcript is rendered and its input is usable, split into loading phases. Only opens with outcome completed measure that latency; filter on outcome == completed for latency analysis.';
	surface: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Where the chat was opened: agentsWindow, editor, or panel.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'How the open ended: completed, cancelled, switchedAway, failed, timeout, or hidden (the chat widget was not visible before the open completed; phases are meaningful up to modelAttached only). Only completed opens measure latency.' };
	sessionType: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded category of the chat session: local, localAgentHost, remoteAgentHost, cloud, or other.' };
	totalMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the selection until the open completed or ended. A latency only when the outcome is completed.' };
	selectionHandledMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the selection until the view showing the chat was switched or reused.' };
	contentRequestedMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the previous milestone until the session content was requested from its provider. Absent for chats that are not loaded from a provider.' };
	contentReceivedMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the previous milestone until the session history was received from its provider.' };
	replayDoneMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the previous milestone until the received history was replayed into the chat model.' };
	modelPublishedMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the previous milestone until the restored chat model was published.' };
	modelAttachedMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the previous milestone until the chat model was attached to the chat widget.' };
	firstRenderMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the previous milestone until the first transcript render was committed to the screen.' };
	loadedMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the previous milestone until the chat input was enabled and the loading progress was hidden.' };
	historyItemCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of history items received from the provider, to relate loading time to transcript length.' };
	restoreYieldCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'How often restoring the history yielded to other tasks.' };
	modelWasLoaded: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the chat model was already in memory when the open started.' };
	viewReused: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the view showing the chat (Agents window chat view, chat editor, or chat panel) had loaded a chat before. False for the first chat loaded into a view.' };
};

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

interface IChatOpenTrackerHost {
	now(): number;
	report(tracker: ChatOpenTracker, event: ChatOpenEvent | undefined): void;
	log(message: string): void;
}

class ChatOpenTracker implements IChatOpenTracker {

	private readonly _times = new Map<ChatOpenMilestone, number>();
	private readonly _startTime: number;
	private _finished = false;
	private _claimed = false;
	private _sessionResource: URI | undefined;
	private _chatResource: URI | undefined;
	private _historyItemCount: number | undefined;
	private _restoreYieldCount: number | undefined;
	private _modelWasLoaded: boolean | undefined;
	private _viewReused: boolean | undefined;
	private _progressHidden = false;
	private _inputEnabled = false;

	constructor(
		readonly id: number,
		readonly surface: ChatOpenSurface,
		/** The in-memory key of the surface and editor group this open is tracked under. */
		readonly key: string,
		target: IChatOpenTarget | undefined,
		private readonly _host: IChatOpenTrackerHost,
	) {
		this._startTime = _host.now();
		this._sessionResource = target?.sessionResource;
		this._chatResource = target?.chatResource;
		this._log(`started${this._describeTarget()}`);
	}

	get chatResource(): URI | undefined {
		return this._chatResource;
	}

	get isFinished(): boolean {
		return this._finished;
	}

	/** Whether the open loads the chat targeted by the given selection. */
	matches(sessionResource: URI, chatResource: URI): boolean {
		return !this._claimed && (this._chatResource ? isEqual(this._chatResource, chatResource) : isEqual(this._sessionResource, sessionResource));
	}

	setTarget(target: IChatOpenTarget): void {
		if (this._finished || this._claimed) {
			return;
		}
		this._sessionResource = target.sessionResource;
		this._chatResource = target.chatResource;
	}

	bindChat(chatResource: URI): void {
		if (this._finished) {
			return;
		}
		this._claimed = true;
		this._chatResource = chatResource;
	}

	mark(milestone: Exclude<ChatOpenMilestone, 'loaded'>, detail?: string): void {
		if (this._record(milestone, detail)) {
			this._completeIfLoaded();
		}
	}

	setHistoryItemCount(count: number): void {
		this._historyItemCount = count;
	}

	setRestoreYieldCount(count: number): void {
		this._restoreYieldCount = count;
	}

	setModelWasLoaded(loaded: boolean): void {
		this._modelWasLoaded ??= loaded;
	}

	setViewReused(reused: boolean): void {
		this._viewReused ??= reused;
	}

	setProgressHidden(hidden: boolean): void {
		this._progressHidden = hidden;
		this._completeIfLoaded();
	}

	setInputEnabled(enabled: boolean): void {
		this._inputEnabled = enabled;
		this._completeIfLoaded();
	}

	finish(outcome: Exclude<ChatOpenOutcome, 'completed'>): void {
		this._finish(outcome);
	}

	discardIfUnbound(): void {
		if (this._finished || this._claimed) {
			return;
		}
		this._finished = true;
		this._log(`discarded: no chat was loaded for the selection${this._describeTarget()}`);
		this._host.report(this, undefined);
	}

	private _completeIfLoaded(): void {
		if (!this._finished && this._times.has('modelAttached') && this._times.has('firstRender') && this._progressHidden && this._inputEnabled) {
			this._record('loaded');
			this._finish('completed');
		}
	}

	private _record(milestone: ChatOpenMilestone, detail?: string): boolean {
		if (this._finished || this._times.has(milestone)) {
			return false;
		}
		const elapsed = this._elapsed();
		this._times.set(milestone, elapsed);
		this._log(`${milestone} +${elapsed}ms${detail ? ` ${detail}` : ''}`);
		return true;
	}

	private _finish(outcome: ChatOpenOutcome): void {
		if (this._finished) {
			return;
		}
		this._finished = true;

		const phases = new Map<ChatOpenMilestone, number>();
		const skipped: ChatOpenMilestone[] = [];
		let previous = 0;
		for (const milestone of chatOpenMilestones) {
			const time = this._times.get(milestone);
			if (time === undefined) {
				skipped.push(milestone);
				continue;
			}
			phases.set(milestone, Math.max(0, time - previous));
			previous = Math.max(previous, time);
		}
		const totalMs = Math.max(previous, this._elapsed());
		const sessionType = getChatOpenSessionType(this._chatResource);

		const phaseSummary = [...phases].map(([milestone, duration]) => `${milestone}=${duration}ms`).join(' ');
		const details = [
			`sessionType=${sessionType}`,
			this._modelWasLoaded !== undefined ? `modelWasLoaded=${this._modelWasLoaded}` : undefined,
			this._viewReused !== undefined ? `viewReused=${this._viewReused}` : undefined,
			this._historyItemCount !== undefined ? `historyItems=${this._historyItemCount}` : undefined,
			this._restoreYieldCount !== undefined ? `restoreYields=${this._restoreYieldCount}` : undefined,
		].filter(value => value !== undefined).join(' ');
		this._log(`${outcome} total=${totalMs}ms ${details} phases: ${phaseSummary || 'none'} skipped: ${skipped.join(',') || 'none'}${this._describeTarget()}`);

		this._host.report(this, {
			surface: this.surface,
			outcome,
			sessionType,
			totalMs,
			selectionHandledMs: phases.get('selectionHandled'),
			contentRequestedMs: phases.get('contentRequested'),
			contentReceivedMs: phases.get('contentReceived'),
			replayDoneMs: phases.get('replayDone'),
			modelPublishedMs: phases.get('modelPublished'),
			modelAttachedMs: phases.get('modelAttached'),
			firstRenderMs: phases.get('firstRender'),
			loadedMs: phases.get('loaded'),
			historyItemCount: this._historyItemCount,
			restoreYieldCount: this._restoreYieldCount,
			modelWasLoaded: this._modelWasLoaded,
			viewReused: this._viewReused,
		});
	}

	private _elapsed(): number {
		return Math.max(0, Math.round(this._host.now() - this._startTime));
	}

	private _describeTarget(): string {
		const resource = this._chatResource ?? this._sessionResource;
		return resource ? ` resource=${resource.toString()}` : '';
	}

	private _log(message: string): void {
		this._host.log(`[ChatOpen] #${this.id} ${this.surface} ${message}`);
	}
}

export class ChatOpenTelemetryService extends Disposable implements IChatOpenTelemetryService {
	declare readonly _serviceBrand: undefined;

	/** The opens being tracked, one per surface and editor group. */
	private readonly _active = new Map<string, { readonly tracker: ChatOpenTracker; readonly timeout: IDisposable }>();
	private _nextId = 1;
	private readonly _host: IChatOpenTrackerHost = {
		now: () => this.now(),
		report: (tracker, event) => this._report(tracker, event),
		log: message => this.logService.info(message),
	};

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(toDisposable(() => {
			for (const { tracker } of [...this._active.values()]) {
				tracker.finish('cancelled');
			}
		}));
	}

	/** The clock open durations are measured with. */
	protected now(): number {
		return Date.now();
	}

	start(surface: ChatOpenSurface, target?: IChatOpenTarget, groupId?: number): IChatOpenTracker {
		const key = groupId === undefined ? surface : `${surface}/${groupId}`;
		this._active.get(key)?.tracker.finish('switchedAway');
		const tracker = new ChatOpenTracker(this._nextId++, surface, key, target, this._host);
		this._active.set(key, { tracker, timeout: disposableTimeout(() => tracker.finish('timeout'), CHAT_OPEN_TIMEOUT_MS) });
		return tracker;
	}

	claim(sessionResource: URI, chatResource: URI): IChatOpenTracker | undefined {
		for (const { tracker } of this._active.values()) {
			if (tracker.matches(sessionResource, chatResource)) {
				tracker.bindChat(chatResource);
				return tracker;
			}
		}
		return undefined;
	}

	getTracker(chatResource: URI): IChatOpenTracker | undefined {
		for (const { tracker } of this._active.values()) {
			if (isEqual(tracker.chatResource, chatResource)) {
				return tracker;
			}
		}
		return undefined;
	}

	private _report(tracker: ChatOpenTracker, event: ChatOpenEvent | undefined): void {
		const active = this._active.get(tracker.key);
		if (active?.tracker === tracker) {
			active.timeout.dispose();
			this._active.delete(tracker.key);
		}
		if (event) {
			this.telemetryService.publicLog2<ChatOpenEvent, ChatOpenClassification>('chat.open', event);
		}
	}
}
