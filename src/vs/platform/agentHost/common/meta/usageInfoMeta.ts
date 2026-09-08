/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Mutable } from '../../../../base/common/types.js';
import type { UsageInfo } from '../state/protocol/state.js';

/**
 * Well-known keys that may appear on {@link UsageInfo._meta}.
 * Clients MAY read these to provide enhanced UI (e.g. credit cost display).
 */
export interface UsageInfoMeta {
	/** Per-turn credit cost reported by the backend. */
	cost?: number;
	/** The concrete model selected by Copilot Auto and the routing explanation. */
	autoModeResolved?: IAutoModeResolvedInfo;
	/** Copilot-specific usage breakdown, including nano-AIU totals. */
	copilotUsage?: {
		/** This turn's nano-AIU cost. */
		totalNanoAiu?: number;
		/**
		 * The whole session's accumulated nano-AIU cost, as reported by the
		 * backend rather than summed from the turns. Clients SHOULD prefer this
		 * over adding up per-turn totals: it is authoritative, and it also
		 * covers work billed outside any turn (e.g. an out-of-turn compaction).
		 */
		sessionTotalNanoAiu?: number;
		[key: string]: unknown;
	};
	/**
	 * Per-category account quota snapshots from the model-call usage event. Keyed by quota type:
	 * `premium_models` (or `premium_interactions` on older backends), `chat`, `session`, `weekly`.
	 */
	quotaSnapshots?: {
		[quotaType: string]: {
			readonly isUnlimitedEntitlement?: boolean;
			readonly entitlementRequests?: number;
			readonly usedRequests?: number;
			readonly remainingPercentage?: number;
			readonly overage?: number;
			readonly overageAllowedWithExhaustedQuota?: boolean;
			/** ISO 8601 date when the quota resets, if applicable. */
			readonly resetDate?: string;
			/** Whether this snapshot is billed against an AI-credits allocation. */
			readonly tokenBasedBilling?: boolean;
			/** Additional-usage budget cap in AI credits, when the backend reports one. */
			readonly overageEntitlement?: number;
		} | undefined;
	};
	/**
	 * Per-source context-window attribution breakdown reported by the SDK's
	 * `session.rpc.metadata.getContextAttribution()`. Populated asynchronously
	 * after each usage event and piped to the context-usage widget as
	 * `promptTokenDetails`.
	 */
	contextAttribution?: IContextAttributionData;
	/**
	 * Per-model token totals accumulated across every model call in the turn,
	 * including calls made by subagents and the summarization call a compaction
	 * performs. Unlike {@link UsageInfo.inputTokens}, which describes only the
	 * most recent model call, these are whole-turn sums, so clients can report
	 * what a completed turn consumed in aggregate.
	 */
	turnTokenTotals?: readonly ITurnTokenTotal[];
	/** Per-model token totals for this turn only, excluding descendant sub-agents (sum a tree without double-counting). */
	directTurnTokenTotals?: readonly ITurnTokenTotal[];
	/** Copilot usage for this turn only. The root's {@link copilotUsage} stays inclusive of descendants. */
	directCopilotUsage?: {
		readonly totalNanoAiu?: number;
	};
	[key: string]: unknown;
}

/** Whole-turn token consumption attributed to a single model. */
export interface ITurnTokenTotal {
	readonly model: string;
	readonly inputTokens: number;
	readonly cachedTokens: number;
	readonly outputTokens: number;
}

export interface IAutoModeResolvedInfo {
	readonly chosenModel: string;
	readonly reasoningBucket?: 'low' | 'medium' | 'high';
	readonly categoryScores?: Readonly<Record<string, number | undefined>>;
	readonly predictedLabel?: string;
	readonly confidence?: number;
	readonly candidateModels?: readonly string[];
}

/**
 * Mirrors the SDK's `SessionContextAttribution` shape — a flat list of
 * per-source entries describing what occupies the session's context window.
 */
export interface IContextAttributionData {
	readonly totalTokens: number;
	readonly entries: readonly IContextAttributionEntry[];
	readonly compactions: { readonly count: number };
}

export interface IContextAttributionEntry {
	readonly kind: string;
	readonly id: string;
	readonly label: string;
	readonly tokens: number;
	readonly parentId?: string;
	readonly attributes?: Readonly<Record<string, string | undefined>>;
}

type AccountQuotaSnapshot = NonNullable<NonNullable<UsageInfoMeta['quotaSnapshots']>[string]>;

function readAccountQuotaSnapshot(value: unknown): AccountQuotaSnapshot | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	const snapshot: Mutable<AccountQuotaSnapshot> = {};
	if (typeof raw['isUnlimitedEntitlement'] === 'boolean') { snapshot.isUnlimitedEntitlement = raw['isUnlimitedEntitlement']; }
	if (typeof raw['entitlementRequests'] === 'number') { snapshot.entitlementRequests = raw['entitlementRequests']; }
	if (typeof raw['usedRequests'] === 'number') { snapshot.usedRequests = raw['usedRequests']; }
	if (typeof raw['remainingPercentage'] === 'number') { snapshot.remainingPercentage = raw['remainingPercentage']; }
	if (typeof raw['overage'] === 'number') { snapshot.overage = raw['overage']; }
	if (typeof raw['overageAllowedWithExhaustedQuota'] === 'boolean') { snapshot.overageAllowedWithExhaustedQuota = raw['overageAllowedWithExhaustedQuota']; }
	if (typeof raw['resetDate'] === 'string') { snapshot.resetDate = raw['resetDate']; }
	if (typeof raw['tokenBasedBilling'] === 'boolean') { snapshot.tokenBasedBilling = raw['tokenBasedBilling']; }
	if (typeof raw['overageEntitlement'] === 'number') { snapshot.overageEntitlement = raw['overageEntitlement']; }
	return snapshot;
}

/**
 * Reads the well-known {@link UsageInfoMeta} keys from a usage report's open
 * `_meta` bag, ignoring unrelated provider-specific keys and validating each
 * field's type. Always read {@link UsageInfo._meta} through this helper rather
 * than casting the bag to {@link UsageInfoMeta}, so a malformed or partial bag
 * degrades to absent fields instead of producing values of the wrong runtime
 * type. Returns an empty object when the bag is absent.
 */
export function readUsageInfoMeta(usage: UsageInfo | undefined): UsageInfoMeta {
	const meta = usage?._meta;
	if (!meta) {
		return {};
	}
	const result: Mutable<UsageInfoMeta> = {};
	if (typeof meta['cost'] === 'number') { result.cost = meta['cost']; }
	const autoModeResolved = readAutoModeResolvedInfo(meta['autoModeResolved']);
	if (autoModeResolved) { result.autoModeResolved = autoModeResolved; }
	const copilotUsage = meta['copilotUsage'];
	if (copilotUsage && typeof copilotUsage === 'object' && !Array.isArray(copilotUsage)) {
		const rawUsage = copilotUsage as Record<string, unknown>;
		const usage: Mutable<NonNullable<UsageInfoMeta['copilotUsage']>> = {};
		if (typeof rawUsage['totalNanoAiu'] === 'number') { usage.totalNanoAiu = rawUsage['totalNanoAiu']; }
		if (typeof rawUsage['sessionTotalNanoAiu'] === 'number') { usage.sessionTotalNanoAiu = rawUsage['sessionTotalNanoAiu']; }
		result.copilotUsage = usage;
	}
	const quotaSnapshots = meta['quotaSnapshots'];
	if (quotaSnapshots && typeof quotaSnapshots === 'object' && !Array.isArray(quotaSnapshots)) {
		const snapshots: Mutable<NonNullable<UsageInfoMeta['quotaSnapshots']>> = {};
		for (const [quotaType, value] of Object.entries(quotaSnapshots as Record<string, unknown>)) {
			snapshots[quotaType] = readAccountQuotaSnapshot(value);
		}
		result.quotaSnapshots = snapshots;
	}
	const contextAttribution = readContextAttribution(meta['contextAttribution']);
	if (contextAttribution) {
		result.contextAttribution = contextAttribution;
	}
	const turnTokenTotals = readTurnTokenTotals(meta['turnTokenTotals']);
	if (turnTokenTotals) {
		result.turnTokenTotals = turnTokenTotals;
	}
	const directTurnTokenTotals = readTurnTokenTotals(meta['directTurnTokenTotals']);
	if (directTurnTokenTotals) {
		result.directTurnTokenTotals = directTurnTokenTotals;
	}
	const directCopilotUsage = meta['directCopilotUsage'];
	if (directCopilotUsage && typeof directCopilotUsage === 'object' && !Array.isArray(directCopilotUsage)) {
		const totalNanoAiu = (directCopilotUsage as Record<string, unknown>)['totalNanoAiu'];
		if (typeof totalNanoAiu === 'number') {
			result.directCopilotUsage = { totalNanoAiu };
		}
	}
	return result;
}

/**
 * Reads whole-turn per-model token totals, dropping rows that are not fully
 * formed. Returns `undefined` when no usable row survives, so callers can treat
 * "absent" and "present but meaningless" identically.
 */
function readTurnTokenTotals(value: unknown): readonly ITurnTokenTotal[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const totals: ITurnTokenTotal[] = [];
	for (const item of value) {
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			continue;
		}
		const raw = item as Record<string, unknown>;
		if (typeof raw['model'] !== 'string' || !raw['model']
			|| !isTokenCount(raw['inputTokens'])
			|| !isTokenCount(raw['cachedTokens'])
			|| !isTokenCount(raw['outputTokens'])
		) {
			continue;
		}
		totals.push({
			model: raw['model'],
			inputTokens: raw['inputTokens'],
			cachedTokens: raw['cachedTokens'],
			outputTokens: raw['outputTokens'],
		});
	}
	return totals.length > 0 ? totals : undefined;
}

function isTokenCount(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Whether a usage report actually records consumption, as opposed to merely
 * existing.
 *
 * A turn can carry a token-less {@link UsageInfo} that exists only to hold
 * routing metadata — notably a Copilot Auto turn restored from the event log,
 * which keeps `_meta.autoModeResolved` even though the usage event itself is
 * ephemeral and was never persisted. Callers that ask "does this turn have
 * usage?" almost always mean "does it have numbers to show", so route that
 * question through here rather than testing the object for truthiness.
 */
export function hasReportedUsage(usage: UsageInfo | undefined): boolean {
	if (!usage) {
		return false;
	}
	if (typeof usage.inputTokens === 'number' || typeof usage.outputTokens === 'number') {
		return true;
	}
	const meta = readUsageInfoMeta(usage);
	// Negative totals are treated as absent, matching how credits are read for display.
	return (typeof meta.copilotUsage?.totalNanoAiu === 'number' && meta.copilotUsage.totalNanoAiu >= 0)
		// A report can carry only the session total — a compaction billed while no turn
		// was active advances it without any per-event billing payload — and that is
		// still consumption worth showing.
		|| (typeof meta.copilotUsage?.sessionTotalNanoAiu === 'number' && meta.copilotUsage.sessionTotalNanoAiu >= 0)
		|| (typeof meta.cost === 'number' && meta.cost >= 0);
}

function readAutoModeResolvedInfo(value: unknown): IAutoModeResolvedInfo | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	if (typeof raw['chosenModel'] !== 'string') {
		return undefined;
	}
	const result: Mutable<IAutoModeResolvedInfo> = { chosenModel: raw['chosenModel'] };
	const reasoningBucket = raw['reasoningBucket'];
	if (reasoningBucket === 'low' || reasoningBucket === 'medium' || reasoningBucket === 'high') {
		result.reasoningBucket = reasoningBucket;
	}
	const categoryScores = raw['categoryScores'];
	if (categoryScores && typeof categoryScores === 'object' && !Array.isArray(categoryScores)) {
		const scores: Record<string, number> = {};
		for (const [category, score] of Object.entries(categoryScores as Record<string, unknown>)) {
			if (typeof score === 'number') {
				scores[category] = score;
			}
		}
		result.categoryScores = scores;
	}
	if (typeof raw['predictedLabel'] === 'string') { result.predictedLabel = raw['predictedLabel']; }
	if (typeof raw['confidence'] === 'number') { result.confidence = raw['confidence']; }
	if (Array.isArray(raw['candidateModels']) && raw['candidateModels'].every(candidate => typeof candidate === 'string')) {
		result.candidateModels = raw['candidateModels'];
	}
	return result;
}

function readContextAttribution(value: unknown): IContextAttributionData | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	if (typeof raw['totalTokens'] !== 'number' || !Array.isArray(raw['entries'])) {
		return undefined;
	}
	const entries: IContextAttributionEntry[] = [];
	for (const item of raw['entries']) {
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			continue;
		}
		const entry = item as Record<string, unknown>;
		if (typeof entry['kind'] !== 'string' || typeof entry['id'] !== 'string'
			|| typeof entry['label'] !== 'string' || typeof entry['tokens'] !== 'number') {
			continue;
		}
		entries.push({
			kind: entry['kind'],
			id: entry['id'],
			label: entry['label'],
			tokens: entry['tokens'],
			parentId: typeof entry['parentId'] === 'string' ? entry['parentId'] : undefined,
			attributes: entry['attributes'] && typeof entry['attributes'] === 'object' && !Array.isArray(entry['attributes'])
				? filterStringAttributes(entry['attributes'] as Record<string, unknown>)
				: undefined,
		});
	}
	const compactionsRaw = raw['compactions'];
	const compactions = compactionsRaw && typeof compactionsRaw === 'object' && !Array.isArray(compactionsRaw)
		&& typeof (compactionsRaw as Record<string, unknown>)['count'] === 'number'
		? { count: (compactionsRaw as Record<string, unknown>)['count'] as number }
		: { count: 0 };
	return { totalTokens: raw['totalTokens'] as number, entries, compactions };
}

function filterStringAttributes(raw: Record<string, unknown>): Record<string, string | undefined> {
	const result: Record<string, string | undefined> = {};
	for (const [key, value] of Object.entries(raw)) {
		if (typeof value === 'string' || value === undefined) {
			result[key] = value;
		}
	}
	return result;
}
