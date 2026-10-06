/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, Limiter, raceCancellation } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IChatMessage, ILanguageModelChatRequestOptions, ILanguageModelChatResponse, ILanguageModelsService } from './languageModels.js';

export const IChatUtilityModelService = createDecorator<IChatUtilityModelService>('chatUtilityModelService');

/** The core feature making a utility model request, used to attribute it in logs and telemetry. */
export type ChatUtilityModelPurpose = 'thinkingTitle' | 'goalSummary' | 'toolRiskAssessment' | 'editExplanation' | 'dictationCleanup' | 'issueTitle';

export interface IChatUtilityModelRequest {
	readonly purpose: ChatUtilityModelPurpose;
	/** A model identifier from {@link ILanguageModelsService.selectLanguageModels}. */
	readonly model: string;
	readonly messages: IChatMessage[];
	readonly options?: ILanguageModelChatRequestOptions;
	/** Queued behind a concurrency limit; once started it finishes even if all callers cancel, so its result can be cached. */
	readonly background?: boolean;
	/** Requests with the same key share one pending request. */
	readonly key?: string;
}

/** Sends core utility model requests with shared concurrency, de-duplication, rate-limit backoff, and per-feature logging. */
export interface IChatUtilityModelService {
	readonly _serviceBrand: undefined;

	/** Resolves to the response text, or `undefined` if cancelled or timed out. Rejects on failure, including while rate limited. */
	sendRequest(request: IChatUtilityModelRequest, token: CancellationToken): Promise<string | undefined>;
}

const MAX_CONCURRENT_BACKGROUND_REQUESTS = 3;
const BACKGROUND_REQUEST_TIMEOUT_MS = 5000;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 60_000;
const MAX_RATE_LIMIT_BACKOFF_MS = 15 * 60_000;

interface IPendingRequest {
	readonly request: IChatUtilityModelRequest;
	readonly result: DeferredPromise<string | undefined>;
	readonly cancellation: CancellationTokenSource;
	readonly callerListeners: DisposableStore;
	waitingCallers: number;
	started: boolean;
}

export class ChatUtilityModelService extends Disposable implements IChatUtilityModelService {
	declare readonly _serviceBrand: undefined;

	private readonly _backgroundLimiter = this._register(new Limiter<void>(MAX_CONCURRENT_BACKGROUND_REQUESTS));
	private readonly _pending = new Set<IPendingRequest>();
	private readonly _rateLimitedUntil = new Map<string, number>();

	constructor(
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	sendRequest(request: IChatUtilityModelRequest, token: CancellationToken): Promise<string | undefined> {
		if (this._store.isDisposed || token.isCancellationRequested) {
			return Promise.resolve(undefined);
		}
		const pending = (request.key !== undefined ? Iterable.find(this._pending, p => p.request.key === request.key) : undefined) ?? this._start(request);
		pending.waitingCallers++;
		pending.callerListeners.add(token.onCancellationRequested(() => this._onCallerCancelled(pending)));
		return pending.request.background ? pending.result.p : raceCancellation(pending.result.p, token);
	}

	private _start(request: IChatUtilityModelRequest): IPendingRequest {
		const pending: IPendingRequest = { request, result: new DeferredPromise(), cancellation: new CancellationTokenSource(), callerListeners: new DisposableStore(), waitingCallers: 0, started: false };
		this._pending.add(pending);
		const run = () => this._run(pending).then(text => this._settle(pending, text), error => this._settle(pending, undefined, error));
		if (request.background) {
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
			this._log(pending.request, 'dropped');
			this._settle(pending, undefined);
		} else if (!pending.request.background) {
			pending.cancellation.cancel();
		}
	}

	private async _run(pending: IPendingRequest): Promise<string | undefined> {
		if (pending.result.isSettled) {
			return undefined;
		}
		pending.started = true;
		const { request } = pending;
		const rateLimitedFor = (this._rateLimitedUntil.get(request.model) ?? 0) - Date.now();
		if (rateLimitedFor > 0) {
			this._log(request, 'skipped', ` retryAfterMs=${rateLimitedFor}`);
			throw new Error(`Requests to ${request.model} are rate limited for another ${rateLimitedFor}ms`);
		}

		const token = pending.cancellation.token;
		const timeout = request.background ? setTimeout(() => pending.cancellation.cancel(), BACKGROUND_REQUEST_TIMEOUT_MS) : undefined;
		const sentAt = Date.now();
		try {
			const options = { ...request.options, modelOptions: { ...request.options?.modelOptions, _requestPurpose: request.purpose } };
			const response = await raceCancellation(this._languageModelsService.sendChatRequest(request.model, undefined, request.messages, options, token), token);
			const text = response && await raceCancellation(collectText(response), token);
			this._log(request, text === undefined ? 'cancelled' : 'success', ` elapsedMs=${Date.now() - sentAt}`);
			return text;
		} catch (error) {
			if (isRateLimitError(error)) {
				const until = Date.now() + Math.min(error.retryAfter ?? DEFAULT_RATE_LIMIT_BACKOFF_MS, MAX_RATE_LIMIT_BACKOFF_MS);
				this._rateLimitedUntil.set(request.model, Math.max(until, this._rateLimitedUntil.get(request.model) ?? 0));
			}
			this._log(request, isRateLimitError(error) ? 'rateLimited' : 'error', ` elapsedMs=${Date.now() - sentAt}`, error);
			throw error;
		} finally {
			clearTimeout(timeout);
		}
	}

	private _settle(pending: IPendingRequest, text: string | undefined, error?: unknown): void {
		this._pending.delete(pending);
		pending.callerListeners.dispose();
		pending.cancellation.dispose();
		if (error) {
			pending.result.error(error);
		} else {
			pending.result.complete(text);
		}
	}

	override dispose(): void {
		for (const pending of [...this._pending]) {
			pending.cancellation.cancel();
			this._settle(pending, undefined);
		}
		super.dispose();
	}

	private _log(request: IChatUtilityModelRequest, outcome: string, details = '', error?: unknown): void {
		const message = `[ChatUtilityModel] purpose=${request.purpose} background=${!!request.background} model=${request.model} outcome=${outcome}${details}`;
		if (outcome === 'dropped' || outcome === 'skipped' || outcome === 'cancelled') {
			this._logService.debug(message);
		} else if (error) {
			this._logService.info(message, error);
		} else {
			this._logService.info(message);
		}
	}
}

/** Matches `vscode.LanguageModelError.RateLimited` after it crosses from the extension host. */
function isRateLimitError(error: unknown): error is Error & { retryAfter?: number } {
	return error instanceof Error && error.name === 'LanguageModelError' && (error as { code?: unknown }).code === 'RateLimited';
}

async function collectText(response: ILanguageModelChatResponse): Promise<string> {
	let text = '';
	for await (const part of response.stream) {
		for (const item of Array.isArray(part) ? part : [part]) {
			if (item.type === 'text') {
				text += item.value;
			}
		}
	}
	await response.result;
	return text;
}
