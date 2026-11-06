/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OutputMode, Raw, toMode } from '@vscode/prompt-tsx';
import type { LanguageModelChatTool } from 'vscode';
import { LRUCache } from '../../../util/common/cache';
import { getImageDimensions } from '../../../util/common/imageUtils';
import { createServiceIdentifier } from '../../../util/common/services';
import { ITokenizer, TokenizerType } from '../../../util/common/tokenizer';
import { WorkerWithRpcProxy } from '../../../util/node/worker';
import { assertNever } from '../../../util/vs/base/common/assert';
import { Lazy } from '../../../util/vs/base/common/lazy';
import { Disposable, toDisposable } from '../../../util/vs/base/common/lifecycle';
import { basename, join } from '../../../util/vs/base/common/path';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { TikTokenImpl } from './tikTokenizerImpl';

export const ITokenizerProvider = createServiceIdentifier<ITokenizerProvider>('ITokenizerProvider');

export interface TokenizationEndpoint {
	readonly tokenizer: TokenizerType;
}

export interface ITokenizerProvider {
	readonly _serviceBrand: undefined;

	acquireTokenizer(endpoint: TokenizationEndpoint): ITokenizer;
}

/**
 * BaseTokensPerCompletion is the minimum tokens for a completion request.
 * Replies are primed with <|im_start|>assistant<|message|>, so these tokens represent the
 * special token and the role name.
 */
export const BaseTokensPerCompletion = 3;
/*
 * Each GPT 3.5 / GPT 4 message comes with 3 tokens per message due to special characters
 */
export const BaseTokensPerMessage = 3;
/*
 * Since gpt-3.5-turbo-0613 each name costs 1 token
 */
export const BaseTokensPerName = 1;


export class TokenizerProvider implements ITokenizerProvider {
	declare readonly _serviceBrand: undefined;

	// These files are copied to `dist` via the `build/postinstall.ts` script
	private readonly _cl100kTokenizer: Lazy<BPETokenizer>;
	private readonly _o200kTokenizer: Lazy<BPETokenizer>;

	constructor(
		useWorker: boolean,
		@ITelemetryService telmetryService: ITelemetryService
	) {
		// if we're running from dist, the dictionary is compressed, but if we're  running
		// in e.g. a `spec` file we should load the dictionary using default behavior.
		// todo: cleanup a bit, have an IS_BUILT constant?
		this._cl100kTokenizer = new Lazy(() => new BPETokenizer(useWorker, join(__dirname, './cl100k_base.tiktoken'), 'cl100k_base', telmetryService));
		this._o200kTokenizer = new Lazy(() => new BPETokenizer(useWorker, join(__dirname, './o200k_base.tiktoken'), 'o200k_base', telmetryService));
	}

	dispose() {
		this._cl100kTokenizer.rawValue?.dispose();
		this._o200kTokenizer.rawValue?.dispose();
	}

	/**
	 * Gets a tokenizer for a given model family
	 * @param endpoint The endpoint you want to acquire a tokenizer for
	 */
	public acquireTokenizer(endpoint: TokenizationEndpoint): ITokenizer {
		switch (endpoint.tokenizer) {
			case TokenizerType.CL100K:
				return this._cl100kTokenizer.value;
			case TokenizerType.O200K:
				return this._o200kTokenizer.value;
			default:
				throw new Error(`Unknown tokenizer: ${endpoint.tokenizer}`);
		}
	}
}

type TikTokenWorker = {
	encode(text: string, allowedSpecial?: ReadonlyArray<string>): Promise<number[]>;
};

class BPETokenizer extends Disposable implements ITokenizer {

	private _tokenizer?: Promise<TikTokenWorker>;

	/**
	 * TikToken has its own cache, but it still does some processing
	 * until a cache hit. We can have a much more efficient cache that
	 * directly looks up string -> token length
	 */
	private readonly _cache = new LRUCache<number>(5000);

	protected readonly baseTokensPerMessage = BaseTokensPerMessage;
	protected readonly baseTokensPerName = BaseTokensPerName;

	public readonly mode = OutputMode.Raw;

	constructor(
		private readonly _useWorker: boolean,
		private readonly _tokenFilePath: string,
		private readonly _encoderName: string,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) {
		super();
	}

	async countMessagesTokens(messages: Raw.ChatMessage[]): Promise<number> {
		let numTokens = BaseTokensPerMessage;
		for (const message of messages) {
			numTokens += await this.countMessageTokens(message);
		}
		return numTokens;
	}

	/**
	 * Tokenizes the given text.
	 * @param text The text to tokenize.
	 * @returns The tokenized text.
	 */
	private async tokenize(text: string): Promise<number[]> {
		return (await this.ensureTokenizer()).encode(text);
	}

	/**
	 * Calculates the token length of the given text.
	 * @param text The text to calculate the token length for.
	 * @returns The number of tokens in the text.
	 */
	async tokenLength(text: string | Raw.ChatCompletionContentPart): Promise<number> {
		if (typeof text === 'string') {
			return this._textTokenLength(text);
		}

		switch (text.type) {
			case Raw.ChatCompletionContentPartKind.Text:
				return this._textTokenLength(text.text);
			case Raw.ChatCompletionContentPartKind.Opaque:
				return text.tokenUsage || 0;
			case Raw.ChatCompletionContentPartKind.Image:
				if (text.imageUrl.url.startsWith('data:image/')) {
					try {
						return calculateImageTokenCost(text.imageUrl.url, text.imageUrl.detail);
					} catch {
						return this._textTokenLength(text.imageUrl.url);
					}
				}
				return this._textTokenLength(text.imageUrl.url);
			case Raw.ChatCompletionContentPartKind.CacheBreakpoint:
				return 0;
			case Raw.ChatCompletionContentPartKind.Document:
				return estimateDocumentTokenCost(text.documentData.data);
			default:
				assertNever(text, `unknown content part (${JSON.stringify(text)})`);
		}
	}

	private async _textTokenLength(text: string) {
		if (!text) {
			return 0;
		}
		let cacheValue = this._cache.get(text);
		if (!cacheValue) {
			cacheValue = (await this.tokenize(text)).length;
			this._cache.put(text, cacheValue);
		}
		return cacheValue;
	}

	/**
	 * Counts tokens for a single chat message within a completion request.
	 *
	 * Follows https://github.com/openai/openai-cookbook/blob/main/examples/How_to_count_tokens_with_tiktoken.ipynb for GPT 3.5/4 models.
	 *
	 * **Note**: The result does not include base tokens for the completion itself.
	 */
	async countMessageTokens(message: Raw.ChatMessage): Promise<number> {
		return this.baseTokensPerMessage + (await this.countMessageObjectTokens(toMode(OutputMode.OpenAI, message)));
	}

	async countToolTokens(tools: LanguageModelChatTool[]): Promise<number> {
		const baseToolTokens = 16;
		let numTokens = 0;
		if (tools.length) {
			numTokens += baseToolTokens;
		}

		const baseTokensPerTool = 8;
		for (const tool of tools) {
			numTokens += baseTokensPerTool;
			numTokens += await this.countObjectTokens({ name: tool.name, description: tool.description, parameters: tool.inputSchema });
		}

		// This is an estimate, so give a little safety margin
		return Math.floor(numTokens * 1.1);
	}

	private async countMessageObjectTokens(obj: any): Promise<number> {
		let numTokens = 0;
		for (const [key, value] of Object.entries(obj)) {
			if (!value) {
				continue;
			}

			if (typeof value === 'string') {
				numTokens += await this.tokenLength(value);
			} else if (value) {
				const casted = value as any;
				if (casted.type === 'text') {
					numTokens += await this.tokenLength(casted.text);
				} else if (casted.type === 'image_url' && casted.image_url) {
					if (casted.image_url.url.startsWith('data:image/')) {
						try {
							numTokens += calculateImageTokenCost(casted.image_url.url, casted.image_url.detail);
						} catch {
							numTokens += await this.tokenLength(casted.image_url.url);
						}
					} else {
						numTokens += await this.tokenLength(casted.image_url.url);
					}
				} else {
					let newTokens = await this.countMessageObjectTokens(value);
					if (key === 'tool_calls') {
						// This is an estimate, not including all of the overhead, so give a little safety margin
						newTokens = Math.floor(newTokens * 1.5);
					}

					numTokens += newTokens;
				}
			}

			if (key === 'name' && value !== undefined) {
				numTokens += this.baseTokensPerName;
			}
		}

		return numTokens;
	}

	private async countObjectTokens(obj: any): Promise<number> {
		let numTokens = 0;
		for (const [key, value] of Object.entries(obj)) {
			if (!value) {
				continue;
			}

			numTokens += await this.tokenLength(key);
			if (typeof value === 'string') {
				numTokens += await this.tokenLength(value);
			} else if (value) {
				numTokens += await this.countMessageObjectTokens(value);
			}
		}

		return numTokens;
	}

	private ensureTokenizer(): Promise<TikTokenWorker> {
		this._tokenizer ??= this.doInitTokenizer();
		return this._tokenizer;
	}

	private async doInitTokenizer(): Promise<TikTokenWorker> {

		const useBinaryTokens = basename(__dirname) === 'dist';

		if (!this._useWorker) {
			const handle = TikTokenImpl.instance.init(this._tokenFilePath, this._encoderName, useBinaryTokens);

			const cleanup = toDisposable(() => {
				TikTokenImpl.instance.destroy(handle);
				this._store.deleteAndLeak(cleanup);
				this._tokenizer = undefined;
			});
			this._store.add(cleanup);

			return {
				encode: async (text, allowedSpecial) => {
					return TikTokenImpl.instance.encode(handle, text, allowedSpecial);
				}
			};
		} else {

			const workerPath = join(__dirname, 'tikTokenizerWorker.js');
			const worker = new WorkerWithRpcProxy<TikTokenImpl>(workerPath, { name: `TikToken worker (${this._encoderName})` });
			const handle = await worker.proxy.init(this._tokenFilePath, this._encoderName, useBinaryTokens);

			const cleanup = toDisposable(() => {
				worker.terminate();
				this._store.deleteAndLeak(cleanup);
				this._tokenizer = undefined;
			});

			let timeout: TimeoutHandle;

			return {
				encode: (text, allowedSpecial) => {
					const result = worker.proxy.encode(handle, text, allowedSpecial);

					clearTimeout(timeout);
					timeout = setTimeout(() => cleanup.dispose(), 15000);

					if (Math.random() < 1 / 1000) {
						worker.proxy.resetStats().then(stats => {
							/* __GDPR__
								"tokenizer.stats" : {
									"owner": "jrieken",
									"comment": "Perf stats about tokenizers",
									"callCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How often tokenize was called" },
									"encodeDuration": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Average time encode took" },
									"textLength": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Average length of text that got encoded" }
								}
							*/
							this._telemetryService.sendMSFTTelemetryEvent('tokenizer.stats', undefined, stats);
						});
					}

					return result;
				}
			};
		}
	}
}


//#region Image tokenizer helpers

// https://platform.openai.com/docs/guides/vision#calculating-costs
export function calculateImageTokenCost(imageUrl: string, detail: 'low' | 'high' | 'auto' | undefined): number {
	let { width, height } = getImageDimensions(imageUrl);

	if (detail === 'low') {
		return 85;
	}

	// Scale image to fit within a 2048 x 2048 square if necessary.
	if (width > 2048 || height > 2048) {
		const scaleFactor = 2048 / Math.max(width, height);
		width = Math.round(width * scaleFactor);
		height = Math.round(height * scaleFactor);
	}

	const scaleFactor = 768 / Math.min(width, height);
	width = Math.round(width * scaleFactor);
	height = Math.round(height * scaleFactor);

	const tiles = Math.ceil(width / 512) * Math.ceil(height / 512);

	return tiles * 170 + 85;
}

/**
 * Estimates the token cost of a base64-encoded document (e.g. PDF) without BPE tokenization.
 * Uses a size-based heuristic to avoid tokenizing large binary payloads and polluting
 * the LRU cache. Intentionally conservative (overestimates) to avoid exceeding context limits.
 */
export function estimateDocumentTokenCost(base64Data: string | undefined): number {
	if (!base64Data) {
		return 0;
	}
	// Roughly estimate original bytes from base64 length.
	// Base64 encodes 3 bytes into 4 characters, so bytes ~= len * 3 / 4.
	const length = base64Data.length;
	const estimatedBytes = Math.floor((length * 3) / 4);
	// Heuristic: assume approximately 1 token per 8 bytes of document data.
	// This is a rough estimate that avoids expensive BPE tokenization of large
	// binary payloads and avoids polluting the LRU token cache.
	const estimatedTokens = Math.ceil(estimatedBytes / 8);
	return estimatedTokens;
}

//#endregion
