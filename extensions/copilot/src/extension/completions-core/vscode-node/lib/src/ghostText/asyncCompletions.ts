/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createServiceIdentifier } from '../../../../../../util/common/services';
import { CancellationTokenSource } from '../../../types/src';
import { ICompletionsFeaturesService } from '../experiments/featuresService';
import { LRUCacheMap } from '../helpers/cache';
import { ICompletionsLogTargetService, Logger } from '../logger';
import { APIChoice } from '../openai/openai';
import { Prompt } from '../prompt/prompt';
import { TelemetryWithExp } from '../telemetry';
import { Deferred } from '../util/async';
import { ReplaySubject } from '../util/subject';
import { GetNetworkCompletionsType } from './completionsFromNetwork';

enum AsyncCompletionRequestState {
	Completed,
	Error,
	Pending,
}

interface BaseAsyncCompletionRequest {
	cancellationTokenSource: CancellationTokenSource;
	headerRequestId: string;
	partialCompletionText?: string;
	prefix: string;
	prompt: Prompt;
	subject: ReplaySubject<AsyncCompletionRequest>;
}

interface PendingAsyncCompletionRequest extends BaseAsyncCompletionRequest {
	state: AsyncCompletionRequestState.Pending;
}

interface CompletedAsyncCompletionRequest extends BaseAsyncCompletionRequest {
	state: AsyncCompletionRequestState.Completed;
	choice: APIChoice;
	result: GetNetworkCompletionsType;
	allChoicesPromise: Promise<void>;
}

type AsyncCompletionRequest = PendingAsyncCompletionRequest | CompletedAsyncCompletionRequest;

export const ICompletionsAsyncManagerService = createServiceIdentifier<ICompletionsAsyncManagerService>('ICompletionsAsyncManagerService');
export interface ICompletionsAsyncManagerService {
	readonly _serviceBrand: undefined;
	clear(): void;
	shouldWaitForAsyncCompletions(prefix: string, prompt: Prompt): boolean;
	updateCompletion(headerRequestId: string, text: string): void;
	queueCompletionRequest(
		headerRequestId: string,
		prefix: string,
		prompt: Prompt,
		cancellationTokenSource: CancellationTokenSource,
		resultPromise: Promise<GetNetworkCompletionsType>
	): Promise<void>;
	getFirstMatchingRequestWithTimeout(
		headerRequestId: string,
		prefix: string,
		prompt: Prompt,
		isSpeculative: boolean,
		telemetryWithExp: TelemetryWithExp
	): Promise<[APIChoice, Promise<void>] | undefined>;
	getFirstMatchingRequest(
		headerRequestId: string,
		prefix: string,
		prompt: Prompt,
		isSpeculative: boolean
	): Promise<[APIChoice, Promise<void>] | undefined>;
}

export class AsyncCompletionManager implements ICompletionsAsyncManagerService {
	declare _serviceBrand: undefined;

	#logger = new Logger('AsyncCompletionManager');

	/** Mapping of headerRequestId to completion request */
	private readonly requests = new LRUCacheMap<string, AsyncCompletionRequest>(100);

	/** The most recently requested (either via getFirstMatchingRequest or
	 * getFirstMatchingRequestWithTimeout) header request ID. Serves as a lock
	 * for cancellation. Since we only want to cancel requests that don't match
	 * the most recent request prefix. */
	private mostRecentRequestId = '';

	constructor(
		@ICompletionsFeaturesService private readonly featuresService: ICompletionsFeaturesService,
		@ICompletionsLogTargetService private readonly logTarget: ICompletionsLogTargetService,
	) { }

	clear() {
		this.requests.clear();
	}

	/**
	 * Check if there are any candidate completions for the current position.
	 * We need to strike the right balance between queuing completions as the
	 * user types, without queuing one per keystroke. This method should return
	 * true if we don't have any completions that match the current position.
	 * This method should return false if we have reasonable candidates that
	 * match the current position.
	 */
	shouldWaitForAsyncCompletions(prefix: string, prompt: Prompt): boolean {
		// TODO: Consider adding a minimum threshold for candidate completions,
		// where we will queue more if the user's typing seems to be diverging
		// from current speculation.
		for (const [_, request] of this.requests) {
			if (isCandidate(prefix, prompt, request)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Called from a FinishedCallback to report partial results as a completion
	 * is streamed back from the server.
	 */
	updateCompletion(headerRequestId: string, text: string) {
		const request = this.requests.get(headerRequestId);
		if (request === undefined) { return; }
		request.partialCompletionText = text;
		request.subject.next(request);
	}

	/**
	 * Adds an in-flight completion request to the requests map for tracking.
	 * Once the request is completed it is removed from the requests map.
	 */
	queueCompletionRequest(
		headerRequestId: string,
		prefix: string,
		prompt: Prompt,
		cancellationTokenSource: CancellationTokenSource,
		resultPromise: Promise<GetNetworkCompletionsType>
	) {
		this.#logger.debug(this.logTarget,
			`[${headerRequestId}] Queueing async completion request:`,
			prefix.substring(prefix.lastIndexOf('\n') + 1)
		);
		const subject = new ReplaySubject<AsyncCompletionRequest>();
		this.requests.set(headerRequestId, {
			state: AsyncCompletionRequestState.Pending,
			cancellationTokenSource,
			headerRequestId,
			prefix,
			prompt,
			subject,
		});
		return resultPromise
			.then(result => {
				this.requests.delete(headerRequestId);
				if (result.type !== 'success') {
					this.#logger.debug(this.logTarget, `[${headerRequestId}] Request failed with`, result.reason);
					subject.error(result.reason);
					return;
				}
				const completed: CompletedAsyncCompletionRequest = {
					cancellationTokenSource,
					headerRequestId,
					prefix,
					prompt,
					subject,
					choice: result.value[0],
					result,
					state: AsyncCompletionRequestState.Completed,
					allChoicesPromise: result.value[1],
				};
				this.requests.set(headerRequestId, completed);
				subject.next(completed);
				subject.complete();
			})
			.catch((e: unknown) => {
				this.#logger.error(this.logTarget, `[${headerRequestId}] Request errored with`, e);
				this.requests.delete(headerRequestId);
				subject.error(e);
			});
	}

	/** Returns the first matching completion or times out. */
	getFirstMatchingRequestWithTimeout(
		headerRequestId: string,
		prefix: string,
		prompt: Prompt,
		isSpeculative: boolean,
		telemetryWithExp: TelemetryWithExp
	): Promise<[APIChoice, Promise<void>] | undefined> {
		const timeout = this.featuresService.asyncCompletionsTimeout(telemetryWithExp);
		if (timeout < 0) {
			this.#logger.debug(this.logTarget, `[${headerRequestId}] Waiting for completions without timeout`);
			return this.getFirstMatchingRequest(headerRequestId, prefix, prompt, isSpeculative);
		}
		this.#logger.debug(this.logTarget, `[${headerRequestId}] Waiting for completions with timeout of ${timeout}ms`);
		return Promise.race([
			this.getFirstMatchingRequest(headerRequestId, prefix, prompt, isSpeculative),
			new Promise<null>(r => setTimeout(() => r(null), timeout)),
		]).then(result => {
			if (result === null) {
				this.#logger.debug(this.logTarget, `[${headerRequestId}] Timed out waiting for completion`);
				return undefined;
			}
			return result;
		});
	}

	/**
	 * Returns the first resolved matching completion request. Modifies the
	 * returned APIChoice to match the current prompt.
	 */
	async getFirstMatchingRequest(
		headerRequestId: string,
		prefix: string,
		prompt: Prompt,
		isSpeculative: boolean
	): Promise<[APIChoice, Promise<void>] | undefined> {
		if (!isSpeculative) { this.mostRecentRequestId = headerRequestId; }
		let resolved = false;
		const deferred = new Deferred<[APIChoice, Promise<void>] | undefined>();
		const subscriptions = new Map<string, () => void>();
		const finishRequest = (id: string) => () => {
			const subscription = subscriptions.get(id);
			if (subscription === undefined) { return; }
			subscription();
			subscriptions.delete(id);
			if (!resolved && subscriptions.size === 0) {
				// TODO: Check for new candidates before resolving.
				resolved = true;
				this.#logger.debug(this.logTarget, `[${headerRequestId}] No matching completions found`);
				deferred.resolve(undefined);
			}
		};
		const next = (request: AsyncCompletionRequest) => {
			if (isCandidate(prefix, prompt, request)) {
				if (request.state === AsyncCompletionRequestState.Completed) {
					const remainingPrefix = prefix.substring(request.prefix.length);
					let { completionText } = request.choice;
					if (
						!completionText.startsWith(remainingPrefix) ||
						completionText.length <= remainingPrefix.length
					) {
						finishRequest(request.headerRequestId)();
						return;
					}
					completionText = completionText.substring(remainingPrefix.length);
					request.choice.telemetryData.measurements.foundOffset = remainingPrefix.length;
					this.#logger.debug(this.logTarget,
						`[${headerRequestId}] Found completion at offset ${remainingPrefix.length}: ${JSON.stringify(completionText)}`
					);
					deferred.resolve([{ ...request.choice, completionText }, request.allChoicesPromise]);
					resolved = true;
				}
			} else {
				this.cancelRequest(headerRequestId, request);
				finishRequest(request.headerRequestId)();
			}
		};
		for (const [id, request] of this.requests) {
			if (isCandidate(prefix, prompt, request)) {
				subscriptions.set(
					id,
					request.subject.subscribe({
						next,
						error: finishRequest(id),
						complete: finishRequest(id),
					})
				);
			} else {
				this.cancelRequest(headerRequestId, request);
			}
		}
		return deferred.promise.finally(() => {
			for (const dispose of subscriptions.values()) {
				dispose();
			}
		});
	}

	/**
	 * Attempts to cancel a request if it is still pending and the request
	 * attempting the cancellation (that it no longer matches) is the most
	 * recent request.
	 *
	 * @param headerRequestId The request id for the call to
	 * getFirstMatchingRequest that the `request` no longer matches.
	 * @param request The request to cancel
	 */
	private cancelRequest(headerRequestId: string, request: AsyncCompletionRequest) {
		if (headerRequestId !== this.mostRecentRequestId) { return; }
		if (request.state === AsyncCompletionRequestState.Completed) { return; }
		this.#logger.debug(this.logTarget, `[${headerRequestId}] Cancelling request: ${request.headerRequestId}`);
		request.cancellationTokenSource.cancel();
		this.requests.delete(request.headerRequestId);
	}
}

function isCandidate(prefix: string, prompt: Prompt, request: AsyncCompletionRequest): boolean {
	if (request.prompt.suffix !== prompt.suffix) { return false; }
	if (!prefix.startsWith(request.prefix)) { return false; }
	const remainingPrefix = prefix.substring(request.prefix.length);
	if (request.state === AsyncCompletionRequestState.Completed) {
		return (
			request.choice.completionText.startsWith(remainingPrefix) &&
			request.choice.completionText.trimEnd().length > remainingPrefix.length
		);
	}
	if (request.partialCompletionText === undefined) { return true; }
	return request.partialCompletionText.startsWith(remainingPrefix);
}
