/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, Limiter, raceCancellation } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IChatMessage, ILanguageModelChatRequestOptions, ILanguageModelChatResponse, ILanguageModelsService, isLanguageModelRateLimitError } from './languageModels.js';

export const IChatUtilityModelService = createDecorator<IChatUtilityModelService>('chatUtilityModelService');

/** Names the feature making a utility model request, so model traffic can be attributed in the logs. */
export type ChatUtilityModelPurpose =
	| 'thinkingTitle'
	| 'goalSummary'
	| 'toolRiskAssessment'
	| 'editExplanation'
	| 'dictationCleanup'
	| 'issueTitle';

/**
 * - `interactive`: someone is waiting for the result. The request is sent immediately and
 *   cancelled as soon as every caller waiting on it has cancelled.
 * - `background`: nobody is waiting. The request is queued behind a small concurrency limit
 *   and dropped if every caller cancels before it starts. Once started it runs to completion,
 *   even if its callers cancel, so its result can still be cached.
 */
export type ChatUtilityModelPriority = 'interactive' | 'background';

export interface IChatUtilityModelRequest {
	readonly purpose: ChatUtilityModelPurpose;
	readonly priority: ChatUtilityModelPriority;
	readonly messages: IChatMessage[];
	/** Copilot model ids to try in order; the first one available is used. Defaults to `copilot-utility-small`. */
	readonly models?: readonly string[];
	/** Request options, or a function returning them for the model id that was selected. */
	readonly options?: ILanguageModelChatRequestOptions | ((model: string) => ILanguageModelChatRequestOptions);
	/** Requests with the same key share one model request while it is pending. */
	readonly key?: string;
	/** Cancels the model request if no response completes within this many milliseconds of sending it. */
	readonly timeout?: number;
}

export type ChatUtilityModelFailure =
	/** No requested model is available, e.g. the user is signed out. */
	| 'noModel'
	/** The provider is rate limiting the model, or a previous rate limit has not expired yet. */
	| 'rateLimited'
	| 'cancelled'
	| 'timeout'
	| 'error';

export type ChatUtilityModelResult =
	| { readonly kind: 'success'; readonly text: string; readonly model: string }
	| {
		readonly kind: 'failed';
		readonly reason: ChatUtilityModelFailure;
		/** The model id that was selected, when selection succeeded. */
		readonly model?: string;
		/** For `rateLimited`: how many milliseconds remain until requests to the model are sent again. */
		readonly retryAfter?: number;
		readonly error?: unknown;
	};

/**
 * Sends the small, non-conversational model requests that workbench features make on their
 * own, like titles, summaries, and risk assessments, so they share one policy: bounded
 * concurrency for background work, sharing of identical pending requests, and backing off
 * when the provider rate limits a model. Every request is logged with the feature making it.
 */
export interface IChatUtilityModelService {
	readonly _serviceBrand: undefined;

	/** Sends `request`. Never rejects; failures are reported in the result. */
	sendRequest(request: IChatUtilityModelRequest, token: CancellationToken): Promise<ChatUtilityModelResult>;
}

const DEFAULT_MODELS: readonly string[] = ['copilot-utility-small'];
const MAX_CONCURRENT_BACKGROUND_REQUESTS = 3;
/** Wait applied to the first rate limit that carries no retry guidance; doubles for each consecutive one. */
const INITIAL_RATE_LIMIT_BACKOFF_MS = 60_000;
/** Caps every rate limit wait, including the provider's, so a bogus value cannot disable a feature indefinitely. */
const MAX_RATE_LIMIT_BACKOFF_MS = 15 * 60_000;

const CANCELLED: ChatUtilityModelResult = { kind: 'failed', reason: 'cancelled' };

/**
 * Private model option naming the {@link ChatUtilityModelPurpose} of a request, so the Copilot
 * provider can attribute it in its logs and telemetry. Keep in sync with
 * `ExtensionLanguageModelRequestOptions._requestPurpose` in the Copilot extension.
 */
const REQUEST_PURPOSE_MODEL_OPTION = '_requestPurpose';

interface IPendingRequest {
	readonly request: IChatUtilityModelRequest;
	readonly result: DeferredPromise<ChatUtilityModelResult>;
	/** Cancels the model request itself. */
	readonly cancellation: CancellationTokenSource;
	readonly callerListeners: DisposableStore;
	readonly createdAt: number;
	waitingCallers: number;
	started: boolean;
	/** The model id that was selected, once selection succeeded. */
	model?: string;
}

interface IRateLimitState {
	until: number;
	consecutive: number;
}

export class ChatUtilityModelService extends Disposable implements IChatUtilityModelService {
	declare readonly _serviceBrand: undefined;

	private readonly _backgroundLimiter = this._register(new Limiter<void>(MAX_CONCURRENT_BACKGROUND_REQUESTS));
	private readonly _pending = new Set<IPendingRequest>();
	private readonly _pendingByKey = new Map<string, IPendingRequest>();
	private readonly _rateLimits = new Map<string, IRateLimitState>();

	constructor(
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	sendRequest(request: IChatUtilityModelRequest, token: CancellationToken): Promise<ChatUtilityModelResult> {
		if (this._store.isDisposed || token.isCancellationRequested) {
			return Promise.resolve(CANCELLED);
		}

		const pending = (request.key !== undefined ? this._pendingByKey.get(request.key) : undefined) ?? this._start(request);
		pending.waitingCallers++;
		pending.callerListeners.add(token.onCancellationRequested(() => this._onCallerCancelled(pending)));

		if (pending.request.priority === 'background') {
			return pending.result.p;
		}
		return raceCancellation(pending.result.p, token).then(result => result ?? { kind: 'failed', reason: 'cancelled', model: pending.model });
	}

	private _start(request: IChatUtilityModelRequest): IPendingRequest {
		const pending: IPendingRequest = {
			request,
			result: new DeferredPromise(),
			cancellation: new CancellationTokenSource(),
			callerListeners: new DisposableStore(),
			createdAt: Date.now(),
			waitingCallers: 0,
			started: false,
		};
		this._pending.add(pending);
		if (request.key !== undefined) {
			this._pendingByKey.set(request.key, pending);
		}

		const run = async () => this._settle(pending, await this._run(pending));
		if (request.priority === 'background') {
			this._backgroundLimiter.queue(run);
		} else {
			run();
		}
		return pending;
	}

	private _onCallerCancelled(pending: IPendingRequest): void {
		if (--pending.waitingCallers > 0) {
			return;
		}
		if (!pending.started) {
			this._log(pending, 'dropped', { level: 'debug' });
			this._settle(pending, CANCELLED);
		} else if (pending.request.priority === 'interactive') {
			pending.cancellation.cancel();
		}
	}

	private async _run(pending: IPendingRequest): Promise<ChatUtilityModelResult> {
		if (pending.result.isSettled) {
			return CANCELLED;
		}
		pending.started = true;
		const { request } = pending;
		const token = pending.cancellation.token;

		let model: string | undefined;
		let identifier: string | undefined;
		let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
		let timedOut = false;
		try {
			const selected = await this._selectModel(request.models ?? DEFAULT_MODELS, token);
			if (token.isCancellationRequested) {
				return this._cancelledOrTimedOut(pending, undefined, false);
			}
			if (!selected) {
				this._log(pending, 'noModel', { level: 'debug' });
				return { kind: 'failed', reason: 'noModel' };
			}
			({ model, identifier } = selected);
			pending.model = model;

			const rateLimitedFor = this._remainingRateLimit(identifier);
			if (rateLimitedFor > 0) {
				this._log(pending, 'skippedRateLimited', { level: 'debug', model, retryAfter: rateLimitedFor });
				return { kind: 'failed', reason: 'rateLimited', model, retryAfter: rateLimitedFor };
			}

			if (request.timeout !== undefined) {
				timeoutHandle = setTimeout(() => {
					timedOut = true;
					pending.cancellation.cancel();
				}, request.timeout);
			}
			const sentAt = Date.now();
			const options = typeof request.options === 'function' ? request.options(model) : request.options ?? {};
			const requestOptions = { ...options, modelOptions: { ...options.modelOptions, [REQUEST_PURPOSE_MODEL_OPTION]: request.purpose } };
			const response = await raceCancellation(this._languageModelsService.sendChatRequest(identifier, undefined, request.messages, requestOptions, token), token);
			const collected = response && await raceCancellation(collectText(response, sentAt), token);
			if (collected === undefined || token.isCancellationRequested) {
				return this._cancelledOrTimedOut(pending, model, timedOut);
			}

			this._clearRateLimit(identifier);
			this._log(pending, 'success', { model, elapsed: Date.now() - sentAt, firstText: collected.firstText });
			return { kind: 'success', text: collected.text, model };
		} catch (error) {
			if (identifier !== undefined && isLanguageModelRateLimitError(error)) {
				const retryAfter = this._recordRateLimit(identifier, error.retryAfter);
				this._log(pending, 'rateLimited', { model, retryAfter });
				return { kind: 'failed', reason: 'rateLimited', model, retryAfter, error };
			}
			if (token.isCancellationRequested) {
				return this._cancelledOrTimedOut(pending, model, timedOut);
			}
			this._log(pending, 'error', { model, error });
			return { kind: 'failed', reason: 'error', model, error };
		} finally {
			clearTimeout(timeoutHandle);
		}
	}

	private async _selectModel(models: readonly string[], token: CancellationToken): Promise<{ model: string; identifier: string } | undefined> {
		for (const model of models) {
			const identifiers = await raceCancellation(this._languageModelsService.selectLanguageModels({ vendor: 'copilot', id: model }), token, []);
			if (identifiers.length) {
				return { model, identifier: identifiers[0] };
			}
			if (token.isCancellationRequested) {
				return undefined;
			}
		}
		return undefined;
	}

	private _cancelledOrTimedOut(pending: IPendingRequest, model: string | undefined, timedOut: boolean): ChatUtilityModelResult {
		const reason = timedOut ? 'timeout' : 'cancelled';
		this._log(pending, reason, { level: timedOut ? 'info' : 'debug', model });
		return { kind: 'failed', reason, model };
	}

	private _remainingRateLimit(identifier: string): number {
		return Math.max(0, (this._rateLimits.get(identifier)?.until ?? 0) - Date.now());
	}

	/** @returns how long requests to the model are now held back, in milliseconds. */
	private _recordRateLimit(identifier: string, retryAfter: number | undefined): number {
		const now = Date.now();
		const state = this._rateLimits.get(identifier) ?? { until: 0, consecutive: 0 };
		state.consecutive++;
		const wait = Math.min(retryAfter ?? INITIAL_RATE_LIMIT_BACKOFF_MS * Math.pow(2, state.consecutive - 1), MAX_RATE_LIMIT_BACKOFF_MS);
		state.until = Math.max(state.until, now + wait);
		this._rateLimits.set(identifier, state);
		return state.until - now;
	}

	private _clearRateLimit(identifier: string): void {
		// A response that was already in flight when another request got rate limited must not
		// lift that newer limit, or later requests would reach the provider while it asked us to wait.
		if (this._remainingRateLimit(identifier) === 0) {
			this._rateLimits.delete(identifier);
		}
	}

	private _settle(pending: IPendingRequest, result: ChatUtilityModelResult): void {
		const { key } = pending.request;
		if (key !== undefined && this._pendingByKey.get(key) === pending) {
			this._pendingByKey.delete(key);
		}
		this._pending.delete(pending);
		pending.callerListeners.dispose();
		pending.cancellation.dispose();
		pending.result.complete(result);
	}

	private _log(pending: IPendingRequest, outcome: string, details: { level?: 'debug' | 'info'; model?: string; elapsed?: number; firstText?: number; retryAfter?: number; error?: unknown }): void {
		const { purpose, priority } = pending.request;
		const parts = [`purpose=${purpose}`, `priority=${priority}`, `outcome=${outcome}`];
		if (details.model) {
			parts.push(`model=${details.model}`);
		}
		if (details.elapsed !== undefined) {
			parts.push(`elapsedMs=${details.elapsed}`);
		}
		if (details.firstText !== undefined) {
			parts.push(`firstTextMs=${details.firstText}`);
		}
		if (details.retryAfter !== undefined) {
			parts.push(`retryAfterMs=${details.retryAfter}`);
		}
		parts.push(`totalMs=${Date.now() - pending.createdAt}`);
		const message = `[ChatUtilityModel] ${parts.join(' ')}`;
		if (details.error !== undefined) {
			this._logService.info(message, details.error);
		} else if (details.level === 'debug') {
			this._logService.debug(message);
		} else {
			this._logService.info(message);
		}
	}

	override dispose(): void {
		for (const pending of [...this._pending]) {
			pending.cancellation.cancel();
			this._settle(pending, CANCELLED);
		}
		super.dispose();
	}
}

/** Reads the whole text of a response, and how many milliseconds after `sentAt` its first text arrived. */
async function collectText(response: ILanguageModelChatResponse, sentAt: number): Promise<{ text: string; firstText: number | undefined }> {
	let text = '';
	let firstText: number | undefined;
	for await (const part of response.stream) {
		for (const item of Array.isArray(part) ? part : [part]) {
			if (item.type === 'text') {
				firstText ??= Date.now() - sentAt;
				text += item.value;
			}
		}
	}
	await response.result;
	return { text, firstText };
}
