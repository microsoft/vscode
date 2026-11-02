/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import { setTimeout0 } from '../../../../../base/common/platform.js';
import { autorun } from '../../../../../base/common/observable.js';
import { clearMarks, mark } from '../../../../../base/common/performance.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { getChatSessionHistoryContent, IChatSession, IChatSessionHistoryItem, IChatSessionRequestHistoryItem, IChatSessionServerRequest } from '../chatSessionsService.js';
import { CloudSandboxSessionTrace } from '../cloudSandboxSessionTrace.js';
import { ChatModeKind } from '../constants.js';
import { chatEditingSessionIsReady } from '../editing/chatEditingService.js';
import { ChatModel, ChatRequestModel, getRestoredChatRequestSource, IChatRequestModeInfo } from '../model/chatModel.js';
import { IChatAgentData, IChatAgentService } from '../participants/chatAgents.js';
import { IParsedChatRequest } from '../requestParser/chatParserTypes.js';
import { IChatModelReference } from './chatService.js';

const maxSliceMs = 25;
/** A restore that replayed in less time than this publishes in the same task, keeping replay, publish and attach within one frame budget. */
const maxSameTaskPublishMs = 10;
/** How often publication waits for history that changed meanwhile; later changes are applied as live refreshes. */
const maxPublishDeferrals = 3;

/**
 * Clock and task scheduling used to restore remote chat history cooperatively.
 */
export interface IRemoteChatHistoryScheduler {
	/** Returns the current time in milliseconds. */
	now(): number;
	/** Runs `callback` in a new macrotask, without waiting for the host to become idle. */
	runInNewTask(callback: () => void): IDisposable;
}

export const defaultRemoteChatHistoryScheduler: IRemoteChatHistoryScheduler = {
	now: () => Date.now(),
	runInNewTask: callback => {
		let disposed = false;
		setTimeout0(() => {
			if (!disposed) {
				callback();
			}
		});
		return toDisposable(() => disposed = true);
	},
};

/**
 * A remote chat session whose history is restored into a chat model.
 */
export interface IRemoteChatSessionRestoreOptions {
	/** The model to restore into. It must not be published to the model store yet. */
	readonly model: ChatModel;
	/** The provided session. Its current history is restored; later changes are applied as refreshes. */
	readonly session: IChatSession;
	readonly chatSessionType: string;
	/** Cancels restoration before the model is published. */
	readonly token: CancellationToken;
	readonly trace: CloudSandboxSessionTrace | undefined;
	/** Parses a prompt from the history into a request. */
	parsePrompt(text: string, agent: IChatAgentData | undefined): IParsedChatRequest;
	/** Publishes the restored model to the model store and returns the first reference to it. */
	publishModel(model: ChatModel): IChatModelReference;
}

export interface IRemoteChatSessionRestoreResult {
	readonly reference: IChatModelReference;
	/** The request whose response continues streaming, if the session streams progress. */
	readonly lastRequest: ChatRequestModel | undefined;
	/** When the last response completed, as recorded in the history. */
	readonly lastResponseCompletedAt: number | undefined;
}

/**
 * Applies the server-initiated requests of a restored session to its model.
 */
export interface IRemoteChatServerRequestHandler {
	/** Adds or resumes the request of a server-initiated turn. */
	handleRequest(request: IChatSessionServerRequest): void;
	/** Called whenever no server-initiated request is left to apply. */
	handleRequestsApplied(): void;
}

const enum RestoreState {
	/** History is replayed into a model that is not published yet. */
	Replaying,
	/** The model is published and follows live history changes. */
	Published,
	Disposed,
}

interface IHistoryTurn {
	readonly request: IChatSessionRequestHistoryItem;
	readonly items: IChatSessionHistoryItem[];
	/** The id of the model request the turn was applied as. */
	id: string | undefined;
}

/** Where a history request is inserted into the model, optionally replacing the request at that index. */
interface IHistoryRequestInsertion {
	readonly index: number;
	readonly replace?: boolean;
}

type IChatSessionResponseHistoryItem = Extract<IChatSessionHistoryItem, { type: 'response' }>;

/**
 * Restores the history of a remote chat session into a chat model and keeps the
 * model in sync with later history changes.
 *
 * The history is replayed into an unpublished model in time-bounded idle slices,
 * so a long history neither blocks the renderer nor makes views render each
 * restored turn. The model is then published once. A final turn that is still
 * running is removed before publication and applied again afterwards, so only
 * that turn, never a restored one, puts the model in progress.
 *
 * After publication, history changes are applied in slices too. Sends and queued
 * requests wait for {@link historyRefresh}, and server-initiated requests are
 * applied in order with history refreshes.
 */
export class RemoteChatSessionRestorer extends Disposable {

	private _state = RestoreState.Replaying;
	private readonly _model: ChatModel;
	private readonly _session: IChatSession;
	private readonly _hasProgressStreaming: boolean;
	private readonly _budget: CooperativeMutationBudget;
	private readonly _marks = new Set<string>();

	/** The history the model reflects. */
	private _restoredHistory: readonly IChatSessionHistoryItem[];
	/** The turns of {@link _restoredHistory}. */
	private _restoredTurns: IHistoryTurn[] = [];
	/** Requests added to the model locally rather than from the history. */
	private readonly _localRequestIds = new Set<string>();
	/** The latest history that is not applied yet. */
	private _pendingHistory: readonly IChatSessionHistoryItem[] | undefined;
	private _activeRefresh: Promise<void> | undefined;

	/** The request that history responses are applied to. */
	private _lastRequest: ChatRequestModel | undefined;
	private _lastResponseCompletedAt: number | undefined;

	private _serverRequestHandler: IRemoteChatServerRequestHandler | undefined;
	private readonly _serverRequestsBeforeHandler: IChatSessionServerRequest[] = [];
	private readonly _serverRequestsAfterRefresh: IChatSessionServerRequest[] = [];
	private _unappliedServerRequests = 0;

	constructor(
		private readonly _options: IRemoteChatSessionRestoreOptions,
		scheduler: IRemoteChatHistoryScheduler = defaultRemoteChatHistoryScheduler,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._model = _options.model;
		this._session = _options.session;
		this._restoredHistory = this._session.history;
		this._hasProgressStreaming = !!(this._session.progressObs && this._session.interruptActiveResponseCallback);
		// Cancel pending cooperative waits when the restorer is disposed, not only when the service token is.
		const budgetCancellation = new CancellationTokenSource(_options.token);
		this._register(toDisposable(() => budgetCancellation.dispose(true)));
		this._budget = new CooperativeMutationBudget(scheduler, budgetCancellation.token, () => this._state === RestoreState.Disposed);

		if (this._session.onDidChangeHistory) {
			this._register(this._session.onDidChangeHistory(history => {
				this._pendingHistory = history;
				if (this._state === RestoreState.Published) {
					this.scheduleHistoryRefresh();
				}
			}));
		}
		if (this._hasProgressStreaming && this._session.onDidStartServerRequest) {
			this._register(this._session.onDidStartServerRequest(request => this._onDidStartServerRequest(request)));
		}
	}

	/** How often restoration yielded to a new task. */
	get yieldCount(): number {
		return this._budget.yieldCount;
	}

	/**
	 * The running history refresh of the published model, if any. Sends and
	 * queued requests wait for it so they apply to the refreshed model.
	 */
	get historyRefresh(): Promise<void> | undefined {
		return this._state === RestoreState.Published ? this._activeRefresh : undefined;
	}

	/** Whether server-initiated requests wait to be applied. Progress belongs to them and must wait as well. */
	get hasUnappliedServerRequests(): boolean {
		return this._unappliedServerRequests > 0;
	}

	/**
	 * Replays the history into the model and publishes it. When restoration fails
	 * or is cancelled, the model is discarded and the promise rejects.
	 */
	async restore(): Promise<IRemoteChatSessionRestoreResult> {
		let reference: IChatModelReference;
		let liveHistory: readonly IChatSessionHistoryItem[] | undefined;
		try {
			await this._replay();
			liveHistory = this._detachLiveTurn();
			this._mark('modelPublishStart');
			reference = this._options.publishModel(this._model);
			this._mark('modelPublishEnd');
		} catch (error) {
			this.dispose();
			throw error;
		}

		this._state = RestoreState.Published;
		this._register(Event.once(this._model.onDidDispose)(() => this.dispose()));
		try {
			this._lastRequest = this._model.getRequests().at(-1);
			this._lastResponseCompletedAt = undefined;
			if (liveHistory) {
				const [liveRequest] = runToCompletion(this._applyHistorySteps(liveHistory));
				const lastTurn = this._restoredTurns.at(-1);
				if (liveRequest && lastTurn) {
					lastTurn.id = liveRequest.id;
				}
			}
			this._register(autorun(reader => {
				if (!this._model.hasActiveRequest.read(reader) && this._pendingHistory) {
					queueMicrotask(() => {
						if (this._state === RestoreState.Published) {
							this.scheduleHistoryRefresh();
						}
					});
				}
			}));
		} catch (error) {
			const activeRequest = this._model.lastRequest;
			if (activeRequest?.response?.isIncomplete.get()) {
				this._model.cancelRequest(activeRequest);
			}
			reference.dispose();
			throw error;
		}
		return { reference, lastRequest: this._lastRequest, lastResponseCompletedAt: this._lastResponseCompletedAt };
	}

	/**
	 * Applies pending history changes once no request is running.
	 */
	scheduleHistoryRefresh(): Promise<void> {
		return this._refreshHistory(false).catch(error => {
			if (!isCancellationError(error)) {
				this._logService.error(`RemoteChatSessionRestorer: failed to refresh history for ${this._model.sessionResource.toString()}`, error);
			}
		});
	}

	/**
	 * Applies server-initiated requests with `handler`, in order with history
	 * refreshes. Requests that started during restoration are applied right away.
	 */
	setServerRequestHandler(handler: IRemoteChatServerRequestHandler): void {
		this._serverRequestHandler = handler;
		for (const request of this._serverRequestsBeforeHandler.splice(0)) {
			handler.handleRequest(request);
		}
	}

	override dispose(): void {
		if (this._state === RestoreState.Disposed) {
			return;
		}
		const state = this._state;
		this._state = RestoreState.Disposed;
		super.dispose();
		for (const name of this._marks) {
			clearMarks(name);
		}
		this._marks.clear();
		if (state !== RestoreState.Published) {
			this._model.dispose();
		}
		this._session.dispose();
	}

	private async _replay(): Promise<void> {
		this._budget.startSlice();
		const yieldsBeforeReplay = this._budget.yieldCount;
		const replayStart = this._budget.now();
		const requests = await this._budget.run(this._applyHistorySteps(this._restoredHistory));
		// Group the history the model was restored from: the session history may
		// have changed during replay, and that change is still pending.
		this._restoredTurns = groupHistoryTurns(this._restoredHistory);
		for (const [index, turn] of this._restoredTurns.entries()) {
			turn.id = requests[index].id;
		}

		await this._applyBufferedHistory();
		await this._completeNonStreamingHistory();
		let deferrals = 0;
		do {
			await this._applyBufferedHistory();
			// Publishing notifies model listeners and lets views render every
			// restored turn, so keep it out of the task that ran the last slice.
			// A restore that was quick and never yielded is small enough to publish right away.
			if (this._budget.yieldCount !== yieldsBeforeReplay || this._budget.now() - replayStart >= maxSameTaskPublishMs) {
				await this._budget.waitForNewTask();
			} else {
				this._budget.throwIfCancelled();
			}
		} while (this._pendingHistory && ++deferrals < maxPublishDeferrals);
	}

	private async _applyBufferedHistory(): Promise<void> {
		if (!this._pendingHistory) {
			return;
		}
		this._mark('bufferedHistoryRefreshStart');
		while (this._pendingHistory) {
			await this._refreshHistory(true);
		}
		this._mark('bufferedHistoryRefreshEnd');
	}

	private async _completeNonStreamingHistory(): Promise<void> {
		if (this._hasProgressStreaming) {
			return;
		}
		if (this._lastRequest && this._model.editingSession) {
			await raceCancellationError(chatEditingSessionIsReady(this._model.editingSession), this._options.token);
			this._budget.startSlice();
		}
		const completion = this._budget.run(this._completeLastResponseSteps());
		if (completion) {
			await completion;
		}
	}

	/**
	 * Removes a final turn that is still running from the unpublished model and
	 * returns its history, to apply it again once the model is published.
	 */
	private _detachLiveTurn(): readonly IChatSessionHistoryItem[] | undefined {
		const isLive = this._hasProgressStreaming && !(this._session.isCompleteObs?.get() ?? false);
		const lastRequestIndex = isLive ? this._restoredHistory.findLastIndex(item => item.type === 'request') : -1;
		if (lastRequestIndex === -1) {
			if (this._hasProgressStreaming) {
				this._completeLastResponse();
			}
			return undefined;
		}
		if (this._model.lastRequest) {
			this._model.removeRequest(this._model.lastRequest.id);
		}
		return this._restoredHistory.slice(lastRequestIndex);
	}

	private _refreshHistory(force: boolean): Promise<void> {
		if (this._activeRefresh) {
			return this._activeRefresh;
		}
		const completion = new DeferredPromise<void>();
		this._activeRefresh = completion.p;
		void this._applyPendingHistory(force).then(() => completion.complete(), error => completion.error(error));
		return completion.p;
	}

	private async _applyPendingHistory(force: boolean): Promise<void> {
		try {
			while (this._pendingHistory && (force || !this._model.hasActiveRequest.get())) {
				const history = this._pendingHistory;
				this._pendingHistory = undefined;
				const refresh = this._budget.run(this._refreshSteps(history));
				if (refresh) {
					await refresh;
				}
			}
		} finally {
			this._activeRefresh = undefined;
			this._applyServerRequestsAfterRefresh();
		}
	}

	private *_refreshSteps(history: readonly IChatSessionHistoryItem[]): Generator<void, void> {
		const requests = this._model.getRequests();
		const turns = groupHistoryTurns(history);
		const restoredTurns = this._restoredTurns;
		if (turns.length === restoredTurns.length && turns.every((turn, index) => equals(turn.items, restoredTurns[index].items))) {
			return;
		}
		const previousAnonymous = restoredTurns.filter(turn => turn.request.id === undefined);
		const incomingAnonymous = turns.filter(turn => turn.request.id === undefined);
		for (const turn of incomingAnonymous) {
			const matches = previousAnonymous.filter(previous => equals(turn.request, previous.request));
			// Reuse a local ID only when the request matches uniquely in both histories.
			if (matches.length === 1 && !incomingAnonymous.some(other => other !== turn && equals(other.request, turn.request))) {
				turn.id = matches[0].id;
			}
		}
		const previousTurns = new Map(restoredTurns.map(turn => [turn.id, turn]));
		const incomingIds = new Set(turns.map(turn => turn.id));
		for (const request of requests) {
			if (!previousTurns.has(request.id)) {
				this._localRequestIds.add(request.id);
			}
		}

		// Only model mutations are budgeted; diffing the histories above runs in one go.
		// A live refresh runs in its own task, while a buffered refresh continues the replay's slice.
		if (this._state === RestoreState.Published) {
			this._budget.startSlice();
		}
		for (const request of [...requests]) {
			if (previousTurns.has(request.id) && !incomingIds.has(request.id) && !this._localRequestIds.has(request.id)) {
				yield;
				this._model.removeRequest(request.id);
			}
		}
		this._lastRequest = undefined;
		this._lastResponseCompletedAt = undefined;
		const requestsById = new Map(this._model.getRequests().map(request => [request.id, request]));
		// The user may remove requests while the refresh waits for a slice. A request
		// removed that way is treated as if it had been removed before the refresh.
		const isInModel = (request: ChatRequestModel) => this._model.getRequests().includes(request);
		for (const [turnIndex, turn] of turns.entries()) {
			if (turn.id !== undefined && this._localRequestIds.has(turn.id)) {
				continue;
			}
			const existing = turn.id === undefined ? undefined : requestsById.get(turn.id);
			// An unchanged turn may be absent because the user removed it locally.
			const previous = previousTurns.get(turn.id);
			if (equals(turn.items, previous?.items)) {
				continue;
			}
			if (this._session.preserveHistoryItemIdentity && previous && equals(getChatSessionHistoryContent(turn.items), getChatSessionHistoryContent(previous.items))) {
				if (existing) {
					if (existing.modelId !== turn.request.modelId) {
						yield;
						if (isInModel(existing)) {
							this._model.updateRequestModelId(existing, turn.request.modelId);
						}
					}
					const responses = turn.items.filter(item => item.type === 'response');
					const details = responses.findLast(item => item.details || item.errorDetails)?.details;
					const metadata = responses.flatMap(item => item.parts).filter(part => part.kind === 'usage' || part.kind === 'autoModeResolution');
					if (existing.response) {
						yield;
						if (isInModel(existing)) {
							existing.response.updateHistoryMetadata(details, metadata);
						}
					}
				}
				continue;
			}
			const getInsertion = (): IHistoryRequestInsertion => {
				const currentRequests = this._model.getRequests();
				const existingIndex = existing ? currentRequests.indexOf(existing) : -1;
				if (existingIndex !== -1) {
					return { index: existingIndex, replace: true };
				}
				for (const following of turns.slice(turnIndex + 1)) {
					const nextRequest = following.id === undefined ? undefined : requestsById.get(following.id);
					const nextIndex = nextRequest ? currentRequests.indexOf(nextRequest) : -1;
					if (nextIndex !== -1) {
						return { index: nextIndex };
					}
				}
				return { index: currentRequests.length };
			};
			const [request] = yield* this._applyHistorySteps(turn.items, getInsertion, turn.id);
			turn.id = request.id;
			requestsById.set(request.id, request);
		}
		yield* this._completeLastResponseSteps();
		this._restoredTurns = turns;
		this._restoredHistory = history;
	}

	/**
	 * Applies history items to the model, pausing before each model mutation.
	 * @param getInsertion Resolves where requests are inserted, after the pause before adding them.
	 * @returns The added requests.
	 */
	private *_applyHistorySteps(history: readonly IChatSessionHistoryItem[], getInsertion?: () => IHistoryRequestInsertion, requestId?: string): Generator<void, ChatRequestModel[]> {
		const added: ChatRequestModel[] = [];
		for (const item of history) {
			if (item.type === 'request') {
				yield;
				added.push(this._addHistoryRequest(item, getInsertion?.(), requestId));
				continue;
			}
			for (const part of item.parts) {
				yield;
				if (this._lastRequest) {
					this._model.acceptResponseProgress(this._lastRequest, part, false, true /* restored */);
				}
			}
			if (item.parts.length === 0 && (item.details || item.errorDetails || typeof item.elapsedMs === 'number')) {
				yield;
			}
			this._finishHistoryResponse(item);
		}
		return added;
	}

	private _addHistoryRequest(item: IChatSessionRequestHistoryItem, insertion: IHistoryRequestInsertion | undefined, requestId: string | undefined): ChatRequestModel {
		if (this._lastRequest) {
			this._completeLastResponse();
		}
		const agent = item.participant
			? this._chatAgentService.getAgent(item.participant) // TODO(jospicer): Remove and always hardcode?
			: this._chatAgentService.getAgent(this._options.chatSessionType);
		const requestText = item.prompt;
		const parsedRequest = this._options.parsePrompt(requestText, agent);
		const modeInfo = item.modeInstructions ? {
			kind: ChatModeKind.Agent,
			isBuiltin: item.modeInstructions.isBuiltin ?? false,
			modeInstructions: item.modeInstructions,
			telemetryModeId: 'custom',
			applyCodeBlockSuggestionId: undefined,
		} satisfies IChatRequestModeInfo : undefined;
		this._lastRequest = this._model.addRequest(parsedRequest,
			item.variableData ?? { variables: [] },
			0, // attempt
			modeInfo,
			agent,
			undefined, // slashCommand
			undefined, // confirmation
			undefined, // locationData
			undefined, // attachments
			false, // Do not treat as requests completed, else edit pills won't show.
			item.modelId,
			undefined,
			item.id ?? requestId,
			item.isSystemInitiated,
			item.systemInitiatedLabel,
			undefined, // terminalExecutionId
			item.isTerminalRequest,
			item.timestamp ?? null,
			item.isHidden,
			item.origin,
			item.isRequestHidden,
			getRestoredChatRequestSource(item, requestText),
			item.modelConfiguration,
			item.metadata,
			insertion,
			item.artifactRequest,
		);
		return this._lastRequest;
	}

	private _finishHistoryResponse(item: IChatSessionResponseHistoryItem): void {
		if (!this._lastRequest) {
			return;
		}
		const response = this._lastRequest.response;
		if (response && (item.details || item.errorDetails)) {
			response.setResult({
				...(item.details ? { details: item.details } : {}),
				...(item.errorDetails ? { errorDetails: item.errorDetails } : {}),
			});
		}
		if (response && typeof item.elapsedMs === 'number') {
			response.setElapsedMs(item.elapsedMs);
		}
		this._lastResponseCompletedAt = item.completedAt;
	}

	private *_completeLastResponseSteps(): Generator<void, void> {
		if (this._model.lastRequest?.response?.isIncomplete.get()) {
			yield;
		}
		this._completeLastResponse();
	}

	/**
	 * Completes the last applied response at the time the history recorded, or
	 * without a timestamp when the history has none.
	 */
	private _completeLastResponse(): void {
		if (Number.isFinite(this._lastResponseCompletedAt)) {
			this._lastRequest?.response?.complete(this._lastResponseCompletedAt);
		} else {
			this._lastRequest?.response?.completeWithoutTimestamp();
		}
		this._lastResponseCompletedAt = undefined;
	}

	private _onDidStartServerRequest(request: IChatSessionServerRequest): void {
		if (!this._serverRequestHandler) {
			this._serverRequestsBeforeHandler.push(request);
			return;
		}
		this._unappliedServerRequests++;
		if (this._activeRefresh || this._pendingHistory) {
			// The request continues the refreshed history, so apply the history first.
			this._serverRequestsAfterRefresh.push(request);
			this._refreshHistory(true).catch(error => {
				if (!isCancellationError(error)) {
					this._logService.error(`RemoteChatSessionRestorer: failed to refresh history before server request for ${this._model.sessionResource.toString()}`, error);
				}
			});
		} else {
			this._applyServerRequest(request);
		}
	}

	private _applyServerRequestsAfterRefresh(): void {
		for (let request = this._serverRequestsAfterRefresh.shift(); request; request = this._serverRequestsAfterRefresh.shift()) {
			this._applyServerRequest(request);
		}
	}

	private _applyServerRequest(request: IChatSessionServerRequest): void {
		try {
			if (this._state !== RestoreState.Disposed) {
				this._serverRequestHandler?.handleRequest(request);
			}
		} catch (error) {
			if (!isCancellationError(error)) {
				this._logService.error(`RemoteChatSessionRestorer: failed to start server request for ${this._model.sessionResource.toString()}`, error);
			}
		} finally {
			this._unappliedServerRequests--;
		}
		if (this._unappliedServerRequests === 0) {
			this._serverRequestHandler?.handleRequestsApplied();
		}
	}

	private _mark(name: string): void {
		if (this._options.trace) {
			const markName = `code/cloudSandbox/${this._options.trace.id}/${name}`;
			mark(markName);
			this._marks.add(markName);
		}
	}
}

/**
 * Bounds how long model mutations run before yielding to the host. A slice ends
 * after {@link maxSliceMs}; the next slice starts in a new macrotask, so progress
 * never depends on the host becoming idle.
 */
class CooperativeMutationBudget {

	private _sliceStart: number;
	private _yieldCount = 0;

	constructor(
		private readonly _scheduler: IRemoteChatHistoryScheduler,
		private readonly _token: CancellationToken,
		private readonly _isDisposed: () => boolean,
	) {
		this._sliceStart = _scheduler.now();
	}

	get yieldCount(): number {
		return this._yieldCount;
	}

	now(): number {
		return this._scheduler.now();
	}

	throwIfCancelled(): void {
		if (this._token.isCancellationRequested || this._isDisposed()) {
			throw new CancellationError();
		}
	}

	/** Starts a new slice in the current task. */
	startSlice(): void {
		this._sliceStart = this._scheduler.now();
	}

	/**
	 * Runs `steps` to completion. Each value the generator yields announces a
	 * model mutation; when the slice is spent at that point, the remaining steps
	 * run in later slices. Returns the result synchronously when every mutation
	 * fits into the current slice.
	 */
	run<T>(steps: Generator<void, T>): T | Promise<T> {
		let step = steps.next();
		while (!step.done) {
			if (!this._hasBudget()) {
				return this._runInNextSlice(steps);
			}
			step = steps.next();
		}
		return step.value;
	}

	/** Resolves in a new task, which starts a new slice. */
	async waitForNewTask(): Promise<void> {
		await this._wait<void>(resolve => this._scheduler.runInNewTask(() => resolve()));
		this.startSlice();
	}

	private _hasBudget(): boolean {
		return this._scheduler.now() - this._sliceStart < maxSliceMs;
	}

	private async _runInNextSlice<T>(steps: Generator<void, T>): Promise<T> {
		this._yieldCount++;
		await this._wait<void>(resolve => this._scheduler.runInNewTask(() => resolve()));
		this._sliceStart = this._scheduler.now();
		return this.run(steps);
	}

	private async _wait<T>(schedule: (resolve: (value: T) => void) => IDisposable): Promise<T> {
		const value = await new Promise<T>((resolve, reject) => {
			const store = new DisposableStore();
			store.add(this._token.onCancellationRequested(() => {
				store.dispose();
				reject(new CancellationError());
			}));
			const scheduled = schedule(value => {
				store.dispose();
				resolve(value);
			});
			if (store.isDisposed) {
				scheduled.dispose();
			} else {
				store.add(scheduled);
			}
		});
		if (this._isDisposed()) {
			throw new CancellationError();
		}
		return value;
	}
}

function groupHistoryTurns(history: readonly IChatSessionHistoryItem[]): IHistoryTurn[] {
	const turns: IHistoryTurn[] = [];
	for (const item of history) {
		if (item.type === 'request') {
			turns.push({ request: item, items: [item], id: item.id });
		} else {
			turns.at(-1)?.items.push(item);
		}
	}
	return turns;
}

function runToCompletion<T>(steps: Generator<void, T>): T {
	let step = steps.next();
	while (!step.done) {
		step = steps.next();
	}
	return step.value;
}
