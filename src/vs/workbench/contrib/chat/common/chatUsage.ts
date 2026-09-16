/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatUsage } from './chatService/chatService.js';

export interface IChatUsageModelSummary {
	readonly model: string;
	readonly inputTokens: number;
	readonly cachedTokens: number;
	readonly outputTokens: number;
}

export interface IChatUsageSummary {
	readonly inputTokens: number;
	readonly cachedTokens?: number;
	readonly outputTokens: number;
	readonly models: readonly IChatUsageModelSummary[];
	readonly isComplete: boolean;
}

export function aggregateChatUsage(usages: readonly (IChatUsage | undefined)[]): IChatUsageSummary | undefined {
	const models = new Map<string, IChatUsageModelSummary>();
	let inputTokens = 0;
	let cachedTokens = 0;
	let outputTokens = 0;
	let hasUsage = false;
	let isComplete = true;

	for (const usage of usages) {
		if (!usage) {
			continue;
		}
		const modelTotals = usage.modelTotals?.filter(isValidModelTotal);
		if (modelTotals?.length) {
			hasUsage = true;
			for (const total of modelTotals) {
				inputTokens += total.inputTokens;
				cachedTokens += total.cachedTokens;
				outputTokens += total.outputTokens;
				const current = models.get(total.model);
				models.set(total.model, {
					model: total.model,
					inputTokens: (current?.inputTokens ?? 0) + total.inputTokens,
					cachedTokens: (current?.cachedTokens ?? 0) + total.cachedTokens,
					outputTokens: (current?.outputTokens ?? 0) + total.outputTokens,
				});
			}
			continue;
		}

		if (isTokenCount(usage.promptTokens) && isTokenCount(usage.completionTokens)) {
			hasUsage = true;
			isComplete = false;
			inputTokens += usage.promptTokens;
			outputTokens += usage.completionTokens;
		}
	}

	return hasUsage ? {
		inputTokens,
		...(isComplete ? { cachedTokens } : {}),
		outputTokens,
		models: [...models.values()],
		isComplete,
	} : undefined;
}

function isValidModelTotal(total: IChatUsageModelSummary): boolean {
	return !!total.model
		&& isTokenCount(total.inputTokens)
		&& isTokenCount(total.cachedTokens)
		&& isTokenCount(total.outputTokens);
}

function isTokenCount(value: number): boolean {
	return Number.isFinite(value) && value >= 0;
}
