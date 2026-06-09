/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Design-token validators that need block (selector + declaration) awareness,
// which the line-based variable-name validator cannot provide.

const RE_FONT_SIZE_PX = /font-size\s*:\s*([\d.]+)px/i;
const RE_CODICON_SELECTOR = /codicon/i;

/** The two standard codicon sizes: 16px base, 12px compact. */
const ALLOWED_CODICON_PX = new Set([16, 12]);

export interface IDesignTokenViolation {
	readonly line: number;
	readonly message: string;
	/**
	 * `true` when the codicon is sized in the 13-15px near-miss band, which is
	 * always meant to be 12 or 16. Off-ramp sizes outside that band (large
	 * hero/empty-state icons, small <=11px chevrons) set this `false` as they may
	 * be intentional. Used only to tailor the warning wording - all codicon
	 * size findings are reported as warnings and never fail the build.
	 */
	readonly isNearMiss: boolean;
}

/** Near-miss band: a codicon at 13/14/15px is always a mistake for 12 or 16. */
function isNearMiss(px: number): boolean {
	return px > 12 && px < 16;
}

/** The two standard codicon sizes, formatted for the warning detail line. */
const STANDARD_CODICON_SIZES = 'var(--vscode-codiconFontSize) for 16px, var(--vscode-codiconFontSize-compact) for 12px';

/** Builds a readable, multi-line warning for an off-scale codicon font-size. */
function formatCodiconMessage(px: string, nearMiss: boolean): string {
	const headline = nearMiss
		? `Codicon font-size ${px}px is off-scale - codicons are only 12px or 16px.`
		: `Codicon font-size ${px}px is off-scale (large hero or <=11px glyph - may be intentional).`;
	return `${headline}\n           -> use ${STANDARD_CODICON_SIZES}`;
}

/**
 * Replace the body of every `/* ... *\/` comment with spaces while preserving
 * newlines, so brace/semicolon scanning is not confused by comment content and
 * line numbers stay accurate.
 */
function blankComments(text: string): string {
	return text.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '));
}

/**
 * Validates that any `font-size` applied to a codicon resolves to one of the two
 * allowed codicon sizes (16px base, 12px compact). Off-scale values are reported
 * as warnings: the 13-15px near-miss band is always a mistake for 12 or 16, while
 * other off sizes (large hero icons / small chevrons) may be intentional and are
 * worded accordingly. Values expressed via `var(--vscode-codiconFontSize...)` are
 * not matched by the px regex and are therefore always accepted.
 *
 * The scan tracks the nesting stack of rule selectors so a `font-size`
 * declaration is checked against the selector of the rule that directly contains
 * it (the innermost selector), correctly handling native CSS nesting.
 */
export function validateCodiconFontSizes(text: string): IDesignTokenViolation[] {
	const violations: IDesignTokenViolation[] = [];
	const source = blankComments(text);
	const selectorStack: string[] = [];
	let pending = '';
	let line = 1;

	for (let i = 0; i < source.length; i++) {
		const ch = source[i];
		if (ch === '\n') {
			line++;
		}
		switch (ch) {
			case '{':
				selectorStack.push(pending.trim());
				pending = '';
				break;
			case '}':
				selectorStack.pop();
				pending = '';
				break;
			case ';': {
				const selector = selectorStack[selectorStack.length - 1] ?? '';
				if (RE_CODICON_SELECTOR.test(selector)) {
					const match = RE_FONT_SIZE_PX.exec(pending);
					if (match) {
						const px = parseFloat(match[1]);
						if (!ALLOWED_CODICON_PX.has(px)) {
							const nearMiss = isNearMiss(px);
							violations.push({
								line,
								isNearMiss: nearMiss,
								message: formatCodiconMessage(match[1], nearMiss)
							});
						}
					}
				}
				pending = '';
				break;
			}
			default:
				pending += ch;
		}
	}

	return violations;
}
