/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Instruction-strength patterns grouped by confidence level.
 * Shared between the static analyzer, hover provider, and code action provider.
 */
export const STRENGTH_PATTERNS: Record<string, readonly string[]> = {
	strong: ['never', 'must', 'always', 'under no circumstances', 'absolutely', 'required', 'mandatory', 'forbidden', 'prohibited'],
	medium: ['should', 'avoid', 'prefer', 'recommended', 'expected', 'generally', 'typically'],
	weak: ['try to', 'consider', 'when appropriate', 'if possible', 'might', 'could', 'may want to', 'optionally'],
};

/** Rough token estimation: ~4 chars per token for English text. */
export const CHARS_PER_TOKEN = 4;

/**
 * Mapping from weak instruction phrases to their stronger replacements.
 * Used by the static analyzer to suggest improvements and by the code
 * action provider to offer quick-fix replacements.
 */
export const WEAK_TO_STRONG: Record<string, string> = {
	'try to': 'Always',
	'consider': 'Must',
	'when appropriate': 'Always',
	'if possible': 'Must',
	'might': 'Will',
	'could': 'Must',
	'may want to': 'Must',
	'optionally': 'Always',
};

export const AMBIGUOUS_QUANTIFIERS: readonly string[] = [
	'a few', 'some', 'sometimes', 'occasionally', 'often', 'many', 'several', 'various', 'numerous',
];

export const QUANTIFIER_SUGGESTIONS: Record<string, string> = {
	'a few': '2-3',
	'some': 'specific',
	'sometimes': 'in specific cases',
	'occasionally': 'in ~10% of cases',
	'often': 'in most cases',
	'many': '10+',
	'several': '5-7',
	'various': 'the following specific',
	'numerous': '10+',
};
