/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Distributes a total size into parts that each have a list of growth rules.
 * Returns `null` if the layout is not possible.
 * The sum of all returned sizes will be equal to `totalSize`.
 *
 * First, each part gets its minimum size.
 * Then, remaining space is distributed to the rules with the highest priority, as long as the max constraint allows it (considering share).
 * This continues with next lower priority rules until no space is left.
*/
export function distributeFlexBoxLayout(totalSize, parts) {
    // Normalize parts to always have array of rules
    const normalizedParts = {};
    for (const [key, part] of Object.entries(parts)) {
        if (Array.isArray(part)) {
            normalizedParts[key] = { min: 0, rules: part };
        }
        else {
            normalizedParts[key] = {
                min: part.min ?? 0,
                rules: part.rules ?? [{ max: part.max, priority: part.priority, share: part.share }]
            };
        }
    }
    // Initialize result with minimum sizes
    const result = {};
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
        const candidateRules = [];
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
        const distributions = [];
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
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmxleEJveExheW91dC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy91dGlscy9mbGV4Qm94TGF5b3V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBY2hHOzs7Ozs7OztFQVFFO0FBQ0YsTUFBTSxVQUFVLHVCQUF1QixDQUN0QyxTQUFpQixFQUNqQixLQUE0RTtJQUU1RSxnREFBZ0Q7SUFDaEQsTUFBTSxlQUFlLEdBQXdFLEVBQUUsQ0FBQztJQUNoRyxLQUFLLE1BQU0sQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQ2pELElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ3pCLGVBQWUsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDO1FBQ2hELENBQUM7YUFBTSxDQUFDO1lBQ1AsZUFBZSxDQUFDLEdBQUcsQ0FBQyxHQUFHO2dCQUN0QixHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDO2dCQUNsQixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQzthQUNwRixDQUFDO1FBQ0gsQ0FBQztJQUNGLENBQUM7SUFFRCx1Q0FBdUM7SUFDdkMsTUFBTSxNQUFNLEdBQTJCLEVBQUUsQ0FBQztJQUMxQyxJQUFJLFFBQVEsR0FBRyxDQUFDLENBQUM7SUFD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