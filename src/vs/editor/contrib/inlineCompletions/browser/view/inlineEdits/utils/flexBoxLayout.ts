/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IFlexBoxPartGrowthRule extends IFlexBoxPartExtensionRule {
	min?: number;
	rules?: IFlexBoxPartExtensionRule[];
}

export interface IFlexBoxPartExtensionRule {
	max?: number;
	priority?: number;
	share?: number;
}


/**
 * Distributes a total size into parts that each have a list of growth rules.
 * Returns `null` if the layout is not possible.
 * The sum of all returned sizes will be equal to `totalSize`.
 *
 * First, each part gets its minimum size.
 * Then, remaining space is distributed to the rules with the highest priority, as long as the max constraint allows it (considering share).
 * This continues with next lower priority rules until no space is left.
*/
export function distributeFlexBoxLayout<T extends Record<string, IFlexBoxPartGrowthRule | IFlexBoxPartGrowthRule[]>>(
	totalSize: number,
	parts: T & Record<string, IFlexBoxPartGrowthRule | IFlexBoxPartGrowthRule[]>
): Record<keyof T, number> | null {
	// Normalize parts to always have array of rules
	const normalizedParts: Record<string, { min: number; rules: IFlexBoxPartExtensionRule[] }> = {};
	for (const [key, part] of Object.entries(parts)) {
		if (Array.isArray(part)) {
			normalizedParts[key] = { min: 0, rules: part };
		} else {
			normalizedParts[key] = {
				min: part.min ?? 0,
				rules: part.rules ?? [{ max: part.max, priority: part.priority, share: part.share }]
			};
		}
	}

	// Initialize result with minimum sizes
	const result: Record<string, number> = {};
	let usedSize = 0;
	for (const [key, part] of Object.entries(normalizedParts)) {
		result[key] = part.min;
		usedSize += part.min;
	}

	// Check if we can satisfy minimum constraints
	if (usedSize > totalSize) {
		return null;
	}

	let remainingSize = totalSize - usedSize;

	// Distribute remaining space by priority levels
	while (remainingSize > 0) {
		// Find all rules at current highest priority that can still grow
		const candidateRules: Array<{
			partKey: string;
			ruleIndex: number;
			rule: IFlexBoxPartExtensionRule;
			priority: number;
			share: number;
		}> = [];

		for (const [key, part] of Object.entries(normalizedParts)) {
			for (let i = 0; i < part.rules.length; i++) {
				const rule = part.rules[i];
				const currentUsage = result[key];
				const maxSize = rule.max ?? Infinity;

				if (currentUsage < maxSize) {
					candidateRules.push({
						partKey: key,
						ruleIndex: i,
						rule,
						priority: rule.priority ?? 0,
						share: rule.share ?? 1
					});
				}
			}
		}

		if (candidateRules.length === 0) {
			// No rules can grow anymore, but we have remaining space
			break;
		}

		// Find the highest priority among candidates
		const maxPriority = Math.max(...candidateRules.map(c => c.priority));
		const highestPriorityCandidates = candidateRules.filter(c => c.priority === maxPriority);

		// Calculate total share
		const totalShare = highestPriorityCandidates.reduce((sum, c) => sum + c.share, 0);

		// Distribute space proportionally by share
		let distributedThisRound = 0;
		const distributions: Array<{ partKey: string; ruleIndex: number; amount: number }> = [];

		for (const candidate of highestPriorityCandidates) {
			const rule = candidate.rule;
			const currentUsage = result[candidate.partKey];
			const maxSize = rule.max ?? Infinity;
			const availableForThisRule = maxSize - currentUsage;

			// Calculate ideal share
			const idealShare = (remainingSize * candidate.share) / totalShare;
			const actualAmount = Math.min(idealShare, availableForThisRule);

			distributions.push({
				partKey: candidate.partKey,
				ruleIndex: candidate.ruleIndex,
				amount: actualAmount
			});

			distributedThisRound += actualAmount;
		}

		if (distributedThisRound === 0) {
			// No progress can be made
			break;
		}

		// Apply distributions
		for (const dist of distributions) {
			result[dist.partKey] += dist.amount;
		}

		remainingSize -= distributedThisRound;

		// Break if remaining is negligible (floating point precision)
		if (remainingSize < 0.0001) {
			break;
		}
	}

	return result as Record<keyof T, number>;
}
