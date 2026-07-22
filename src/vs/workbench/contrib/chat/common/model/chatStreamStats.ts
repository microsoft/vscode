/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../../platform/log/common/log.js';

export interface IChatStreamStats {
	impliedWordLoadRate: number;
	lastWordCount: number;
}

export interface IChatStreamStatsInternal extends IChatStreamStats {
	totalTime: number;
	lastUpdateTime: number;
	firstMarkdownTime: number | undefined;
	bootstrapActive: boolean;
	wordCountAtBootstrapExit: number | undefined;
	updatesWithNewWords: number;
}

export interface IChatStreamUpdate {
	totalWordCount: number;
}

const MIN_BOOTSTRAP_TOTAL_TIME = 250;
const LARGE_BOOTSTRAP_MIN_TOTAL_TIME = 500;
const MAX_INTERVAL_TIME = 250;
const LARGE_UPDATE_MAX_INTERVAL_TIME = 1000;
const WORDS_FOR_LARGE_CHUNK = 10;
const MIN_UPDATES_FOR_STABLE_RATE = 2;

/**
 * Estimates the loading rate of a chat response stream so that we can try to match the rendering rate to
 * the rate at which text is actually produced by the model. This can only be an estimate for various reasons-
 * reasoning summaries don't represent real generated tokens, we don't have full visibility into tool calls,
 * some model providers send text in large chunks rather than a steady stream, e.g. Gemini, we don't know about
 * latency between agent requests, etc.
 *
 * When the first text is received, we don't know how long it actually took to generate. So we apply an assumed
 * minimum time, until we have received enough data to make a stable estimate. This is the "bootstrap" phase.
 *
 * Since we don't have visibility into when the model started generated tool call args, or when the client was running
 * a tool, we ignore long pauses. The ignore period is longer for large chunks, since those naturally take longer
 * to generate anyway.
 *
 * After that, the word load rate is estimated using the words received since the end of the bootstrap phase.
 */
export class ChatStreamStatsTracker {
	private _data: IChatStreamStatsInternal;
	private _publicData: IChatStreamStats;

	constructor(
		@ILogService private readonly logService: ILogService
	) {
		const start = Date.now();
		this._data = {
			totalTime: 0,
			lastUpdateTime: start,
			impliedWordLoadRate: 0,
			lastWordCount: 0,
			firstMarkdownTime: undefined,
			bootstrapActive: true,
			wordCountAtBootstrapExit: undefined,
			updatesWithNewWords: 0
		};
		this._publicData = { impliedWordLoadRate: 0, lastWordCount: 0 };
	}

	get data(): IChatStreamStats {
		return this._publicData;
	}

	get internalData(): IChatStreamStatsInternal {
		return this._data;
	}

	update(totals: IChatStreamUpdate): IChatStreamStats | undefined {
		const { totalWordCount: wordCount } = totals;
		if (wordCount === this._data.lastWordCount) {
			this.trace('Update- no new words');
			return undefined;
		}

		const now = Date.now();
		const newWords = wordCount - this._data.lastWordCount;
		const hadNoWordsBeforeUpdate = this._data.lastWordCount === 0;
		let firstMarkdownTime = this._data.firstMarkdownTime;
		let wordCountAtBootstrapExit = this._data.wordCountAtBootstrapExit;
		if (typeof firstMarkdownTime !== 'number' && wordCount > 0) {
			firstMarkdownTime = now;
		}
		const updatesWithNewWords = this._data.updatesWithNewWords + 1;

		if (hadNoWordsBeforeUpdate) {
			this._data.lastUpdateTime = now;
		}

		const intervalCap = newWords > WORDS_FOR_LARGE_CHUNK ? LARGE_UPDATE_MAX_INTERVAL_TIME : MAX_INTERVAL_TIME;
		const timeDiff = Math.min(now - this._data.lastUpdateTime, intervalCap);
		let totalTime = this._data.totalTime + timeDiff;
		const minBootstrapTotalTime = hadNoWordsBeforeUpdate && wordCount > WORDS_FOR_LARGE_CHUNK ? LARGE_BOOTSTRAP_MIN_TOTAL_TIME : MIN_BOOTSTRAP_TOTAL_TIME;

		let bootstrapActive = this._data.bootstrapActive;
		if (bootstrapActive) {
			const stableStartTime = firstMarkdownTime;
			const hasStableData = typeof stableStartTime === 'number'
				&& updatesWithNewWords >= MIN_UPDATES_FOR_STABLE_RATE
				&& wordCount >= WORDS_FOR_LARGE_CHUNK;
			if (hasStableData) {
				bootstrapActive = false;
				totalTime = Math.max(now - stableStartTime, timeDiff);
				wordCountAtBootstrapExit = this._data.lastWordCount;
				this.trace('Has stable data');
			} else {
				totalTime = Math.max(totalTime, minBootstrapTotalTime);
			}
		}

		const wordsSinceBootstrap = typeof wordCountAtBootstrapExit === 'number' ? Math.max(wordCount - wordCountAtBootstrapExit, 0) : wordCount;
		const effectiveTime = totalTime;
		const effectiveWordCount = bootstrapActive ? wordCount : wordsSinceBootstrap;
		const impliedWordLoadRate = effectiveTime > 0 ? effectiveWordCount / (effectiveTime / 1000) : 0;
		this._data = {
			totalTime,
			lastUpdateTime: now,
			impliedWordLoadRate,
			lastWordCount: wordCount,
			firstMarkdownTime,
			bootstrapActive,
			wordCountAtBootstrapExit,
			updatesWithNewWords
		};
		this._publicData = {
			impliedWordLoadRate,
			lastWordCount: wordCount
		};

		const traceWords = bootstrapActive ? wordCount : wordsSinceBootstrap;
		this.trace(`Update- got ${traceWords} words over last ${totalTime}ms = ${impliedWordLoadRate} words/s`);
		return this._data;
	}

	private trace(message: string): void {
		this.logService.trace(`ChatStreamStatsTracker#update: ${message}`);
	}
}
