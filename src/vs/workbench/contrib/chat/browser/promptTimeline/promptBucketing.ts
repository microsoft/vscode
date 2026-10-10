/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** A user prompt that can be represented on the prompt timeline. */
export interface PromptItem {
	/** Stable id of the user request (chat request view model id). */
	readonly requestId: string;
	/** Preview text of the prompt (already single-line/plain is fine). */
	readonly text: string;
	/** Creation time in ms since epoch. */
	readonly timestamp: number;
}

/** A timeline tick representing one or more chronological prompts. */
export interface PromptBucket {
	/** Representative prompt (the FIRST prompt in the bucket) — the jump target. */
	readonly prompt: PromptItem;
	/** All prompts grouped into this bucket, in chronological order. */
	readonly prompts: readonly PromptItem[];
	/** How many prompts this tick represents (== prompts.length). */
	readonly count: number;
}

/** Hard cap on the number of ticks produced. */
export const MAX_TICKS = 24;

const oneDayMs = 86400000;

function bucketKey(date: Date, now: Date): string {
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	if (date >= startOfToday) {
		return `today-${date.getTime()}`;
	}

	const daysAgo = (startOfToday.getTime() - date.getTime()) / oneDayMs;
	if (daysAgo < 1) {
		return `yesterday-h${date.getHours()}`;
	}

	if (daysAgo < 30) {
		return `day-${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
	}

	return `month-${date.getFullYear()}-${date.getMonth()}`;
}

function toBucket(prompt: PromptItem, prompts: readonly PromptItem[] = [prompt]): PromptBucket {
	return {
		prompt,
		prompts,
		count: prompts.length
	};
}

function bucketPrompts(prompts: readonly PromptItem[], now: Date): PromptBucket[] {
	const buckets: PromptBucket[] = [];
	let currentKey: string | undefined;

	for (const prompt of prompts) {
		const key = bucketKey(new Date(prompt.timestamp), now);
		const current = buckets[buckets.length - 1];

		if (!current || key !== currentKey) {
			buckets.push(toBucket(prompt));
			currentKey = key;
		} else {
			const groupedPrompts = [...current.prompts, prompt];
			buckets[buckets.length - 1] = toBucket(current.prompt, groupedPrompts);
		}
	}

	return buckets;
}

function uniformSample(buckets: PromptBucket[], maxTicks: number): PromptBucket[] {
	if (buckets.length <= maxTicks) {
		return buckets;
	}

	const first = buckets[0];
	const last = buckets[buckets.length - 1];

	if (maxTicks <= 2) {
		return [first, last];
	}

	const sampled: PromptBucket[] = [first];
	const step = (buckets.length - 1) / (maxTicks - 1);
	for (let i = 1; i <= maxTicks - 2; i++) {
		const index = Math.round(i * step);
		if (index > 0 && index < buckets.length - 1) {
			sampled.push(buckets[index]);
		}
	}
	sampled.push(last);

	return sampled;
}

function expandBucket(bucket: PromptBucket, budget: number): PromptBucket[] {
	if (bucket.count <= budget + 1) {
		return bucket.prompts.map(prompt => toBucket(prompt));
	}

	const expandedCount = budget;
	const remainder = bucket.prompts.slice(0, bucket.count - expandedCount);
	const expandedPrompts = bucket.prompts.slice(bucket.count - expandedCount);

	return [
		toBucket(remainder[0], remainder),
		...expandedPrompts.map(prompt => toBucket(prompt))
	];
}

function expandRecentBuckets(buckets: PromptBucket[], maxTicks: number): PromptBucket[] {
	if (buckets.length >= maxTicks) {
		return buckets;
	}

	let expanded = buckets;
	let total = buckets.length;

	for (let i = expanded.length - 1; i >= 0 && total < maxTicks; i--) {
		const bucket = expanded[i];
		if (bucket.count <= 1) {
			continue;
		}

		const replacement = expandBucket(bucket, maxTicks - total);
		total += replacement.length - 1;
		expanded = [
			...expanded.slice(0, i),
			...replacement,
			...expanded.slice(i + 1)
		];
	}

	return expanded;
}

/**
 * Compresses chronological prompts into a bounded set of recency-aware timeline ticks.
 * Pass `now` in tests to make time-based grouping deterministic. `maxTicks` caps the
 * result (defaults to {@link MAX_TICKS}); callers lower it to fit the available height.
 */
export function budgetBucketPrompts(prompts: readonly PromptItem[], now = Date.now(), maxTicks = MAX_TICKS): PromptBucket[] {
	const cap = Math.min(MAX_TICKS, Math.max(1, maxTicks));
	const buckets = bucketPrompts(prompts, new Date(now));
	if (buckets.length > cap) {
		return uniformSample(buckets, cap);
	}

	if (buckets.length < cap) {
		return expandRecentBuckets(buckets, cap);
	}

	return buckets;
}

/** Internal helpers exposed only for focused unit tests. */
export const _testing = {
	bucketKey,
	bucketPrompts,
	uniformSample,
	expandRecentBuckets
} as const;
