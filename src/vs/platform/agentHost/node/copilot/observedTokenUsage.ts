/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgentTokenUsageSummary, IAgentTurnTokenUsage } from '../../common/agent.js';

interface IObservedTokens {
	readonly inputTokens?: number;
	readonly outputTokens?: number;
	readonly cacheReadTokens?: number;
}

/** Independent of UI/billing totals: unknown counters are never coerced to zero. */
export class ObservedTokenUsage {
	private readonly _seen = new Set<string>();
	private readonly _groups = new Map<string, IAgentTokenUsageSummary>();

	add(eventId: string | undefined, model: string | undefined, usageScope: IAgentTokenUsageSummary['usageScope'], tokens: IObservedTokens, reasoningEffort?: string): void {
		const identity = eventId ? `${usageScope}\0${eventId}` : undefined;
		if (identity && this._seen.has(identity)) {
			return;
		}
		if (identity) {
			this._seen.add(identity);
		}
		const key = JSON.stringify([usageScope, model, reasoningEffort]);
		const previous = this._groups.get(key);
		const input = validTokenCount(tokens.inputTokens);
		const output = validTokenCount(tokens.outputTokens);
		const cache = validTokenCount(tokens.cacheReadTokens);
		const usageRecordCount = (previous?.usageRecordCount ?? 0) + 1;
		const inputKnownRecordCount = (previous?.inputKnownRecordCount ?? 0) + Number(input !== undefined);
		const outputKnownRecordCount = (previous?.outputKnownRecordCount ?? 0) + Number(output !== undefined);
		const cacheKnownRecordCount = (previous?.cacheKnownRecordCount ?? 0) + Number(cache !== undefined);
		const known = inputKnownRecordCount + outputKnownRecordCount + cacheKnownRecordCount;
		this._groups.set(key, {
			...(model ? { model } : {}),
			...(reasoningEffort ? { reasoningEffort } : {}),
			usageScope,
			usageStatus: known === 0 ? 'notReported' : known === usageRecordCount * 3 ? 'known' : 'partial',
			usageRecordCount, inputKnownRecordCount, outputKnownRecordCount, cacheKnownRecordCount,
			...(inputKnownRecordCount ? { knownInputTokens: (previous?.knownInputTokens ?? 0) + (input ?? 0) } : {}),
			...(outputKnownRecordCount ? { knownOutputTokens: (previous?.knownOutputTokens ?? 0) + (output ?? 0) } : {}),
			...(cacheKnownRecordCount ? { knownCacheReadTokens: (previous?.knownCacheReadTokens ?? 0) + (cache ?? 0) } : {}),
		});
	}

	snapshot(): IAgentTurnTokenUsage {
		const summaries = [...this._groups.values()].map(summary => ({ ...summary }));
		if (!summaries.some(summary => summary.usageScope === 'direct-model')) {
			summaries.unshift({
				usageScope: 'direct-model', usageStatus: 'notReported', usageRecordCount: 0,
				inputKnownRecordCount: 0, outputKnownRecordCount: 0, cacheKnownRecordCount: 0,
			});
		}
		return { summaries };
	}
}

function validTokenCount(value: number | undefined): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}
