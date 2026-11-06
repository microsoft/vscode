/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Raw } from '@vscode/prompt-tsx';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import type { CancellationToken } from 'vscode';
import { AbstractChatMLFetcher } from '../../src/extension/prompt/node/chatMLFetcher';
import { IChatMLFetcher, IFetchMLOptions } from '../../src/platform/chat/common/chatMLFetcher';
import { ChatFetchResponseType, ChatResponses } from '../../src/platform/chat/common/commonTypes';
import { IConversationOptions } from '../../src/platform/chat/common/conversationOptions';
import { getTextPart } from '../../src/platform/chat/common/globalStringUtils';
import { LogLevel } from '../../src/platform/log/common/logService';
import { FinishedCallback, ICopilotToolCall, IResponseDelta, OptionalChatRequestParams } from '../../src/platform/networking/common/fetch';
import { ChoiceLogProbs, rawMessageToCAPI } from '../../src/platform/networking/common/openai';
import { LcsDiff, LineSequence } from '../../src/util/common/diff';
import { LockMap } from '../../src/util/common/lock';
import { BugIndicatingError } from '../../src/util/vs/base/common/errors';
import { SyncDescriptor } from '../../src/util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { CHAT_ML_CACHE_SALT_PER_MODEL } from '../cacheSalt';
import { IJSONOutputPrinter } from '../jsonOutputPrinter';
import { OutputType } from '../simulation/shared/sharedTypes';
import { logger } from '../simulationLogger';
import { computeSHA256 } from './hash';
import { CacheMode, NoFetchChatMLFetcher } from './simulationContext';
import { ISimulationEndpointHealth } from './simulationEndpointHealth';
import { SimulationOutcomeImpl } from './simulationOutcome';
import { drainStdoutAndExit } from './stdout';
import { REPO_ROOT, SimulationTest } from './stest';

export class CacheableChatRequest {
	public readonly hash: string;
	private readonly obj: unknown;

	constructor(
		messages: Raw.ChatMessage[],
		model: string,
		requestOptions: OptionalChatRequestParams,
		extraCacheProperties: any | undefined
	) {
		this.obj = { messages: rawMessageToCAPI(messages), model, requestOptions, extraCacheProperties };
		const salt = CHAT_ML_CACHE_SALT_PER_MODEL[model] ?? CHAT_ML_CACHE_SALT_PER_MODEL['DEFAULT'];
		this.hash = computeSHA256(salt + JSON.stringify(this.obj));

		// To aid in reading cache entries, we will write objects to disk splitting each message by new lines
		// We do this after the sha computation to avoid invalidating all the existing caches
		(this.obj as any).messages = (this.obj as any).messages.map((m: Raw.ChatMessage) => {
			return { ...m, content: getTextPart(m.content).split('\n') };
		});
	}

	toJSON() {
		return this.obj;
	}
}

export interface IChatMLCache {
	getRequest?(hash: string): Promise<unknown | undefined>;
	get(req: CacheableChatRequest, cacheSlot: number): Promise<CachedResponse | undefined>;
	set(req: CacheableChatRequest, cacheSlot: number, cachedResponse: CachedResponse): Promise<void>;
}

export class CachedTestInfo {
	public get testName() { return this.stest.fullName; }

	constructor(
		public readonly stest: SimulationTest,
		public readonly cacheSlot: number = 0
	) { }
}

export interface CachedResponseMetadata {
	requestDuration: number;
	requestTime: string;
	testName: string;
}

export namespace CachedResponseMetadata {
	export function isCachedResponseMetadata(obj: any): obj is CachedResponseMetadata {
		return (
			typeof obj === 'object' &&
			obj !== null &&
			'requestDuration' in obj &&
			typeof (obj as any).requestDuration === 'number' &&
			'requestTime' in obj &&
			typeof (obj as any).requestTime === 'string' &&
			'testName' in obj &&
			typeof (obj as any).testName === 'string'
		);
	}
}

export type CachedExtraData = { cacheMetadata: CachedResponseMetadata | undefined; copilotFunctionCalls?: ICopilotToolCall[]; logprobs?: ChoiceLogProbs };
export type CachedResponse = ChatResponses & CachedExtraData;

export type ResponseWithMeta = ChatResponses & {
	isCacheHit?: boolean; // set when the cache was checked
	cacheKey?: string; // set when the cache was used or updated
	cacheMetadata?: CachedResponseMetadata; // set when the cache was used or updated
};


export class CachingChatMLFetcher extends AbstractChatMLFetcher {

	private static readonly Locks = new LockMap();

	private readonly fetcher: IChatMLFetcher;
	private isDisposed = false;

	constructor(
		fetcherOrDescriptor: SyncDescriptor<IChatMLFetcher> | IChatMLFetcher,
		private readonly cache: IChatMLCache,
		private readonly testInfo: CachedTestInfo,
		private readonly extraCacheProperties: any | undefined = undefined,
		private readonly cacheMode = CacheMode.Default,
		@IJSONOutputPrinter private readonly jsonOutputPrinter: IJSONOutputPrinter,
		@ISimulationEndpointHealth private readonly simulationEndpointHealth: ISimulationEndpointHealth,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConversationOptions options: IConversationOptions,
	) {
		super(options);

		this.fetcher = (fetcherOrDescriptor instanceof SyncDescriptor ? instantiationService.createInstance(fetcherOrDescriptor) : fetcherOrDescriptor);
	}

	override dispose() {
		super.dispose();
		this.isDisposed = true;
	}

	override async fetchMany(opts: IFetchMLOptions, token: CancellationToken): Promise<ResponseWithMeta> {

		if (this.isDisposed) {
			throw new BugIndicatingError('The CachingChatMLFetcher has been disposed and cannot be used anymore.');
		}

		if (!this.testInfo.testName) {
			throw new Error(`Illegal usage of the ChatMLFetcher! You should only use the ChatMLFetcher that is passed to your test and not an ambient one!`);
		}

		if (this.cacheMode === CacheMode.Require) {
			for (const message of opts.messages) {
				if (containsRepoPath(getTextPart(message.content))) {
					const message = `You should not use the repository root (${REPO_ROOT}) in your ChatML messages because this leads to cache misses! This request is generated by test "${this.testInfo.testName}`;
					console.error(`\n\n${message}\n\n`);
					this.printTerminatedWithRequireCache(message);
					await drainStdoutAndExit(1);
					throw new Error(message);
				}
			}
		}

		const finalReqOptions = this.preparePostOptions(opts.requestOptions);
		const req = new CacheableChatRequest(opts.messages, opts.endpoint.model, finalReqOptions, this.extraCacheProperties);
		// console.log(`request with hash: ${req.hash}`);

		return CachingChatMLFetcher.Locks.withLock(req.hash, async () => {
			let isCacheHit: boolean | undefined = undefined;
			if (this.cacheMode !== CacheMode.Disable) {
				const cacheValue = await this.cache.get(req, this.testInfo.cacheSlot);
				if (cacheValue) {
					if (cacheValue.type === ChatFetchResponseType.Success) {
						await opts.finishedCb?.(cacheValue.value[0], 0, { text: cacheValue.value[0], copilotToolCalls: cacheValue.copilotFunctionCalls, logprobs: cacheValue.logprobs });
					} else if (cacheValue.type === ChatFetchResponseType.Length) {
						await opts.finishedCb?.(cacheValue.truncatedValue, 0, { text: cacheValue.truncatedValue, copilotToolCalls: cacheValue.copilotFunctionCalls, logprobs: cacheValue.logprobs });
					}
					return { ...cacheValue, isCacheHit: true, cacheKey: req.hash };
				}
				isCacheHit = false;
			}

			if (this.cacheMode === CacheMode.Require) {
				let diff: { newRequest: string; oldRequest: string } | undefined;
				try {
					diff = await this.suggestDiffCommandForCacheMiss(req);
				} catch (err) {
					console.log(err);
				}

				console.log(JSON.stringify(opts.messages, (key, value) => {
					if (typeof value === 'string') {
						const split = value.split(/\n/g);
						return split.length > 1 ? split : value;
					}
					return value;
				}, 4));

				let message = `\n✗ Cache entry not found for a request generated by test "${this.testInfo.testName}"!
- Valid cache entries are currently required for all requests!
- The missing request has the hash: ${req.hash} (cache slot ${this.testInfo.cacheSlot}, make sure to call simulate -- -n=10).
`;
				if (diff) {
					message += `- Compare with the closest cache entry using \`code-insiders --diff "${diff.oldRequest}" "${diff.newRequest}"\`\n`;
				}

				console.log(message);
				this.printTerminatedWithRequireCache(message);
				await drainStdoutAndExit(1);
				throw new Error(message);
			}

			const callbackWrapper = new FinishedCallbackWrapper(opts.finishedCb);
			const start = Date.now();
			if (logger.shouldLog(LogLevel.Trace)) {
				logger.trace(`Making request:\n` + opts.messages.map(m => `  ${m.role}: ${getTextPart(m.content)}`).join('\n'));
			}
			const result = await this.fetcher.fetchMany({ ...opts, finishedCb: callbackWrapper.getCb() }, token);
			const fetchingResponseTimeInMs = Date.now() - start;
			// Don't cache failed results
			if (
				result.type === ChatFetchResponseType.OffTopic
				|| result.type === ChatFetchResponseType.Filtered
				|| result.type === ChatFetchResponseType.PromptFiltered
				|| result.type === ChatFetchResponseType.Length
				|| result.type === ChatFetchResponseType.Success
			) {
				const cacheMetadata: CachedResponseMetadata = {
					testName: this.testInfo.testName,
					requestDuration: fetchingResponseTimeInMs,
					requestTime: new Date().toISOString()
				};
				const cachedResponse: CachedResponse = {
					...result,
					cacheMetadata,
					copilotFunctionCalls: callbackWrapper.copilotFunctionCalls,
					logprobs: callbackWrapper.logprobs,
				};
				if (!(this.fetcher instanceof NoFetchChatMLFetcher)) {
					try {
						await this.cache.set(req, this.testInfo.cacheSlot, cachedResponse);
					} catch (err) {
						if (/Key already exists/.test(err.message)) {
							console.log(JSON.stringify(opts.messages, (key, value) => {
								if (typeof value === 'string') {
									const split = value.split(/\n/g);
									return split.length > 1 ? split : value;
								}
								return value;
							}, 4));
							console.log(`\n✗ ${err.message}`);
							await drainStdoutAndExit(1);
						}

						throw err;
					}
					return { ...result, cacheMetadata, isCacheHit, cacheKey: req.hash };
				}
			} else {
				// A request failed, so we don't want to cache it.
				// But we should warn the developer that they need to rerun
				this.simulationEndpointHealth.markFailure(this.testInfo, result);
			}
			return { ...result, isCacheHit };
		});
	}

	private async suggestDiffCommandForCacheMiss(req: CacheableChatRequest) {
		const outcome = await this.instantiationService.createInstance(SimulationOutcomeImpl, false).get(this.testInfo.stest);
		if (!outcome?.requests.length) {
			return;
		}

		const newRequest = path.join(tmpdir(), `${req.hash}-new.json`);
		await fs.writeFile(newRequest, JSON.stringify(req.toJSON(), null, '\t'));

		let best: unknown | undefined;
		let bestScore = Infinity;
		for (const requestHash of outcome.requests) {
			const request = await this.cache.getRequest!(requestHash);
			if (!request) {
				continue;
			}

			const diff = new LcsDiff(
				new LineSequence(JSON.stringify(request, null, '\t').split('\n')),
				new LineSequence(JSON.stringify(req.toJSON(), null, '\t').split('\n')),
			).ComputeDiff();

			let score = 0;
			for (const d of diff) {
				score += d.modifiedLength + d.originalLength;
			}

			if (score < bestScore) {
				best = request;
				bestScore = score;
			}
		}

		if (!best) {
			return;
		}

		const oldRequest = path.join(tmpdir(), `${req.hash}-previous.json`);
		await fs.writeFile(oldRequest, JSON.stringify(best, null, '\t'));
		return {
			newRequest,
			oldRequest,
			get isWhitespaceOnly() {
				let whitespaceOnly = false;
				if (best) {
					const bestCast = best as { messages: { content: string[] }[] };
					const currentCast = req.toJSON() as { messages: { content: string[] }[] };
					if (bestCast.messages.length === currentCast.messages.length && bestCast.messages.every(
						(v, i) => v.content.join('').replace(/\n\n+/, '\n').trim() === currentCast.messages[i].content.join('').replace(/\n\n+/, '\n').trim())) {
						whitespaceOnly = true;
					}
				}

				return whitespaceOnly;
			}
		};
	}

	private printTerminatedWithRequireCache(message: string) {
		return this.jsonOutputPrinter.print({ type: OutputType.terminated, reason: `Terminated because of --require-cache\n${message}` });
	}
}

const repoRootRegex = new RegExp(REPO_ROOT.replace(/[/\\]/g, '[/\\\\]'), 'i');

function containsRepoPath(testString: string): boolean {
	return repoRootRegex.test(testString);
}

class FinishedCallbackWrapper {
	public readonly copilotFunctionCalls: ICopilotToolCall[] = [];
	public logprobs: ChoiceLogProbs | undefined;

	constructor(
		private readonly original: FinishedCallback | undefined) { }

	public getCb(): FinishedCallback {
		return async (text: string, index: number, delta: IResponseDelta): Promise<number | undefined> => {
			if (delta.copilotToolCalls) {
				this.copilotFunctionCalls.push(...delta.copilotToolCalls);
			}
			if (delta.logprobs) {
				if (!this.logprobs) {
					this.logprobs = { ...delta.logprobs };
				} else {
					this.logprobs.content.push(...delta.logprobs.content);
				}
			}

			return this.original?.(text, index, delta);
		};
	}
}
