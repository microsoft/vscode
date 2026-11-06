/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../../../../util/common/services';
import { ComponentStatistics } from '../../../prompt/src/components/components';
import {
	ContextItemOrigin,
	ContextItemUsageDetails,
	ContextUsageStatistics,
	ResolutionStatus,
	SupportedContextItemType,
	UsageStatus,
} from '../../../types/src';
import { LRUCacheMap } from '../helpers/cache';
import { SupportedContextItemWithId } from './contextProviders/contextItemSchemas';

export type PromptExpectation = 'included' | 'content_excluded';

export type PromptMatcher = {
	source: SupportedContextItemWithId;
	expectedTokens: number;
	actualTokens: number;
};

export const ICompletionsContextProviderService = createServiceIdentifier<ICompletionsContextProviderService>('ICompletionsContextProviderService');
export interface ICompletionsContextProviderService {
	readonly _serviceBrand: undefined;

	getStatisticsForCompletion(completionId: string): PerCompletionContextProviderStatistics;
	getPreviousStatisticsForCompletion(completionId: string): PerCompletionContextProviderStatistics | undefined;
}

export class ContextProviderStatistics implements ICompletionsContextProviderService {
	declare _serviceBrand: undefined;

	private statistics = new LRUCacheMap<string, PerCompletionContextProviderStatistics>(25);

	constructor(
		private readonly createStatistics: () => PerCompletionContextProviderStatistics = () =>
			new PerCompletionContextProviderStatistics()
	) { }

	getStatisticsForCompletion(completionId: string): PerCompletionContextProviderStatistics {
		const statistics = this.statistics.get(completionId);
		if (statistics) {
			return statistics;
		}
		const newStatistics = this.createStatistics();
		this.statistics.set(completionId, newStatistics);
		return newStatistics;
	}

	getPreviousStatisticsForCompletion(completionId: string) {
		const keys = Array.from(this.statistics.keys());
		for (let i = keys.length - 1; i >= 0; i--) {
			const key = keys[i];
			if (key !== completionId) {
				return this.statistics.peek(key);
			}
		}
		return undefined;
	}
}

export class PerCompletionContextProviderStatistics {

	public opportunityId: string | undefined;

	// Keyed by the providerId, contains an array of tuples [context item, expectation]
	protected _expectations = new Map<string, [SupportedContextItemWithId, PromptExpectation][]>();
	protected _lastResolution = new Map<string, ResolutionStatus>();
	protected _statistics = new Map<string, ContextUsageStatistics>();

	constructor() {
		this.opportunityId = undefined;
	}

	addExpectations(providerId: string, expectations: [SupportedContextItemWithId, PromptExpectation][]) {
		const providerExpectations = this._expectations.get(providerId) ?? [];
		this._expectations.set(providerId, [...providerExpectations, ...expectations]);
	}

	clearExpectations() {
		this._expectations.clear();
	}

	setLastResolution(providerId: string, resolution: ResolutionStatus) {
		this._lastResolution.set(providerId, resolution);
	}

	setOpportunityId(opportunityId: string) {
		this.opportunityId = opportunityId;
	}

	get(providerId: string): ContextUsageStatistics | undefined {
		return this._statistics.get(providerId);
	}

	getAllUsageStatistics(): IterableIterator<[string, ContextUsageStatistics]> {
		return this._statistics.entries();
	}

	computeMatch(promptMatchers: PromptMatcher[]) {
		try {
			for (const [providerId, expectations] of this._expectations) {
				if (expectations.length === 0) {
					continue;
				}

				const resolution = this._lastResolution.get(providerId) ?? 'none';
				if (resolution === 'none' || resolution === 'error') {
					this._statistics.set(providerId, {
						usage: 'none',
						resolution,
					});
					continue;
				}

				const providerUsageDetails: ContextItemUsageDetails[] = [];

				for (const [item, expectation] of expectations) {
					const itemDetails: {
						id: string;
						type: SupportedContextItemType;
						origin?: ContextItemOrigin;
					} = {
						id: item.id,
						type: item.type,
					};

					if (item.origin) {
						itemDetails.origin = item.origin;
					}

					if (expectation === 'content_excluded') {
						providerUsageDetails.push({
							...itemDetails,
							usage: 'none_content_excluded',
						});
						continue;
					}

					const itemStatistics = promptMatchers.find(component => component.source === item);

					if (itemStatistics === undefined) {
						providerUsageDetails.push({
							...itemDetails,
							// In this case, the item didn't make to elision, despite being expected.
							usage: 'error',
						});
					} else {
						providerUsageDetails.push({
							...itemDetails,
							usage:
								itemStatistics.expectedTokens > 0 &&
									itemStatistics.expectedTokens === itemStatistics.actualTokens
									? 'full'
									: itemStatistics.actualTokens > 0
										? 'partial'
										: 'none',
							expectedTokens: itemStatistics.expectedTokens,
							actualTokens: itemStatistics.actualTokens,
						});
					}
				}

				const usedItems = providerUsageDetails.reduce((acc, item) => {
					if (item.usage === 'full') {
						return acc + 1;
					} else if (item.usage === 'partial') {
						return acc + 0.5;
					}
					return acc;
				}, 0);
				const usedPercentage = usedItems / expectations.length;
				const usage: UsageStatus = usedPercentage === 1 ? 'full' : usedPercentage === 0 ? 'none' : 'partial';
				this._statistics.set(providerId, {
					resolution,
					usage,
					usageDetails: providerUsageDetails,
				});
			}
		} finally {
			// Remove expectations and resolutions no matter what happens
			this.clearExpectations();
			this._lastResolution.clear();
		}
	}
}

export function componentStatisticsToPromptMatcher(promptComponentStatistics: ComponentStatistics[]): PromptMatcher[] {
	return promptComponentStatistics
		.map(component => {
			if (
				component.source === undefined ||
				component.expectedTokens === undefined ||
				component.actualTokens === undefined
			) {
				return;
			}

			return {
				source: component.source as SupportedContextItemWithId,
				expectedTokens: component.expectedTokens,
				actualTokens: component.actualTokens,
			};
		})
		.filter(p => p !== undefined);
}
