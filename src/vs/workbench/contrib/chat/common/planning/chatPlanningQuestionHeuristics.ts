/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const planningContextHeader = 'Planning context from the previous planning step:';
const explicitRefinementCuePattern = /\b(actually|instead|rather than|different|changed?|new goal|pivot|re-?scope|replan|refine|update (?:the )?plan|change of plan|another approach|alternative approach|alternate approach|switch to|focus on)\b/i;
const additiveFollowupCuePattern = /^\s*(also|and|plus|additionally|one more thing|include|including|as well as)\b/i;

export function shouldRegeneratePlanningQuestions(input: string, previousInput: string | undefined, hasPlanningContext: boolean): boolean {
	const current = normalizePlanningPromptForComparison(input);
	if (!current) {
		return false;
	}

	const previous = normalizePlanningPromptForComparison(previousInput);
	if (!previous) {
		return true;
	}

	if (current === previous) {
		return false;
	}

	if (explicitRefinementCuePattern.test(current)) {
		return true;
	}

	if (additiveFollowupCuePattern.test(current)) {
		return false;
	}

	const similarity = computeTokenOverlap(current, previous);
	return hasPlanningContext ? similarity < 0.18 : similarity < 0.55;
}

export function normalizePlanningPromptForComparison(input: string | undefined): string | undefined {
	if (!input) {
		return undefined;
	}

	const stripped = stripPlanningContextBlock(input);
	const normalized = stripped.replace(/\s+/g, ' ').trim().toLowerCase();
	return normalized || undefined;
}

function stripPlanningContextBlock(input: string): string {
	const planningContextIndex = input.indexOf(planningContextHeader);
	return planningContextIndex >= 0 ? input.slice(0, planningContextIndex) : input;
}

function computeTokenOverlap(left: string, right: string): number {
	const leftTokens = tokenize(left);
	const rightTokens = tokenize(right);
	if (leftTokens.size === 0 || rightTokens.size === 0) {
		return 0;
	}

	let intersectionCount = 0;
	for (const token of leftTokens) {
		if (rightTokens.has(token)) {
			intersectionCount += 1;
		}
	}

	return intersectionCount / Math.max(leftTokens.size, rightTokens.size);
}

function tokenize(input: string): Set<string> {
	const tokens = input.match(/[a-z0-9]{4,}/gi) ?? [];
	return new Set(tokens);
}
