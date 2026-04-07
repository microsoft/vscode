/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Raw } from '@vscode/prompt-tsx';
import type { CancellationToken } from 'vscode';
import { AbstractChatMLFetcher } from '../../src/extension/prompt/node/chatMLFetcher';
import { IChatMLFetcher, IFetchMLOptions } from '../../src/platform/chat/common/chatMLFetcher';
import { ChatResponses } from '../../src/platform/chat/common/commonTypes';
import { IConversationOptions } from '../../src/platform/chat/common/conversationOptions';
import { roleToString } from '../../src/platform/chat/common/globalStringUtils';
import { FinishedCallback, ICopilotToolCall } from '../../src/platform/networking/common/fetch';
import { APIUsage } from '../../src/platform/networking/common/openai';
import { TaskQueue } from '../../src/util/common/async';
import { coalesce } from '../../src/util/vs/base/common/arrays';
import { isDisposable } from '../../src/util/vs/base/common/lifecycle';
import { StopWatch } from '../../src/util/vs/base/common/stopwatch';
import { SyncDescriptor } from '../../src/util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { InterceptedRequest, ISerialisedChatResponse } from '../simulation/shared/sharedTypes';
import { CacheInfo, TestRunCacheInfo } from '../testExecutor';
import { ResponseWithMeta } from './cachingChatMLFetcher';

export class FetchRequestCollector {
	public readonly _interceptedRequests: InterceptedRequest[] = [];

	public get interceptedRequests(): readonly InterceptedRequest[] {
		return this._interceptedRequests;
	}

	private readonly _pendingRequests = new TaskQueue();
	private readonly _scheduledRequests: Promise<void>[] = [];

	public addInterceptedRequest(requestPromise: Promise<InterceptedRequest>): void {
		this._scheduledRequests.push(this._pendingRequests.schedule(async () => {
			try {
				const request = await requestPromise;
				this._interceptedRequests.push(request);
			} catch (err) {
				// ignore errors here- the error will be thrown out of the ChatMLFetcher and handled
			}
		}));
	}

	/**
	 * Intercepted requests are async. This method waits for all pending requests to complete.
	 */
	public async complete(): Promise<void> {
		await Promise.all(this._scheduledRequests);
	}

	public get contentFilterCount(): number {
		return this.interceptedRequests.filter(x => x.response.type === 'filtered').length;
	}

	public get usage(): APIUsage {
		// Have to extract this to give it an explicit type or TS is confused
		const initial: APIUsage = { completion_tokens: 0, prompt_tokens: 0, total_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } };
		return this.interceptedRequests.reduce((p, c): APIUsage => {
			const initialUsage: APIUsage = { completion_tokens: 0, prompt_tokens: 0, total_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } };
			const cUsage = c.response.usage || initialUsage;
			return {
				completion_tokens: p.completion_tokens + cUsage.completion_tokens,
				prompt_tokens: p.prompt_tokens + cUsage.prompt_tokens,
				total_tokens: p.total_tokens + cUsage.total_tokens,
				prompt_tokens_details: {
					cached_tokens: (p.prompt_tokens_details?.cached_tokens ?? 0) + (cUsage.prompt_tokens_details?.cached_tokens ?? 0),
				}
			};
		}, initial);
	}

	public get averageRequestDuration(): number {
		const requestDurations = coalesce(this.interceptedRequests.map(r => r.response.cacheMetadata?.requestDuration));
		return requestDurations.reduce((sum, duration) => sum + duration, 0) / requestDurations.length;
	}

	public get hasCacheMiss(): boolean {
		return this.interceptedRequests.some(x => x.response.isCacheHit === false);
	}

	public get cacheInfo(): TestRunCacheInfo {
		return coalesce(this.interceptedRequests.map(r => r.cacheKey)).map(key => ({ type: 'request', key } satisfies CacheInfo));
	}
}

export class SpyingChatMLFetcher extends AbstractChatMLFetcher {

	private readonly fetcher: IChatMLFetcher;

	public get interceptedRequests(): readonly InterceptedRequest[] {
		return this.requestCollector.interceptedRequests;
	}

	public get contentFilterCount(): number {
		return this.requestCollector.contentFilterCount;
	}

	constructor(
		public readonly requestCollector: FetchRequestCollector,
		fetcherDesc: SyncDescriptor<IChatMLFetcher>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConversationOptions options: IConversationOptions,
	) {
		super(options);
		this.fetcher = instantiationService.createInstance(fetcherDesc);
	}

	public override dispose(): void {
		super.dispose();
		if (isDisposable(this.fetcher)) {
			this.fetcher.dispose();
		}
	}

	override async fetchMany(opts: IFetchMLOptions, token: CancellationToken): Promise<ChatResponses> {

		const toolCalls: ICopilotToolCall[] = [];
		const captureToolCallsCb: FinishedCallback = async (text, idx, delta) => {
			if (delta.copilotToolCalls) {
				toolCalls.push(...delta.copilotToolCalls);
			}
			if (opts.finishedCb) {
				return opts.finishedCb(text, idx, delta);
			}
		};

		const respPromise = this.fetcher.fetchMany({ ...opts, finishedCb: captureToolCallsCb }, token);

		const sw = new StopWatch(false);
		this.requestCollector.addInterceptedRequest(respPromise.then(resp => {
			let cacheKey: string | undefined;
			if (typeof (resp as ResponseWithMeta).cacheKey === 'string') {
				cacheKey = (resp as ResponseWithMeta).cacheKey;
			}
			(resp as ISerialisedChatResponse).copilotFunctionCalls = toolCalls;
			return new InterceptedRequest(opts.messages.map(message => {
				return {
					role: roleToString(message.role),
					content: message.content,
					tool_call_id: message.role === Raw.ChatRole.Tool ? message.toolCallId : undefined,
					tool_calls: message.role === Raw.ChatRole.Assistant ? message.toolCalls : undefined,
					name: message.name,
				};
			}), opts.requestOptions, resp, cacheKey, opts.endpoint.model, sw.elapsed());
		}));

		return await respPromise;
	}
}
